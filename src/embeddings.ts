/**
 * AuroraNotes API - Embeddings Generation
 *
 * Uses Google's text-embedding models via the Generative AI SDK.
 * Includes LRU caching, retry logic, and query normalization.
 */

import { GoogleGenAI } from "@google/genai";
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_BATCH_SIZE,
} from "./config";
import { logInfo, logError, logWarn, hashText } from "./utils";

let genaiClient: GoogleGenAI | null = null;

// LRU Cache for embeddings by textHash (reduces API costs for repeated/identical content)
const EMBEDDING_CACHE_MAX_SIZE = parseInt(process.env.EMBEDDING_CACHE_MAX_SIZE || '') || 1000;
const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();

// Track cache statistics
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Get or initialize the GenAI client
 */
function getGenAIClient(): GoogleGenAI {
  if (!genaiClient) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required');
    }
    genaiClient = new GoogleGenAI({ apiKey });
  }
  return genaiClient;
}

/**
 * Normalize text for consistent embedding generation
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000); // Limit input length
}

/**
 * Get cache key for text
 */
function getCacheKey(text: string): string {
  return hashText(normalizeText(text));
}

/**
 * Evict oldest entries if cache is full
 */
function evictOldestCacheEntries(): void {
  if (embeddingCache.size < EMBEDDING_CACHE_MAX_SIZE) return;

  const entries = Array.from(embeddingCache.entries());
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

  const toRemove = entries.slice(0, Math.floor(EMBEDDING_CACHE_MAX_SIZE * 0.2));
  for (const [key] of toRemove) {
    embeddingCache.delete(key);
  }
}

/**
 * Retry with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry on certain errors
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage.includes('INVALID_ARGUMENT') ||
          errMessage.includes('PERMISSION_DENIED')) {
        throw err;
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
        logWarn('Embedding API retry', { attempt: attempt + 1, delayMs: delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Generate embedding for a single text with caching
 */
async function generateSingleEmbedding(text: string): Promise<number[]> {
  const client = getGenAIClient();

  const result = await withRetry(async () => {
    return await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });
  });

  if (result.embeddings && result.embeddings.length > 0 && result.embeddings[0].values) {
    return result.embeddings[0].values;
  }
  throw new Error('No embedding values in response');
}

/**
 * Generate embeddings for a batch of texts with caching and retry logic
 * Uses textHash for deduplication - identical text returns cached embedding
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const startTime = Date.now();
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const toGenerate: { index: number; text: string; cacheKey: string }[] = [];

  // Check cache first for all texts
  for (let i = 0; i < texts.length; i++) {
    const cacheKey = getCacheKey(texts[i]);
    const cached = embeddingCache.get(cacheKey);

    if (cached) {
      cached.timestamp = Date.now(); // Update LRU timestamp
      results[i] = cached.embedding;
      cacheHits++;
    } else {
      toGenerate.push({ index: i, text: texts[i], cacheKey });
      cacheMisses++;
    }
  }

  // Generate embeddings for cache misses in batches
  for (let i = 0; i < toGenerate.length; i += MAX_EMBEDDING_BATCH_SIZE) {
    const batch = toGenerate.slice(i, i + MAX_EMBEDDING_BATCH_SIZE);

    try {
      const batchEmbeddings = await Promise.all(
        batch.map(item => generateSingleEmbedding(item.text))
      );

      // Store results and cache
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const embedding = batchEmbeddings[j];
        results[item.index] = embedding;

        // Cache the result
        evictOldestCacheEntries();
        embeddingCache.set(item.cacheKey, { embedding, timestamp: Date.now() });
      }
    } catch (err) {
      logError('Embedding batch failed', err, {
        batchStart: i,
        batchSize: batch.length
      });
      throw err;
    }
  }

  const elapsedMs = Date.now() - startTime;
  logInfo('Embeddings generated', {
    count: texts.length,
    fromCache: texts.length - toGenerate.length,
    generated: toGenerate.length,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    elapsedMs,
  });

  return results.filter((r): r is number[] => r !== null);
}

/**
 * Generate embedding for a query with caching
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const cacheKey = getCacheKey(query);

  // Check cache first
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    cached.timestamp = Date.now(); // Update LRU timestamp
    logInfo('Query embedding cache hit', { queryLength: query.length });
    return cached.embedding;
  }

  // Generate new embedding
  const embedding = await generateSingleEmbedding(normalizeText(query));

  // Cache the result
  evictOldestCacheEntries();
  embeddingCache.set(cacheKey, { embedding, timestamp: Date.now() });

  return embedding;
}

/**
 * Check if embeddings service is available
 */
export function isEmbeddingsAvailable(): boolean {
  try {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    return !!apiKey;
  } catch {
    return false;
  }
}

/**
 * Clear embedding cache (for testing/maintenance)
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/**
 * Get cache stats (for monitoring)
 */
export function getEmbeddingCacheStats(): {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const total = cacheHits + cacheMisses;
  return {
    size: embeddingCache.size,
    maxSize: EMBEDDING_CACHE_MAX_SIZE,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? Math.round((cacheHits / total) * 100) / 100 : 0,
  };
}

