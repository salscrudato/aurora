/**
 * AuroraNotes API - Embeddings Generation
 *
 * Uses Google's text-embedding models via the Generative AI SDK.
 * Features LRU caching, retry logic, and parallel batch processing.
 */

import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_BATCH_SIZE,
  EMBEDDING_TIMEOUT_MS,
} from "./config";
import { logInfo, logError, logWarn, fastHashWithLength } from "./utils";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

// =============================================================================
// Constants
// =============================================================================

const CACHE_MAX_SIZE = 1000;
const CACHE_EVICT_RATIO = 0.2;
const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const PARALLEL_BATCH_CONCURRENCY = 3;
const MAX_TEXT_LENGTH = 8000;

// =============================================================================
// Types
// =============================================================================

interface CacheEntry {
  embedding: Float32Array;
  timestamp: number;
  accessCount: number;
}

// =============================================================================
// State
// =============================================================================

const cache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<number[]>>();

// =============================================================================
// Text Processing
// =============================================================================

/** Single-pass text normalization: lowercase, collapse whitespace, truncate */
function normalizeText(text: string): string {
  let result = '';
  let lastWasSpace = true;
  const len = Math.min(text.length, MAX_TEXT_LENGTH);

  for (let i = 0; i < len; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode <= 32) {
      if (!lastWasSpace) {
        result += ' ';
        lastWasSpace = true;
      }
    } else {
      result += text[i].toLowerCase();
      lastWasSpace = false;
    }
  }

  return result.endsWith(' ') ? result.slice(0, -1) : result;
}

function getCacheKey(text: string): string {
  return fastHashWithLength(normalizeText(text));
}

// =============================================================================
// Cache Management
// =============================================================================

/** LFU-LRU hybrid eviction using partial selection sort */
function evictCacheEntries(): void {
  if (cache.size < CACHE_MAX_SIZE) return;

  const targetEvictions = Math.ceil(CACHE_MAX_SIZE * CACHE_EVICT_RATIO);
  const now = Date.now();

  const keys: string[] = [];
  const scores: number[] = [];

  for (const [key, entry] of cache) {
    const ageMs = now - entry.timestamp;
    const recencyScore = ageMs >= CACHE_MAX_AGE_MS ? 0 : 1 - (ageMs / CACHE_MAX_AGE_MS);
    scores.push(entry.accessCount * 0.3 + recencyScore * 0.7);
    keys.push(key);
  }

  // Partial selection sort to find k lowest scores
  for (let i = 0; i < targetEvictions && i < keys.length; i++) {
    let minIdx = i;
    for (let j = i + 1; j < keys.length; j++) {
      if (scores[j] < scores[minIdx]) minIdx = j;
    }
    if (minIdx !== i) {
      [scores[i], scores[minIdx]] = [scores[minIdx], scores[i]];
      [keys[i], keys[minIdx]] = [keys[minIdx], keys[i]];
    }
    cache.delete(keys[i]);
  }
}

// =============================================================================
// Retry & Timeout
// =============================================================================

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('INVALID_ARGUMENT') || msg.includes('PERMISSION_DENIED')) throw err;

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
        logWarn('Embedding API retry', { attempt: attempt + 1, delayMs: delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms));
}

// =============================================================================
// Single Embedding Generation
// =============================================================================

async function generateSingleEmbedding(text: string): Promise<number[]> {
  const cacheKey = getCacheKey(text);

  // Deduplicate concurrent requests for same text
  const existing = inFlightRequests.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const client = getGenAIClient();
    const result = await withRetry(async () => {
      const apiPromise = client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });
      return await Promise.race([apiPromise, timeout<typeof apiPromise>(EMBEDDING_TIMEOUT_MS)]) as Awaited<typeof apiPromise>;
    });

    if (result.embeddings?.[0]?.values) return result.embeddings[0].values;
    throw new Error('No embedding values in response');
  })();

  inFlightRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

// =============================================================================
// Cache Helpers
// =============================================================================

function updateCacheLRU(cacheKey: string, entry: CacheEntry): void {
  cache.delete(cacheKey);
  entry.timestamp = Date.now();
  entry.accessCount++;
  cache.set(cacheKey, entry);
}

function cacheEmbedding(cacheKey: string, embedding: number[]): void {
  evictCacheEntries();
  cache.set(cacheKey, {
    embedding: new Float32Array(embedding),
    timestamp: Date.now(),
    accessCount: 1,
  });
}

// =============================================================================
// Public API
// =============================================================================

export class EmbeddingError extends Error {
  constructor(message: string, public readonly missingIndices: number[] = []) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

/**
 * Generate embeddings for a batch of texts with caching.
 * Returns array with EXACTLY the same length as input texts.
 * Throws EmbeddingError if any embedding fails.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const startTime = Date.now();
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const toGenerate: { index: number; text: string; cacheKey: string }[] = [];
  const cacheKeys = texts.map(getCacheKey);

  // Check cache
  for (let i = 0; i < texts.length; i++) {
    const cached = cache.get(cacheKeys[i]);
    if (cached) {
      updateCacheLRU(cacheKeys[i], cached);
      results[i] = Array.from(cached.embedding);
    } else {
      toGenerate.push({ index: i, text: texts[i], cacheKey: cacheKeys[i] });
    }
  }

  // Generate in parallel batches
  const batches: typeof toGenerate[] = [];
  for (let i = 0; i < toGenerate.length; i += MAX_EMBEDDING_BATCH_SIZE) {
    batches.push(toGenerate.slice(i, i + MAX_EMBEDDING_BATCH_SIZE));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx += PARALLEL_BATCH_CONCURRENCY) {
    const concurrent = batches.slice(batchIdx, batchIdx + PARALLEL_BATCH_CONCURRENCY);
    try {
      const batchResults = await Promise.all(
        concurrent.map(async batch => ({
          batch,
          embeddings: await Promise.all(batch.map(item => generateSingleEmbedding(item.text))),
        }))
      );

      for (const { batch, embeddings } of batchResults) {
        for (let j = 0; j < batch.length; j++) {
          results[batch[j].index] = embeddings[j];
          cacheEmbedding(batch[j].cacheKey, embeddings[j]);
        }
      }
    } catch (err) {
      logError('Embedding batch failed', err, { batchStart: batchIdx });
      throw err;
    }
  }

  // Verify completeness
  const missing = results.map((r, i) => r === null ? i : -1).filter(i => i >= 0);
  if (missing.length > 0) {
    logError('Embedding generation incomplete', null, { missing: missing.slice(0, 10) });
    throw new EmbeddingError(`Failed to generate ${missing.length} of ${texts.length} embeddings`, missing);
  }

  logInfo('Embeddings generated', {
    count: texts.length,
    fromCache: texts.length - toGenerate.length,
    generated: toGenerate.length,
    elapsedMs: Date.now() - startTime,
  });

  return results as number[][];
}

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const cacheKey = getCacheKey(query);
  const cached = cache.get(cacheKey);

  if (cached) {
    updateCacheLRU(cacheKey, cached);
    return Array.from(cached.embedding);
  }

  const embedding = await generateSingleEmbedding(normalizeText(query));
  cacheEmbedding(cacheKey, embedding);
  return embedding;
}

export function isEmbeddingsAvailable(): boolean {
  return isGenAIAvailable();
}
