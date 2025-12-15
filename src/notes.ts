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
import { timestampToISO, parseCursor, encodeCursor, logInfo, logError, sanitizeText, isValidTenantId } from "./utils";
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
 * Note: For backward compatibility with notes created before tenantId was added,
 * we fetch all notes and filter client-side when querying for 'public' tenant.
 * New deployments should use Firestore index on tenantId.
 */
export async function listNotes(
  tenantId: string = DEFAULT_TENANT_ID,
  limit: number = NOTES_PAGE_LIMIT,
  cursor?: string
): Promise<NotesListResponse> {
  const db = getDb();

  // Enforce limits
  const pageLimit = Math.min(Math.max(1, limit), MAX_NOTES_PAGE_LIMIT);

  // Build base query - order by createdAt desc
  // For backward compatibility, we don't filter by tenantId in query
  // (old notes may not have tenantId field)
  let query = db
    .collection(NOTES_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(pageLimit + 1); // Fetch one extra to detect hasMore

  // Apply cursor if provided
  const cursorData = parseCursor(cursor);
  if (cursorData) {
    query = query.startAfter(Timestamp.fromDate(cursorData.createdAt));
  }

  const snap = await query.get();

  // Map and filter by tenantId (for backward compatibility)
  // Notes without tenantId are treated as 'public'
  const allDocs = snap.docs.map(d => {
    const data = d.data() as NoteDoc;
    // Set default tenantId if missing (backward compatibility)
    if (!data.tenantId) {
      data.tenantId = DEFAULT_TENANT_ID;
    }
    return data;
  });

  // Filter by tenantId
  const docs = allDocs.filter(d => d.tenantId === tenantId);
  
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

