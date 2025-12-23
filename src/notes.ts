/**
 * AuroraNotes API - Notes Service
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./firestore";
import { NOTES_COLLECTION, MAX_NOTE_LENGTH, DEFAULT_TENANT_ID, NOTES_PAGE_LIMIT, MAX_NOTES_PAGE_LIMIT, CHUNKS_COLLECTION } from "./config";
import { NoteDoc, NoteResponse, NotesListResponse, DeleteNoteResponse } from "./types";
import { timestampToISO, parseCursor, encodeCursor, logInfo, logError, logWarn, sanitizeText, isValidTenantId } from "./utils";
import { processNoteChunks } from "./chunking";
import { invalidateTenantCache } from "./cache";
import { getVertexIndex } from "./vectorIndex";
import { enrichNote } from "./enrichment";

// =============================================================================
// Types
// =============================================================================

interface CreateNoteOptions {
  title?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Helpers
// =============================================================================

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

// =============================================================================
// Create Note
// =============================================================================

export async function createNote(
  text: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: CreateNoteOptions = {}
): Promise<NoteResponse> {
  const trimmedText = sanitizeText(text, MAX_NOTE_LENGTH + 100).trim();
  if (!trimmedText) throw new Error('text is required');
  if (trimmedText.length > MAX_NOTE_LENGTH) throw new Error(`text too long (max ${MAX_NOTE_LENGTH})`);
  if (!isValidTenantId(tenantId)) throw new Error('invalid tenantId format');

  const id = uuidv4();
  const now = FieldValue.serverTimestamp();
  const db = getDb();

  const doc: NoteDoc = {
    id,
    text: trimmedText,
    tenantId,
    processingStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    ...(options.title && { title: options.title.trim().slice(0, 500) }),
    ...(options.tags?.length && { tags: options.tags.slice(0, 20).map(t => t.trim().slice(0, 50)) }),
    ...(options.metadata && { metadata: options.metadata }),
  };

  await db.collection(NOTES_COLLECTION).doc(id).set(doc);
  const savedDoc = await db.collection(NOTES_COLLECTION).doc(id).get();
  let savedData = savedDoc.data() as NoteDoc;

  // Process chunks synchronously
  try {
    await processNoteChunks(savedData);
    await db.collection(NOTES_COLLECTION).doc(id).update({
      processingStatus: 'ready',
      updatedAt: FieldValue.serverTimestamp(),
    });
    savedData.processingStatus = 'ready';
  } catch (err) {
    await db.collection(NOTES_COLLECTION).doc(id).update({
      processingStatus: 'failed',
      processingError: err instanceof Error ? err.message : 'Unknown error',
      updatedAt: FieldValue.serverTimestamp(),
    });
    savedData.processingStatus = 'failed';
    logError('Chunk processing failed', err, { noteId: id });
  }

  invalidateTenantCache(tenantId);

  // Trigger async enrichment
  triggerEnrichment(id, trimmedText, options.title).catch((err) => {
    logError('Enrichment trigger failed', err, { noteId: id });
  });

  logInfo('Note created', { noteId: id, tenantId, textLength: trimmedText.length });
  return docToResponse(savedData);
}

// =============================================================================
// List Notes
// =============================================================================

export interface ListNotesOptions {
  tag?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  status?: 'pending' | 'ready' | 'failed';
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  order?: 'asc' | 'desc';
  search?: string;
}

export async function listNotes(
  tenantId: string = DEFAULT_TENANT_ID,
  limit: number = NOTES_PAGE_LIMIT,
  cursor?: string,
  options: ListNotesOptions = {}
): Promise<NotesListResponse> {
  const db = getDb();
  const pageLimit = Math.min(Math.max(1, limit), MAX_NOTES_PAGE_LIMIT);
  const cursorData = parseCursor(cursor);
  const allTags = [...(options.tag ? [options.tag] : []), ...(options.tags || [])];

  try {
    return await listNotesOptimized(db, tenantId, pageLimit, cursorData, options, allTags);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('FAILED_PRECONDITION') || msg.includes('requires an index')) {
      logWarn('Notes index not found, using legacy query', { tenantId });
      return await listNotesLegacy(db, tenantId, pageLimit, cursorData, options, allTags);
    }
    throw err;
  }
}

function applyClientSideFilters(docs: NoteDoc[], options: ListNotesOptions, allTags: string[]): NoteDoc[] {
  return docs.filter(doc => {
    if (allTags.length > 0) {
      const noteTags = doc.tags || [];
      if (!allTags.some(tag => noteTags.some(nt => nt.toLowerCase() === tag.toLowerCase()))) return false;
    }
    if (options.dateFrom || options.dateTo) {
      const createdAt = doc.createdAt instanceof Timestamp ? doc.createdAt.toDate() : new Date();
      if (options.dateFrom && createdAt < options.dateFrom) return false;
      if (options.dateTo && createdAt > options.dateTo) return false;
    }
    if (options.status && doc.processingStatus !== options.status) return false;
    if (options.search) {
      const s = options.search.toLowerCase();
      if (!(doc.title || '').toLowerCase().startsWith(s) && !doc.text.toLowerCase().includes(s)) return false;
    }
    return true;
  });
}

function sortNotes(docs: NoteDoc[], sortBy: 'createdAt' | 'updatedAt' | 'title' = 'createdAt', order: 'asc' | 'desc' = 'desc'): NoteDoc[] {
  return [...docs].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'title') {
      cmp = (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase());
    } else {
      const dateA = a[sortBy] instanceof Timestamp ? (a[sortBy] as Timestamp).toDate().getTime() : 0;
      const dateB = b[sortBy] instanceof Timestamp ? (b[sortBy] as Timestamp).toDate().getTime() : 0;
      cmp = dateA - dateB;
    }
    return order === 'desc' ? -cmp : cmp;
  });
}

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

  let query: FirebaseFirestore.Query = db.collection(NOTES_COLLECTION).where('tenantId', '==', tenantId);
  if (options.status) query = query.where('processingStatus', '==', options.status);
  if (allTags.length === 1) query = query.where('tags', 'array-contains', allTags[0]);
  if (sortBy === 'createdAt') {
    if (options.dateFrom) query = query.where('createdAt', '>=', Timestamp.fromDate(options.dateFrom));
    if (options.dateTo) query = query.where('createdAt', '<=', Timestamp.fromDate(options.dateTo));
  }

  query = query.orderBy(sortBy, order).orderBy('__name__', order);
  if (cursorData) query = query.startAfter(Timestamp.fromDate(cursorData.createdAt), cursorData.id);

  const needsClientFiltering = allTags.length > 1 || options.search || (sortBy !== 'createdAt' && (options.dateFrom || options.dateTo));
  query = query.limit(needsClientFiltering ? pageLimit * 3 : pageLimit + 1);

  const snap = await query.get();
  let docs = snap.docs.map(d => ({ ...d.data() as NoteDoc, tenantId: (d.data() as NoteDoc).tenantId || DEFAULT_TENANT_ID }));
  if (needsClientFiltering) docs = applyClientSideFilters(docs, options, allTags.length > 1 ? allTags : []);

  const hasMore = docs.length > pageLimit;
  const resultDocs = hasMore ? docs.slice(0, pageLimit) : docs;
  const lastDoc = resultDocs[resultDocs.length - 1];
  const nextCursor = hasMore && lastDoc ? encodeCursor(lastDoc.createdAt as Timestamp, lastDoc.id) : null;

  return { notes: resultDocs.map(docToResponse), cursor: nextCursor, hasMore };
}

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

  let query: FirebaseFirestore.Query = db.collection(NOTES_COLLECTION).orderBy('createdAt', 'desc').limit(pageLimit * 5);
  if (cursorData) query = query.startAfter(Timestamp.fromDate(cursorData.createdAt));

  const snap = await query.get();
  let docs = snap.docs
    .map(d => ({ ...d.data() as NoteDoc, tenantId: (d.data() as NoteDoc).tenantId || DEFAULT_TENANT_ID }))
    .filter(d => d.tenantId === tenantId);

  docs = applyClientSideFilters(docs, options, allTags);
  if (sortBy !== 'createdAt' || order !== 'desc') docs = sortNotes(docs, sortBy, order);

  const hasMore = docs.length > pageLimit;
  const resultDocs = hasMore ? docs.slice(0, pageLimit) : docs;
  const lastDoc = resultDocs[resultDocs.length - 1];
  const nextCursor = hasMore && lastDoc ? encodeCursor(lastDoc.createdAt as Timestamp, lastDoc.id) : null;

  return { notes: resultDocs.map(docToResponse), cursor: nextCursor, hasMore };
}

// =============================================================================
// Get Note
// =============================================================================

export async function getNote(noteId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<NoteResponse | null> {
  const db = getDb();
  const doc = await db.collection(NOTES_COLLECTION).doc(noteId).get();
  if (!doc.exists) return null;
  const data = doc.data() as NoteDoc;
  return data.tenantId === tenantId ? docToResponse(data) : null;
}

// =============================================================================
// Update Note
// =============================================================================

interface UpdateNoteOptions {
  title?: string;
  text?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export async function updateNote(
  noteId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: UpdateNoteOptions = {}
): Promise<NoteResponse | null> {
  if (!noteId || typeof noteId !== 'string') throw new Error('noteId is required');
  if (!isValidTenantId(tenantId)) throw new Error('invalid tenantId format');
  if (!options.text && !options.title && !options.tags && !options.metadata) {
    throw new Error('at least one field must be provided for update');
  }

  if (options.text !== undefined) {
    const trimmed = sanitizeText(options.text, MAX_NOTE_LENGTH + 100).trim();
    if (!trimmed) throw new Error('text cannot be empty');
    if (trimmed.length > MAX_NOTE_LENGTH) throw new Error(`text too long (max ${MAX_NOTE_LENGTH})`);
    options.text = trimmed;
  }

  const db = getDb();
  const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);
  const noteDoc = await noteRef.get();
  if (!noteDoc.exists) return null;

  const noteData = noteDoc.data() as NoteDoc;
  if (noteData.tenantId !== tenantId) {
    logWarn('Update denied - tenant mismatch', { noteId });
    return null;
  }

  const textChanged = options.text !== undefined && options.text !== noteData.text;
  const updateData: Partial<NoteDoc> = {
    updatedAt: FieldValue.serverTimestamp(),
    ...(options.text !== undefined && { text: options.text }),
    ...(textChanged && { processingStatus: 'pending' as const }),
    ...(options.title !== undefined && { title: options.title.trim().slice(0, 500) }),
    ...(options.tags !== undefined && { tags: options.tags.slice(0, 20).map(t => t.trim().slice(0, 50)) }),
    ...(options.metadata !== undefined && { metadata: options.metadata }),
  };

  await noteRef.update(updateData);

  if (textChanged) {
    try {
      await deleteAndReprocessChunks(db, noteId, noteRef);
    } catch (err) {
      await noteRef.update({ processingStatus: 'failed', processingError: err instanceof Error ? err.message : 'Unknown error' });
      logError('Chunk re-processing failed', err, { noteId });
    }
  }

  invalidateTenantCache(tenantId);
  const finalData = (await noteRef.get()).data() as NoteDoc;
  logInfo('Note updated', { noteId, tenantId, textChanged });
  return docToResponse(finalData);
}

async function deleteAndReprocessChunks(
  db: FirebaseFirestore.Firestore,
  noteId: string,
  noteRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  const chunksSnap = await db.collection(CHUNKS_COLLECTION).where('noteId', '==', noteId).get();
  if (!chunksSnap.empty) {
    const chunkIds: string[] = [];
    const BATCH_SIZE = 400;
    for (let i = 0; i < chunksSnap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchDocs = chunksSnap.docs.slice(i, i + BATCH_SIZE);
      for (const doc of batchDocs) {
        chunkIds.push(doc.id);
        batch.delete(doc.ref);
      }
      await batch.commit();
    }
    const vertexIndex = getVertexIndex();
    if (vertexIndex && chunkIds.length > 0) {
      try { await vertexIndex.remove(chunkIds); } catch { /* best effort */ }
    }
  }
  const updatedData = (await noteRef.get()).data() as NoteDoc;
  await processNoteChunks(updatedData);
  await noteRef.update({ processingStatus: 'ready', updatedAt: FieldValue.serverTimestamp() });
}

// =============================================================================
// Delete Note
// =============================================================================

export async function deleteNote(noteId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<DeleteNoteResponse | null> {
  if (!noteId || typeof noteId !== 'string') throw new Error('noteId is required');
  if (!isValidTenantId(tenantId)) throw new Error('invalid tenantId format');

  const db = getDb();
  const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);
  const noteDoc = await noteRef.get();
  if (!noteDoc.exists) return null;

  const noteData = noteDoc.data() as NoteDoc;
  if (noteData.tenantId !== tenantId) {
    logWarn('Delete denied - tenant mismatch', { noteId });
    return null;
  }

  let chunksDeleted = 0;
  const chunkIds: string[] = [];

  const chunksSnap = await db.collection(CHUNKS_COLLECTION).where('noteId', '==', noteId).get();
  if (!chunksSnap.empty) {
    chunksSnap.docs.forEach(doc => chunkIds.push(doc.id));
    const BATCH_SIZE = 400;
    for (let i = 0; i < chunksSnap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchDocs = chunksSnap.docs.slice(i, i + BATCH_SIZE);
      for (const doc of batchDocs) batch.delete(doc.ref);
      await batch.commit();
      chunksDeleted += batchDocs.length;
    }
  }

  if (chunkIds.length > 0) {
    const vertexIndex = getVertexIndex();
    if (vertexIndex) {
      try { await vertexIndex.remove(chunkIds); } catch { /* best effort */ }
    }
  }

  await noteRef.delete();
  invalidateTenantCache(tenantId);
  logInfo('Note deleted', { noteId, tenantId, chunksDeleted });

  return { success: true, id: noteId, deletedAt: new Date().toISOString(), chunksDeleted };
}

// =============================================================================
// Semantic Search
// =============================================================================

import { retrieveRelevantChunks } from "./retrieval";
import { ScoredChunk } from "./types";

interface SearchNoteResult {
  note: NoteResponse;
  relevanceScore: number;
  matchedChunks?: Array<{ text: string; score: number }>;
}

interface SearchNotesResponse {
  results: SearchNoteResult[];
  totalMatches: number;
  queryTimeMs: number;
  mode?: 'semantic' | 'keyword' | 'hybrid';
}

interface SearchNotesOptions {
  limit?: number;
  threshold?: number;
  includeChunks?: boolean;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  sortBy?: 'relevance' | 'date' | 'title';
  order?: 'asc' | 'desc';
  includeHighlights?: boolean;
  filters?: {
    tags?: string[];
    dateFrom?: Date;
    dateTo?: Date;
    status?: 'pending' | 'ready' | 'failed';
    noteType?: string;
    noteIds?: string[];
  };
}

function highlightMatches(text: string, query: string): string {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  if (terms.length === 0) return text;
  let result = text;
  for (const term of terms) {
    result = result.replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<<$1>>');
  }
  return result;
}

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

  const { chunks } = await retrieveRelevantChunks(query, {
    tenantId,
    topK: limit * 5,
    rerankTo: limit * 3,
    maxAgeDays: options.filters?.dateFrom
      ? Math.ceil((Date.now() - options.filters.dateFrom.getTime()) / (1000 * 60 * 60 * 24))
      : undefined,
    keywords: mode === 'keyword' ? query.split(/\s+/).filter(t => t.length >= 2) : undefined,
  });

  // Group chunks by noteId
  const noteScores = new Map<string, { score: number; chunks: ScoredChunk[] }>();
  for (const chunk of chunks) {
    const score = mode === 'keyword' ? (chunk.keywordScore ?? chunk.score) :
                  mode === 'semantic' ? (chunk.vectorScore ?? chunk.score) : chunk.score;
    const existing = noteScores.get(chunk.noteId);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      existing.chunks.push(chunk);
    } else {
      noteScores.set(chunk.noteId, { score, chunks: [chunk] });
    }
  }

  const noteIdSet = options.filters?.noteIds?.length ? new Set(options.filters.noteIds) : undefined;
  const filteredNotes = Array.from(noteScores.entries())
    .filter(([noteId, data]) => data.score >= threshold && (!noteIdSet || noteIdSet.has(noteId)));

  // Fetch note documents in batch
  const db = getDb();
  const noteDataMap = new Map<string, NoteDoc>();
  const noteIds = filteredNotes.map(([id]) => id);
  for (let i = 0; i < noteIds.length; i += 10) {
    const refs = noteIds.slice(i, i + 10).map(id => db.collection(NOTES_COLLECTION).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) noteDataMap.set(doc.id, doc.data() as NoteDoc);
    }
  }

  // Build results
  const results: SearchNoteResult[] = [];
  for (const [noteId, { score, chunks: matchedChunks }] of filteredNotes) {
    const noteData = noteDataMap.get(noteId);
    if (!noteData || noteData.tenantId !== tenantId) continue;

    if (options.filters) {
      const { tags, dateFrom, dateTo, status, noteType } = options.filters;
      if (tags?.length && !tags.some(t => noteData.tags?.some(nt => nt.toLowerCase() === t.toLowerCase()))) continue;
      const createdAt = noteData.createdAt instanceof Timestamp ? noteData.createdAt.toDate() : new Date();
      if (dateFrom && createdAt < dateFrom) continue;
      if (dateTo && createdAt > dateTo) continue;
      if (status && noteData.processingStatus !== status) continue;
      if (noteType && noteData.noteType !== noteType) continue;
    }

    const result: SearchNoteResult = { note: docToResponse(noteData), relevanceScore: score };
    if (options.includeChunks) {
      result.matchedChunks = matchedChunks.sort((a, b) => b.score - a.score).slice(0, 3).map(c => ({
        text: options.includeHighlights ? highlightMatches(c.text.slice(0, 300), query) : c.text.slice(0, 300) + (c.text.length > 300 ? '...' : ''),
        score: c.score,
      }));
    }
    results.push(result);
  }

  // Sort
  if (sortBy === 'date') {
    results.sort((a, b) => order === 'asc'
      ? new Date(a.note.createdAt).getTime() - new Date(b.note.createdAt).getTime()
      : new Date(b.note.createdAt).getTime() - new Date(a.note.createdAt).getTime());
  } else if (sortBy === 'title') {
    results.sort((a, b) => {
      const titleA = (a.note.title || a.note.text.slice(0, 50)).toLowerCase();
      const titleB = (b.note.title || b.note.text.slice(0, 50)).toLowerCase();
      return order === 'asc' ? titleA.localeCompare(titleB) : titleB.localeCompare(titleA);
    });
  } else if (order === 'asc') {
    results.reverse();
  }

  const limitedResults = results.slice(0, limit);
  logInfo('Search completed', { tenantId, mode, totalMatches: limitedResults.length, queryTimeMs: Date.now() - startTime });
  return { results: limitedResults, totalMatches: results.length, queryTimeMs: Date.now() - startTime, mode };
}

// =============================================================================
// Enrichment
// =============================================================================

async function triggerEnrichment(noteId: string, text: string, existingTitle?: string): Promise<void> {
  const db = getDb();
  const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);
  await noteRef.update({ enrichmentStatus: 'pending' });

  try {
    const result = await enrichNote(text, existingTitle);
    await noteRef.update({
      enrichmentStatus: 'ready',
      updatedAt: FieldValue.serverTimestamp(),
      ...(result.title && !existingTitle && { title: result.title }),
      ...(result.summary && { summary: result.summary }),
      ...(result.noteType && { noteType: result.noteType }),
      ...(result.actionItems?.length && { actionItems: result.actionItems }),
      ...(result.entities?.length && { entities: result.entities }),
    });
    logInfo('Enrichment completed', { noteId });
  } catch (err) {
    await noteRef.update({ enrichmentStatus: 'failed' });
    logError('Enrichment failed', err, { noteId });
  }
}

// =============================================================================
// Autocomplete
// =============================================================================

type SuggestionType = 'note' | 'tag' | 'title';

interface AutocompleteSuggestion {
  type: SuggestionType;
  text: string;
  noteId?: string;
  score: number;
}

interface AutocompleteResponse {
  suggestions: AutocompleteSuggestion[];
  queryTimeMs: number;
}

interface AutocompleteOptions {
  limit?: number;
  types?: SuggestionType[];
}

export async function getAutocompleteSuggestions(
  prefix: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: AutocompleteOptions = {}
): Promise<AutocompleteResponse> {
  const startTime = Date.now();
  const limit = Math.min(options.limit || 5, 20);
  const types = options.types || ['note', 'tag', 'title'];
  const prefixLower = prefix.toLowerCase();

  const db = getDb();
  const snap = await db.collection(NOTES_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const suggestions: AutocompleteSuggestion[] = [];
  const seen = new Set<string>();

  for (const doc of snap.docs) {
    const note = doc.data() as NoteDoc;

    if (types.includes('title') && note.title) {
      const titleLower = note.title.toLowerCase();
      if (titleLower.includes(prefixLower) && !seen.has(titleLower)) {
        seen.add(titleLower);
        suggestions.push({ type: 'title', text: note.title, noteId: doc.id, score: 0.8 + (titleLower.startsWith(prefixLower) ? 0.3 : 0) });
      }
    }

    if (types.includes('tag') && note.tags) {
      for (const tag of note.tags) {
        const tagLower = tag.toLowerCase();
        const key = `tag:${tagLower}`;
        if (tagLower.includes(prefixLower) && !seen.has(key)) {
          seen.add(key);
          suggestions.push({ type: 'tag', text: tag, score: 0.7 + (tagLower.startsWith(prefixLower) ? 0.2 : 0) });
        }
      }
    }

    if (types.includes('note')) {
      const textLower = note.text.toLowerCase();
      const idx = textLower.indexOf(prefixLower);
      if (idx !== -1) {
        const start = Math.max(0, idx - 20);
        const end = Math.min(note.text.length, idx + prefix.length + 50);
        let snippet = (start > 0 ? '...' : '') + note.text.slice(start, end) + (end < note.text.length ? '...' : '');
        const key = snippet.toLowerCase().slice(0, 50);
        if (!seen.has(key)) {
          seen.add(key);
          suggestions.push({ type: 'note', text: snippet, noteId: doc.id, score: 0.5 });
        }
      }
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  logInfo('Autocomplete', { tenantId, count: Math.min(suggestions.length, limit) });
  return { suggestions: suggestions.slice(0, limit), queryTimeMs: Date.now() - startTime };
}
