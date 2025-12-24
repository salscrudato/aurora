/**
 * Conversation Threads Service - Multi-turn chat with message history
 *
 * ARCHITECTURE: Messages are stored in a subcollection for scalability:
 *   threads/{threadId}/messages/{messageId}
 *
 * This allows:
 * - Unlimited messages per thread (no 1MB document limit)
 * - Efficient pagination of messages
 * - Parallel message writes
 * - Better Firestore read/write patterns
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './firestore';
import { ThreadDoc, ThreadResponse, ThreadDetailResponse, ThreadsListResponse, ThreadMessagesResponse, ThreadMessage, MessageRole, Source } from './types';
import { timestampToISO, encodeCursor, parseCursor, logInfo } from './utils';

const THREADS_COLLECTION = 'threads';
const MESSAGES_SUBCOLLECTION = 'messages';
const MAX_MSG_LEN = 10000, DEFAULT_LIMIT = 20, MAX_LIMIT = 100;

/** Thread document (without embedded messages) */
interface ThreadDocV2 {
  id: string;
  tenantId: string;
  title?: string;
  summary?: string;
  messageCount: number;
  metadata?: Record<string, unknown>;
  lastActivityAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Message document in subcollection */
interface MessageDoc {
  id: string;
  threadId: string;
  tenantId: string;
  role: MessageRole;
  content: string;
  sources?: Source[];
  createdAt: Timestamp | FieldValue;
}

function threadDocToResponse(doc: ThreadDocV2): ThreadResponse {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    title: doc.title,
    summary: doc.summary,
    messageCount: doc.messageCount,
    lastActivityAt: timestampToISO(doc.lastActivityAt),
    createdAt: timestampToISO(doc.createdAt),
    updatedAt: timestampToISO(doc.updatedAt),
  };
}

function messageDocToResponse(doc: MessageDoc): { id: string; role: MessageRole; content: string; sources?: Source[]; createdAt: string } {
  return {
    id: doc.id,
    role: doc.role,
    content: doc.content,
    sources: doc.sources,
    createdAt: timestampToISO(doc.createdAt),
  };
}

// Legacy support: convert old embedded messages format
function isLegacyThreadDoc(doc: any): doc is ThreadDoc {
  return Array.isArray(doc.messages);
}

function legacyDocToResponse(doc: ThreadDoc): ThreadResponse {
  return {
    id: doc.id, tenantId: doc.tenantId, title: doc.title, summary: doc.summary,
    messageCount: doc.messages.length, lastActivityAt: timestampToISO(doc.lastActivityAt),
    createdAt: timestampToISO(doc.createdAt), updatedAt: timestampToISO(doc.updatedAt),
  };
}

// =============================================================================
// Thread CRUD Operations
// =============================================================================

export async function createThread(tenantId: string, options: { title?: string; metadata?: Record<string, unknown> } = {}): Promise<ThreadResponse> {
  const id = uuidv4(), now = FieldValue.serverTimestamp();
  const doc: ThreadDocV2 = {
    id,
    tenantId,
    title: options.title,
    messageCount: 0,
    metadata: options.metadata,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const db = getDb();
  await db.collection(THREADS_COLLECTION).doc(id).set(doc);
  const saved = await db.collection(THREADS_COLLECTION).doc(id).get();
  logInfo('Thread created', { threadId: id, tenantId });
  return threadDocToResponse(saved.data() as ThreadDocV2);
}

export async function getThread(threadId: string, tenantId: string): Promise<ThreadDetailResponse | null> {
  const db = getDb();
  const doc = await db.collection(THREADS_COLLECTION).doc(threadId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (data.tenantId !== tenantId) return null;

  // Handle legacy embedded messages format
  if (isLegacyThreadDoc(data)) {
    return {
      ...legacyDocToResponse(data),
      messages: data.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources,
        createdAt: timestampToISO(m.createdAt),
      })),
    };
  }

  // New subcollection format - fetch recent messages
  const messagesSnap = await db
    .collection(THREADS_COLLECTION)
    .doc(threadId)
    .collection(MESSAGES_SUBCOLLECTION)
    .orderBy('createdAt', 'asc')
    .limit(50) // Default limit for detail view
    .get();

  const messages = messagesSnap.docs.map(d => messageDocToResponse(d.data() as MessageDoc));

  return {
    ...threadDocToResponse(data as ThreadDocV2),
    messages,
  };
}

export async function listThreads(tenantId: string, limit = DEFAULT_LIMIT, cursor?: string): Promise<ThreadsListResponse> {
  const db = getDb();
  const pageLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
  const cursorData = parseCursor(cursor);

  let query = db
    .collection(THREADS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('lastActivityAt', 'desc')
    .orderBy('__name__', 'desc')
    .limit(pageLimit + 1);

  if (cursorData) {
    query = query.startAfter(Timestamp.fromDate(cursorData.createdAt), cursorData.id);
  }

  const snap = await query.get();
  const docs = snap.docs.map(d => d.data());
  const hasMore = docs.length > pageLimit;
  const result = hasMore ? docs.slice(0, pageLimit) : docs;

  // Handle both legacy and new format
  const threads = result.map(doc => {
    if (isLegacyThreadDoc(doc)) {
      return legacyDocToResponse(doc);
    }
    return threadDocToResponse(doc as ThreadDocV2);
  });

  const lastDoc = result[result.length - 1];
  const nextCursor = hasMore && lastDoc
    ? encodeCursor(lastDoc.lastActivityAt as Timestamp, lastDoc.id)
    : null;

  return { threads, cursor: nextCursor, hasMore };
}

// =============================================================================
// Message Operations (Subcollection)
// =============================================================================

export async function addMessage(
  threadId: string,
  tenantId: string,
  role: MessageRole,
  content: string,
  sources?: Source[]
): Promise<ThreadMessage | null> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);
  const threadDoc = await threadRef.get();

  if (!threadDoc.exists) return null;
  const threadData = threadDoc.data()!;
  if (threadData.tenantId !== tenantId) return null;

  if (content.length > MAX_MSG_LEN) {
    throw new Error(`Message too long (max ${MAX_MSG_LEN})`);
  }

  const messageId = uuidv4();
  const now = FieldValue.serverTimestamp();

  // Handle legacy format - migrate to subcollection on first new message
  if (isLegacyThreadDoc(threadData)) {
    // Migrate existing messages to subcollection
    const batch = db.batch();
    for (const msg of threadData.messages) {
      const msgRef = threadRef.collection(MESSAGES_SUBCOLLECTION).doc(msg.id);
      batch.set(msgRef, {
        id: msg.id,
        threadId,
        tenantId,
        role: msg.role,
        content: msg.content,
        sources: msg.sources,
        createdAt: msg.createdAt,
      });
    }

    // Update thread to new format
    batch.update(threadRef, {
      messages: FieldValue.delete(),
      messageCount: threadData.messages.length,
    });

    await batch.commit();
    logInfo('Migrated thread to subcollection format', { threadId, messageCount: threadData.messages.length });
  }

  // Create message in subcollection
  const messageDoc: MessageDoc = {
    id: messageId,
    threadId,
    tenantId,
    role,
    content: content.trim(),
    sources,
    createdAt: now,
  };

  const messageRef = threadRef.collection(MESSAGES_SUBCOLLECTION).doc(messageId);
  await messageRef.set(messageDoc);

  // Update thread metadata
  const currentCount = isLegacyThreadDoc(threadData) ? threadData.messages.length : (threadData.messageCount || 0);
  const updateData: Record<string, unknown> = {
    messageCount: currentCount + 1,
    lastActivityAt: now,
    updatedAt: now,
  };

  // Auto-title from first user message
  if (currentCount === 0 && role === 'user' && !threadData.title) {
    updateData.title = content.slice(0, 100) + (content.length > 100 ? '...' : '');
  }

  await threadRef.update(updateData);

  logInfo('Message added', { threadId, messageId, role });
  return { id: messageId, role, content: content.trim(), sources, createdAt: now };
}

export async function deleteThread(threadId: string, tenantId: string): Promise<boolean> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);
  const threadDoc = await threadRef.get();

  if (!threadDoc.exists) return false;
  const data = threadDoc.data()!;
  if (data.tenantId !== tenantId) return false;

  // Delete all messages in subcollection
  const messagesSnap = await threadRef.collection(MESSAGES_SUBCOLLECTION).get();
  const batch = db.batch();
  messagesSnap.docs.forEach(doc => batch.delete(doc.ref));
  batch.delete(threadRef);
  await batch.commit();

  logInfo('Thread deleted', { threadId, tenantId, messagesDeleted: messagesSnap.size });
  return true;
}

export async function getRecentMessages(threadId: string, tenantId: string, limit = 10): Promise<ThreadMessage[]> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);
  const threadDoc = await threadRef.get();

  if (!threadDoc.exists) return [];
  const data = threadDoc.data()!;
  if (data.tenantId !== tenantId) return [];

  // Handle legacy format
  if (isLegacyThreadDoc(data)) {
    return data.messages.slice(-limit).map(m => ({
      id: m.id,
      role: m.role as MessageRole,
      content: m.content,
      sources: m.sources,
      createdAt: m.createdAt,
    }));
  }

  // Subcollection format - get most recent messages
  const messagesSnap = await threadRef
    .collection(MESSAGES_SUBCOLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  // Reverse to get chronological order
  return messagesSnap.docs
    .map(d => d.data() as MessageDoc)
    .reverse()
    .map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources,
      createdAt: m.createdAt,
    }));
}

export async function updateThread(
  threadId: string,
  tenantId: string,
  updates: { title?: string; summary?: string }
): Promise<ThreadResponse | null> {
  const db = getDb();
  const ref = db.collection(THREADS_COLLECTION).doc(threadId);
  const doc = await ref.get();

  if (!doc.exists) return null;
  const data = doc.data()!;
  if (data.tenantId !== tenantId) return null;

  const upd: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (updates.title !== undefined) upd.title = updates.title;
  if (updates.summary !== undefined) upd.summary = updates.summary;

  await ref.update(upd);
  logInfo('Thread updated', { threadId });

  const updated = await ref.get();
  const updatedData = updated.data()!;

  if (isLegacyThreadDoc(updatedData)) {
    return legacyDocToResponse(updatedData);
  }
  return threadDocToResponse(updatedData as ThreadDocV2);
}

export async function getThreadMessages(
  threadId: string,
  tenantId: string,
  options: { limit?: number; cursor?: string; order?: 'asc' | 'desc' } = {}
): Promise<ThreadMessagesResponse | null> {
  const { limit = 20, cursor, order = 'desc' } = options;
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);
  const threadDoc = await threadRef.get();

  if (!threadDoc.exists) return null;
  const data = threadDoc.data()!;
  if (data.tenantId !== tenantId) return null;

  // Handle legacy format
  if (isLegacyThreadDoc(data)) {
    const msgs = data.messages;
    const total = msgs.length;
    let start = order === 'desc' ? msgs.length - 1 : 0;
    if (cursor) {
      const idx = parseInt(cursor, 10);
      if (!isNaN(idx)) start = idx;
    }

    let result: typeof msgs;
    let next: string | null = null;

    if (order === 'desc') {
      const end = Math.max(0, start - limit + 1);
      result = msgs.slice(end, start + 1).reverse();
      if (end > 0) next = String(end - 1);
    } else {
      const end = Math.min(msgs.length, start + limit);
      result = msgs.slice(start, end);
      if (end < msgs.length) next = String(end);
    }

    return {
      messages: result.map(m => ({
        id: m.id,
        role: m.role as MessageRole,
        content: m.content,
        sources: m.sources,
        createdAt: timestampToISO(m.createdAt),
      })),
      cursor: next,
      hasMore: next !== null,
      totalCount: total,
    };
  }

  // Subcollection format with proper cursor-based pagination
  const pageLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
  let query = threadRef
    .collection(MESSAGES_SUBCOLLECTION)
    .orderBy('createdAt', order)
    .limit(pageLimit + 1);

  // Apply cursor if provided
  if (cursor) {
    const cursorData = parseCursor(cursor);
    if (cursorData) {
      query = query.startAfter(Timestamp.fromDate(cursorData.createdAt), cursorData.id);
    }
  }

  const snap = await query.get();
  const docs = snap.docs.map(d => d.data() as MessageDoc);
  const hasMore = docs.length > pageLimit;
  const result = hasMore ? docs.slice(0, pageLimit) : docs;

  const lastDoc = result[result.length - 1];
  const nextCursor = hasMore && lastDoc
    ? encodeCursor(lastDoc.createdAt as Timestamp, lastDoc.id)
    : null;

  return {
    messages: result.map(messageDocToResponse),
    cursor: nextCursor,
    hasMore,
    totalCount: (data as ThreadDocV2).messageCount || 0,
  };
}
