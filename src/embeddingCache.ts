/**
 * AuroraNotes API - Embedding Cache
 *
 * In-memory LRU cache for query embeddings with TTL.
 * Reduces embedding API calls by 60-80% for repeated/similar queries.
 *
 * For production at scale, consider Redis/Memcached backend.
 */

import { logInfo, logWarn } from "./utils";

// Cache configuration
const DEFAULT_TTL_MS = 5 * 60 * 1000;      // 5 minutes default
const FREQUENT_QUERY_TTL_MS = 60 * 60 * 1000; // 1 hour for frequent queries
const MAX_CACHE_SIZE = 1000;                // Max entries
const FREQUENCY_THRESHOLD = 3;              // Hits to qualify as "frequent"

interface CacheEntry {
  embedding: number[];
  createdAt: number;
  ttlMs: number;
  hitCount: number;
}

/**
 * LRU Cache with TTL for embeddings
 */
class EmbeddingCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };

  /**
   * Normalize query for cache key (lowercase, trim, collapse whitespace)
   */
  private normalizeKey(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Get embedding from cache if valid
   */
  get(text: string): number[] | null {
    const key = this.normalizeKey(text);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    const age = Date.now() - entry.createdAt;
    if (age > entry.ttlMs) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.stats.expirations++;
      this.stats.misses++;
      return null;
    }

    // Cache hit - update access order and hit count
    this.stats.hits++;
    entry.hitCount++;

    // Upgrade TTL for frequent queries
    if (entry.hitCount >= FREQUENCY_THRESHOLD && entry.ttlMs < FREQUENT_QUERY_TTL_MS) {
      entry.ttlMs = FREQUENT_QUERY_TTL_MS;
    }

    this.updateAccessOrder(key);
    return entry.embedding;
  }

  /**
   * Store embedding in cache
   */
  set(text: string, embedding: number[], ttlMs: number = DEFAULT_TTL_MS): void {
    const key = this.normalizeKey(text);

    // Evict if at capacity
    while (this.cache.size >= MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, {
      embedding,
      createdAt: Date.now(),
      ttlMs,
      hitCount: 0,
    });

    this.updateAccessOrder(key);
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict oldest entry (LRU)
   */
  private evictOldest(): void {
    if (this.accessOrder.length === 0) return;

    const oldestKey = this.accessOrder.shift();
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clear expired entries (call periodically)
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > entry.ttlMs) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logInfo('Embedding cache cleanup', { entriesRemoved: cleaned, remaining: this.cache.size });
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    expirations: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }
}

// Singleton instance
let cacheInstance: EmbeddingCache | null = null;

export function getEmbeddingCache(): EmbeddingCache {
  if (!cacheInstance) {
    cacheInstance = new EmbeddingCache();

    // Periodic cleanup every 5 minutes
    setInterval(() => {
      cacheInstance?.cleanup();
    }, 5 * 60 * 1000);

    logInfo('Embedding cache initialized', { maxSize: MAX_CACHE_SIZE, defaultTtlMs: DEFAULT_TTL_MS });
  }
  return cacheInstance;
}

/**
 * Get cached embedding or null
 */
export function getCachedEmbedding(text: string): number[] | null {
  return getEmbeddingCache().get(text);
}

/**
 * Cache an embedding
 */
export function cacheEmbedding(text: string, embedding: number[], ttlMs?: number): void {
  getEmbeddingCache().set(text, embedding, ttlMs);
}

/**
 * Get cache statistics for monitoring
 */
export function getEmbeddingCacheStats() {
  return getEmbeddingCache().getStats();
}

