/**
 * AuroraNotes API - In-Memory Cache Module
 *
 * Provides TTL-based caching for performance optimization.
 * Caches are process-local and cleared on restart.
 *
 * Optimizations:
 * - LFU-LRU hybrid eviction strategy for better hit rates
 * - Batch eviction to reduce overhead
 * - Lazy cleanup to avoid blocking operations
 * - Memory-efficient entry tracking
 */

import { logInfo, logWarn } from "./utils";

// Cache configuration
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000; // Max entries per cache
const CLEANUP_INTERVAL_MS = 60 * 1000; // Cleanup every minute
const BATCH_EVICTION_PERCENT = 0.1; // Evict 10% when at capacity

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessTime: number;  // Track recency for LRU component
}

/**
 * Generic TTL cache with LFU-LRU hybrid eviction
 *
 * Eviction strategy combines:
 * - Frequency (LFU): Prefer keeping frequently accessed items
 * - Recency (LRU): Among items with similar frequency, prefer recent ones
 * - TTL: Expired items are always evicted first
 */
export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly name: string;
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(name: string, ttlMs: number = DEFAULT_TTL_MS, maxSize: number = MAX_CACHE_SIZE) {
    this.name = name;
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.startCleanup();
  }

  /**
   * Get a value from the cache
   * O(1) operation with LRU update via Map delete/re-insert
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessTime = now;

    // Move to end of Map for LRU ordering (O(1) amortized)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache
   * Uses batch eviction when at capacity for efficiency
   */
  set(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();

    // Check if key already exists (update case)
    const existing = this.cache.get(key);
    if (existing) {
      existing.value = value;
      existing.expiresAt = now + (ttlMs ?? this.ttlMs);
      existing.accessCount++;
      existing.lastAccessTime = now;
      // Move to end for LRU
      this.cache.delete(key);
      this.cache.set(key, existing);
      return;
    }

    // Evict if at capacity (batch eviction for efficiency)
    if (this.cache.size >= this.maxSize) {
      this.evictBatch();
    }

    this.cache.set(key, {
      value,
      expiresAt: now + (ttlMs ?? this.ttlMs),
      accessCount: 1,
      lastAccessTime: now,
    });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all entries matching a prefix
   * Optimized: collect keys first to avoid iterator invalidation
   */
  deleteByPrefix(prefix: string): number {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    return keysToDelete.length;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hits: number; misses: number; hitRate: number; evictions: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Math.round((this.hits / total) * 100) : 0,
      evictions: this.evictions,
    };
  }

  /**
   * Stop the cleanup timer (for graceful shutdown)
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Pre-warm cache with multiple entries (for batch operations)
   */
  setMany(entries: Array<{ key: string; value: T; ttlMs?: number }>): void {
    for (const { key, value, ttlMs } of entries) {
      this.set(key, value, ttlMs);
    }
  }

  /**
   * Get multiple values at once (for batch operations)
   */
  getMany(keys: string[]): Map<string, T> {
    const results = new Map<string, T>();
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        results.set(key, value);
      }
    }
    return results;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
    // Don't prevent process exit
    this.cleanupTimer.unref();
  }

  private cleanup(): void {
    const now = Date.now();
    let expired = 0;
    const keysToDelete: string[] = [];

    // Collect expired keys first
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    // Delete in batch
    for (const key of keysToDelete) {
      this.cache.delete(key);
      expired++;
    }

    if (expired > 0) {
      logInfo(`Cache ${this.name} cleanup`, { expired, remaining: this.cache.size });
    }
  }

  /**
   * Batch eviction using LFU-LRU hybrid scoring
   * Evicts BATCH_EVICTION_PERCENT of entries to reduce eviction frequency
   *
   * Optimizations:
   * - Use typed array for scores to reduce memory allocations
   * - Partial selection sort for finding k lowest scores (O(n*k) vs O(n log n))
   * - Early exit when expired entries satisfy eviction target
   */
  private evictBatch(): void {
    const targetEvictions = Math.max(1, Math.ceil(this.maxSize * BATCH_EVICTION_PERCENT));
    const now = Date.now();

    // First, evict any expired entries
    const expiredKeys: string[] = [];
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.evictions++;
    }

    // If we evicted enough expired entries, we're done
    if (expiredKeys.length >= targetEvictions) {
      return;
    }

    // Otherwise, use LFU-LRU hybrid scoring to select victims
    const remaining = targetEvictions - expiredKeys.length;
    const cacheSize = this.cache.size;

    // Pre-allocate arrays for efficiency
    const keys: string[] = new Array(cacheSize);
    const scores = new Float32Array(cacheSize);
    const maxAge = this.ttlMs;

    // Calculate eviction score for each entry
    // Lower score = more likely to be evicted
    let idx = 0;
    for (const [key, entry] of this.cache) {
      // Frequency component (log scale to prevent runaway values)
      const freqScore = Math.log2(entry.accessCount + 1);

      // Recency component (0 to 1, higher = more recent)
      const age = now - entry.lastAccessTime;
      const recencyScore = age >= maxAge ? 0 : 1 - (age / maxAge);

      // Combined score: 60% frequency, 40% recency
      scores[idx] = freqScore * 0.6 + recencyScore * 0.4;
      keys[idx] = key;
      idx++;
    }

    // Use partial selection sort to find k lowest scores
    // This is faster than full sort when remaining << cacheSize
    const toEvict: string[] = [];
    for (let i = 0; i < remaining && i < cacheSize; i++) {
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
      this.cache.delete(key);
      this.evictions++;
    }
  }
}

// ============================================
// Singleton Cache Instances
// ============================================

// Cache for hydrated chunk documents (by chunkId)
// Short TTL since chunks can be updated
const CHUNK_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const chunkCache = new TTLCache<unknown>('chunk_docs', CHUNK_CACHE_TTL_MS, 500);

// Cache for retrieval results (by tenantId + normalizedQuery + timeWindow)
// Slightly longer TTL for query results
const RETRIEVAL_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const retrievalCache = new TTLCache<unknown>('retrieval_results', RETRIEVAL_CACHE_TTL_MS, 200);

/**
 * Generate a cache key for retrieval results
 */
export function makeRetrievalCacheKey(
  tenantId: string,
  normalizedQuery: string,
  maxAgeDays: number
): string {
  // Normalize query for caching (lowercase, trim, collapse whitespace)
  const normalized = normalizedQuery.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${tenantId}:${maxAgeDays}:${normalized}`;
}

/**
 * Get cached chunk document
 */
export function getCachedChunk<T>(chunkId: string): T | undefined {
  return chunkCache.get(chunkId) as T | undefined;
}

/**
 * Set cached chunk document
 */
export function setCachedChunk<T>(chunkId: string, chunk: T): void {
  chunkCache.set(chunkId, chunk);
}

/**
 * Get cached retrieval result
 */
export function getCachedRetrieval<T>(cacheKey: string): T | undefined {
  return retrievalCache.get(cacheKey) as T | undefined;
}

/**
 * Set cached retrieval result
 */
export function setCachedRetrieval<T>(cacheKey: string, result: T): void {
  retrievalCache.set(cacheKey, result);
}

/**
 * Get cache statistics for observability
 */
export function getCacheStats(): {
  chunks: { size: number; hits: number; misses: number; hitRate: number; evictions: number };
  retrieval: { size: number; hits: number; misses: number; hitRate: number; evictions: number };
} {
  return {
    chunks: chunkCache.getStats(),
    retrieval: retrievalCache.getStats(),
  };
}

/**
 * Clear all caches (useful for testing)
 */
export function clearAllCaches(): void {
  chunkCache.clear();
  retrievalCache.clear();
  logInfo('All caches cleared');
}

/**
 * Invalidate all cached retrieval results for a tenant
 * Call this when notes are created, updated, or deleted
 */
export function invalidateTenantCache(tenantId: string): number {
  const deleted = retrievalCache.deleteByPrefix(`${tenantId}:`);
  if (deleted > 0) {
    logInfo('Tenant cache invalidated', { tenantId, entriesDeleted: deleted });
  }
  return deleted;
}

/**
 * Invalidate cached chunk by ID
 * Call this when a chunk is deleted or re-indexed
 */
export function invalidateChunkCache(chunkId: string): boolean {
  return chunkCache.delete(chunkId);
}

