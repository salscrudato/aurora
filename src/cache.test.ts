/**
 * Cache Module Tests
 *
 * Tests for TTL cache functionality.
 * Run with: npx ts-node --test src/cache.test.ts
 * Or: node --experimental-strip-types --test src/cache.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TTLCache, makeRetrievalCacheKey } from './cache';

describe('TTLCache', () => {
  let cache: TTLCache<string>;

  beforeEach(() => {
    cache = new TTLCache<string>('test', 1000, 10); // 1 second TTL, max 10 entries
  });

  afterEach(() => {
    cache.stop();
  });

  it('stores and retrieves values', () => {
    cache.set('key1', 'value1');
    const result = cache.get('key1');
    assert.strictEqual(result, 'value1');
  });

  it('returns undefined for missing keys', () => {
    const result = cache.get('nonexistent');
    assert.strictEqual(result, undefined);
  });

  it('respects TTL expiration', async () => {
    cache.set('key1', 'value1', 50); // 50ms TTL
    
    // Should exist immediately
    assert.strictEqual(cache.get('key1'), 'value1');
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should be expired
    assert.strictEqual(cache.get('key1'), undefined);
  });

  it('tracks cache statistics', () => {
    cache.set('key1', 'value1');
    cache.get('key1'); // hit
    cache.get('key1'); // hit
    cache.get('nonexistent'); // miss
    
    const stats = cache.getStats();
    assert.strictEqual(stats.size, 1);
    assert.strictEqual(stats.hits, 2);
    assert.strictEqual(stats.misses, 1);
    assert.strictEqual(stats.hitRate, 67); // 2/3 = 66.67% rounded
  });

  it('evicts least used entries when at capacity', () => {
    // Fill cache to capacity
    for (let i = 0; i < 10; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    
    // Access some keys to increase their access count
    cache.get('key5');
    cache.get('key5');
    cache.get('key7');
    
    // Add one more to trigger eviction
    cache.set('key10', 'value10');
    
    // key5 and key7 should still exist (higher access count)
    assert.strictEqual(cache.get('key5'), 'value5');
    assert.strictEqual(cache.get('key7'), 'value7');
    
    // One of the less-accessed keys should be evicted
    const stats = cache.getStats();
    assert.strictEqual(stats.size, 10); // Should still be at max capacity
  });

  it('clears all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    cache.clear();
    
    assert.strictEqual(cache.get('key1'), undefined);
    assert.strictEqual(cache.get('key2'), undefined);
    assert.strictEqual(cache.getStats().size, 0);
  });

  it('deletes specific keys', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    const deleted = cache.delete('key1');
    
    assert.strictEqual(deleted, true);
    assert.strictEqual(cache.get('key1'), undefined);
    assert.strictEqual(cache.get('key2'), 'value2');
  });

  it('has() returns correct status', () => {
    cache.set('key1', 'value1');
    
    assert.strictEqual(cache.has('key1'), true);
    assert.strictEqual(cache.has('nonexistent'), false);
  });
});

describe('makeRetrievalCacheKey', () => {
  it('creates consistent cache keys', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'what is the project status', 30);
    const key2 = makeRetrievalCacheKey('tenant1', 'what is the project status', 30);
    
    assert.strictEqual(key1, key2);
  });

  it('normalizes query case', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'Hello World', 30);
    const key2 = makeRetrievalCacheKey('tenant1', 'hello world', 30);
    
    assert.strictEqual(key1, key2);
  });

  it('normalizes whitespace', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'hello  world', 30);
    const key2 = makeRetrievalCacheKey('tenant1', 'hello world', 30);
    
    assert.strictEqual(key1, key2);
  });

  it('differentiates by tenant', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'query', 30);
    const key2 = makeRetrievalCacheKey('tenant2', 'query', 30);
    
    assert.notStrictEqual(key1, key2);
  });

  it('differentiates by time window', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'query', 30);
    const key2 = makeRetrievalCacheKey('tenant1', 'query', 60);
    
    assert.notStrictEqual(key1, key2);
  });
});

