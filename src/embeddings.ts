/**
 * AuroraNotes API - Embeddings Generation
 *
 * Uses Google's text-embedding models via the Generative AI SDK.
 * Includes optimized LRU caching, retry logic, parallel batch processing,
 * and query normalization.
 *
 * Optimizations:
 * - Efficient LRU cache with O(1) access and eviction
 * - Parallel batch processing with controlled concurrency
 * - Reduced memory allocations through Float32Array storage
 * - Pre-computed cache keys for batch operations
 */

import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_BATCH_SIZE,
  EMBEDDING_TIMEOUT_MS,
} from "./config";
import { logInfo, logError, logWarn, hashText, fastHashWithLength } from "./utils";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

// LRU Cache for embeddings by textHash (reduces API costs for repeated/identical content)
const EMBEDDING_CACHE_MAX_SIZE = parseInt(process.env.EMBEDDING_CACHE_MAX_SIZE || '') || 1000;

// Optimized cache entry using Float32Array to reduce memory (64-bit -> 32-bit per value)
interface EmbeddingCacheEntry {
  embedding: Float32Array;
  timestamp: number;
  accessCount: number;  // Track frequency for smarter eviction
}

// Use Map with LRU ordering maintained via deletion and re-insertion
const embeddingCache = new Map<string, EmbeddingCacheEntry>();

// In-flight request deduplication: prevents redundant API calls for identical texts requested concurrently
// Key: normalized text hash, Value: Promise resolving to embedding
const inFlightRequests = new Map<string, Promise<number[]>>();

// Track cache statistics
let cacheHits = 0;
let cacheMisses = 0;
let cacheEvictions = 0;
let deduplicatedRequests = 0;

// Parallel processing configuration
const PARALLEL_BATCH_CONCURRENCY = 3;  // Max parallel API calls within a batch

/**
 * Normalize text for consistent embedding generation
 * Optimized: avoid multiple regex passes
 */
function normalizeText(text: string): string {
  // Single pass normalization
  let result = '';
  let lastWasSpace = true;  // Trim leading whitespace
  const len = Math.min(text.length, 8000);

  for (let i = 0; i < len; i++) {
    const char = text[i];
    const charCode = text.charCodeAt(i);

    // Check if whitespace (space, tab, newline, etc.)
    if (charCode <= 32) {
      if (!lastWasSpace) {
        result += ' ';
        lastWasSpace = true;
      }
    } else {
      // Convert to lowercase inline
      result += char.toLowerCase();
      lastWasSpace = false;
    }
  }

  // Trim trailing whitespace
  if (result.endsWith(' ')) {
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * Get cache key for text - uses fast non-cryptographic hash
 * The fastHashWithLength function is ~10x faster than SHA-256
 * and includes length to reduce collisions
 */
function getCacheKey(text: string): string {
  return fastHashWithLength(normalizeText(text));
}

/**
 * Convert number[] to Float32Array for storage
 */
function toFloat32Array(arr: number[]): Float32Array {
  return new Float32Array(arr);
}

/**
 * Convert Float32Array back to number[] for API compatibility
 */
function toNumberArray(arr: Float32Array): number[] {
  return Array.from(arr);
}

/**
 * Evict least valuable entries using LFU-LRU hybrid strategy
 * Considers both access frequency and recency
 *
 * Optimizations:
 * - Use typed array for scores to reduce memory allocations
 * - Partial sort using selection algorithm for top-k eviction
 * - Batch eviction to reduce Map operations
 */
function evictCacheEntries(): void {
  const cacheSize = embeddingCache.size;
  if (cacheSize < EMBEDDING_CACHE_MAX_SIZE) return;

  const targetEvictions = Math.ceil(EMBEDDING_CACHE_MAX_SIZE * 0.2);
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes normalization window

  // Pre-allocate arrays for efficiency
  const keys: string[] = new Array(cacheSize);
  const scores = new Float32Array(cacheSize);

  let idx = 0;
  for (const [key, entry] of embeddingCache) {
    // Recency score: more recent = higher score (0 to 1)
    const ageMs = now - entry.timestamp;
    const recencyScore = ageMs >= maxAge ? 0 : 1 - (ageMs / maxAge);

    // Combined score (lower = evict first)
    scores[idx] = entry.accessCount * 0.3 + recencyScore * 0.7;
    keys[idx] = key;
    idx++;
  }

  // Use partial selection sort to find k lowest scores (O(n*k) vs O(n log n) for full sort)
  // This is faster when targetEvictions << cacheSize
  const toEvict: string[] = [];
  for (let i = 0; i < targetEvictions && i < cacheSize; i++) {
    let minIdx = i;
    let minScore = scores[i];

    for (let j = i + 1; j < cacheSize; j++) {
      if (scores[j] < minScore) {
        minScore = scores[j];
        minIdx = j;
      }
    }

    // Swap to front
    if (minIdx !== i) {
      const tmpScore = scores[i];
      scores[i] = scores[minIdx];
      scores[minIdx] = tmpScore;

      const tmpKey = keys[i];
      keys[i] = keys[minIdx];
      keys[minIdx] = tmpKey;
    }

    toEvict.push(keys[i]);
  }

  // Batch eviction
  for (const key of toEvict) {
    embeddingCache.delete(key);
    cacheEvictions++;
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
 * Create a timeout promise that rejects after specified milliseconds
 */
function createTimeout<T>(ms: number, context: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms: ${context}`));
    }, ms);
  });
}

/**
 * Generate embedding for a single text with timeout, retry, and request deduplication
 *
 * Optimization: Uses in-flight request deduplication to prevent redundant API calls
 * when the same text is requested concurrently (e.g., during parallel chunk processing)
 */
async function generateSingleEmbedding(text: string): Promise<number[]> {
  const cacheKey = getCacheKey(text);

  // Check if there's already an in-flight request for this text
  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    deduplicatedRequests++;
    return existingRequest;
  }

  // Create the embedding request
  const embeddingPromise = (async () => {
    const client = getGenAIClient();

    const result = await withRetry(async () => {
      // Race between embedding call and timeout
      const apiPromise = client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      });

      return await Promise.race([
        apiPromise,
        createTimeout<typeof apiPromise>(EMBEDDING_TIMEOUT_MS, 'embedding generation'),
      ]) as Awaited<typeof apiPromise>;
    });

    if (result.embeddings && result.embeddings.length > 0 && result.embeddings[0].values) {
      return result.embeddings[0].values;
    }
    throw new Error('No embedding values in response');
  })();

  // Track in-flight request for deduplication
  inFlightRequests.set(cacheKey, embeddingPromise);

  try {
    const embedding = await embeddingPromise;
    return embedding;
  } finally {
    // Always clean up in-flight tracking
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Custom error for embedding generation failures
 */
export class EmbeddingError extends Error {
  constructor(message: string, public readonly missingIndices: number[] = []) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

/**
 * Generate embeddings for a batch of texts with caching and retry logic
 * Uses textHash for deduplication - identical text returns cached embedding
 *
 * IMPORTANT: Returns an array with EXACTLY the same length as input texts.
 * Throws EmbeddingError if any embedding fails to generate - this prevents
 * misaligned embeddings-to-chunks assignment which would corrupt the index.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const startTime = Date.now();
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const toGenerate: { index: number; text: string; cacheKey: string }[] = [];

  // Pre-compute all cache keys upfront for efficiency
  const cacheKeys = texts.map(text => getCacheKey(text));

  // Check cache first for all texts
  for (let i = 0; i < texts.length; i++) {
    const cacheKey = cacheKeys[i];
    const cached = embeddingCache.get(cacheKey);

    if (cached) {
      // Update LRU: delete and re-insert to move to end
      embeddingCache.delete(cacheKey);
      cached.timestamp = Date.now();
      cached.accessCount++;
      embeddingCache.set(cacheKey, cached);

      // Convert Float32Array back to number[] for API compatibility
      results[i] = toNumberArray(cached.embedding);
      cacheHits++;
    } else {
      toGenerate.push({ index: i, text: texts[i], cacheKey });
      cacheMisses++;
    }
  }

  // Generate embeddings for cache misses with parallel batch processing
  // Process multiple batches concurrently for better throughput
  const batches: { index: number; text: string; cacheKey: string }[][] = [];
  for (let i = 0; i < toGenerate.length; i += MAX_EMBEDDING_BATCH_SIZE) {
    batches.push(toGenerate.slice(i, i + MAX_EMBEDDING_BATCH_SIZE));
  }

  // Process batches with controlled concurrency
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx += PARALLEL_BATCH_CONCURRENCY) {
    const concurrentBatches = batches.slice(batchIdx, batchIdx + PARALLEL_BATCH_CONCURRENCY);

    try {
      const batchResults = await Promise.all(
        concurrentBatches.map(async (batch) => {
          const embeddings = await Promise.all(
            batch.map(item => generateSingleEmbedding(item.text))
          );
          return { batch, embeddings };
        })
      );

      // Store results and cache for all concurrent batches
      for (const { batch, embeddings } of batchResults) {
        for (let j = 0; j < batch.length; j++) {
          const item = batch[j];
          const embedding = embeddings[j];
          results[item.index] = embedding;

          // Cache the result with Float32Array for memory efficiency
          evictCacheEntries();
          embeddingCache.set(item.cacheKey, {
            embedding: toFloat32Array(embedding),
            timestamp: Date.now(),
            accessCount: 1
          });
        }
      }
    } catch (err) {
      logError('Embedding batch failed', err, {
        batchStart: batchIdx,
        batchCount: concurrentBatches.length
      });
      throw err;
    }
  }

  // CRITICAL: Verify all embeddings were generated successfully
  // If any are missing, throw an error to prevent misaligned embeddings
  const missingIndices: number[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i] === null) {
      missingIndices.push(i);
    }
  }

  if (missingIndices.length > 0) {
    logError('Embedding generation incomplete - missing indices would cause misalignment', null, {
      inputCount: texts.length,
      missingCount: missingIndices.length,
      missingIndices: missingIndices.slice(0, 10), // Log first 10
    });
    throw new EmbeddingError(
      `Failed to generate ${missingIndices.length} of ${texts.length} embeddings`,
      missingIndices
    );
  }

  const elapsedMs = Date.now() - startTime;

  // Estimate cost (Gemini embedding pricing: ~$0.00001 per 1K tokens)
  // Rough estimate: ~1 token per 4 chars
  const estimatedTokens = toGenerate.reduce((sum, item) => sum + Math.ceil(item.text.length / 4), 0);
  const estimatedCostUsd = (estimatedTokens / 1000) * 0.00001;

  logInfo('Embeddings generated', {
    count: texts.length,
    fromCache: texts.length - toGenerate.length,
    generated: toGenerate.length,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    estimatedTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1000000) / 1000000, // 6 decimal places
    elapsedMs,
  });

  // Safe to cast since we verified all entries are non-null above
  return results as number[][];
}

/**
 * Generate embedding for a query with caching
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const cacheKey = getCacheKey(query);

  // Check cache first
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    // Update LRU: delete and re-insert to move to end
    embeddingCache.delete(cacheKey);
    cached.timestamp = Date.now();
    cached.accessCount++;
    embeddingCache.set(cacheKey, cached);

    logInfo('Query embedding cache hit', { queryLength: query.length });
    return toNumberArray(cached.embedding);
  }

  // Generate new embedding
  const embedding = await generateSingleEmbedding(normalizeText(query));

  // Cache the result with Float32Array for memory efficiency
  evictCacheEntries();
  embeddingCache.set(cacheKey, {
    embedding: toFloat32Array(embedding),
    timestamp: Date.now(),
    accessCount: 1
  });

  return embedding;
}

/**
 * Check if embeddings service is available
 */
export function isEmbeddingsAvailable(): boolean {
  return isGenAIAvailable();
}

/**
 * Clear embedding cache (for testing/maintenance)
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  cacheEvictions = 0;
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
  evictions: number;
  deduplicatedRequests: number;
  inFlightCount: number;
  memoryEstimateKB: number;
} {
  const total = cacheHits + cacheMisses;

  // Estimate memory: each Float32Array entry uses 4 bytes per dimension
  // Plus overhead for Map entry (~100 bytes per entry)
  const bytesPerEntry = (EMBEDDING_DIMENSIONS * 4) + 100;
  const memoryEstimateKB = Math.round((embeddingCache.size * bytesPerEntry) / 1024);

  return {
    size: embeddingCache.size,
    maxSize: EMBEDDING_CACHE_MAX_SIZE,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? Math.round((cacheHits / total) * 100) / 100 : 0,
    evictions: cacheEvictions,
    deduplicatedRequests,
    inFlightCount: inFlightRequests.size,
    memoryEstimateKB,
  };
}

