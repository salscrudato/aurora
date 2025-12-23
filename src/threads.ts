/** Conversation Threads Service - Multi-turn chat with message history */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './firestore';
import { ThreadDoc, ThreadResponse, ThreadDetailResponse, ThreadsListResponse, ThreadMessagesResponse, ThreadMessage, MessageRole, Source } from './types';
import { timestampToISO, encodeCursor, parseCursor, logInfo } from './utils';

const THREADS_COLLECTION = 'threads';
const MAX_MESSAGES = 100, MAX_MSG_LEN = 10000, DEFAULT_LIMIT = 20, MAX_LIMIT = 100;

function docToResponse(doc: ThreadDoc): ThreadResponse {
  return {
    id: doc.id, tenantId: doc.tenantId, title: doc.title, summary: doc.summary,
    messageCount: doc.messages.length, lastActivityAt: timestampToISO(doc.lastActivityAt),
    createdAt: timestampToISO(doc.createdAt), updatedAt: timestampToISO(doc.updatedAt),
  };
}

function docToDetailResponse(doc: ThreadDoc): ThreadDetailResponse {
  return {
    ...docToResponse(doc),
    messages: doc.messages.map(m => ({ id: m.id, role: m.role, content: m.content, sources: m.sources, createdAt: timestampToISO(m.createdAt) })),
  };
}

export async function createThread(tenantId: string, options: { title?: string; metadata?: Record<string, unknown> } = {}): Promise<ThreadResponse> {
  const id = uuidv4(), now = FieldValue.serverTimestamp();
  const doc: ThreadDoc = { id, tenantId, title: options.title, messages: [], metadata: options.metadata, lastActivityAt: now, createdAt: now, updatedAt: now };
  const db = getDb();
  await db.collection(THREADS_COLLECTION).doc(id).set(doc);
  const saved = await db.collection(THREADS_COLLECTION).doc(id).get();
  logInfo('Thread created', { threadId: id, tenantId });
  return docToResponse(saved.data() as ThreadDoc);
}

export async function getThread(threadId: string, tenantId: string): Promise<ThreadDetailResponse | null> {
  const doc = await getDb().collection(THREADS_COLLECTION).doc(threadId).get();
  if (!doc.exists) return null;
  const data = doc.data() as ThreadDoc;
  return data.tenantId === tenantId ? docToDetailResponse(data) : null;
}

export async function listThreads(tenantId: string, limit = DEFAULT_LIMIT, cursor?: string): Promise<ThreadsListResponse> {
  const db = getDb(), pageLimit = Math.min(Math.max(1, limit), MAX_LIMIT), cursorData = parseCursor(cursor);
  let query = db.collection(THREADS_COLLECTION).where('tenantId', '==', tenantId).orderBy('lastActivityAt', 'desc').orderBy('__name__', 'desc').limit(pageLimit + 1);
  if (cursorData) query = query.startAfter(Timestamp.fromDate(cursorData.createdAt), cursorData.id);
  const snap = await query.get(), docs = snap.docs.map(d => d.data() as ThreadDoc);
  const hasMore = docs.length > pageLimit, result = hasMore ? docs.slice(0, pageLimit) : docs;
  const nextCursor = hasMore && result.length ? encodeCursor(result[result.length - 1].lastActivityAt as Timestamp, result[result.length - 1].id) : null;
  return { threads: result.map(docToResponse), cursor: nextCursor, hasMore };
}

export async function addMessage(threadId: string, tenantId: string, role: MessageRole, content: string, sources?: Source[]): Promise<ThreadMessage | null> {
  const db = getDb(), ref = db.collection(THREADS_COLLECTION).doc(threadId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const data = doc.data() as ThreadDoc;
  if (data.tenantId !== tenantId) return null;
  if (data.messages.length >= MAX_MESSAGES) throw new Error(`Thread limit reached (${MAX_MESSAGES})`);
  if (content.length > MAX_MSG_LEN) throw new Error(`Message too long (max ${MAX_MSG_LEN})`);

  const msg: ThreadMessage = { id: uuidv4(), role, content: content.trim(), sources, createdAt: FieldValue.serverTimestamp() };
  await ref.update({
    messages: FieldValue.arrayUnion(msg), lastActivityAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    ...(data.messages.length === 0 && role === 'user' && !data.title ? { title: content.slice(0, 100) + (content.length > 100 ? '...' : '') } : {}),
  });
  logInfo('Message added', { threadId, messageId: msg.id, role });
  return msg;
}

export async function deleteThread(threadId: string, tenantId: string): Promise<boolean> {
  const ref = getDb().collection(THREADS_COLLECTION).doc(threadId);
  const doc = await ref.get();
  if (!doc.exists) return false;
  const data = doc.data() as ThreadDoc;
  if (data.tenantId !== tenantId) return false;
  await ref.delete();
  logInfo('Thread deleted', { threadId, tenantId });
  return true;
}

export async function getRecentMessages(threadId: string, tenantId: string, limit = 10): Promise<ThreadMessage[]> {
  const thread = await getThread(threadId, tenantId);
  if (!thread) return [];
  return thread.messages.slice(-limit).map(m => ({ id: m.id, role: m.role as MessageRole, content: m.content, sources: m.sources, createdAt: FieldValue.serverTimestamp() }));
}

export async function updateThread(threadId: string, tenantId: string, updates: { title?: string; summary?: string }): Promise<ThreadResponse | null> {
  const ref = getDb().collection(THREADS_COLLECTION).doc(threadId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const data = doc.data() as ThreadDoc;
  if (data.tenantId !== tenantId) return null;
  const upd: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (updates.title !== undefined) upd.title = updates.title;
  if (updates.summary !== undefined) upd.summary = updates.summary;
  await ref.update(upd);
  logInfo('Thread updated', { threadId });
  const updated = await ref.get();
  return docToResponse(updated.data() as ThreadDoc);
}

export async function getThreadMessages(threadId: string, tenantId: string, options: { limit?: number; cursor?: string; order?: 'asc' | 'desc' } = {}): Promise<ThreadMessagesResponse | null> {
  const { limit = 20, cursor, order = 'desc' } = options;
  const thread = await getThread(threadId, tenantId);
  if (!thread) return null;

  const msgs = thread.messages, total = msgs.length;
  let start = order === 'desc' ? msgs.length - 1 : 0;
  if (cursor) { const idx = parseInt(cursor, 10); if (!isNaN(idx)) start = idx; }

  let result: typeof msgs, next: string | null = null;
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
    messages: result.map(m => ({ id: m.id, role: m.role as MessageRole, content: m.content, sources: m.sources, createdAt: timestampToISO(m.createdAt) })),
    cursor: next, hasMore: next !== null, totalCount: total,
  };
}
