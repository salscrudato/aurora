/**
 * In-Memory Cache Module
 *
 * TTL-based caching with LFU-LRU hybrid eviction.
 * Process-local caches cleared on restart.
 */

import { logInfo } from './utils';

// =============================================================================
// Types
// =============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessTime: number;
}

/** Cache statistics */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

// =============================================================================
// Configuration
// =============================================================================

/** Default configuration values */
const CONFIG = {
  /** Default TTL in milliseconds */
  DEFAULT_TTL_MS: 5 * 60 * 1000, // 5 minutes
  /** Maximum entries per cache */
  MAX_CACHE_SIZE: 1000,
  /** Cleanup interval in milliseconds */
  CLEANUP_INTERVAL_MS: 60 * 1000, // 1 minute
  /** Percentage of entries to evict when at capacity */
  BATCH_EVICTION_PERCENT: 0.1, // 10%
  /** Weight for frequency in eviction scoring (0-1) */
  FREQUENCY_WEIGHT: 0.6,
  /** Weight for recency in eviction scoring (0-1) */
  RECENCY_WEIGHT: 0.4,
} as const;

// =============================================================================
// TTLCache Class
// =============================================================================

/**
 * Generic TTL cache with LFU-LRU hybrid eviction
 *
 * Eviction strategy:
 * - Expired items evicted first
 * - Then lowest-scored by: 60% frequency + 40% recency
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

  constructor(
    name: string,
    ttlMs: number = CONFIG.DEFAULT_TTL_MS,
    maxSize: number = CONFIG.MAX_CACHE_SIZE
  ) {
    this.name = name;
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.startCleanup();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Get a value from the cache (O(1) with LRU update) */
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

    // Update access tracking and move to end for LRU
    entry.accessCount++;
    entry.lastAccessTime = now;
    this.moveToEnd(key, entry);

    this.hits++;
    return entry.value;
  }

  /** Set a value in the cache (uses batch eviction when at capacity) */
  set(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();
    const effectiveTtl = ttlMs ?? this.ttlMs;

    const existing = this.cache.get(key);
    if (existing) {
      existing.value = value;
      existing.expiresAt = now + effectiveTtl;
      existing.accessCount++;
      existing.lastAccessTime = now;
      this.moveToEnd(key, existing);
      return;
    }

    if (this.cache.size >= this.maxSize) {
      this.evictBatch();
    }

    this.cache.set(key, {
      value,
      expiresAt: now + effectiveTtl,
      accessCount: 1,
      lastAccessTime: now,
    });
  }

  /** Check if a key exists and is not expired */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /** Delete a specific key */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /** Delete all entries matching a prefix */
  deleteByPrefix(prefix: string): number {
    const keysToDelete = this.collectKeys(key => key.startsWith(prefix));
    this.deleteKeys(keysToDelete);
    return keysToDelete.length;
  }

  /** Clear all entries and reset stats */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /** Get cache statistics */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Math.round((this.hits / total) * 100) : 0,
      evictions: this.evictions,
    };
  }

  /** Stop the cleanup timer (for graceful shutdown) */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Batch Operations
  // ---------------------------------------------------------------------------

  /** Pre-warm cache with multiple entries */
  setMany(entries: Array<{ key: string; value: T; ttlMs?: number }>): void {
    for (const { key, value, ttlMs } of entries) {
      this.set(key, value, ttlMs);
    }
  }

  /** Get multiple values at once */
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

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /** Move entry to end of Map for LRU ordering */
  private moveToEnd(key: string, entry: CacheEntry<T>): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  /** Collect keys matching a predicate */
  private collectKeys(predicate: (key: string) => boolean): string[] {
    const keys: string[] = [];
    for (const key of this.cache.keys()) {
      if (predicate(key)) keys.push(key);
    }
    return keys;
  }

  /** Delete multiple keys */
  private deleteKeys(keys: string[]): void {
    for (const key of keys) {
      this.cache.delete(key);
    }
  }

  /** Start periodic cleanup timer */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), CONFIG.CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref(); // Don't prevent process exit
  }

  /** Remove expired entries */
  private cleanup(): void {
    const now = Date.now();
    const expired = this.collectKeys(key => {
      const entry = this.cache.get(key);
      return entry ? now > entry.expiresAt : false;
    });

    this.deleteKeys(expired);

    if (expired.length > 0) {
      logInfo(`Cache ${this.name} cleanup`, { expired: expired.length, remaining: this.cache.size });
    }
  }

  /** Batch eviction using LFU-LRU hybrid scoring */
  private evictBatch(): void {
    const target = Math.max(1, Math.ceil(this.maxSize * CONFIG.BATCH_EVICTION_PERCENT));
    const now = Date.now();

    // First, evict expired entries
    const expiredCount = this.evictExpired(now);
    if (expiredCount >= target) return;

    // Score remaining entries and evict lowest
    const remaining = target - expiredCount;
    this.evictByScore(now, remaining);
  }

  /** Evict all expired entries, return count */
  private evictExpired(now: number): number {
    const expired = this.collectKeys(key => {
      const entry = this.cache.get(key);
      return entry ? now > entry.expiresAt : false;
    });

    for (const key of expired) {
      this.cache.delete(key);
      this.evictions++;
    }
    return expired.length;
  }

  /** Evict entries with lowest scores using partial selection sort */
  private evictByScore(now: number, count: number): void {
    const size = this.cache.size;
    if (size === 0 || count === 0) return;

    // Pre-allocate arrays
    const keys: string[] = new Array(size);
    const scores = new Float32Array(size);

    // Calculate scores (lower = more likely to evict)
    let idx = 0;
    for (const [key, entry] of this.cache) {
      const freqScore = Math.log2(entry.accessCount + 1);
      const age = now - entry.lastAccessTime;
      const recencyScore = age >= this.ttlMs ? 0 : 1 - age / this.ttlMs;
      scores[idx] = freqScore * CONFIG.FREQUENCY_WEIGHT + recencyScore * CONFIG.RECENCY_WEIGHT;
      keys[idx] = key;
      idx++;
    }

    // Partial selection sort to find k lowest
    const toEvict = this.selectLowest(keys, scores, count);

    for (const key of toEvict) {
      this.cache.delete(key);
      this.evictions++;
    }
  }

  /** Select k keys with lowest scores using partial selection sort */
  private selectLowest(keys: string[], scores: Float32Array, k: number): string[] {
    const n = keys.length;
    const result: string[] = [];

    for (let i = 0; i < k && i < n; i++) {
      let minIdx = i;
      for (let j = i + 1; j < n; j++) {
        if (scores[j] < scores[minIdx]) minIdx = j;
      }

      // Swap to front
      if (minIdx !== i) {
        [scores[i], scores[minIdx]] = [scores[minIdx], scores[i]];
        [keys[i], keys[minIdx]] = [keys[minIdx], keys[i]];
      }
      result.push(keys[i]);
    }

    return result;
  }
}

// =============================================================================
// Singleton Cache Instances
// =============================================================================

/** Cache TTL configuration */
const CACHE_CONFIG = {
  CHUNK_TTL_MS: 2 * 60 * 1000,      // 2 minutes
  CHUNK_MAX_SIZE: 500,
  RETRIEVAL_TTL_MS: 3 * 60 * 1000,  // 3 minutes
  RETRIEVAL_MAX_SIZE: 200,
} as const;

/** Cache for hydrated chunk documents */
const chunkCache = new TTLCache<unknown>(
  'chunk_docs',
  CACHE_CONFIG.CHUNK_TTL_MS,
  CACHE_CONFIG.CHUNK_MAX_SIZE
);

/** Cache for retrieval results */
const retrievalCache = new TTLCache<unknown>(
  'retrieval_results',
  CACHE_CONFIG.RETRIEVAL_TTL_MS,
  CACHE_CONFIG.RETRIEVAL_MAX_SIZE
);

// =============================================================================
// Exported Cache Functions
// =============================================================================

/** Generate a cache key for retrieval results */
export function makeRetrievalCacheKey(
  tenantId: string,
  normalizedQuery: string,
  maxAgeDays: number
): string {
  const normalized = normalizedQuery.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${tenantId}:${maxAgeDays}:${normalized}`;
}

// ---------------------------------------------------------------------------
// Chunk Cache Operations
// ---------------------------------------------------------------------------

/** Get cached chunk document */
export function getCachedChunk<T>(chunkId: string): T | undefined {
  return chunkCache.get(chunkId) as T | undefined;
}

/** Set cached chunk document */
export function setCachedChunk<T>(chunkId: string, chunk: T): void {
  chunkCache.set(chunkId, chunk);
}

/** Invalidate cached chunk by ID */
export function invalidateChunkCache(chunkId: string): boolean {
  return chunkCache.delete(chunkId);
}

// ---------------------------------------------------------------------------
// Retrieval Cache Operations
// ---------------------------------------------------------------------------

/** Get cached retrieval result */
export function getCachedRetrieval<T>(cacheKey: string): T | undefined {
  return retrievalCache.get(cacheKey) as T | undefined;
}

/** Set cached retrieval result */
export function setCachedRetrieval<T>(cacheKey: string, result: T): void {
  retrievalCache.set(cacheKey, result);
}

/** Invalidate all cached retrieval results for a tenant */
export function invalidateTenantCache(tenantId: string): number {
  const deleted = retrievalCache.deleteByPrefix(`${tenantId}:`);
  if (deleted > 0) {
    logInfo('Tenant cache invalidated', { tenantId, entriesDeleted: deleted });
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Cache Management
// ---------------------------------------------------------------------------

/** Get cache statistics for observability */
export function getCacheStats(): { chunks: CacheStats; retrieval: CacheStats } {
  return {
    chunks: chunkCache.getStats(),
    retrieval: retrievalCache.getStats(),
  };
}

/** Clear all caches (useful for testing) */
export function clearAllCaches(): void {
  chunkCache.clear();
  retrievalCache.clear();
  logInfo('All caches cleared');
}
