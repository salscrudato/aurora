/**
 * AuroraNotes API - Notes Service
 * 
 * Handles note CRUD operations with pagination and tenant support.
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./firestore";
import { 
  NOTES_COLLECTION, 
  MAX_NOTE_LENGTH, 
  DEFAULT_TENANT_ID,
  NOTES_PAGE_LIMIT,
  MAX_NOTES_PAGE_LIMIT
} from "./config";
import { NoteDoc, NoteResponse, NotesListResponse, DeleteNoteResponse } from "./types";
import { timestampToISO, parseCursor, encodeCursor, logInfo, logError, logWarn, sanitizeText, isValidTenantId } from "./utils";
import { processNoteChunks } from "./chunking";
import { invalidateTenantCache } from "./cache";
import { CHUNKS_COLLECTION } from "./config";
import { getVertexIndex } from "./vectorIndex";
import { enrichNote } from "./enrichment";

/**
 * Options for creating a note
 */
export interface CreateNoteOptions {
  title?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Convert Firestore document to API response
 */
function docToResponse(doc: NoteDoc): NoteResponse {
  return {
    id: doc.id,
    title: doc.title,
    text: doc.text,
    tenantId: doc.tenantId,
    processingStatus: doc.processingStatus,
    tags: doc.tags,
    metadata: doc.metadata,
    summary: doc.summary,
    noteType: doc.noteType,
    actionItems: doc.actionItems,
    entities: doc.entities,
    enrichmentStatus: doc.enrichmentStatus,
    createdAt: timestampToISO(doc.createdAt),
    updatedAt: timestampToISO(doc.updatedAt),
  };
}

/**
 * Create a new note with input validation and sanitization
 *
 * @param text - Note content (required)
 * @param tenantId - Tenant ID (derived from authenticated user's UID)
 * @param options - Optional title, tags, and metadata
 */
export async function createNote(
  text: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: CreateNoteOptions = {}
): Promise<NoteResponse> {
  // Sanitize and validate input
  const sanitizedText = sanitizeText(text, MAX_NOTE_LENGTH + 100);
  const trimmedText = sanitizedText.trim();

  if (!trimmedText) {
    throw new Error('text is required');
  }

  if (trimmedText.length > MAX_NOTE_LENGTH) {
    throw new Error(`text too long (max ${MAX_NOTE_LENGTH})`);
  }

  // Validate tenant ID
  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  const id = uuidv4();
  const now = FieldValue.serverTimestamp();

  // Build the note document
  const doc: NoteDoc = {
    id,
    text: trimmedText,
    tenantId,
    processingStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  // Add optional fields
  if (options.title) {
    doc.title = options.title.trim().slice(0, 500);
  }
  if (options.tags && options.tags.length > 0) {
    doc.tags = options.tags.slice(0, 20).map(t => t.trim().slice(0, 50));
  }
  if (options.metadata) {
    doc.metadata = options.metadata;
  }

  const db = getDb();
  await db.collection(NOTES_COLLECTION).doc(id).set(doc);

  // Fetch the document to get actual server timestamp
  const savedDoc = await db.collection(NOTES_COLLECTION).doc(id).get();
  let savedData = savedDoc.data() as NoteDoc;

  // Process chunks synchronously so notes are immediately available in RAG pipeline
  // This adds latency but ensures the note is searchable right away
  const chunkStartTime = Date.now();
  try {
    await processNoteChunks(savedData);

    // Update processing status to 'ready'
    await db.collection(NOTES_COLLECTION).doc(id).update({
      processingStatus: 'ready',
      updatedAt: FieldValue.serverTimestamp(),
    });
    savedData.processingStatus = 'ready';

    logInfo('Note chunks processed synchronously', {
      noteId: id,
      elapsedMs: Date.now() - chunkStartTime,
    });
  } catch (err) {
    // Update processing status to 'failed'
    await db.collection(NOTES_COLLECTION).doc(id).update({
      processingStatus: 'failed',
      processingError: err instanceof Error ? err.message : 'Unknown error',
      updatedAt: FieldValue.serverTimestamp(),
    });
    savedData.processingStatus = 'failed';

    // Log error but don't fail the note creation - the note is saved
    // and can be re-indexed later if needed
    logError('Chunk processing failed during note creation', err, { noteId: id });
  }

  // Invalidate retrieval cache AFTER chunks are created
  // This ensures subsequent queries won't use stale cached results
  invalidateTenantCache(tenantId);

  // Trigger async enrichment (non-blocking)
  triggerEnrichment(id, trimmedText, options.title).catch((err) => {
    logError('Failed to trigger enrichment', err, { noteId: id });
  });

  logInfo('Note created', {
    noteId: id,
    tenantId,
    textLength: trimmedText.length,
    hasTitle: !!options.title,
    tagCount: options.tags?.length || 0,
  });

  return docToResponse(savedData);
}

/**
 * Options for listing notes with filters and sorting
 */
export interface ListNotesOptions {
  /** Filter by a single tag */
  tag?: string;
  /** Filter by multiple tags (OR logic) */
  tags?: string[];
  /** Filter notes created on or after this date */
  dateFrom?: Date;
  /** Filter notes created on or before this date */
  dateTo?: Date;
  /** Filter by processing status */
  status?: 'pending' | 'ready' | 'failed';
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  /** Sort order */
  order?: 'asc' | 'desc';
  /** Simple text search in title (prefix match) */
  search?: string;
}

/**
 * List notes with cursor-based pagination and filtering
 *
 * Uses stable ordering: createdAt DESC, id DESC to ensure deterministic pagination.
 * The cursor encodes both createdAt and id to handle timestamp collisions correctly.
 *
 * PREFERRED FIRESTORE INDEX (for best performance):
 *   Collection: notes
 *   Fields: tenantId ASC, createdAt DESC, __name__ DESC
 *
 * Additional indexes may be needed for:
 *   - tenantId ASC, updatedAt DESC, __name__ DESC
 *   - tenantId ASC, title ASC, __name__ ASC
 *   - tenantId ASC, processingStatus ASC, createdAt DESC
 *   - tenantId ASC, tags ARRAY_CONTAINS, createdAt DESC
 *
 * Falls back to client-side filtering if index doesn't exist yet.
 */
export async function listNotes(
  tenantId: string = DEFAULT_TENANT_ID,
  limit: number = NOTES_PAGE_LIMIT,
  cursor?: string,
  options: ListNotesOptions = {}
): Promise<NotesListResponse> {
  const db = getDb();
  const pageLimit = Math.min(Math.max(1, limit), MAX_NOTES_PAGE_LIMIT);
  const cursorData = parseCursor(cursor);

  // Merge tag and tags into a single array
  const allTags: string[] = [];
  if (options.tag) allTags.push(options.tag);
  if (options.tags) allTags.push(...options.tags);

  // Try optimized query with index first, fall back to legacy if index missing
  try {
    return await listNotesOptimized(db, tenantId, pageLimit, cursorData, options, allTags);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('FAILED_PRECONDITION') || errorMessage.includes('requires an index')) {
      logWarn('Notes index not found, using legacy query with client-side filtering', { tenantId });
      return await listNotesLegacy(db, tenantId, pageLimit, cursorData, options, allTags);
    }
    throw err;
  }
}

/**
 * Apply client-side filters to a list of notes
 */
function applyClientSideFilters(
  docs: NoteDoc[],
  options: ListNotesOptions,
  allTags: string[]
): NoteDoc[] {
  return docs.filter(doc => {
    // Tag filter (OR logic - match any of the tags)
    if (allTags.length > 0) {
      const noteTags = doc.tags || [];
      const hasMatchingTag = allTags.some(tag =>
        noteTags.some(noteTag => noteTag.toLowerCase() === tag.toLowerCase())
      );
      if (!hasMatchingTag) return false;
    }

    // Date range filters
    if (options.dateFrom || options.dateTo) {
      const createdAt = doc.createdAt instanceof Timestamp
        ? doc.createdAt.toDate()
        : new Date();

      if (options.dateFrom && createdAt < options.dateFrom) return false;
      if (options.dateTo && createdAt > options.dateTo) return false;
    }

    // Status filter
    if (options.status && doc.processingStatus !== options.status) {
      return false;
    }

    // Title search (case-insensitive prefix match)
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      const titleLower = (doc.title || '').toLowerCase();
      const textLower = doc.text.toLowerCase();
      // Match if title starts with search term OR text contains search term
      if (!titleLower.startsWith(searchLower) && !textLower.includes(searchLower)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort notes by the specified field and order
 */
function sortNotes(
  docs: NoteDoc[],
  sortBy: 'createdAt' | 'updatedAt' | 'title' = 'createdAt',
  order: 'asc' | 'desc' = 'desc'
): NoteDoc[] {
  return [...docs].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'title') {
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      comparison = titleA.localeCompare(titleB);
    } else {
      // For createdAt and updatedAt
      const dateA = a[sortBy] instanceof Timestamp
        ? (a[sortBy] as Timestamp).toDate().getTime()
        : 0;
      const dateB = b[sortBy] instanceof Timestamp
        ? (b[sortBy] as Timestamp).toDate().getTime()
        : 0;
      comparison = dateA - dateB;
    }

    return order === 'desc' ? -comparison : comparison;
  });
}

/**
 * Optimized query using composite index with filters
 */
async function listNotesOptimized(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  pageLimit: number,
  cursorData: { createdAt: Date; id: string } | null,
  options: ListNotesOptions,
  allTags: string[]
): Promise<NotesListResponse> {
  const sortBy = options.sortBy || 'createdAt';
  const order = options.order || 'desc';

  // Build query with tenant filter
  let query: FirebaseFirestore.Query = db
    .collection(NOTES_COLLECTION)
    .where('tenantId', '==', tenantId);

  // Add status filter if specified (can be done in Firestore)
  if (options.status) {
    query = query.where('processingStatus', '==', options.status);
  }

  // Add tag filter using array-contains (only one tag at a time in Firestore)
  // For multiple tags, we'll need client-side filtering
  if (allTags.length === 1) {
    query = query.where('tags', 'array-contains', allTags[0]);
  }

  // Add date range filters if possible
  if (sortBy === 'createdAt') {
    if (options.dateFrom) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(options.dateFrom));
    }
    if (options.dateTo) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(options.dateTo));
    }
  }

  // Order by sort field
  query = query.orderBy(sortBy, order);
  query = query.orderBy('__name__', order);

  // Apply cursor
  if (cursorData) {
    query = query.startAfter(
      Timestamp.fromDate(cursorData.createdAt),
      cursorData.id
    );
  }

  // Fetch more if we need client-side filtering
  const needsClientFiltering = allTags.length > 1 ||
    options.search ||
    (sortBy !== 'createdAt' && (options.dateFrom || options.dateTo));
  const fetchLimit = needsClientFiltering ? pageLimit * 3 : pageLimit + 1;

  query = query.limit(fetchLimit);

  const snap = await query.get();

  // Map documents to NoteDoc
  let docs = snap.docs.map(d => {
    const data = d.data() as NoteDoc;
    if (!data.tenantId) {
      data.tenantId = DEFAULT_TENANT_ID;
    }
    return data;
  });

  // Apply client-side filters if needed
  if (needsClientFiltering) {
    docs = applyClientSideFilters(docs, options, allTags.length > 1 ? allTags : []);
  }

  // Determine if there are more results
  const hasMore = docs.length > pageLimit;
  const resultDocs = hasMore ? docs.slice(0, pageLimit) : docs;

  // Build next cursor from last result
  let nextCursor: string | null = null;
  if (hasMore && resultDocs.length > 0) {
    const lastDoc = resultDocs[resultDocs.length - 1];
    const lastCreatedAt = lastDoc.createdAt as Timestamp;
    nextCursor = encodeCursor(lastCreatedAt, lastDoc.id);
  }

  return {
    notes: resultDocs.map(docToResponse),
    cursor: nextCursor,
    hasMore,
  };
}

/**
 * Legacy query fallback - uses client-side filtering when index doesn't exist
 */
async function listNotesLegacy(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  pageLimit: number,
  cursorData: { createdAt: Date; id: string } | null,
  options: ListNotesOptions,
  allTags: string[]
): Promise<NotesListResponse> {
  const sortBy = options.sortBy || 'createdAt';
  const order = options.order || 'desc';

  // Fetch more than needed to account for client-side filtering
  const fetchLimit = pageLimit * 5;

  let query: FirebaseFirestore.Query = db
    .collection(NOTES_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(fetchLimit);

  if (cursorData) {
    query = query.startAfter(Timestamp.fromDate(cursorData.createdAt));
  }

  const snap = await query.get();

  // Map and filter by tenant
  let docs = snap.docs.map(d => {
    const data = d.data() as NoteDoc;
    if (!data.tenantId) {
      data.tenantId = DEFAULT_TENANT_ID;
    }
    return data;
  }).filter(d => d.tenantId === tenantId);

  // Apply all client-side filters
  docs = applyClientSideFilters(docs, options, allTags);

  // Apply client-side sorting if not createdAt desc
  if (sortBy !== 'createdAt' || order !== 'desc') {
    docs = sortNotes(docs, sortBy, order);
  }

  const hasMore = docs.length > pageLimit;
  const resultDocs = hasMore ? docs.slice(0, pageLimit) : docs;

  let nextCursor: string | null = null;
  if (hasMore && resultDocs.length > 0) {
    const lastDoc = resultDocs[resultDocs.length - 1];
    const lastCreatedAt = lastDoc.createdAt as Timestamp;
    nextCursor = encodeCursor(lastCreatedAt, lastDoc.id);
  }

  return {
    notes: resultDocs.map(docToResponse),
    cursor: nextCursor,
    hasMore,
  };
}

/**
 * Get a single note by ID
 */
export async function getNote(
  noteId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<NoteResponse | null> {
  const db = getDb();
  const doc = await db.collection(NOTES_COLLECTION).doc(noteId).get();

  if (!doc.exists) return null;

  const data = doc.data() as NoteDoc;

  // Verify tenant access
  if (data.tenantId !== tenantId) return null;

  return docToResponse(data);
}

/**
 * Options for updating a note
 */
export interface UpdateNoteOptions {
  title?: string;
  text?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Update an existing note
 *
 * This operation:
 * 1. Validates the note exists and belongs to the tenant
 * 2. Updates the note fields
 * 3. Re-processes chunks if text was changed
 * 4. Invalidates the tenant cache
 *
 * @param noteId - The ID of the note to update
 * @param tenantId - The tenant ID for ownership verification
 * @param options - Fields to update
 * @returns NoteResponse on success, null if note not found or access denied
 * @throws Error if update fails
 */
export async function updateNote(
  noteId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: UpdateNoteOptions = {}
): Promise<NoteResponse | null> {
  const db = getDb();
  const startTime = Date.now();

  // Validate inputs
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('noteId is required');
  }

  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  // Ensure at least one field is being updated
  if (!options.text && !options.title && !options.tags && !options.metadata) {
    throw new Error('at least one field must be provided for update');
  }

  // Validate text if provided
  if (options.text !== undefined) {
    const sanitizedText = sanitizeText(options.text, MAX_NOTE_LENGTH + 100);
    const trimmedText = sanitizedText.trim();

    if (!trimmedText) {
      throw new Error('text cannot be empty');
    }

    if (trimmedText.length > MAX_NOTE_LENGTH) {
      throw new Error(`text too long (max ${MAX_NOTE_LENGTH})`);
    }

    options.text = trimmedText;
  }

  // Fetch the note to verify it exists and belongs to the tenant
  const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);
  const noteDoc = await noteRef.get();

  if (!noteDoc.exists) {
    return null; // Note not found
  }

  const noteData = noteDoc.data() as NoteDoc;

  // Verify tenant ownership (security check)
  if (noteData.tenantId !== tenantId) {
    logWarn('Update note denied - tenant mismatch', {
      noteId,
      requestedTenant: tenantId,
      actualTenant: noteData.tenantId,
    });
    return null; // Access denied - treat as not found for security
  }

  // Build update object
  const updateData: Partial<NoteDoc> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  const textChanged = options.text !== undefined && options.text !== noteData.text;

  if (options.text !== undefined) {
    updateData.text = options.text;
    // Mark for re-processing if text changed
    if (textChanged) {
      updateData.processingStatus = 'pending';
    }
  }

  if (options.title !== undefined) {
    updateData.title = options.title.trim().slice(0, 500);
  }

  if (options.tags !== undefined) {
    updateData.tags = options.tags.slice(0, 20).map(t => t.trim().slice(0, 50));
  }

  if (options.metadata !== undefined) {
    updateData.metadata = options.metadata;
  }

  // Update the note
  await noteRef.update(updateData);

  // If text changed, delete old chunks and re-process
  if (textChanged) {
    try {
      // Delete existing chunks
      const chunksSnap = await db
        .collection(CHUNKS_COLLECTION)
        .where('noteId', '==', noteId)
        .get();

      if (!chunksSnap.empty) {
        const chunkIds: string[] = [];
        const BATCH_SIZE = 400;

        for (let i = 0; i < chunksSnap.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const batchDocs = chunksSnap.docs.slice(i, i + BATCH_SIZE);

          for (const chunkDoc of batchDocs) {
            chunkIds.push(chunkDoc.id);
            batch.delete(chunkDoc.ref);
          }

          await batch.commit();
        }

        // Remove from Vertex index
        const vertexIndex = getVertexIndex();
        if (vertexIndex && chunkIds.length > 0) {
          try {
            await vertexIndex.remove(chunkIds);
          } catch (vertexErr) {
            logError('Failed to remove old chunks from Vertex index during update', vertexErr, {
              noteId,
              chunkCount: chunkIds.length,
            });
          }
        }
      }

      // Fetch updated note data and re-process chunks
      const updatedDoc = await noteRef.get();
      const updatedData = updatedDoc.data() as NoteDoc;

      await processNoteChunks(updatedData);

      // Mark as ready
      await noteRef.update({
        processingStatus: 'ready',
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      // Mark as failed but don't fail the update
      await noteRef.update({
        processingStatus: 'failed',
        processingError: err instanceof Error ? err.message : 'Unknown error',
      });
      logError('Chunk re-processing failed during note update', err, { noteId });
    }
  }

  // Invalidate cache
  invalidateTenantCache(tenantId);

  // Fetch final state
  const finalDoc = await noteRef.get();
  const finalData = finalDoc.data() as NoteDoc;

  logInfo('Note updated', {
    noteId,
    tenantId,
    textChanged,
    elapsedMs: Date.now() - startTime,
  });

  return docToResponse(finalData);
}

/**
 * Delete a note and all associated data
 *
 * This operation:
 * 1. Validates the note exists and belongs to the tenant
 * 2. Deletes all associated chunks from Firestore
 * 3. Removes chunk vectors from Vertex AI index (if configured)
 * 4. Deletes the note document
 * 5. Invalidates the tenant cache
 *
 * @param noteId - The ID of the note to delete
 * @param tenantId - The tenant ID for ownership verification
 * @returns DeleteNoteResponse on success, null if note not found or access denied
 * @throws Error if deletion fails
 */
export async function deleteNote(
  noteId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<DeleteNoteResponse | null> {
  const db = getDb();
  const startTime = Date.now();

  // Validate inputs
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('noteId is required');
  }

  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  // Fetch the note to verify it exists and belongs to the tenant
  const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);
  const noteDoc = await noteRef.get();

  if (!noteDoc.exists) {
    return null; // Note not found
  }

  const noteData = noteDoc.data() as NoteDoc;

  // Verify tenant ownership (security check)
  if (noteData.tenantId !== tenantId) {
    logWarn('Delete note denied - tenant mismatch', {
      noteId,
      requestedTenant: tenantId,
      actualTenant: noteData.tenantId,
    });
    return null; // Access denied - treat as not found for security
  }

  // Find and delete all associated chunks
  let chunksDeleted = 0;
  const chunkIds: string[] = [];

  try {
    // Query all chunks for this note
    const chunksSnap = await db
      .collection(CHUNKS_COLLECTION)
      .where('noteId', '==', noteId)
      .get();

    if (!chunksSnap.empty) {
      // Collect chunk IDs for Vertex removal
      chunksSnap.docs.forEach(doc => chunkIds.push(doc.id));

      // Delete chunks in batches (Firestore limit: 500 per batch)
      const BATCH_SIZE = 400;
      for (let i = 0; i < chunksSnap.docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const batchDocs = chunksSnap.docs.slice(i, i + BATCH_SIZE);

        for (const chunkDoc of batchDocs) {
          batch.delete(chunkDoc.ref);
        }

        await batch.commit();
        chunksDeleted += batchDocs.length;
      }
    }

    // Remove from Vertex AI Vector Search index (if configured)
    if (chunkIds.length > 0) {
      const vertexIndex = getVertexIndex();
      if (vertexIndex) {
        try {
          await vertexIndex.remove(chunkIds);
          logInfo('Removed chunks from Vertex index', {
            noteId,
            chunkCount: chunkIds.length
          });
        } catch (vertexErr) {
          // Log but don't fail - Vertex sync is best-effort
          logError('Failed to remove chunks from Vertex index', vertexErr, {
            noteId,
            chunkCount: chunkIds.length
          });
        }
      }
    }

    // Delete the note document
    await noteRef.delete();

    // Invalidate retrieval cache for this tenant
    invalidateTenantCache(tenantId);

    const elapsedMs = Date.now() - startTime;

    logInfo('Note deleted', {
      noteId,
      tenantId,
      chunksDeleted,
      elapsedMs,
    });

    return {
      success: true,
      id: noteId,
      deletedAt: new Date().toISOString(),
      chunksDeleted,
    };
  } catch (err) {
    logError('Note deletion failed', err, { noteId, tenantId });
    throw err;
  }
}

// ============================================
// Semantic Search
// ============================================

import { retrieveRelevantChunks } from "./retrieval";
import { ScoredChunk } from "./types";

/**
 * Search result with relevance score
 */
export interface SearchNoteResult {
  note: NoteResponse;
  relevanceScore: number;
  matchedChunks?: Array<{
    text: string;
    score: number;
  }>;
}

/**
 * Search notes response
 */
export interface SearchNotesResponse {
  results: SearchNoteResult[];
  totalMatches: number;
  queryTimeMs: number;
  /** The search mode that was used */
  mode?: 'semantic' | 'keyword' | 'hybrid';
}

/**
 * Search mode for notes search
 */
export type SearchMode = 'semantic' | 'keyword' | 'hybrid';

/**
 * Sort options for search results
 */
export type SearchSort = 'relevance' | 'date' | 'title';

/**
 * Options for semantic note search
 */
export interface SearchNotesOptions {
  /** Maximum number of notes to return */
  limit?: number;
  /** Minimum relevance score threshold (0-1) */
  threshold?: number;
  /** Include matched chunks in response */
  includeChunks?: boolean;
  /** Search mode: semantic, keyword, or hybrid (default) */
  mode?: SearchMode;
  /** Sort results by: relevance (default), date, or title */
  sortBy?: SearchSort;
  /** Sort order: desc (default) or asc */
  order?: 'asc' | 'desc';
  /** Include highlight markers in matched text */
  includeHighlights?: boolean;
  /** Filter options */
  filters?: {
    tags?: string[];
    dateFrom?: Date;
    dateTo?: Date;
    status?: 'pending' | 'ready' | 'failed';
    /** Filter by note type */
    noteType?: string;
    /** Filter to specific note IDs */
    noteIds?: string[];
  };
}

/**
 * Add highlight markers to text around query matches
 */
function highlightMatches(text: string, query: string): string {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  if (terms.length === 0) return text;

  let result = text;
  for (const term of terms) {
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, '<<$1>>');
  }
  return result;
}

/**
 * Semantic search across notes using the RAG retrieval pipeline
 *
 * This function leverages the existing retrieval infrastructure (vector search,
 * BM25, reranking) to find notes semantically similar to the query.
 *
 * Supports multiple search modes:
 * - semantic: Pure vector similarity (best for natural language)
 * - keyword: BM25 lexical matching (best for exact terms)
 * - hybrid: Combines both with RRF fusion (default, best overall)
 *
 * @param query - Natural language search query
 * @param tenantId - Tenant ID for data isolation
 * @param options - Search options
 * @returns Search results with relevance scores
 */
export async function searchNotes(
  query: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: SearchNotesOptions = {}
): Promise<SearchNotesResponse> {
  const startTime = Date.now();
  const limit = Math.min(options.limit || 10, 50);
  const threshold = options.threshold ?? 0.1;
  const mode = options.mode ?? 'hybrid';
  const sortBy = options.sortBy ?? 'relevance';
  const order = options.order ?? 'desc';

  // Use the retrieval pipeline to get relevant chunks
  // The mode affects how chunks are scored internally
  const { chunks } = await retrieveRelevantChunks(query, {
    tenantId,
    topK: limit * 5, // Fetch more chunks since we'll dedupe by note
    rerankTo: limit * 3,
    maxAgeDays: options.filters?.dateFrom
      ? Math.ceil((Date.now() - options.filters.dateFrom.getTime()) / (1000 * 60 * 60 * 24))
      : undefined,
    // Pass mode hint for scoring adjustments
    keywords: mode === 'keyword' ? query.split(/\s+/).filter(t => t.length >= 2) : undefined,
  });

  // Group chunks by noteId and calculate note-level scores
  // For keyword mode, prefer keywordScore; for semantic, prefer vectorScore
  const noteScores = new Map<string, { score: number; chunks: ScoredChunk[] }>();

  for (const chunk of chunks) {
    // Select score based on mode
    let effectiveScore: number;
    if (mode === 'keyword') {
      effectiveScore = chunk.keywordScore ?? chunk.score;
    } else if (mode === 'semantic') {
      effectiveScore = chunk.vectorScore ?? chunk.score;
    } else {
      effectiveScore = chunk.score; // hybrid uses combined score
    }

    const existing = noteScores.get(chunk.noteId);
    if (existing) {
      // Use max score from any chunk, but also track all chunks
      existing.score = Math.max(existing.score, effectiveScore);
      existing.chunks.push(chunk);
    } else {
      noteScores.set(chunk.noteId, { score: effectiveScore, chunks: [chunk] });
    }
  }

  // Pre-filter by noteIds if specified
  let noteIdSet: Set<string> | undefined;
  if (options.filters?.noteIds && options.filters.noteIds.length > 0) {
    noteIdSet = new Set(options.filters.noteIds);
  }

  // Filter by threshold (applied before fetching note docs for efficiency)
  let sortedNoteIds = Array.from(noteScores.entries())
    .filter(([noteId, data]) => {
      if (data.score < threshold) return false;
      if (noteIdSet && !noteIdSet.has(noteId)) return false;
      return true;
    });

  // Fetch full note documents in batch for efficiency
  const db = getDb();
  const noteDataMap = new Map<string, NoteDoc>();

  // Fetch in batches of 10 (Firestore getAll limit considerations)
  const noteIds = sortedNoteIds.map(([id]) => id);
  const batchSize = 10;
  for (let i = 0; i < noteIds.length; i += batchSize) {
    const batchIds = noteIds.slice(i, i + batchSize);
    const refs = batchIds.map(id => db.collection(NOTES_COLLECTION).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) {
        noteDataMap.set(doc.id, doc.data() as NoteDoc);
      }
    }
  }

  // Build results with filtering
  const results: SearchNoteResult[] = [];

  for (const [noteId, { score, chunks: matchedChunks }] of sortedNoteIds) {
    const noteData = noteDataMap.get(noteId);
    if (!noteData) continue;

    // Verify tenant access
    if (noteData.tenantId !== tenantId) continue;

    // Apply filters
    if (options.filters) {
      const { tags, dateFrom, dateTo, status, noteType } = options.filters;

      // Tag filter
      if (tags && tags.length > 0) {
        const noteTags = noteData.tags || [];
        const hasMatchingTag = tags.some(tag =>
          noteTags.some(noteTag => noteTag.toLowerCase() === tag.toLowerCase())
        );
        if (!hasMatchingTag) continue;
      }

      // Date filters
      const createdAt = noteData.createdAt instanceof Timestamp
        ? noteData.createdAt.toDate()
        : new Date();

      if (dateFrom && createdAt < dateFrom) continue;
      if (dateTo && createdAt > dateTo) continue;

      // Status filter
      if (status && noteData.processingStatus !== status) continue;

      // Note type filter
      if (noteType && noteData.noteType !== noteType) continue;
    }

    const result: SearchNoteResult = {
      note: docToResponse(noteData),
      relevanceScore: score,
    };

    if (options.includeChunks) {
      const sortedMatchedChunks = matchedChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      result.matchedChunks = sortedMatchedChunks.map(c => {
        let chunkText = c.text.slice(0, 300) + (c.text.length > 300 ? '...' : '');
        if (options.includeHighlights) {
          chunkText = highlightMatches(chunkText, query);
        }
        return {
          text: chunkText,
          score: c.score,
        };
      });
    }

    results.push(result);
  }

  // Apply sorting
  if (sortBy === 'date') {
    results.sort((a, b) => {
      const dateA = new Date(a.note.createdAt).getTime();
      const dateB = new Date(b.note.createdAt).getTime();
      return order === 'asc' ? dateA - dateB : dateB - dateA;
    });
  } else if (sortBy === 'title') {
    results.sort((a, b) => {
      const titleA = (a.note.title || a.note.text.slice(0, 50)).toLowerCase();
      const titleB = (b.note.title || b.note.text.slice(0, 50)).toLowerCase();
      return order === 'asc'
        ? titleA.localeCompare(titleB)
        : titleB.localeCompare(titleA);
    });
  } else {
    // relevance - already sorted by score, just handle order
    if (order === 'asc') {
      results.reverse();
    }
  }

  // Apply limit after sorting
  const limitedResults = results.slice(0, limit);

  const queryTimeMs = Date.now() - startTime;

  logInfo('Note search completed', {
    query: query.slice(0, 100),
    tenantId,
    mode,
    sortBy,
    order,
    totalMatches: limitedResults.length,
    queryTimeMs,
  });

  return {
    results: limitedResults,
    totalMatches: results.length, // Total before limit
    queryTimeMs,
    mode,
  };
}

/**
 * Trigger async enrichment for a note
 * This runs in the background and updates the note with AI-generated metadata
 */
async function triggerEnrichment(
  noteId: string,
  text: string,
  existingTitle?: string
): Promise<void> {
  const db = getDb();
  const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);

  // Mark enrichment as pending
  await noteRef.update({
    enrichmentStatus: 'pending',
  });

  try {
    const enrichmentResult = await enrichNote(text, existingTitle);

    // Build update object with only non-undefined values
    const updateData: Record<string, unknown> = {
      enrichmentStatus: 'ready',
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (enrichmentResult.title && !existingTitle) {
      updateData.title = enrichmentResult.title;
    }
    if (enrichmentResult.summary) {
      updateData.summary = enrichmentResult.summary;
    }
    if (enrichmentResult.noteType) {
      updateData.noteType = enrichmentResult.noteType;
    }
    if (enrichmentResult.actionItems && enrichmentResult.actionItems.length > 0) {
      updateData.actionItems = enrichmentResult.actionItems;
    }
    if (enrichmentResult.entities && enrichmentResult.entities.length > 0) {
      updateData.entities = enrichmentResult.entities;
    }

    await noteRef.update(updateData);

    logInfo('Note enrichment completed', {
      noteId,
      hasTitle: !!enrichmentResult.title,
      hasSummary: !!enrichmentResult.summary,
      noteType: enrichmentResult.noteType,
      actionItemCount: enrichmentResult.actionItems?.length || 0,
      entityCount: enrichmentResult.entities?.length || 0,
    });
  } catch (err) {
    await noteRef.update({
      enrichmentStatus: 'failed',
    });
    logError('Note enrichment failed', err, { noteId });
  }
}

/**
 * Autocomplete suggestion types
 */
export type AutocompleteSuggestionType = 'note' | 'tag' | 'title';

/**
 * Individual autocomplete suggestion
 */
export interface AutocompleteSuggestion {
  type: AutocompleteSuggestionType;
  text: string;
  noteId?: string;
  score: number;
}

/**
 * Autocomplete response
 */
export interface AutocompleteResponse {
  suggestions: AutocompleteSuggestion[];
  queryTimeMs: number;
}

/**
 * Options for autocomplete query
 */
export interface AutocompleteOptions {
  /** Maximum suggestions to return */
  limit?: number;
  /** Types of suggestions to include */
  types?: AutocompleteSuggestionType[];
}

/**
 * Get autocomplete suggestions for a search prefix
 *
 * Returns suggestions from:
 * - Note titles that match the prefix
 * - Tags that match the prefix
 * - Note snippets that contain the prefix
 *
 * @param prefix - The search prefix to autocomplete
 * @param tenantId - Tenant ID for data isolation
 * @param options - Autocomplete options
 * @returns Autocomplete suggestions sorted by relevance
 */
export async function getAutocompleteSuggestions(
  prefix: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: AutocompleteOptions = {}
): Promise<AutocompleteResponse> {
  const startTime = Date.now();
  const limit = Math.min(options.limit || 5, 20);
  const types = options.types || ['notes', 'tags', 'titles'] as unknown as AutocompleteSuggestionType[];

  const db = getDb();
  const suggestions: AutocompleteSuggestion[] = [];
  const prefixLower = prefix.toLowerCase();

  // Fetch recent notes for the tenant (limit to 100 for performance)
  const notesSnapshot = await db
    .collection(NOTES_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const seenTexts = new Set<string>();

  for (const doc of notesSnapshot.docs) {
    const noteData = doc.data() as NoteDoc;

    // Title suggestions
    if (types.includes('title' as AutocompleteSuggestionType) && noteData.title) {
      const titleLower = noteData.title.toLowerCase();
      if (titleLower.includes(prefixLower) && !seenTexts.has(titleLower)) {
        seenTexts.add(titleLower);
        const startsWithBonus = titleLower.startsWith(prefixLower) ? 0.3 : 0;
        suggestions.push({
          type: 'title',
          text: noteData.title,
          noteId: doc.id,
          score: 0.8 + startsWithBonus,
        });
      }
    }

    // Tag suggestions
    if (types.includes('tag' as AutocompleteSuggestionType) && noteData.tags) {
      for (const tag of noteData.tags) {
        const tagLower = tag.toLowerCase();
        if (tagLower.includes(prefixLower) && !seenTexts.has(`tag:${tagLower}`)) {
          seenTexts.add(`tag:${tagLower}`);
          const startsWithBonus = tagLower.startsWith(prefixLower) ? 0.2 : 0;
          suggestions.push({
            type: 'tag',
            text: tag,
            score: 0.7 + startsWithBonus,
          });
        }
      }
    }

    // Note snippet suggestions
    if (types.includes('note' as AutocompleteSuggestionType)) {
      const textLower = noteData.text.toLowerCase();
      const matchIndex = textLower.indexOf(prefixLower);
      if (matchIndex !== -1) {
        // Extract a snippet around the match
        const snippetStart = Math.max(0, matchIndex - 20);
        const snippetEnd = Math.min(noteData.text.length, matchIndex + prefix.length + 50);
        let snippet = noteData.text.slice(snippetStart, snippetEnd);
        if (snippetStart > 0) snippet = '...' + snippet;
        if (snippetEnd < noteData.text.length) snippet = snippet + '...';

        const snippetKey = snippet.toLowerCase().slice(0, 50);
        if (!seenTexts.has(snippetKey)) {
          seenTexts.add(snippetKey);
          suggestions.push({
            type: 'note',
            text: snippet,
            noteId: doc.id,
            score: 0.5,
          });
        }
      }
    }
  }

  // Sort by score and limit
  suggestions.sort((a, b) => b.score - a.score);
  const limitedSuggestions = suggestions.slice(0, limit);

  const queryTimeMs = Date.now() - startTime;

  logInfo('Autocomplete suggestions generated', {
    prefix: prefix.slice(0, 50),
    tenantId,
    suggestionCount: limitedSuggestions.length,
    queryTimeMs,
  });

  return {
    suggestions: limitedSuggestions,
    queryTimeMs,
  };
}
