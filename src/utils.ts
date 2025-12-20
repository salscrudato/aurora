/**
 * AuroraNotes API - Utility Functions
 *
 * Common utilities for logging, validation, text processing, and security.
 */

import { Timestamp } from "firebase-admin/firestore";
import * as crypto from "crypto";

// ============================================
// Input Sanitization
// ============================================

/**
 * Sanitize user input text (remove control characters, limit length)
 */
export function sanitizeText(text: string, maxLength: number = 10000): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // Remove null bytes and other control characters (except newlines/tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize unicode
    .normalize('NFC')
    // Trim whitespace
    .trim()
    // Limit length
    .slice(0, maxLength);
}

/**
 * Sanitize query string for safe logging
 */
export function sanitizeForLogging(text: string, maxLength: number = 100): string {
  return sanitizeText(text, maxLength)
    .replace(/[\n\r]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Validate tenant ID format
 */
export function isValidTenantId(tenantId: string): boolean {
  if (!tenantId || typeof tenantId !== 'string') return false;
  // Allow alphanumeric, hyphens, underscores, max 64 chars
  return /^[a-zA-Z0-9_-]{1,64}$/.test(tenantId);
}

/**
 * Convert Firestore Timestamp to ISO string
 */
export function timestampToISO(ts: Timestamp | Date | unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (ts instanceof Date) {
    return ts.toISOString();
  }
  // Handle serialized timestamp
  if (ts && typeof ts === 'object' && '_seconds' in ts) {
    const obj = ts as { _seconds: number; _nanoseconds?: number };
    return new Date(obj._seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Create a hash of text for deduplication
 * Uses SHA-256 for cryptographic strength
 */
export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Fast non-cryptographic hash for cache keys (FNV-1a 32-bit)
 * ~10x faster than SHA-256 for short strings
 * NOT suitable for security-sensitive use cases
 *
 * @param text - Text to hash
 * @returns 8-character hex string
 */
export function fastHash(text: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // FNV prime multiplication (JavaScript handles 32-bit overflow)
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Fast hash with additional length component for better distribution
 * Combines FNV-1a with length to reduce collisions on similar-length strings
 *
 * @param text - Text to hash
 * @returns 12-character string (8 hash + 4 length)
 */
export function fastHashWithLength(text: string): string {
  const hash = fastHash(text);
  const lenComponent = (text.length & 0xFFFF).toString(16).padStart(4, '0');
  return `${hash}${lenComponent}`;
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Parse cursor for pagination (base64 encoded)
 */
export function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const [timestamp, id] = decoded.split('|');
    const createdAt = new Date(timestamp);
    if (isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Encode cursor for pagination
 */
export function encodeCursor(createdAt: Date | Timestamp, id: string): string {
  const date = createdAt instanceof Timestamp ? createdAt.toDate() : createdAt;
  return Buffer.from(`${date.toISOString()}|${id}`).toString('base64');
}

// ============================================
// Request Context (for request ID correlation)
// ============================================

// Using AsyncLocalStorage for request-scoped context
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
  startTime: number;
  path?: string;
  /** Request-scoped memoization cache */
  memoCache?: Map<string, unknown>;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Run a function with request context
 */
export function withRequestContext<T>(context: RequestContext, fn: () => T): T {
  // Initialize memoization cache for this request
  const contextWithMemo = { ...context, memoCache: new Map<string, unknown>() };
  return requestContextStorage.run(contextWithMemo, fn);
}

/**
 * Get current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

// ============================================
// Request-Scoped Memoization
// ============================================

/**
 * Memoize a function result within the current request scope.
 * Results are automatically cleared when the request completes.
 *
 * This is useful for avoiding duplicate work within a single request,
 * such as repeated embedding generation or query analysis.
 *
 * @param key - Unique key for this memoized value
 * @param fn - Function to compute the value if not cached
 * @returns The cached or computed value
 */
export function requestMemo<T>(key: string, fn: () => T): T {
  const ctx = getRequestContext();
  if (!ctx?.memoCache) {
    // No request context, just compute the value
    return fn();
  }

  if (ctx.memoCache.has(key)) {
    return ctx.memoCache.get(key) as T;
  }

  const value = fn();
  ctx.memoCache.set(key, value);
  return value;
}

/**
 * Async version of requestMemo for async functions.
 * Handles concurrent calls by storing the promise itself.
 *
 * @param key - Unique key for this memoized value
 * @param fn - Async function to compute the value if not cached
 * @returns Promise resolving to the cached or computed value
 */
export async function requestMemoAsync<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const ctx = getRequestContext();
  if (!ctx?.memoCache) {
    // No request context, just compute the value
    return fn();
  }

  if (ctx.memoCache.has(key)) {
    return ctx.memoCache.get(key) as T;
  }

  // Store the promise to handle concurrent calls
  const promise = fn();
  ctx.memoCache.set(key, promise);

  try {
    const value = await promise;
    // Replace promise with resolved value for future sync access
    ctx.memoCache.set(key, value);
    return value;
  } catch (err) {
    // Remove failed promise so retry is possible
    ctx.memoCache.delete(key);
    throw err;
  }
}

/**
 * Get request memoization stats for debugging
 */
export function getRequestMemoStats(): { size: number } | null {
  const ctx = getRequestContext();
  if (!ctx?.memoCache) return null;
  return { size: ctx.memoCache.size };
}

/**
 * Structured log helper (for Cloud Logging)
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
  const ctx = getRequestContext();
  console.log(JSON.stringify({
    severity: 'INFO',
    message,
    requestId: ctx?.requestId,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

export function logWarn(message: string, data?: Record<string, unknown>): void {
  const ctx = getRequestContext();
  console.log(JSON.stringify({
    severity: 'WARNING',
    message,
    requestId: ctx?.requestId,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

export function logError(message: string, error?: unknown, data?: Record<string, unknown>): void {
  const ctx = getRequestContext();
  const errorInfo = error instanceof Error
    ? { errorMessage: error.message, errorStack: error.stack }
    : { errorMessage: String(error) };

  console.error(JSON.stringify({
    severity: 'ERROR',
    message,
    requestId: ctx?.requestId,
    ...errorInfo,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Extract keywords from query (simple implementation)
 */
export function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
    'until', 'while', 'about', 'what', 'which', 'who', 'whom', 'this', 'that',
    'these', 'those', 'am', 'it', 'its', 'my', 'your', 'his', 'her', 'their', 'our',
    'me', 'you', 'him', 'us', 'them', 'i', 'we', 'they', 'he', 'she',
    'include', 'including', 'tell', 'everything', 'complete', 'give', 'show'
  ]);

  // First, extract unique identifiers (uppercase with underscores/numbers) - these get priority
  const uniqueIdPattern = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  const uniqueIds: string[] = [];
  let match;
  while ((match = uniqueIdPattern.exec(query)) !== null) {
    uniqueIds.push(match[1].toLowerCase());
  }

  // Extract regular keywords
  const regularKeywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Combine: unique IDs first (they're more specific), then regular keywords
  const combined = [...new Set([...uniqueIds, ...regularKeywords])];
  return combined.slice(0, 15); // Allow more keywords for better recall
}

/**
 * Cosine similarity between two vectors
 *
 * Optimizations:
 * - Loop unrolling (4x) for better CPU pipelining
 * - Single sqrt call instead of two
 * - Early exit for zero-length vectors
 * - Typed array support for Float32Array embeddings
 */
export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  const len = a.length;
  if (len !== b.length || len === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Process 4 elements at a time (loop unrolling)
  const unrollLimit = len - (len % 4);
  let i = 0;

  for (; i < unrollLimit; i += 4) {
    const a0 = a[i], a1 = a[i + 1], a2 = a[i + 2], a3 = a[i + 3];
    const b0 = b[i], b1 = b[i + 1], b2 = b[i + 2], b3 = b[i + 3];

    dotProduct += a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
    normA += a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
    normB += b0 * b0 + b1 * b1 + b2 * b2 + b3 * b3;
  }

  // Handle remaining elements
  for (; i < len; i++) {
    const ai = a[i], bi = b[i];
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  // Single sqrt call is faster than two separate calls
  const denominator = Math.sqrt(normA * normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Batch cosine similarity: compute similarity of one query against many candidates
 * More efficient than calling cosineSimilarity repeatedly
 */
export function batchCosineSimilarity(
  query: number[] | Float32Array,
  candidates: Array<number[] | Float32Array>
): number[] {
  const len = query.length;
  if (len === 0 || candidates.length === 0) return [];

  // Pre-compute query norm
  let queryNorm = 0;
  for (let i = 0; i < len; i++) {
    queryNorm += query[i] * query[i];
  }
  queryNorm = Math.sqrt(queryNorm);

  if (queryNorm === 0) {
    return new Array(candidates.length).fill(0);
  }

  const results: number[] = new Array(candidates.length);

  for (let c = 0; c < candidates.length; c++) {
    const candidate = candidates[c];
    if (candidate.length !== len) {
      results[c] = 0;
      continue;
    }

    let dotProduct = 0;
    let candidateNorm = 0;

    // Unrolled loop
    const unrollLimit = len - (len % 4);
    let i = 0;

    for (; i < unrollLimit; i += 4) {
      const q0 = query[i], q1 = query[i + 1], q2 = query[i + 2], q3 = query[i + 3];
      const c0 = candidate[i], c1 = candidate[i + 1], c2 = candidate[i + 2], c3 = candidate[i + 3];

      dotProduct += q0 * c0 + q1 * c1 + q2 * c2 + q3 * c3;
      candidateNorm += c0 * c0 + c1 * c1 + c2 * c2 + c3 * c3;
    }

    for (; i < len; i++) {
      dotProduct += query[i] * candidate[i];
      candidateNorm += candidate[i] * candidate[i];
    }

    const denominator = queryNorm * Math.sqrt(candidateNorm);
    results[c] = denominator === 0 ? 0 : dotProduct / denominator;
  }

  return results;
}

// ============================================
// Term Extraction for Lexical Indexing
// ============================================

// Current version of term extraction algorithm (increment when algorithm changes for backfill)
export const TERMS_VERSION = 1;

// Stop words for term extraction (more comprehensive for indexing)
const TERM_STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
  'until', 'while', 'about', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'am', 'it', 'its', 'my', 'your', 'his', 'her', 'their', 'our',
  'me', 'you', 'him', 'us', 'them', 'i', 'we', 'they', 'he', 'she',
]);

/**
 * Extract normalized terms from text for lexical indexing.
 * Returns unique, lowercase tokens suitable for Firestore array-contains-any queries.
 *
 * Includes:
 * - Regular words (normalized, lowercased, stemmed minimally)
 * - Unique identifiers (preserved with underscores/numbers)
 * - Numbers (preserved for ID matching)
 *
 * Max 50 terms per chunk to stay within Firestore limits.
 */
export function extractTermsForIndexing(text: string): string[] {
  const terms = new Set<string>();

  // Extract unique identifiers first (e.g., CITE_TEST_002, PROJECT_ALPHA)
  // These are high-value for exact matching
  const uniqueIdPattern = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  let match;
  while ((match = uniqueIdPattern.exec(text)) !== null) {
    terms.add(match[1].toLowerCase());
  }

  // Extract regular terms
  const normalizedText = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')  // Keep hyphens for compound words
    .replace(/\s+/g, ' ');

  const tokens = normalizedText.split(/\s+/);

  for (const token of tokens) {
    // Skip short terms and stop words
    if (token.length < 2) continue;
    if (TERM_STOP_WORDS.has(token)) continue;

    // Add the term
    terms.add(token);

    // For hyphenated terms, also add components
    if (token.includes('-')) {
      const parts = token.split('-');
      for (const part of parts) {
        if (part.length >= 2 && !TERM_STOP_WORDS.has(part)) {
          terms.add(part);
        }
      }
    }
  }

  // Convert to array and limit to 50 terms (Firestore array limit considerations)
  const termArray = Array.from(terms).slice(0, 50);

  return termArray;
}

/**
 * Check if a term looks like a unique identifier
 */
export function isUniqueIdentifier(term: string): boolean {
  // Match patterns like CITE_TEST_002, PROJECT_ALPHA, TEST123
  return /^[a-z][a-z0-9_]*[0-9_][a-z0-9_]*$/i.test(term) ||
         /^[a-z]+_[a-z0-9_]+$/i.test(term) ||
         /^[A-Z][A-Z0-9_]{2,}$/.test(term);
}

