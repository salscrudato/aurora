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
import { NoteDoc, NoteResponse, NotesListResponse } from "./types";
import { timestampToISO, parseCursor, encodeCursor, logInfo, logError, logWarn, sanitizeText, isValidTenantId } from "./utils";
import { enqueueNoteProcessing } from "./queue";

/**
 * Convert Firestore document to API response
 */
function docToResponse(doc: NoteDoc): NoteResponse {
  return {
    id: doc.id,
    text: doc.text,
    tenantId: doc.tenantId,
    createdAt: timestampToISO(doc.createdAt),
    updatedAt: timestampToISO(doc.updatedAt),
  };
}

/**
 * Create a new note with input validation and sanitization
 */
export async function createNote(
  text: string,
  tenantId: string = DEFAULT_TENANT_ID
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
  
  const doc: NoteDoc = {
    id,
    text: trimmedText,
    tenantId,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb();
  await db.collection(NOTES_COLLECTION).doc(id).set(doc);
  
  // Fetch the document to get actual server timestamp
  const savedDoc = await db.collection(NOTES_COLLECTION).doc(id).get();
  const savedData = savedDoc.data() as NoteDoc;
  
  // Enqueue for background chunk/embedding processing with backpressure
  const enqueued = enqueueNoteProcessing(savedData);
  if (!enqueued) {
    logError('Failed to enqueue note for processing - queue full', null, { noteId: id });
  }
  
  logInfo('Note created', { 
    noteId: id, 
    tenantId, 
    textLength: trimmedText.length 
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

