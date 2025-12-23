/** AuroraNotes API - Utility Functions */

import { Timestamp } from "firebase-admin/firestore";
import * as crypto from "crypto";

export function sanitizeText(text: string, maxLength: number = 10000): string {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').normalize('NFC').trim().slice(0, maxLength);
}

export function sanitizeForLogging(text: string, maxLength: number = 100): string {
  return sanitizeText(text, maxLength).replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ');
}

export function isValidTenantId(tenantId: string): boolean {
  return !!tenantId && typeof tenantId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(tenantId);
}

export function timestampToISO(ts: Timestamp | Date | unknown): string {
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (ts && typeof ts === 'object' && '_seconds' in ts) return new Date((ts as { _seconds: number })._seconds * 1000).toISOString();
  return new Date().toISOString();
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Fast non-cryptographic hash (FNV-1a 32-bit) - NOT for security use */
export function fastHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}

export function fastHashWithLength(text: string): string {
  return `${fastHash(text)}${(text.length & 0xFFFF).toString(16).padStart(4, '0')}`;
}

export function estimateTokens(text: string): number { return Math.ceil(text.length / 4); }

export function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [timestamp, id] = Buffer.from(cursor, 'base64').toString('utf8').split('|');
    const createdAt = new Date(timestamp);
    return isNaN(createdAt.getTime()) || !id ? null : { createdAt, id };
  } catch { return null; }
}

export function encodeCursor(createdAt: Date | Timestamp, id: string): string {
  const date = createdAt instanceof Timestamp ? createdAt.toDate() : createdAt;
  return Buffer.from(`${date.toISOString()}|${id}`).toString('base64');
}

import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext { requestId: string; startTime: number; path?: string; memoCache?: Map<string, unknown>; }
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function generateRequestId(): string { return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`; }
export function withRequestContext<T>(context: RequestContext, fn: () => T): T { return requestContextStorage.run({ ...context, memoCache: new Map<string, unknown>() }, fn); }
export function getRequestContext(): RequestContext | undefined { return requestContextStorage.getStore(); }

export function requestMemo<T>(key: string, fn: () => T): T {
  const ctx = getRequestContext();
  if (!ctx?.memoCache) return fn();
  if (ctx.memoCache.has(key)) return ctx.memoCache.get(key) as T;
  const value = fn(); ctx.memoCache.set(key, value); return value;
}

export async function requestMemoAsync<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const ctx = getRequestContext();
  if (!ctx?.memoCache) return fn();
  if (ctx.memoCache.has(key)) return ctx.memoCache.get(key) as T;
  const promise = fn(); ctx.memoCache.set(key, promise);
  try { const value = await promise; ctx.memoCache.set(key, value); return value; }
  catch (err) { ctx.memoCache.delete(key); throw err; }
}

export function getRequestMemoStats(): { size: number } | null { const ctx = getRequestContext(); return ctx?.memoCache ? { size: ctx.memoCache.size } : null; }

function structuredLog(severity: string, message: string, data?: Record<string, unknown>, error?: unknown): void {
  const ctx = getRequestContext();
  const errorInfo = error ? (error instanceof Error ? { errorMessage: error.message, errorStack: error.stack } : { errorMessage: String(error) }) : {};
  const logFn = severity === 'ERROR' ? console.error : console.log;
  logFn(JSON.stringify({ severity, message, requestId: ctx?.requestId, ...errorInfo, ...data, timestamp: new Date().toISOString() }));
}

export function logInfo(message: string, data?: Record<string, unknown>): void { structuredLog('INFO', message, data); }
export function logWarn(message: string, data?: Record<string, unknown>): void { structuredLog('WARNING', message, data); }
export function logError(message: string, error?: unknown, data?: Record<string, unknown>): void { structuredLog('ERROR', message, data, error); }

const STOP_WORDS = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'about', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'it', 'its', 'my', 'your', 'his', 'her', 'their', 'our', 'me', 'you', 'him', 'us', 'them', 'i', 'we', 'they', 'he', 'she', 'include', 'including', 'tell', 'everything', 'complete', 'give', 'show']);

export function extractKeywords(query: string): string[] {
  const uniqueIds: string[] = []; let m; const p = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  while ((m = p.exec(query)) !== null) uniqueIds.push(m[1].toLowerCase());
  const regular = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return [...new Set([...uniqueIds, ...regular])].slice(0, 15);
}

/** Cosine similarity with loop unrolling optimization */
export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  const len = a.length; if (len !== b.length || len === 0) return 0;
  let dot = 0, normA = 0, normB = 0, i = 0;
  const limit = len - (len % 4);
  for (; i < limit; i += 4) {
    const a0 = a[i], a1 = a[i+1], a2 = a[i+2], a3 = a[i+3], b0 = b[i], b1 = b[i+1], b2 = b[i+2], b3 = b[i+3];
    dot += a0*b0 + a1*b1 + a2*b2 + a3*b3; normA += a0*a0 + a1*a1 + a2*a2 + a3*a3; normB += b0*b0 + b1*b1 + b2*b2 + b3*b3;
  }
  for (; i < len; i++) { dot += a[i]*b[i]; normA += a[i]*a[i]; normB += b[i]*b[i]; }
  const denom = Math.sqrt(normA * normB); return denom === 0 ? 0 : dot / denom;
}

export function batchCosineSimilarity(query: number[] | Float32Array, candidates: Array<number[] | Float32Array>): number[] {
  const len = query.length; if (len === 0 || candidates.length === 0) return [];
  let qNorm = 0; for (let i = 0; i < len; i++) qNorm += query[i] * query[i]; qNorm = Math.sqrt(qNorm);
  if (qNorm === 0) return new Array(candidates.length).fill(0);
  const results: number[] = new Array(candidates.length);
  for (let c = 0; c < candidates.length; c++) {
    const cand = candidates[c]; if (cand.length !== len) { results[c] = 0; continue; }
    let dot = 0, cNorm = 0, i = 0; const limit = len - (len % 4);
    for (; i < limit; i += 4) {
      const q0 = query[i], q1 = query[i+1], q2 = query[i+2], q3 = query[i+3], c0 = cand[i], c1 = cand[i+1], c2 = cand[i+2], c3 = cand[i+3];
      dot += q0*c0 + q1*c1 + q2*c2 + q3*c3; cNorm += c0*c0 + c1*c1 + c2*c2 + c3*c3;
    }
    for (; i < len; i++) { dot += query[i]*cand[i]; cNorm += cand[i]*cand[i]; }
    const denom = qNorm * Math.sqrt(cNorm); results[c] = denom === 0 ? 0 : dot / denom;
  }
  return results;
}

export const TERMS_VERSION = 1;

/** Extract normalized terms for lexical indexing (max 50 terms) */
export function extractTermsForIndexing(text: string): string[] {
  const terms = new Set<string>(); let m; const p = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  while ((m = p.exec(text)) !== null) terms.add(m[1].toLowerCase());
  const tokens = text.toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').split(/\s+/);
  for (const t of tokens) {
    if (t.length < 2 || STOP_WORDS.has(t)) continue;
    terms.add(t);
    if (t.includes('-')) for (const part of t.split('-')) if (part.length >= 2 && !STOP_WORDS.has(part)) terms.add(part);
  }
  return Array.from(terms).slice(0, 50);
}

export function isUniqueIdentifier(term: string): boolean {
  return /^[a-z][a-z0-9_]*[0-9_][a-z0-9_]*$/i.test(term) || /^[a-z]+_[a-z0-9_]+$/i.test(term) || /^[A-Z][A-Z0-9_]{2,}$/.test(term);
}
