/**
 * AuroraNotes API - User Memory Service
 * 
 * Stores and summarizes user preferences, context, and learned patterns.
 * Used to personalize chat responses and improve relevance over time.
 * 
 * Memory types:
 * - preferences: User's stated preferences (e.g., "I prefer bullet points")
 * - context: Learned context about the user (e.g., "Works at Acme Corp")
 * - patterns: Observed usage patterns (e.g., "Often asks about meetings")
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from './firestore';
import { logInfo, logWarn } from './utils';

// =============================================================================
// Configuration
// =============================================================================

const USER_MEMORY_COLLECTION = 'user_memory';
const MAX_MEMORIES_PER_TYPE = 50;
const MAX_MEMORY_LENGTH = 500;
const MEMORY_SUMMARY_THRESHOLD = 20; // Summarize when this many memories exist

// =============================================================================
// Types
// =============================================================================

export type MemoryType = 'preference' | 'context' | 'pattern';

export interface UserMemory {
  id: string;
  tenantId: string;
  type: MemoryType;
  content: string;
  source?: string; // Where this memory came from (e.g., "chat", "explicit")
  confidence: number; // 0-1, how confident we are in this memory
  createdAt: Timestamp | FieldValue;
  lastUsedAt?: Timestamp | FieldValue;
  useCount: number;
}

export interface UserMemoryDoc {
  tenantId: string;
  memories: UserMemory[];
  summary?: string;
  summaryUpdatedAt?: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// =============================================================================
// Memory Operations
// =============================================================================

/**
 * Get all memories for a user
 */
export async function getUserMemories(tenantId: string): Promise<UserMemory[]> {
  const db = getDb();
  const doc = await db.collection(USER_MEMORY_COLLECTION).doc(tenantId).get();
  
  if (!doc.exists) return [];
  
  const data = doc.data() as UserMemoryDoc;
  return data.memories || [];
}

/**
 * Get memories of a specific type
 */
export async function getMemoriesByType(
  tenantId: string,
  type: MemoryType
): Promise<UserMemory[]> {
  const memories = await getUserMemories(tenantId);
  return memories.filter(m => m.type === type);
}

/**
 * Add a new memory for a user
 */
export async function addUserMemory(
  tenantId: string,
  type: MemoryType,
  content: string,
  options: { source?: string; confidence?: number } = {}
): Promise<UserMemory> {
  const { source = 'chat', confidence = 0.7 } = options;
  
  // Validate and truncate content
  const trimmedContent = content.trim().slice(0, MAX_MEMORY_LENGTH);
  if (!trimmedContent) {
    throw new Error('Memory content cannot be empty');
  }

  const db = getDb();
  const docRef = db.collection(USER_MEMORY_COLLECTION).doc(tenantId);
  
  const memory: UserMemory = {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    type,
    content: trimmedContent,
    source,
    confidence,
    createdAt: FieldValue.serverTimestamp(),
    useCount: 0,
  };

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    let memories: UserMemory[] = [];
    
    if (doc.exists) {
      const data = doc.data() as UserMemoryDoc;
      memories = data.memories || [];
    }

    // Check for duplicates (similar content)
    const isDuplicate = memories.some(m => 
      m.type === type && 
      m.content.toLowerCase() === trimmedContent.toLowerCase()
    );
    
    if (isDuplicate) {
      logInfo('Duplicate memory skipped', { tenantId, type, content: trimmedContent.slice(0, 50) });
      return;
    }

    // Add new memory
    memories.push(memory);

    // Enforce per-type limit (remove oldest)
    const typeMemories = memories.filter(m => m.type === type);
    if (typeMemories.length > MAX_MEMORIES_PER_TYPE) {
      const oldestId = typeMemories
        .sort((a, b) => (a.useCount || 0) - (b.useCount || 0))[0].id;
      memories = memories.filter(m => m.id !== oldestId);
    }

    tx.set(docRef, {
      tenantId,
      memories,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  logInfo('User memory added', { tenantId, type, memoryId: memory.id });
  return memory;
}

/**
 * Get a formatted summary of user memories for chat context
 */
export async function getMemorySummary(tenantId: string): Promise<string | null> {
  const memories = await getUserMemories(tenantId);
  if (memories.length === 0) return null;

  const preferences = memories.filter(m => m.type === 'preference');
  const context = memories.filter(m => m.type === 'context');

  const parts: string[] = [];

  if (preferences.length > 0) {
    const prefList = preferences
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 5)
      .map(p => `- ${p.content}`)
      .join('\n');
    parts.push(`User preferences:\n${prefList}`);
  }

  if (context.length > 0) {
    const ctxList = context
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 5)
      .map(c => `- ${c.content}`)
      .join('\n');
    parts.push(`Known context:\n${ctxList}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

/**
 * Mark a memory as used (for relevance tracking)
 */
export async function touchMemory(tenantId: string, memoryId: string): Promise<void> {
  const db = getDb();
  const docRef = db.collection(USER_MEMORY_COLLECTION).doc(tenantId);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    if (!doc.exists) return;

    const data = doc.data() as UserMemoryDoc;
    const memories = data.memories.map(m => {
      if (m.id === memoryId) {
        return {
          ...m,
          lastUsedAt: FieldValue.serverTimestamp(),
          useCount: (m.useCount || 0) + 1,
        };
      }
      return m;
    });

    tx.update(docRef, { memories, updatedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * Delete a specific memory
 */
export async function deleteMemory(tenantId: string, memoryId: string): Promise<boolean> {
  const db = getDb();
  const docRef = db.collection(USER_MEMORY_COLLECTION).doc(tenantId);

  let deleted = false;
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    if (!doc.exists) return;

    const data = doc.data() as UserMemoryDoc;
    const before = data.memories.length;
    const memories = data.memories.filter(m => m.id !== memoryId);
    deleted = memories.length < before;

    if (deleted) {
      tx.update(docRef, { memories, updatedAt: FieldValue.serverTimestamp() });
    }
  });

  if (deleted) {
    logInfo('User memory deleted', { tenantId, memoryId });
  }
  return deleted;
}

/**
 * Clear all memories for a user
 */
export async function clearUserMemories(tenantId: string): Promise<void> {
  const db = getDb();
  await db.collection(USER_MEMORY_COLLECTION).doc(tenantId).delete();
  logInfo('All user memories cleared', { tenantId });
}

