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
 * List notes with cursor-based pagination
 *
 * Uses stable ordering: createdAt DESC, id DESC to ensure deterministic pagination.
 * The cursor encodes both createdAt and id to handle timestamp collisions correctly.
 *
 * PREFERRED FIRESTORE INDEX (for best performance):
 *   Collection: notes
 *   Fields: tenantId ASC, createdAt DESC, __name__ DESC
 *
 * Falls back to client-side filtering if index doesn't exist yet.
 */
export async function listNotes(
  tenantId: string = DEFAULT_TENANT_ID,
  limit: number = NOTES_PAGE_LIMIT,
  cursor?: string
): Promise<NotesListResponse> {
  const db = getDb();
  const pageLimit = Math.min(Math.max(1, limit), MAX_NOTES_PAGE_LIMIT);
  const cursorData = parseCursor(cursor);

  // Try optimized query with index first, fall back to legacy if index missing
  try {
    return await listNotesOptimized(db, tenantId, pageLimit, cursorData);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('FAILED_PRECONDITION') || errorMessage.includes('requires an index')) {
      logWarn('Notes index not found, using legacy query', { tenantId });
      return await listNotesLegacy(db, tenantId, pageLimit, cursorData);
    }
    throw err;
  }
}

/**
 * Optimized query using composite index
 */
async function listNotesOptimized(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  pageLimit: number,
  cursorData: { createdAt: Date; id: string } | null
): Promise<NotesListResponse> {
  let query = db
    .collection(NOTES_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .orderBy('__name__', 'desc')
    .limit(pageLimit + 1);

  if (cursorData) {
    query = query.startAfter(
      Timestamp.fromDate(cursorData.createdAt),
      cursorData.id
    );
  }

  const snap = await query.get();

  // Map documents to NoteDoc (no client-side filtering needed anymore)
  const docs = snap.docs.map(d => {
    const data = d.data() as NoteDoc;
    // Ensure tenantId is set (should always be present after backfill)
    if (!data.tenantId) {
      data.tenantId = DEFAULT_TENANT_ID;
    }
    return data;
  });

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
  cursorData: { createdAt: Date; id: string } | null
): Promise<NotesListResponse> {
  // Fetch more than needed to account for client-side filtering
  const fetchLimit = pageLimit * 3;

  let query = db
    .collection(NOTES_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(fetchLimit + 1);

  if (cursorData) {
    query = query.startAfter(Timestamp.fromDate(cursorData.createdAt));
  }

  const snap = await query.get();

  // Client-side filtering (legacy mode)
  const allDocs = snap.docs.map(d => {
    const data = d.data() as NoteDoc;
    if (!data.tenantId) {
      data.tenantId = DEFAULT_TENANT_ID;
    }
    return data;
  });

  const docs = allDocs.filter(d => d.tenantId === tenantId);

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
