/**
 * Retrieval Module - Multi-stage hybrid retrieval with vector, lexical, and recency signals
 */

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firestore";
import {
  CHUNKS_COLLECTION, RETRIEVAL_DEFAULT_DAYS, RETRIEVAL_MIN_RELEVANCE,
  LLM_CONTEXT_BUDGET_CHARS, LLM_CONTEXT_RESERVE_CHARS, VECTOR_SEARCH_ENABLED,
  RERANKING_ENABLED, LLM_RERANK_ENABLED, RETRIEVAL_VECTOR_TOP_K,
  RETRIEVAL_LEXICAL_TOP_K, RETRIEVAL_LEXICAL_MAX_TERMS, RETRIEVAL_RECENCY_TOP_K,
  RETRIEVAL_MMR_ENABLED, RETRIEVAL_MMR_LAMBDA, SCORE_WEIGHT_VECTOR,
  SCORE_WEIGHT_LEXICAL, SCORE_WEIGHT_RECENCY, CROSS_ENCODER_ENABLED,
} from "./config";
import { ChunkDoc, ScoredChunk, RetrievalOptions, QueryIntent, CandidateCounts, RetrievalTimingsStage } from "./types";
import { generateQueryEmbedding, isEmbeddingsAvailable } from "./embeddings";
import { cosineSimilarity, logInfo, logError, logWarn, extractTermsForIndexing } from "./utils";
import { analyzeQuery } from "./query";
import { llmRerank, isLLMRerankerAvailable } from "./reranker";
import { getVectorIndex, VectorSearchResult } from "./vectorIndex";
import { expandQuery, isQueryExpansionAvailable } from "./queryExpansion";
import { crossEncoderRerank, isCrossEncoderAvailable } from "./crossEncoder";
import { getCachedChunk, setCachedChunk, getCachedRetrieval, setCachedRetrieval, makeRetrievalCacheKey } from "./cache";

export { analyzeQuery } from "./query";

// === Configuration Constants ===
const CFG = {
  // Score thresholds
  minVectorScore: 0.15, minCombinedScore: 0.05, diversityPenalty: 0.10, maxChunksPerNote: 4,
  // Precision boost
  precisionTopThreshold: 0.70, precisionGapThreshold: 0.25, precisionMinScore: 0.25,
  // Score gap detection
  scoreGapThreshold: 0.35, scoreGapMinTop: 0.60, scoreGapMinRetain: 2,
  // Hydration & entity
  batchHydrationMax: 500, entityExpandedDays: 365, entityExpandedLimit: 500,
  // BM25
  bm25K1: 1.2, bm25B: 0.75, positionBonusMax: 0.05,
  // Drift detection
  driftWarningThreshold: 0.15, driftSampleSize: 5,
  // Adaptive K
  adaptiveKMin: 6, adaptiveKMax: 30, adaptiveKBase: 12,
  // Lexical
  lexicalMaxParallel: 8, lexicalPerTermLimit: 75,
  // Dedup thresholds
  semanticDedupThreshold: 0.92, textDedupMinLen: 50, textDedupThreshold: 0.85,
};

const ALL_TIME_PATTERNS = [/\b(all|ever|always|any ?time|history|historical)\b/i, /\b(first|original|oldest|earliest|initial)\b/i];
const INTENT_K_ADJ: Record<QueryIntent, number> = { summarize: 8, list: 6, action_item: 6, decision: 5, question: 0, search: 2 };
const STOP_WORDS = new Set(['the','and','for','that','with','this','from','are','was','were','been','have','has','had','what','when','where','which','how','who','about','into','through','during','before','after','above','below']);

// Pre-computed BM25 constants
const BM25_K1_PLUS_1 = CFG.bm25K1 + 1;
const BM25_ONE_MINUS_B = 1 - CFG.bm25B;

// Position bonus cache
const POSITION_BONUS_CACHE = Array.from({ length: 10 }, (_, i) => CFG.positionBonusMax * Math.exp(-i * 0.5));
const getPositionBonus = (pos: number) => pos < 10 ? POSITION_BONUS_CACHE[pos] : CFG.positionBonusMax * Math.exp(-pos * 0.5);

// Source bitflags for efficient tracking
const SRC_VECTOR = 1, SRC_LEXICAL = 2, SRC_RECENCY = 4;

// Regex caches
const regexCache = new Map<string, RegExp>();
const wordBoundaryCache = new Map<string, RegExp>();

export function calculateAdaptiveK(query: string, intent: QueryIntent, keywords: string[]): number {
  let k = CFG.adaptiveKBase + (INTENT_K_ADJ[intent] ?? 0);
  const words = query.split(/\s+/).length;
  k += words >= 20 ? 4 : words >= 12 ? 3 : words >= 6 ? 1 : words <= 3 ? -2 : 0;
  k += keywords.length >= 8 ? 3 : keywords.length >= 5 ? 2 : keywords.length >= 3 ? 1 : 0;
  return Math.min(Math.max(k, CFG.adaptiveKMin), CFG.adaptiveKMax);
}

/** Batch hydrate chunks from Firestore with caching and drift detection */
async function batchHydrateChunks(vectorResults: VectorSearchResult[], tenantId = 'unknown'): Promise<{
  chunks: ChunkDoc[]; hydratedCount: number; cappedAt: number | null; missingCount: number; driftDetected: boolean;
}> {
  if (!vectorResults.length) return { chunks: [], hydratedCount: 0, cappedAt: null, missingCount: 0, driftDetected: false };

  const db = getDb();
  const cappedAt = vectorResults.length > CFG.batchHydrationMax ? CFG.batchHydrationMax : null;
  const resultsToFetch = vectorResults.slice(0, CFG.batchHydrationMax);
  const startTime = Date.now();

  // Check cache first
  const cachedChunks = new Map<string, ChunkDoc>();
  const uncachedIds: string[] = [];
  for (const r of resultsToFetch) {
    const cached = getCachedChunk<ChunkDoc>(r.chunkId);
    cached ? cachedChunks.set(r.chunkId, cached) : uncachedIds.push(r.chunkId);
  }

  // Fetch uncached from Firestore
  if (uncachedIds.length) {
    const docRefs = uncachedIds.map(id => db.collection(CHUNKS_COLLECTION).doc(id));
    const snapshots = await db.getAll(...docRefs);
    for (const snap of snapshots) {
      if (snap.exists) {
        const data = snap.data() as ChunkDoc;
        cachedChunks.set(snap.id, data);
        setCachedChunk(snap.id, data);
      }
    }
  }

  const orderedChunks: ChunkDoc[] = [];
  const missingIds: string[] = [];
  for (const r of resultsToFetch) {
    const chunk = cachedChunks.get(r.chunkId);
    chunk ? orderedChunks.push(chunk) : missingIds.push(`${r.chunkId}:${r.noteId}`);
  }

  const missingCount = missingIds.length;
  const missingRatio = resultsToFetch.length > 0 ? missingCount / resultsToFetch.length : 0;
  const driftDetected = missingRatio > CFG.driftWarningThreshold;

  if (driftDetected) {
    logWarn('Vertex index drift detected', { tenantId, missingCount, missingRatio: Math.round(missingRatio * 100), sampleMissingIds: missingIds.slice(0, CFG.driftSampleSize) });
  }

  return { chunks: orderedChunks, hydratedCount: orderedChunks.length, cappedAt, missingCount, driftDetected };
}

/** Fetch candidate chunks from Firestore with optimized queries */
async function fetchCandidates(tenantId: string, maxAgeDays: number, limit: number): Promise<ChunkDoc[]> {
  const db = getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  try {
    const snap = await db.collection(CHUNKS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('createdAt', '>=', cutoffTimestamp)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    if (!snap.empty) return snap.docs.map(d => d.data() as ChunkDoc);
  } catch (err) {
    logError('Optimized chunk query failed, using fallback', err);
  }

  // Fallback: fetch all and filter client-side
  const snap = await db.collection(CHUNKS_COLLECTION).orderBy('createdAt', 'desc').limit(limit * 2).get();
  return snap.docs
    .map(d => { const data = d.data() as ChunkDoc; if (!data.tenantId) data.tenantId = 'public'; return data; })
    .filter(c => c.tenantId === tenantId && (c.createdAt instanceof Timestamp ? c.createdAt.toDate() : new Date()) >= cutoffDate)
    .slice(0, limit);
}

/** Estimate term rarity (IDF-like heuristic) */
function estimateTermRarity(term: string): number {
  let score = Math.min(term.length, 15);
  if (/[0-9]/.test(term)) score += 8;
  if (/[_-]/.test(term)) score += 5;
  if (/^[A-Z]/.test(term) || term === term.toUpperCase()) score += 4;
  if (term.length <= 2) score -= 5;
  if (STOP_WORDS.has(term.toLowerCase())) score -= 10;
  return score;
}

/** Select best terms for lexical search using IDF-like heuristics */
function selectBestTermsForLexical(terms: string[], maxTerms: number): string[] {
  if (terms.length <= maxTerms) return terms;
  return terms.map(t => ({ term: t, score: estimateTermRarity(t) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTerms)
    .map(s => s.term);
}

/** Fetch chunks via lexical search using terms[] field */
async function fetchLexicalCandidates(tenantId: string, queryTerms: string[], limit: number): Promise<ChunkDoc[]> {
  if (!queryTerms.length) return [];
  const db = getDb();
  const selectedTerms = selectBestTermsForLexical(queryTerms, RETRIEVAL_LEXICAL_MAX_TERMS);

  try {
    if (selectedTerms.length > 1) {
      // Multi-query union for better scale
      const termsToQuery = selectedTerms.slice(0, CFG.lexicalMaxParallel);
      const snapshots = await Promise.all(termsToQuery.map(term =>
        db.collection(CHUNKS_COLLECTION).where('tenantId', '==', tenantId).where('terms', 'array-contains', term).limit(CFG.lexicalPerTermLimit).get()
      ));
      const chunkMap = new Map<string, { chunk: ChunkDoc; matchCount: number }>();
      for (const snap of snapshots) {
        for (const doc of snap.docs) {
          const chunk = doc.data() as ChunkDoc;
          const existing = chunkMap.get(chunk.chunkId);
          existing ? existing.matchCount++ : chunkMap.set(chunk.chunkId, { chunk, matchCount: 1 });
        }
      }
      return Array.from(chunkMap.values()).sort((a, b) => b.matchCount - a.matchCount).slice(0, limit).map(e => e.chunk);
    } else {
      const snap = await db.collection(CHUNKS_COLLECTION).where('tenantId', '==', tenantId).where('terms', 'array-contains-any', selectedTerms).limit(limit).get();
      return snap.docs.map(d => d.data() as ChunkDoc);
    }
  } catch (err) {
    logWarn('Lexical search failed', { error: String(err) });
    return [];
  }
}

/** Fetch recent chunks for recency signal */
async function fetchRecentCandidates(tenantId: string, limit: number): Promise<ChunkDoc[]> {
  const snap = await getDb().collection(CHUNKS_COLLECTION).where('tenantId', '==', tenantId).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(d => d.data() as ChunkDoc);
}

/** Merge candidates from multiple stages with source tracking using bitflags */
function mergeCandidates(vectorChunks: ChunkDoc[], lexicalChunks: ChunkDoc[], recencyChunks: ChunkDoc[]): { chunks: ChunkDoc[]; sources: Map<string, Set<'vector' | 'lexical' | 'recency'>> } {
  const chunkMap = new Map<string, ChunkDoc>();
  const sourceFlags = new Map<string, number>();

  for (const chunk of vectorChunks) { chunkMap.set(chunk.chunkId, chunk); sourceFlags.set(chunk.chunkId, SRC_VECTOR); }
  for (const chunk of lexicalChunks) { const f = sourceFlags.get(chunk.chunkId); f !== undefined ? sourceFlags.set(chunk.chunkId, f | SRC_LEXICAL) : (chunkMap.set(chunk.chunkId, chunk), sourceFlags.set(chunk.chunkId, SRC_LEXICAL)); }
  for (const chunk of recencyChunks) { const f = sourceFlags.get(chunk.chunkId); f !== undefined ? sourceFlags.set(chunk.chunkId, f | SRC_RECENCY) : (chunkMap.set(chunk.chunkId, chunk), sourceFlags.set(chunk.chunkId, SRC_RECENCY)); }

  const sources = new Map<string, Set<'vector' | 'lexical' | 'recency'>>();
  for (const [id, flags] of sourceFlags) {
    const s = new Set<'vector' | 'lexical' | 'recency'>();
    if (flags & SRC_VECTOR) s.add('vector');
    if (flags & SRC_LEXICAL) s.add('lexical');
    if (flags & SRC_RECENCY) s.add('recency');
    sources.set(id, s);
  }
  return { chunks: Array.from(chunkMap.values()), sources };
}

/** Score chunks based on vector similarity */
function scoreByVector(chunks: ChunkDoc[], queryEmbedding: number[]): Map<string, number> {
  const rawScores = new Map<string, number>();
  for (const chunk of chunks) {
    if (chunk.embedding) {
      const sim = cosineSimilarity(queryEmbedding, chunk.embedding);
      rawScores.set(chunk.chunkId, sim >= CFG.minVectorScore ? sim : sim * 0.5);
    }
  }
  return normalizeScores(rawScores);
}

// Unique identifier patterns
const UNIQUE_ID_PATTERNS = [/^[a-z][a-z0-9_]*[0-9_][a-z0-9_]*$/i, /^[a-z]+_[a-z0-9_]+$/i];
const isUniqueIdentifier = (kw: string) => UNIQUE_ID_PATTERNS.some(p => p.test(kw));

function getKeywordRegex(keyword: string): RegExp {
  let r = regexCache.get(keyword);
  if (!r) { r = new RegExp(escapeRegex(keyword), 'gi'); regexCache.set(keyword, r); }
  r.lastIndex = 0;
  return r;
}

function getWordBoundaryRegex(keyword: string): RegExp {
  let r = wordBoundaryCache.get(keyword);
  if (!r) { r = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi'); wordBoundaryCache.set(keyword, r); }
  r.lastIndex = 0;
  return r;
}

/** Fast term frequency counter using indexOf loop */
function countOccurrences(text: string, term: string): number {
  let count = 0, pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) { count++; pos += term.length; }
  return count;
}

/** Score chunks with BM25-like weighting and unique identifier boosting */
function scoreByKeywords(chunks: ChunkDoc[], keywords: string[]): Map<string, number> {
  const scores = new Map<string, number>();
  const n = chunks.length;
  if (!keywords.length || !n) return scores;

  const kwLower = keywords.map(k => k.toLowerCase());
  const uniqueIds = keywords.filter(isUniqueIdentifier).map(k => k.toLowerCase());
  const regularKw = keywords.filter(k => !isUniqueIdentifier(k));
  const regularKwLower = regularKw.map(k => k.toLowerCase());

  // Pre-compute chunk data
  const chunksLower = chunks.map(c => c.text.toLowerCase());
  const docLengths = chunks.map(c => c.text.length);
  const avgLen = docLengths.reduce((a, b) => a + b, 0) / n;

  // Document frequency and IDF
  const docFreq = kwLower.map(kw => chunksLower.filter(t => t.includes(kw)).length || 1);
  const idf = docFreq.map(df => Math.log((n - df + 0.5) / (df + 0.5) + 1));
  const regularIdf = regularKw.map(k => idf[keywords.indexOf(k)] ?? 0);

  const isPureUniqueId = uniqueIds.length > 0 && !regularKw.length;
  let uidMatches = 0;

  for (let i = 0; i < n; i++) {
    const chunk = chunks[i], textLower = chunksLower[i], docLen = docLengths[i];
    let score = 0, uidMatch = 0;

    // Unique ID matches
    for (const uid of uniqueIds) { if (textLower.includes(uid)) { uidMatch++; score += 3.0; } }
    if (uidMatch) uidMatches++;

    if (isPureUniqueId) {
      if (uidMatch) scores.set(chunk.chunkId, score / keywords.length);
      if (uidMatches >= 25) break;
      continue;
    }

    const lengthNorm = BM25_ONE_MINUS_B + CFG.bm25B * (docLen / avgLen);
    for (let j = 0; j < regularKw.length; j++) {
      const kwl = regularKwLower[j], firstIdx = textLower.indexOf(kwl);
      if (firstIdx === -1) continue;
      const tf = countOccurrences(textLower, kwl);
      const tfNorm = (tf * BM25_K1_PLUS_1) / (tf + CFG.bm25K1 * lengthNorm);
      score += regularIdf[j] * tfNorm;
      if (firstIdx < 50) score += regularIdf[j] * 0.3;
      const exact = textLower.match(getWordBoundaryRegex(kwl));
      if (exact?.length) score += regularIdf[j] * 0.4 * exact.length;
    }

    if (uniqueIds.length && !uidMatch) score *= 0.2;
    scores.set(chunk.chunkId, score / keywords.length);
  }
  return normalizeScores(scores);
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Score chunks based on recency with exponential decay */
function scoreByRecency(chunks: ChunkDoc[], maxAgeDays: number): Map<string, number> {
  const scores = new Map<string, number>();
  const now = Date.now(), halfLife = (maxAgeDays / 3) * 86400000;
  for (const chunk of chunks) {
    const created = chunk.createdAt instanceof Timestamp ? chunk.createdAt.toDate() : new Date();
    scores.set(chunk.chunkId, Math.exp(-(now - created.getTime()) / halfLife));
  }
  return scores;
}

/** Normalize scores to [0, 1] range */
function normalizeScores(scores: Map<string, number>): Map<string, number> {
  if (!scores.size) return scores;
  let min = Infinity, max = -Infinity;
  for (const s of scores.values()) { if (s < min) min = s; if (s > max) max = s; }
  if (max === min) return scores;
  const range = max - min, normalized = new Map<string, number>();
  for (const [k, v] of scores) normalized.set(k, (v - min) / range);
  return normalized;
}

/** Jaccard text similarity for deduplication */
function textSimilarity(t1: string, t2: string): number {
  if (t1.length < CFG.textDedupMinLen || t2.length < CFG.textDedupMinLen) return 0;
  const w1 = new Set(t1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const w2 = new Set(t2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (!w1.size || !w2.size) return 0;
  let inter = 0;
  for (const w of w1) if (w2.has(w)) inter++;
  return inter / (w1.size + w2.size - inter);
}

/** MMR reranking for diversity with semantic deduplication */
export function applyMMRReranking(chunks: ScoredChunk[], lambda = RETRIEVAL_MMR_LAMBDA, targetK: number): ScoredChunk[] {
  const n = chunks.length;
  if (n <= targetK) return chunks;

  const maxScore = Math.max(...chunks.map(c => c.score)) || 0.001;
  const normScores = new Float64Array(n);
  for (let i = 0; i < n; i++) normScores[i] = chunks[i].score / maxScore;

  const isRemaining = new Uint8Array(n).fill(1);
  let remaining = n;
  const selected: ScoredChunk[] = [], selEmbed: (number[] | undefined)[] = [], selNotes: string[] = [];
  const oneMinusLambda = 1 - lambda;

  while (selected.length < targetK && remaining > 0) {
    let bestIdx = -1, bestMMR = -Infinity;

    for (let i = 0; i < n; i++) {
      if (!isRemaining[i]) continue;
      const cand = chunks[i], candEmbed = cand.embedding;
      let maxSim = 0, isDup = false;

      for (let s = 0; s < selected.length; s++) {
        if (cand.noteId === selNotes[s]) { maxSim = Math.max(maxSim, 0.8); continue; }
        if (textSimilarity(cand.text, selected[s].text) >= CFG.textDedupThreshold) { isDup = true; break; }
        if (candEmbed && selEmbed[s]) {
          const sim = cosineSimilarity(candEmbed, selEmbed[s]!);
          if (sim >= CFG.semanticDedupThreshold) { isDup = true; break; }
          maxSim = Math.max(maxSim, sim * 0.6);
        }
      }

      if (isDup) { isRemaining[i] = 0; remaining--; continue; }
      const mmr = lambda * normScores[i] - oneMinusLambda * maxSim;
      if (mmr > bestMMR) { bestMMR = mmr; bestIdx = i; }
    }

    if (bestIdx >= 0) {
      selected.push(chunks[bestIdx]);
      selEmbed.push(chunks[bestIdx].embedding);
      selNotes.push(chunks[bestIdx].noteId);
      isRemaining[bestIdx] = 0;
      remaining--;
    } else break;
  }
  return selected;
}

/** Fast text deduplication after reranking */
function deduplicateByText(chunks: ScoredChunk[], threshold = CFG.textDedupThreshold): ScoredChunk[] {
  if (chunks.length <= 1) return chunks;
  const result: ScoredChunk[] = [], texts: string[] = [];
  for (const c of chunks) {
    if (!texts.some(t => textSimilarity(c.text, t) >= threshold)) { result.push(c); texts.push(c.text); }
  }
  return result;
}

/** Diversity reranking fallback when MMR disabled */
function applyDiversityReranking(chunks: ScoredChunk[], maxPerNote = CFG.maxChunksPerNote): ScoredChunk[] {
  const noteCount = new Map<string, number>(), result: ScoredChunk[] = [];
  for (const c of chunks) {
    const cnt = noteCount.get(c.noteId) || 0;
    if (cnt < maxPerNote) { result.push(c); noteCount.set(c.noteId, cnt + 1); }
    else result.push({ ...c, score: c.score * (1 - CFG.diversityPenalty * (cnt - maxPerNote + 1)) });
  }
  return result.sort((a, b) => b.score - a.score);
}

const hasUniqueIdentifiers = (kw: string[]) => kw.some(isUniqueIdentifier);
const suggestsAllTimeSearch = (q: string) => ALL_TIME_PATTERNS.some(p => p.test(q));

/** Boost chunks containing unique identifiers */
function applyUniqueIdPrecisionBoost(chunks: ScoredChunk[], keywords: string[]): ScoredChunk[] {
  const uids = keywords.filter(isUniqueIdentifier);
  if (!uids.length) return chunks;
  return chunks.map(c => {
    const lower = c.text.toLowerCase();
    const matches = uids.filter(u => lower.includes(u.toLowerCase())).length;
    return matches ? { ...c, score: c.score * (1 + 0.5 * matches) } : c;
  }).sort((a, b) => b.score - a.score);
}

/** Coverage-aware reranking to ensure query keywords are represented */
function applyCoverageReranking(chunks: ScoredChunk[], keywords: string[], targetCount: number): ScoredChunk[] {
  const n = chunks.length;
  if (n <= targetCount || !keywords.length) return chunks.slice(0, targetCount);

  const lowerTexts = chunks.map(c => c.text.toLowerCase());
  const lowerKw = keywords.map(k => k.toLowerCase());
  const selected: ScoredChunk[] = [], covered = new Uint8Array(lowerKw.length);
  const avail = new Uint8Array(n).fill(1);
  let coveredCount = 0;

  // First pass: ensure keyword coverage
  for (let ki = 0; ki < lowerKw.length && selected.length < targetCount; ki++) {
    if (covered[ki]) continue;
    for (let ci = 0; ci < n; ci++) {
      if (!avail[ci]) continue;
      if (lowerTexts[ci].includes(lowerKw[ki])) {
        selected.push(chunks[ci]);
        avail[ci] = 0;
        for (let kj = 0; kj < lowerKw.length; kj++) {
          if (!covered[kj] && lowerTexts[ci].includes(lowerKw[kj])) { covered[kj] = 1; coveredCount++; }
        }
        break;
      }
    }
    if (coveredCount >= lowerKw.length) break;
  }

  // Fill with highest scoring remaining
  for (let ci = 0; ci < n && selected.length < targetCount; ci++) {
    if (avail[ci]) selected.push(chunks[ci]);
  }

  selected.sort((a, b) => b.score - a.score);
  return selected;
}

/** Score gap detection to filter trailing low-relevance sources */
function applyScoreGapDetection(chunks: ScoredChunk[]): { chunks: ScoredChunk[]; gapFound: boolean; cutoffIndex?: number } {
  if (chunks.length <= CFG.scoreGapMinRetain) return { chunks, gapFound: false };
  const topScore = chunks[0]?.score ?? 0;
  if (topScore < CFG.scoreGapMinTop) return { chunks, gapFound: false };

  for (let i = CFG.scoreGapMinRetain - 1; i < chunks.length - 1; i++) {
    if (chunks[i].score - chunks[i + 1].score >= CFG.scoreGapThreshold) {
      return { chunks: chunks.slice(0, i + 1), gapFound: true, cutoffIndex: i + 1 };
    }
  }
  return { chunks, gapFound: false };
}

export interface RetrievalResult {
  chunks: ScoredChunk[];
  strategy: string;
  candidateCount: number;
  candidateCounts: CandidateCounts;
  timings?: RetrievalTimingsStage;
  scoreDistribution?: { topScore: number; scoreGap: number; uniqueNoteCount: number };
  elapsedMs: number;
}

/** Main retrieval function with multi-stage candidate generation */
export async function retrieveRelevantChunks(query: string, options: RetrievalOptions): Promise<RetrievalResult> {
  const startTime = Date.now();
  const timings: RetrievalTimingsStage = { queryParseMs: 0, embeddingMs: 0, vectorSearchMs: 0, lexicalSearchMs: 0, firestoreFetchMs: 0, scoringMs: 0, rerankMs: 0, totalMs: 0 };
  const candidateCounts: CandidateCounts = { vectorK: 0, lexicalK: 0, recencyK: 0, mergedK: 0, rerankedK: 0, finalK: 0 };

  // Stage 1: Query analysis
  const parseStart = Date.now();
  const analysis = analyzeQuery(query);
  const keywords = options.keywords ?? analysis.boostTerms ?? analysis.keywords;
  const queryTerms = extractTermsForIndexing(query);
  timings.queryParseMs = Date.now() - parseStart;

  const hasEntities = hasUniqueIdentifiers(keywords);
  const wantsAllTime = suggestsAllTimeSearch(query);
  const expandTimeWindow = hasEntities || wantsAllTime;
  const maxAgeDays = options.maxAgeDays ?? (expandTimeWindow ? CFG.entityExpandedDays : (analysis.timeHint?.days ?? RETRIEVAL_DEFAULT_DAYS));

  // Check cache
  const cacheKey = makeRetrievalCacheKey(options.tenantId, analysis.normalizedQuery, maxAgeDays);
  if (query.length >= 5) {
    const cached = getCachedRetrieval<RetrievalResult>(cacheKey);
    if (cached) return { ...cached, strategy: cached.strategy + '_cached', elapsedMs: Date.now() - startTime };
  }

  let strategy = expandTimeWindow ? 'multistage_expanded' : 'multistage';
  let vectorChunks: ChunkDoc[] = [], lexicalChunks: ChunkDoc[] = [], recencyChunks: ChunkDoc[] = [];
  let queryEmbedding: number[] | null = null;
  const useVector = VECTOR_SEARCH_ENABLED && isEmbeddingsAvailable();

  // Generate embedding
  if (useVector) {
    const t = Date.now();
    try { queryEmbedding = await generateQueryEmbedding(query); } catch (e) { logError('Embedding failed', e); }
    timings.embeddingMs = Date.now() - t;
  }

  // Parallel searches
  const searchPromises: Promise<void>[] = [];
  let vectorSearchMs = 0, vectorHydrationMs = 0;

  if (queryEmbedding) {
    searchPromises.push((async () => {
      const t = Date.now();
      try {
        const idx = getVectorIndex();
        const topK = expandTimeWindow ? CFG.entityExpandedLimit : RETRIEVAL_VECTOR_TOP_K;
        const results = await idx.search(queryEmbedding!, options.tenantId, topK);
        vectorSearchMs = Date.now() - t;
        if (results.length) {
          const ht = Date.now();
          const { chunks, cappedAt, driftDetected } = await batchHydrateChunks(results, options.tenantId);
          vectorChunks = chunks;
          vectorHydrationMs = Date.now() - ht;
          if (cappedAt) strategy += `_capped(${cappedAt})`;
          if (driftDetected) strategy += '_drift';
        }
        candidateCounts.vectorK = vectorChunks.length;
        strategy += `_vector(${idx.getName()})`;
      } catch (e) { vectorSearchMs = Date.now() - t; logError('Vector search failed', e); }
    })());
  }

  if (queryTerms.length) {
    searchPromises.push((async () => {
      const t = Date.now();
      let allTerms = queryTerms;
      if (isQueryExpansionAvailable()) {
        try {
          const expanded = await expandQuery(query);
          const terms = new Set(queryTerms);
          for (const eq of expanded.slice(1)) extractTermsForIndexing(eq).forEach(t => terms.add(t));
          allTerms = Array.from(terms).slice(0, RETRIEVAL_LEXICAL_MAX_TERMS);
          if (allTerms.length > queryTerms.length) strategy += '_qexp';
        } catch { /* ignore */ }
      }
      lexicalChunks = await fetchLexicalCandidates(options.tenantId, allTerms, RETRIEVAL_LEXICAL_TOP_K);
      candidateCounts.lexicalK = lexicalChunks.length;
      timings.lexicalSearchMs = Date.now() - t;
      if (lexicalChunks.length) strategy += '_lexical';
    })());
  }

  searchPromises.push((async () => {
    recencyChunks = await fetchRecentCandidates(options.tenantId, RETRIEVAL_RECENCY_TOP_K);
    candidateCounts.recencyK = recencyChunks.length;
  })());

  await Promise.all(searchPromises);
  timings.vectorSearchMs = vectorSearchMs;
  timings.firestoreFetchMs = vectorHydrationMs;

  // Fallback mode
  const isInFallbackMode = !vectorChunks.length && !lexicalChunks.length;
  if (isInFallbackMode) {
    const t = Date.now();
    const limit = expandTimeWindow ? CFG.entityExpandedLimit : Math.max(options.topK * 4, 150);
    logWarn('Retrieval fallback', { tenantId: options.tenantId, query: query.slice(0, 50) });
    vectorChunks = await fetchCandidates(options.tenantId, maxAgeDays, limit);
    candidateCounts.vectorK = vectorChunks.length;
    timings.firestoreFetchMs = Date.now() - t;
    strategy += '_fallback';
  }

  // Stage 3: Merge candidates
  let { chunks: mergedChunks, sources } = mergeCandidates(vectorChunks, lexicalChunks, recencyChunks);
  candidateCounts.mergedK = mergedChunks.length;

  // Time-hint filtering for aggregation intents
  const aggIntents: QueryIntent[] = ['summarize', 'list', 'action_item', 'decision'];
  const isAggIntent = aggIntents.includes(analysis.intent);
  if (isAggIntent && analysis.timeHint?.days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - analysis.timeHint.days);
    const before = mergedChunks.length;
    mergedChunks = mergedChunks.filter(c => (c.createdAt instanceof Timestamp ? c.createdAt.toDate() : new Date()) >= cutoff);
    const ids = new Set(mergedChunks.map(c => c.chunkId));
    sources = new Map(Array.from(sources.entries()).filter(([id]) => ids.has(id)));
    if (before !== mergedChunks.length) strategy += `_time_filtered(${analysis.timeHint.days}d)`;
  }

  // Recency fallback for aggregation
  if (!mergedChunks.length && recencyChunks.length && isAggIntent) {
    mergedChunks = recencyChunks;
    sources = new Map(recencyChunks.map(c => [c.chunkId, new Set(['recency'] as const)]));
    strategy += '_recency_fallback';
  }

  if (!mergedChunks.length) {
    return { chunks: [], strategy: strategy + '_no_candidates', candidateCount: 0, candidateCounts, timings, elapsedMs: Date.now() - startTime };
  }

  // Stage 4: Score candidates
  const scoringStart = Date.now();
  const vectorScores = queryEmbedding ? scoreByVector(mergedChunks, queryEmbedding) : new Map<string, number>();
  const keywordScores = scoreByKeywords(mergedChunks, keywords);
  const recencyScores = scoreByRecency(mergedChunks, maxAgeDays);
  let scored = combineScoresWeighted(mergedChunks, vectorScores, keywordScores, recencyScores, sources, vectorScores.size > 0);
  timings.scoringMs = Date.now() - scoringStart;
  scored.sort((a, b) => b.score - a.score);

  // Precision boost for strong top results
  let effectiveMinScore = CFG.minCombinedScore;
  if (scored.length >= 5) {
    const top = scored[0]?.score || 0, fifth = scored[4]?.score || 0;
    if (top >= CFG.precisionTopThreshold && top - fifth >= CFG.precisionGapThreshold) {
      effectiveMinScore = CFG.precisionMinScore;
      strategy += '_precboost';
    }
  }
  scored = scored.filter(c => c.score >= effectiveMinScore);

  // Stage 5: Reranking
  const rerankStart = Date.now();
  if (RETRIEVAL_MMR_ENABLED && scored.length > 1) { scored = applyMMRReranking(scored, RETRIEVAL_MMR_LAMBDA, options.topK); strategy += '_mmr'; }
  else if (RERANKING_ENABLED && scored.length > 1) { scored = applyDiversityReranking(scored); strategy += '_diverse'; }

  if (hasUniqueIdentifiers(keywords) && scored.length > 1) { scored = applyUniqueIdPrecisionBoost(scored, keywords); strategy += '_uidboost'; }
  if (keywords.length > 1 && scored.length > options.rerankTo) { scored = applyCoverageReranking(scored, keywords, options.rerankTo); strategy += '_coverage'; }

  if (CROSS_ENCODER_ENABLED && isCrossEncoderAvailable() && scored.length > 1) {
    try { scored = await crossEncoderRerank(query, scored, Math.min(scored.length, 25)); strategy += '_crossenc'; } catch { /* ignore */ }
  }
  if (LLM_RERANK_ENABLED && isLLMRerankerAvailable() && scored.length > 1) {
    try { scored = await llmRerank(query, scored, options.rerankTo); strategy += '_llm'; } catch { /* ignore */ }
  }
  if (scored.length > 1) { scored = deduplicateByText(scored); strategy += '_dedup'; }
  if (!isAggIntent && scored.length > CFG.scoreGapMinRetain) {
    const gap = applyScoreGapDetection(scored);
    if (gap.gapFound) { scored = gap.chunks; strategy += '_scoregap'; }
  }

  // Relevance threshold
  const relThreshold = isAggIntent ? Math.min(RETRIEVAL_MIN_RELEVANCE, 0.10) : RETRIEVAL_MIN_RELEVANCE;
  scored = scored.filter(c => c.score >= relThreshold);
  if (scored.length > options.rerankTo) scored = scored.slice(0, options.rerankTo);
  candidateCounts.rerankedK = scored.length;
  timings.rerankMs = Date.now() - rerankStart;

  // Stage 6: Context assembly
  const contextBudget = options.contextBudget ?? (LLM_CONTEXT_BUDGET_CHARS - LLM_CONTEXT_RESERVE_CHARS);
  const maxPerNote = isAggIntent ? 3 : 6;
  let totalChars = 0;
  const limitedChunks: ScoredChunk[] = [], noteCount = new Map<string, number>(), skipped: ScoredChunk[] = [];

  for (const c of scored) {
    if (totalChars + c.text.length > contextBudget) { skipped.push(c); continue; }
    const cnt = noteCount.get(c.noteId) || 0;
    if (cnt >= maxPerNote) { skipped.push(c); continue; }
    limitedChunks.push(c);
    totalChars += c.text.length;
    noteCount.set(c.noteId, cnt + 1);
  }

  // Backfill
  if (skipped.length && totalChars < contextBudget * 0.9) {
    for (const c of skipped) {
      if (c.score < 0.5) break;
      if (totalChars + c.text.length > contextBudget) continue;
      limitedChunks.push(c);
      totalChars += c.text.length;
    }
    limitedChunks.sort((a, b) => b.score - a.score);
  }

  if (isAggIntent && limitedChunks.length) strategy += `_diversified(${noteCount.size}notes)`;
  candidateCounts.finalK = limitedChunks.length;

  const scoreDistribution = limitedChunks.length ? {
    topScore: limitedChunks[0].score,
    scoreGap: limitedChunks.length > 1 ? limitedChunks[0].score - limitedChunks[1].score : 0,
    uniqueNoteCount: new Set(limitedChunks.map(c => c.noteId)).size,
  } : undefined;

  timings.totalMs = Date.now() - startTime;
  logInfo('Retrieval complete', { query: query.slice(0, 50), candidateCounts, strategy, timings });

  const result: RetrievalResult = { chunks: limitedChunks, strategy, candidateCount: candidateCounts.mergedK, candidateCounts, timings, scoreDistribution, elapsedMs: timings.totalMs };
  if (query.length >= 5 && limitedChunks.length) setCachedRetrieval(cacheKey, result);
  return result;
}

/** Combine scores with configurable weights */
function combineScoresWeighted(
  chunks: ChunkDoc[], vectorScores: Map<string, number>, keywordScores: Map<string, number>,
  recencyScores: Map<string, number>, sources: Map<string, Set<'vector' | 'lexical' | 'recency'>>, hasVector: boolean
): ScoredChunk[] {
  if (!chunks.length) return [];
  const vw = hasVector ? SCORE_WEIGHT_VECTOR : 0, kw = hasVector ? SCORE_WEIGHT_LEXICAL : 0.75, rw = hasVector ? SCORE_WEIGHT_RECENCY : 0.25;
  const defaultDate = new Date();

  return chunks.map(c => {
    const vs = vectorScores.get(c.chunkId) || 0, ks = keywordScores.get(c.chunkId) || 0, rs = recencyScores.get(c.chunkId) || 0;
    const srcCount = sources.get(c.chunkId)?.size || 0;
    const score = Math.min(vw * vs + kw * ks + rw * rs + getPositionBonus(c.position) + (srcCount > 1 ? 0.1 * (srcCount - 1) : 0), 1.0);
    return {
      chunkId: c.chunkId, noteId: c.noteId, tenantId: c.tenantId, text: c.text, position: c.position,
      createdAt: c.createdAt instanceof Timestamp ? c.createdAt.toDate() : defaultDate,
      score, vectorScore: vs, keywordScore: ks, recencyScore: rs, embedding: c.embedding,
    };
  });
}

