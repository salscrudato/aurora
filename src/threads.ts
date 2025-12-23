/**
 * AuroraNotes API - Conversation Threads Service
 *
 * Manages conversation threads with message history for multi-turn chat.
 * Each thread belongs to a tenant (user) and contains a list of messages.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './firestore';
import {
  ThreadDoc,
  ThreadResponse,
  ThreadDetailResponse,
  ThreadsListResponse,
  ThreadMessagesResponse,
  ThreadMessage,
  MessageRole,
  Source,
} from './types';
import { timestampToISO, encodeCursor, parseCursor, logInfo, logError } from './utils';

// Collection name
const THREADS_COLLECTION = 'threads';

// Configuration
const MAX_MESSAGES_PER_THREAD = 100;
const MAX_MESSAGE_LENGTH = 10000;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

/**
 * Convert ThreadDoc to ThreadResponse (list view)
 */
function docToResponse(doc: ThreadDoc): ThreadResponse {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    title: doc.title,
    summary: doc.summary,
    messageCount: doc.messages.length,
    lastActivityAt: timestampToISO(doc.lastActivityAt),
    createdAt: timestampToISO(doc.createdAt),
    updatedAt: timestampToISO(doc.updatedAt),
  };
}

/**
 * Convert ThreadDoc to ThreadDetailResponse (full view with messages)
 */
function docToDetailResponse(doc: ThreadDoc): ThreadDetailResponse {
  return {
    ...docToResponse(doc),
    messages: doc.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources,
      createdAt: timestampToISO(m.createdAt),
    })),
  };
}

/**
 * Create a new conversation thread
 */
export async function createThread(
  tenantId: string,
  options: { title?: string; metadata?: Record<string, unknown> } = {}
): Promise<ThreadResponse> {
  const id = uuidv4();
  const now = FieldValue.serverTimestamp();

  const doc: ThreadDoc = {
    id,
    tenantId,
    title: options.title,
    messages: [],
    metadata: options.metadata,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb();
  await db.collection(THREADS_COLLECTION).doc(id).set(doc);

  // Fetch to get server timestamps
  const savedDoc = await db.collection(THREADS_COLLECTION).doc(id).get();
  const savedData = savedDoc.data() as ThreadDoc;

  logInfo('Thread created', { threadId: id, tenantId });

  return docToResponse(savedData);
}

/**
 * Get a thread by ID with all messages
 */
export async function getThread(
  threadId: string,
  tenantId: string
): Promise<ThreadDetailResponse | null> {
  const db = getDb();
  const doc = await db.collection(THREADS_COLLECTION).doc(threadId).get();

  if (!doc.exists) return null;

  const data = doc.data() as ThreadDoc;

  // Verify tenant access
  if (data.tenantId !== tenantId) return null;

  return docToDetailResponse(data);
}

/**
 * List threads for a tenant with pagination
 */
export async function listThreads(
  tenantId: string,
  limit: number = DEFAULT_PAGE_LIMIT,
  cursor?: string
): Promise<ThreadsListResponse> {
  const db = getDb();
  const pageLimit = Math.min(Math.max(1, limit), MAX_PAGE_LIMIT);
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
  const docs = snap.docs.map((d) => d.data() as ThreadDoc);

  const hasMore = docs.length > pageLimit;
  const resultDocs = hasMore ? docs.slice(0, pageLimit) : docs;

  let nextCursor: string | null = null;
  if (hasMore && resultDocs.length > 0) {
    const lastDoc = resultDocs[resultDocs.length - 1];
    const lastActivity = lastDoc.lastActivityAt as Timestamp;
    nextCursor = encodeCursor(lastActivity, lastDoc.id);
  }

  return {
    threads: resultDocs.map(docToResponse),
    cursor: nextCursor,
    hasMore,
  };
}

/**
 * Add a message to a thread
 */
export async function addMessage(
  threadId: string,
  tenantId: string,
  role: MessageRole,
  content: string,
  sources?: Source[]
): Promise<ThreadMessage | null> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);

  // Fetch thread and verify access
  const threadDoc = await threadRef.get();
  if (!threadDoc.exists) return null;

  const threadData = threadDoc.data() as ThreadDoc;
  if (threadData.tenantId !== tenantId) return null;

  // Check message limit
  if (threadData.messages.length >= MAX_MESSAGES_PER_THREAD) {
    throw new Error(`Thread has reached maximum message limit (${MAX_MESSAGES_PER_THREAD})`);
  }

  // Validate content length
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }

  // Create message
  const message: ThreadMessage = {
    id: uuidv4(),
    role,
    content: content.trim(),
    sources,
    createdAt: FieldValue.serverTimestamp(),
  };

  // Update thread with new message
  await threadRef.update({
    messages: FieldValue.arrayUnion(message),
    lastActivityAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    // Auto-generate title from first user message if not set
    ...(threadData.messages.length === 0 && role === 'user' && !threadData.title
      ? { title: content.slice(0, 100) + (content.length > 100 ? '...' : '') }
      : {}),
  });

  logInfo('Message added to thread', {
    threadId,
    messageId: message.id,
    role,
    contentLength: content.length,
  });

  return message;
}

/**
 * Delete a thread
 */
export async function deleteThread(
  threadId: string,
  tenantId: string
): Promise<boolean> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);

  const threadDoc = await threadRef.get();
  if (!threadDoc.exists) return false;

  const threadData = threadDoc.data() as ThreadDoc;
  if (threadData.tenantId !== tenantId) return false;

  await threadRef.delete();

  logInfo('Thread deleted', { threadId, tenantId });

  return true;
}

/**
 * Get recent messages from a thread for context
 * Returns the last N messages for use in chat context
 */
export async function getRecentMessages(
  threadId: string,
  tenantId: string,
  limit: number = 10
): Promise<ThreadMessage[]> {
  const thread = await getThread(threadId, tenantId);
  if (!thread) return [];

  // Return last N messages
  return thread.messages.slice(-limit).map((m) => ({
    id: m.id,
    role: m.role as MessageRole,
    content: m.content,
    sources: m.sources,
    createdAt: FieldValue.serverTimestamp(), // Placeholder, actual value from thread
  }));
}

/**
 * Update a thread's metadata (title, summary)
 */
export async function updateThread(
  threadId: string,
  tenantId: string,
  updates: { title?: string; summary?: string }
): Promise<ThreadResponse | null> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);

  const threadDoc = await threadRef.get();
  if (!threadDoc.exists) return null;

  const threadData = threadDoc.data() as ThreadDoc;
  if (threadData.tenantId !== tenantId) return null;

  const updateData: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (updates.title !== undefined) {
    updateData.title = updates.title;
  }
  if (updates.summary !== undefined) {
    updateData.summary = updates.summary;
  }

  await threadRef.update(updateData);

  logInfo('Thread updated', { threadId, tenantId, updates: Object.keys(updates) });

  // Fetch updated document
  const updatedDoc = await threadRef.get();
  return docToResponse(updatedDoc.data() as ThreadDoc);
}

/**
 * Get paginated messages from a thread
 * Uses cursor-based pagination with message index
 */
export async function getThreadMessages(
  threadId: string,
  tenantId: string,
  options: { limit?: number; cursor?: string; order?: 'asc' | 'desc' } = {}
): Promise<ThreadMessagesResponse | null> {
  const { limit = 20, cursor, order = 'desc' } = options;

  const thread = await getThread(threadId, tenantId);
  if (!thread) return null;

  const messages = thread.messages;
  const totalCount = messages.length;

  // Parse cursor (message index)
  let startIndex = order === 'desc' ? messages.length - 1 : 0;
  if (cursor) {
    const cursorIndex = parseInt(cursor, 10);
    if (!isNaN(cursorIndex)) {
      startIndex = cursorIndex;
    }
  }

  // Get messages based on order
  let resultMessages: typeof messages;
  let nextCursor: string | null = null;

  if (order === 'desc') {
    // Newest first
    const endIndex = Math.max(0, startIndex - limit + 1);
    resultMessages = messages.slice(endIndex, startIndex + 1).reverse();
    if (endIndex > 0) {
      nextCursor = String(endIndex - 1);
    }
  } else {
    // Oldest first
    const endIndex = Math.min(messages.length, startIndex + limit);
    resultMessages = messages.slice(startIndex, endIndex);
    if (endIndex < messages.length) {
      nextCursor = String(endIndex);
    }
  }

  return {
    messages: resultMessages.map((m) => ({
      id: m.id,
      role: m.role as MessageRole,
      content: m.content,
      sources: m.sources,
      createdAt: timestampToISO(m.createdAt),
    })),
    cursor: nextCursor,
    hasMore: nextCursor !== null,
    totalCount,
  };
}

