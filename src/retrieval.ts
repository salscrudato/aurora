/**
 * AuroraNotes API - Retrieval Module
 *
 * Implements best-in-class multi-stage hybrid retrieval with:
 * - Multi-stage candidate generation (vector → lexical → recency)
 * - Recall-first architecture for near-perfect recall at scale
 * - BM25-like keyword matching (lexical precision)
 * - MMR diversity reranking (multi-note coverage)
 * - Entity/unique-ID detection (expands search for specific queries)
 * - Position bonuses (intro/summary detection)
 * - Coverage-aware reranking (ensure query keywords are represented)
 *
 * Scale targets: 100k+ notes, millions of chunks with sub-second retrieval
 */

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firestore";
import {
  CHUNKS_COLLECTION,
  RETRIEVAL_DEFAULT_DAYS,
  RETRIEVAL_MAX_CONTEXT_CHARS,
  RETRIEVAL_MIN_RELEVANCE,
  LLM_CONTEXT_BUDGET_CHARS,
  LLM_CONTEXT_RESERVE_CHARS,
  VECTOR_SEARCH_ENABLED,
  RERANKING_ENABLED,
  LLM_RERANK_ENABLED,
  RETRIEVAL_VECTOR_TOP_K,
  RETRIEVAL_LEXICAL_TOP_K,
  RETRIEVAL_LEXICAL_MAX_TERMS,
  RETRIEVAL_RECENCY_TOP_K,
  RETRIEVAL_MMR_ENABLED,
  RETRIEVAL_MMR_LAMBDA,
  SCORE_WEIGHT_VECTOR,
  SCORE_WEIGHT_LEXICAL,
  SCORE_WEIGHT_RECENCY,
} from "./config";
import { ChunkDoc, ScoredChunk, RetrievalOptions, QueryAnalysis, QueryIntent, CandidateCounts, RetrievalTimingsStage } from "./types";
import { generateQueryEmbedding, isEmbeddingsAvailable } from "./embeddings";
import { cosineSimilarity, logInfo, logError, logWarn, extractTermsForIndexing } from "./utils";
import { analyzeQuery } from "./query";
import { llmRerank, isLLMRerankerAvailable } from "./reranker";
import { getVectorIndex, VectorSearchResult } from "./vectorIndex";
import { expandQuery, isQueryExpansionAvailable } from "./queryExpansion";
import { crossEncoderRerank, isCrossEncoderAvailable } from "./crossEncoder";
import { RRF_ENABLED, RRF_USE_WEIGHTED, CROSS_ENCODER_ENABLED } from "./config";
import {
  getCachedChunk,
  setCachedChunk,
  getCachedRetrieval,
  setCachedRetrieval,
  makeRetrievalCacheKey,
} from "./cache";

// Quality thresholds (tuned for better recall while maintaining precision)
const MIN_VECTOR_SCORE = 0.15;     // Lower threshold for recall-first (was 0.20)
const MIN_COMBINED_SCORE = 0.05;   // Lower for better recall (was 0.08)
const DIVERSITY_PENALTY = 0.10;    // Penalty for over-represented notes
const MAX_CHUNKS_PER_NOTE = 4;     // Max chunks from single note before diversity penalty

// Precision boost thresholds - when top results are very strong, filter more aggressively
const PRECISION_BOOST_TOP_SCORE_THRESHOLD = 0.70;  // If top chunk scores above this (lowered from 0.75)
const PRECISION_BOOST_GAP_THRESHOLD = 0.25;        // And gap to 5th chunk is above this (lowered from 0.30)
const PRECISION_BOOST_MIN_SCORE = 0.25;            // Then raise min score to this (raised from 0.20)

// Score gap detection thresholds - filter out sources with large score drop-off
// This prevents including low-relevance "trailing" sources that dilute precision
const SCORE_GAP_THRESHOLD = 0.35;      // If consecutive gap is larger than this, truncate
const SCORE_GAP_MIN_TOP_SCORE = 0.60;  // Only apply gap detection if top score is strong
const SCORE_GAP_MIN_RETAIN = 2;        // Always keep at least this many results

// Batch hydration configuration
const BATCH_HYDRATION_MAX = 500;   // Max chunks to hydrate from vector results (configurable cap)

// Entity/unique-ID query detection settings
const ENTITY_EXPANDED_DAYS = 365;     // Expand to 1 year for entity queries
const ENTITY_EXPANDED_LIMIT = 500;    // Fetch more candidates for entity queries
const ALL_TIME_PATTERNS = [
  /\b(all|ever|always|any time|anytime|history|historical)\b/i,
  /\b(first|original|oldest|earliest|initial)\b/i,
];

// BM25 parameters (tuned for note-style documents)
const BM25_K1 = 1.2;  // Slightly lower for shorter documents
const BM25_B = 0.75;  // Document length normalization

// Position bonus for chunks earlier in a note (more likely to be introduction/summary)
const POSITION_BONUS_MAX = 0.05;   // Reduced to not over-weight position

// Re-export analyzeQuery for backward compatibility
export { analyzeQuery } from "./query";

// Drift detection thresholds
const DRIFT_WARNING_THRESHOLD = 0.15; // Warn if >15% of vector results are missing
const DRIFT_SAMPLE_SIZE = 5; // Sample of missing IDs to log

// Adaptive K configuration (increased for larger context budget)
const ADAPTIVE_K_MIN = 6;     // Minimum chunks for simple queries (was 4)
const ADAPTIVE_K_MAX = 30;    // Maximum chunks for complex queries (was 12)
const ADAPTIVE_K_BASE = 12;   // Default for moderate queries (was 8)

// Intent-specific K adjustments
const INTENT_K_ADJUSTMENTS: Record<QueryIntent, number> = {
  summarize: 8,     // Aggregation needs many chunks
  list: 6,          // Lists need variety
  action_item: 6,   // Action items need broad coverage
  decision: 5,      // Decisions need context
  question: 0,      // Direct questions are focused
  search: 2,        // General search needs some breadth
};

/**
 * Calculate adaptive K based on query complexity and intent
 *
 * Factors considered:
 * - Query length (longer = more complex)
 * - Intent type (summarize needs more, question needs fewer)
 * - Number of query terms (more terms = broader scope)
 *
 * With unlimited context budget, we can afford to retrieve more chunks
 * and let the context assembly handle the final selection.
 *
 * @param query - The original query string
 * @param intent - Detected query intent
 * @param keywords - Extracted keywords
 * @returns Recommended number of chunks to return
 */
export function calculateAdaptiveK(
  query: string,
  intent: QueryIntent,
  keywords: string[]
): number {
  let k = ADAPTIVE_K_BASE;

  // Intent-based adjustment (more aggressive with larger budget)
  k += INTENT_K_ADJUSTMENTS[intent] ?? 0;

  // Query length adjustment (normalized to 0-4 bonus)
  const wordCount = query.split(/\s+/).length;
  if (wordCount >= 20) {
    k += 4; // Very complex query
  } else if (wordCount >= 12) {
    k += 3; // Complex query
  } else if (wordCount >= 6) {
    k += 1; // Moderate query
  } else if (wordCount <= 3) {
    k -= 2; // Simple query
  }

  // Keyword count adjustment
  if (keywords.length >= 8) {
    k += 3; // Many keywords = very broad scope
  } else if (keywords.length >= 5) {
    k += 2; // Moderate keyword count
  } else if (keywords.length >= 3) {
    k += 1; // Some keywords
  }

  // Clamp to valid range
  return Math.min(Math.max(k, ADAPTIVE_K_MIN), ADAPTIVE_K_MAX);
}

/**
 * Batch hydrate chunk documents from Firestore using getAll().
 * Preserves ordering from vectorResults by score.
 *
 * Uses Firestore Admin SDK batch getAll for efficient multi-document fetch.
 * Caps to BATCH_HYDRATION_MAX to prevent excessive memory usage.
 *
 * DRIFT DETECTION: Tracks missing chunk documents that exist in Vertex
 * but not in Firestore. If the missing ratio exceeds DRIFT_WARNING_THRESHOLD,
 * emits a structured warning log with sample of missing datapoint IDs.
 *
 * @param vectorResults - Results from vector search with chunkId and score
 * @param tenantId - Tenant ID for logging
 * @returns ChunkDoc array ordered by original score ranking
 */
async function batchHydrateChunks(
  vectorResults: VectorSearchResult[],
  tenantId: string = 'unknown'
): Promise<{
  chunks: ChunkDoc[];
  hydratedCount: number;
  cappedAt: number | null;
  missingCount: number;
  driftDetected: boolean;
}> {
  if (vectorResults.length === 0) {
    return { chunks: [], hydratedCount: 0, cappedAt: null, missingCount: 0, driftDetected: false };
  }

  const db = getDb();
  const cappedAt = vectorResults.length > BATCH_HYDRATION_MAX ? BATCH_HYDRATION_MAX : null;
  const resultsToFetch = vectorResults.slice(0, BATCH_HYDRATION_MAX);

  const startTime = Date.now();

  // Check cache first for each chunk
  const cachedChunks = new Map<string, ChunkDoc>();
  const uncachedIds: string[] = [];

  for (const r of resultsToFetch) {
    const cached = getCachedChunk<ChunkDoc>(r.chunkId);
    if (cached) {
      cachedChunks.set(r.chunkId, cached);
    } else {
      uncachedIds.push(r.chunkId);
    }
  }

  // Fetch uncached chunks from Firestore
  if (uncachedIds.length > 0) {
    const docRefs = uncachedIds.map(id =>
      db.collection(CHUNKS_COLLECTION).doc(id)
    );
    const snapshots = await db.getAll(...docRefs);

    for (const snap of snapshots) {
      if (snap.exists) {
        const data = snap.data() as ChunkDoc;
        cachedChunks.set(snap.id, data);
        // Cache for future requests
        setCachedChunk(snap.id, data);
      }
    }
  }

  const cacheHits = resultsToFetch.length - uncachedIds.length;

  // Preserve ordering by vector score (resultsToFetch order)
  // Track missing chunk IDs for drift detection
  const orderedChunks: ChunkDoc[] = [];
  const missingDatapointIds: string[] = [];

  for (const r of resultsToFetch) {
    const chunk = cachedChunks.get(r.chunkId);
    if (chunk) {
      orderedChunks.push(chunk);
    } else {
      // This chunk exists in Vertex but not in Firestore - potential drift
      missingDatapointIds.push(`${r.chunkId}:${r.noteId}`);
    }
  }

  const missingCount = missingDatapointIds.length;
  const missingRatio = resultsToFetch.length > 0 ? missingCount / resultsToFetch.length : 0;
  const driftDetected = missingRatio > DRIFT_WARNING_THRESHOLD;

  // Log drift warning if threshold exceeded
  if (driftDetected) {
    logWarn('Vertex index drift detected: missing chunk documents', {
      tenantId,
      requestedCount: resultsToFetch.length,
      hydratedCount: orderedChunks.length,
      missingCount,
      missingRatio: Math.round(missingRatio * 100),
      sampleMissingIds: missingDatapointIds.slice(0, DRIFT_SAMPLE_SIZE),
      recommendation: 'Run index cleanup to remove orphan Vertex datapoints',
      cacheHits,
      elapsedMs: Date.now() - startTime,
    });
  } else if (cappedAt) {
    logWarn('Batch hydration capped due to size limit', {
      requestedCount: vectorResults.length,
      cappedAt: BATCH_HYDRATION_MAX,
      hydratedCount: orderedChunks.length,
      missingCount,
      cacheHits,
      elapsedMs: Date.now() - startTime,
    });
  } else {
    logInfo('Batch hydration complete', {
      requestedCount: vectorResults.length,
      hydratedCount: orderedChunks.length,
      missingCount,
      cacheHits,
      elapsedMs: Date.now() - startTime,
    });
  }

  return {
    chunks: orderedChunks,
    hydratedCount: orderedChunks.length,
    cappedAt,
    missingCount,
    driftDetected,
  };
}

/**
 * Fetch candidate chunks from Firestore with optimized queries
 *
 * Uses server-side filtering when possible for better performance.
 * Falls back to client-side filtering for backward compatibility.
 */
async function fetchCandidates(
  tenantId: string,
  maxAgeDays: number,
  limit: number
): Promise<ChunkDoc[]> {
  const db = getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  try {
    // Try optimized query with composite index (tenantId + createdAt)
    // Requires Firestore index: noteChunks(tenantId ASC, createdAt DESC)
    const snap = await db
      .collection(CHUNKS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('createdAt', '>=', cutoffTimestamp)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    if (!snap.empty) {
      return snap.docs.map(d => d.data() as ChunkDoc);
    }
  } catch (err) {
    // Index may not exist yet, fall back to client-side filtering
    logError('Optimized chunk query failed, using fallback', err);
  }

  // Fallback: fetch all and filter client-side (for backward compatibility)
  const snap = await db
    .collection(CHUNKS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit * 2) // Fetch more to account for filtering
    .get();

  const chunks = snap.docs
    .map(d => {
      const data = d.data() as ChunkDoc;
      if (!data.tenantId) {
        data.tenantId = 'public';
      }
      return data;
    })
    .filter(c => {
      const createdAt = c.createdAt instanceof Timestamp
        ? c.createdAt.toDate()
        : new Date();
      return c.tenantId === tenantId && createdAt >= cutoffDate;
    })
    .slice(0, limit);

  return chunks;
}

// Lexical search configuration (tuned for better recall)
const LEXICAL_MULTI_QUERY_ENABLED = true; // Use multi-query union strategy
const LEXICAL_MAX_PARALLEL_QUERIES = 8; // Max parallel per-term queries (was 5)
const LEXICAL_PER_TERM_LIMIT = 75; // Limit per individual term query (was 50)

// Common stop words to deprioritize in lexical search
const LEXICAL_STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'was', 'were',
  'been', 'have', 'has', 'had', 'what', 'when', 'where', 'which', 'how', 'who',
  'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
]);

/**
 * Estimate term rarity using simple heuristics (IDF-like).
 * Longer terms and terms with special characters are typically rarer.
 * Returns higher score for rarer terms.
 */
function estimateTermRarity(term: string): number {
  let score = 0;

  // Longer terms are typically rarer
  score += Math.min(term.length, 15);

  // Terms with numbers are often identifiers (rarer, higher value)
  if (/[0-9]/.test(term)) {
    score += 8; // Increased from 5
  }

  // Terms with underscores/hyphens are often technical identifiers
  if (/[_-]/.test(term)) {
    score += 5; // Increased from 3
  }

  // Capitalized terms may be proper nouns or acronyms (valuable)
  if (/^[A-Z]/.test(term) || term === term.toUpperCase()) {
    score += 4;
  }

  // Very short common words are less valuable
  if (term.length <= 2) {
    score -= 5;
  }

  // Stop words should be deprioritized
  if (LEXICAL_STOP_WORDS.has(term.toLowerCase())) {
    score -= 10;
  }

  return score;
}

/**
 * Select best terms for lexical search using IDF-like heuristics.
 * Prefers rarer, more specific terms that are likely to have better precision.
 */
function selectBestTermsForLexical(terms: string[], maxTerms: number): string[] {
  if (terms.length <= maxTerms) {
    return terms;
  }

  // Score and sort by estimated rarity (descending)
  const scored = terms.map(term => ({
    term,
    score: estimateTermRarity(term),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxTerms).map(s => s.term);
}

/**
 * Fetch chunks via lexical search using terms[] field
 *
 * Uses multi-query union strategy for better scale:
 * 1. Select best terms using IDF-like heuristics
 * 2. Run parallel per-term queries (array-contains)
 * 3. Merge results with deduplication
 *
 * Falls back to single array-contains-any for small term sets.
 * Requires Firestore index: noteChunks(tenantId, terms array-contains)
 */
async function fetchLexicalCandidates(
  tenantId: string,
  queryTerms: string[],
  limit: number
): Promise<ChunkDoc[]> {
  if (queryTerms.length === 0) {
    return [];
  }

  const db = getDb();
  const startTime = Date.now();

  // Select best terms using IDF-like heuristics
  const selectedTerms = selectBestTermsForLexical(queryTerms, RETRIEVAL_LEXICAL_MAX_TERMS);

  try {
    let chunks: ChunkDoc[];

    // Use multi-query union for better scale when we have multiple terms
    if (LEXICAL_MULTI_QUERY_ENABLED && selectedTerms.length > 1) {
      chunks = await fetchLexicalMultiQuery(db, tenantId, selectedTerms, limit);
    } else {
      // Fallback to single array-contains-any for single term or disabled
      chunks = await fetchLexicalSingleQuery(db, tenantId, selectedTerms, limit);
    }

    logInfo('Lexical search complete', {
      tenantId,
      queryTermCount: queryTerms.length,
      selectedTermCount: selectedTerms.length,
      selectedTerms: selectedTerms.slice(0, 5), // Log first 5 for debugging
      strategy: LEXICAL_MULTI_QUERY_ENABLED && selectedTerms.length > 1 ? 'multi_query' : 'single_query',
      resultsReturned: chunks.length,
      elapsedMs: Date.now() - startTime,
    });

    return chunks;
  } catch (err) {
    // Index may not exist yet - this is expected for new deployments
    logWarn('Lexical search failed (index may not exist)', { error: String(err) });
    return [];
  }
}

/**
 * Single query using array-contains-any (original approach)
 */
async function fetchLexicalSingleQuery(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  terms: string[],
  limit: number
): Promise<ChunkDoc[]> {
  const snap = await db
    .collection(CHUNKS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('terms', 'array-contains-any', terms)
    .limit(limit)
    .get();

  return snap.docs.map(d => d.data() as ChunkDoc);
}

/**
 * Multi-query union strategy for better scale.
 * Runs parallel per-term queries and merges with deduplication.
 */
async function fetchLexicalMultiQuery(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  terms: string[],
  limit: number
): Promise<ChunkDoc[]> {
  // Limit parallel queries to avoid overwhelming Firestore
  const termsToQuery = terms.slice(0, LEXICAL_MAX_PARALLEL_QUERIES);

  // Run parallel per-term queries
  const queryPromises = termsToQuery.map(term =>
    db
      .collection(CHUNKS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('terms', 'array-contains', term)
      .limit(LEXICAL_PER_TERM_LIMIT)
      .get()
  );

  const snapshots = await Promise.all(queryPromises);

  // Merge with deduplication, tracking term match count for ranking
  const chunkMap = new Map<string, { chunk: ChunkDoc; matchCount: number }>();

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const chunk = doc.data() as ChunkDoc;
      const existing = chunkMap.get(chunk.chunkId);
      if (existing) {
        // Increment match count for chunks matching multiple terms
        existing.matchCount++;
      } else {
        chunkMap.set(chunk.chunkId, { chunk, matchCount: 1 });
      }
    }
  }

  // Sort by match count (descending) to prioritize chunks matching more terms
  const sorted = Array.from(chunkMap.values())
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, limit)
    .map(entry => entry.chunk);

  return sorted;
}

/**
 * Fetch recent chunks for recency signal
 * Returns the most recent chunks regardless of relevance
 */
async function fetchRecentCandidates(
  tenantId: string,
  limit: number
): Promise<ChunkDoc[]> {
  const db = getDb();

  const snap = await db
    .collection(CHUNKS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map(d => d.data() as ChunkDoc);
}

/**
 * Merge candidates from multiple stages, deduplicating by chunkId
 * Returns merged list with source tracking
 *
 * Optimized: Uses bitflags instead of Set for source tracking (reduces allocations)
 */
const SOURCE_VECTOR = 1;
const SOURCE_LEXICAL = 2;
const SOURCE_RECENCY = 4;

function mergeCandidates(
  vectorChunks: ChunkDoc[],
  lexicalChunks: ChunkDoc[],
  recencyChunks: ChunkDoc[]
): { chunks: ChunkDoc[]; sources: Map<string, Set<'vector' | 'lexical' | 'recency'>> } {
  const chunkMap = new Map<string, ChunkDoc>();
  // Use bitflags for efficient source tracking during merge
  const sourceFlags = new Map<string, number>();

  // Add vector candidates (typically largest set, add first)
  for (const chunk of vectorChunks) {
    chunkMap.set(chunk.chunkId, chunk);
    sourceFlags.set(chunk.chunkId, SOURCE_VECTOR);
  }

  // Add lexical candidates
  for (const chunk of lexicalChunks) {
    const existing = sourceFlags.get(chunk.chunkId);
    if (existing !== undefined) {
      sourceFlags.set(chunk.chunkId, existing | SOURCE_LEXICAL);
    } else {
      chunkMap.set(chunk.chunkId, chunk);
      sourceFlags.set(chunk.chunkId, SOURCE_LEXICAL);
    }
  }

  // Add recency candidates
  for (const chunk of recencyChunks) {
    const existing = sourceFlags.get(chunk.chunkId);
    if (existing !== undefined) {
      sourceFlags.set(chunk.chunkId, existing | SOURCE_RECENCY);
    } else {
      chunkMap.set(chunk.chunkId, chunk);
      sourceFlags.set(chunk.chunkId, SOURCE_RECENCY);
    }
  }

  // Convert bitflags to Set for API compatibility (only at the end)
  const sources = new Map<string, Set<'vector' | 'lexical' | 'recency'>>();
  for (const [chunkId, flags] of sourceFlags) {
    const sourceSet = new Set<'vector' | 'lexical' | 'recency'>();
    if (flags & SOURCE_VECTOR) sourceSet.add('vector');
    if (flags & SOURCE_LEXICAL) sourceSet.add('lexical');
    if (flags & SOURCE_RECENCY) sourceSet.add('recency');
    sources.set(chunkId, sourceSet);
  }

  return {
    chunks: Array.from(chunkMap.values()),
    sources,
  };
}

/**
 * Score chunks based on vector similarity with normalization
 */
function scoreByVector(
  chunks: ChunkDoc[],
  queryEmbedding: number[]
): Map<string, number> {
  const rawScores = new Map<string, number>();

  for (const chunk of chunks) {
    if (chunk.embedding) {
      const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
      // Apply minimum threshold
      if (similarity >= MIN_VECTOR_SCORE) {
        rawScores.set(chunk.chunkId, similarity);
      } else {
        rawScores.set(chunk.chunkId, similarity * 0.5); // Penalize low scores
      }
    }
  }

  return normalizeScores(rawScores);
}

// Pre-compiled regex patterns for unique identifier detection
const UNIQUE_ID_PATTERN_1 = /^[a-z][a-z0-9_]*[0-9_][a-z0-9_]*$/i;
const UNIQUE_ID_PATTERN_2 = /^[a-z]+_[a-z0-9_]+$/i;

/**
 * Check if a keyword looks like a unique identifier (uppercase with numbers/underscores)
 */
function isUniqueIdentifier(keyword: string): boolean {
  // Match patterns like CITE_TEST_002, PROJECT_ALPHA, TEST123
  return UNIQUE_ID_PATTERN_1.test(keyword) || UNIQUE_ID_PATTERN_2.test(keyword);
}

// Cache for compiled regex patterns (avoids recompilation per chunk)
const regexCache = new Map<string, RegExp>();
const wordBoundaryRegexCache = new Map<string, RegExp>();

function getKeywordRegex(keyword: string): RegExp {
  let regex = regexCache.get(keyword);
  if (!regex) {
    regex = new RegExp(escapeRegex(keyword), 'gi');
    regexCache.set(keyword, regex);
  }
  // Reset lastIndex for global regex reuse
  regex.lastIndex = 0;
  return regex;
}

function getWordBoundaryRegex(keyword: string): RegExp {
  let regex = wordBoundaryRegexCache.get(keyword);
  if (!regex) {
    regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
    wordBoundaryRegexCache.set(keyword, regex);
  }
  regex.lastIndex = 0;
  return regex;
}

// Pre-computed BM25 constants for common document length ratios
// Avoids repeated division in hot loop
const BM25_K1_PLUS_1 = BM25_K1 + 1;
const BM25_ONE_MINUS_B = 1 - BM25_B;

/**
 * Fast term frequency counter using indexOf loop
 * Faster than regex.match() for simple substring counting
 */
function countOccurrences(text: string, term: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) {
    count++;
    pos += term.length;
  }
  return count;
}

/**
 * Score chunks based on keyword overlap with BM25-like weighting
 * BM25 provides better relevance ranking than simple TF-IDF
 * Unique identifiers get significantly boosted scoring
 *
 * Optimizations:
 * - Pre-compute lowercase text once per chunk
 * - Pre-compile and cache regex patterns
 * - Pre-compute IDF values once per keyword
 * - Use indexOf for simple substring checks (faster than regex)
 * - Fast term frequency counting without regex
 * - Pre-computed BM25 constants
 */
function scoreByKeywords(
  chunks: ChunkDoc[],
  keywords: string[]
): Map<string, number> {
  const scores = new Map<string, number>();
  const chunkCount = chunks.length;

  if (keywords.length === 0 || chunkCount === 0) return scores;

  // Pre-compute lowercase keywords once
  const keywordCount = keywords.length;
  const keywordsLower: string[] = new Array(keywordCount);
  for (let i = 0; i < keywordCount; i++) {
    keywordsLower[i] = keywords[i].toLowerCase();
  }

  // Separate unique identifiers from regular keywords
  const uniqueIdsLower: string[] = [];
  const regularKeywords: string[] = [];
  const regularKeywordsLower: string[] = [];

  for (let i = 0; i < keywordCount; i++) {
    if (isUniqueIdentifier(keywords[i])) {
      uniqueIdsLower.push(keywordsLower[i]);
    } else {
      regularKeywords.push(keywords[i]);
      regularKeywordsLower.push(keywordsLower[i]);
    }
  }

  // Pre-compute lowercase text and lengths for all chunks
  const chunksLower: string[] = new Array(chunkCount);
  const docLengths: number[] = new Array(chunkCount);
  let totalLength = 0;

  for (let i = 0; i < chunkCount; i++) {
    const text = chunks[i].text;
    chunksLower[i] = text.toLowerCase();
    docLengths[i] = text.length;
    totalLength += text.length;
  }

  const avgDocLength = totalLength / chunkCount;

  // Calculate document frequency for each keyword (using pre-computed lowercase)
  // Use array instead of Map for faster access
  const docFreq: number[] = new Array(keywordCount);
  for (let i = 0; i < keywordCount; i++) {
    const keywordLower = keywordsLower[i];
    let count = 0;
    for (let j = 0; j < chunkCount; j++) {
      if (chunksLower[j].includes(keywordLower)) {
        count++;
      }
    }
    docFreq[i] = count || 1;
  }

  // Pre-compute IDF values for all keywords (array for faster access)
  const idfValues: number[] = new Array(keywordCount);
  for (let i = 0; i < keywordCount; i++) {
    const df = docFreq[i];
    idfValues[i] = Math.log((chunkCount - df + 0.5) / (df + 0.5) + 1);
  }

  // Build IDF lookup for regular keywords
  const regularIdf: number[] = new Array(regularKeywords.length);
  for (let i = 0; i < regularKeywords.length; i++) {
    const origIdx = keywords.indexOf(regularKeywords[i]);
    regularIdf[i] = origIdx >= 0 ? idfValues[origIdx] : 0;
  }

  const uniqueIdCount = uniqueIdsLower.length;
  const regularCount = regularKeywords.length;
  const keywordDivisor = Math.max(keywordCount, 1);

  // Early exit optimization: for pure unique-ID queries, we can use a fast path
  // that only looks for chunks containing those IDs without full BM25 scoring
  const isPureUniqueIdQuery = uniqueIdCount > 0 && regularCount === 0;

  // Track unique ID match results for early termination analysis
  let uniqueIdMatchedChunks = 0;
  const EARLY_EXIT_THRESHOLD = 25; // Stop after finding this many unique ID matches

  // Score each chunk
  for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const chunkLower = chunksLower[chunkIdx];
    const docLength = docLengths[chunkIdx];
    let weightedScore = 0;
    let uniqueIdMatchCount = 0;

    // First pass: check unique identifier matches (use indexOf, faster than regex)
    for (let i = 0; i < uniqueIdCount; i++) {
      if (chunkLower.includes(uniqueIdsLower[i])) {
        uniqueIdMatchCount++;
        // Unique IDs get massive boost - they're the most specific signals
        weightedScore += 3.0;
      }
    }

    // Track matches for early termination on pure unique ID queries
    if (uniqueIdMatchCount > 0) {
      uniqueIdMatchedChunks++;
    }

    // Fast path for pure unique-ID queries: skip BM25 scoring entirely
    // This provides significant speedup for entity-focused queries
    if (isPureUniqueIdQuery) {
      if (uniqueIdMatchCount > 0) {
        scores.set(chunk.chunkId, weightedScore / keywordDivisor);
      }
      // Early exit: if we've found enough matches, stop searching
      // This optimization helps with large document collections
      if (isPureUniqueIdQuery && uniqueIdMatchedChunks >= EARLY_EXIT_THRESHOLD) {
        break;
      }
      continue;
    }

    // Pre-compute BM25 length normalization factor for this document
    const lengthNorm = BM25_ONE_MINUS_B + BM25_B * (docLength / avgDocLength);

    // Second pass: regular keywords with BM25
    for (let i = 0; i < regularCount; i++) {
      const keywordLower = regularKeywordsLower[i];

      // Use indexOf for initial check (faster than regex)
      const firstIndex = chunkLower.indexOf(keywordLower);
      if (firstIndex === -1) continue;

      // Count occurrences using fast indexOf loop
      const tf = countOccurrences(chunkLower, keywordLower);

      if (tf > 0) {
        const idf = regularIdf[i];

        // BM25 TF normalization with pre-computed constants
        const tfNormalized = (tf * BM25_K1_PLUS_1) /
          (tf + BM25_K1 * lengthNorm);

        weightedScore += idf * tfNormalized;

        // Position boost for early matches (intro/summary detection)
        if (firstIndex < 50) {
          weightedScore += idf * 0.3;
        }

        // Exact word boundary match bonus (not just substring)
        const wordBoundaryRegex = getWordBoundaryRegex(keywordLower);
        const exactMatches = chunkLower.match(wordBoundaryRegex);
        if (exactMatches && exactMatches.length > 0) {
          weightedScore += idf * 0.4 * exactMatches.length;
        }
      }
    }

    // Penalize chunks that don't match unique IDs when unique IDs are present in query
    if (uniqueIdCount > 0 && uniqueIdMatchCount === 0) {
      weightedScore *= 0.2;
    }

    scores.set(chunk.chunkId, weightedScore / keywordDivisor);
  }

  return normalizeScores(scores);
}

/**
 * Escape special regex characters in keyword
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Score chunks based on recency with exponential decay
 */
function scoreByRecency(
  chunks: ChunkDoc[],
  maxAgeDays: number
): Map<string, number> {
  const scores = new Map<string, number>();
  const now = Date.now();
  const halfLifeMs = (maxAgeDays / 3) * 24 * 60 * 60 * 1000; // Decay half-life

  for (const chunk of chunks) {
    const createdAt = chunk.createdAt instanceof Timestamp
      ? chunk.createdAt.toDate()
      : new Date();
    const ageMs = now - createdAt.getTime();

    // Exponential decay for more natural recency scoring
    const recencyScore = Math.exp(-ageMs / halfLifeMs);
    scores.set(chunk.chunkId, recencyScore);
  }

  return scores;
}

/**
 * Normalize scores to [0, 1] range using min-max normalization
 *
 * Optimizations:
 * - Single pass for min/max (avoid Math.min/max function call overhead)
 * - In-place update when possible to reduce allocations
 * - Pre-compute range divisor
 */
function normalizeScores(scores: Map<string, number>): Map<string, number> {
  const size = scores.size;
  if (size === 0) return scores;

  // Single pass to find min and max (avoid function call overhead)
  let min = Infinity;
  let max = -Infinity;

  for (const score of scores.values()) {
    if (score < min) min = score;
    if (score > max) max = score;
  }

  // All scores are equal - return as-is
  if (max === min) return scores;

  // Pre-compute range for division
  const range = max - min;

  // Create normalized map
  const normalized = new Map<string, number>();
  for (const [key, value] of scores) {
    normalized.set(key, (value - min) / range);
  }

  return normalized;
}

// Pre-computed position bonus values for common positions (0-9)
// Avoids repeated Math.exp calls for frequently accessed positions
const POSITION_BONUS_CACHE: number[] = [];
for (let i = 0; i < 10; i++) {
  POSITION_BONUS_CACHE[i] = POSITION_BONUS_MAX * Math.exp(-i * 0.5);
}

/**
 * Calculate position bonus - earlier chunks in a note often contain key info
 * Uses pre-computed cache for common positions
 */
function getPositionBonus(position: number): number {
  // Use cached value for common positions
  if (position < POSITION_BONUS_CACHE.length) {
    return POSITION_BONUS_CACHE[position];
  }
  // Compute for rare high positions
  return POSITION_BONUS_MAX * Math.exp(-position * 0.5);
}

// Semantic deduplication threshold - chunks with cosine similarity above this are considered duplicates
const SEMANTIC_DEDUP_THRESHOLD = 0.92;

// Text-based deduplication threshold - chunks with this much text overlap are duplicates
const TEXT_DEDUP_MIN_LENGTH = 50;  // Only dedup for chunks with substantial content
const TEXT_DEDUP_THRESHOLD = 0.85; // 85% text overlap indicates near-duplicate

/**
 * Calculate Jaccard similarity between two texts using word sets
 * Fast approximate text similarity for deduplication
 */
function textSimilarity(text1: string, text2: string): number {
  if (text1.length < TEXT_DEDUP_MIN_LENGTH || text2.length < TEXT_DEDUP_MIN_LENGTH) {
    return 0; // Don't dedup very short texts
  }

  // Simple word-based Jaccard similarity
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }

  const union = words1.size + words2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * MMR (Maximal Marginal Relevance) reranking for diversity
 *
 * Balances relevance with diversity to avoid returning 8 chunks from one note
 * unless the query really requires it. Also performs semantic deduplication
 * using embedding similarity.
 *
 * MMR score = λ * relevance - (1-λ) * max_similarity_to_selected
 *
 * Optimizations:
 * - Pre-compute normalized scores as Float64Array for faster access
 * - Use Array instead of Set for remaining indices (faster iteration)
 * - Cache embedding references to avoid repeated property access
 * - Early exit when semantic duplicate detected
 * - Track note counts to skip expensive embedding comparison when same note
 *
 * @param chunks - Scored chunks sorted by relevance
 * @param lambda - Trade-off parameter (0.7 = 70% relevance, 30% diversity)
 * @param targetK - Number of chunks to select
 */
export function applyMMRReranking(
  chunks: ScoredChunk[],
  lambda: number = RETRIEVAL_MMR_LAMBDA,
  targetK: number
): ScoredChunk[] {
  const chunkCount = chunks.length;
  if (chunkCount <= targetK) {
    return chunks;
  }

  // Pre-compute normalized scores as typed array for faster access
  let maxScore = 0;
  for (let i = 0; i < chunkCount; i++) {
    if (chunks[i].score > maxScore) maxScore = chunks[i].score;
  }
  if (maxScore === 0) maxScore = 0.001;

  const normalizedScores = new Float64Array(chunkCount);
  for (let i = 0; i < chunkCount; i++) {
    normalizedScores[i] = chunks[i].score / maxScore;
  }

  // Use array-based tracking (faster than Set for small sizes)
  const isRemaining = new Uint8Array(chunkCount);
  for (let i = 0; i < chunkCount; i++) isRemaining[i] = 1;
  let remainingCount = chunkCount;

  const selected: ScoredChunk[] = [];
  const selectedEmbeddings: (number[] | undefined)[] = [];
  const selectedNoteIds: string[] = [];

  // Pre-cache lambda complement for MMR calculation
  const oneMinusLambda = 1 - lambda;

  // Track semantic duplicates filtered
  let semanticDupsFiltered = 0;

  while (selected.length < targetK && remainingCount > 0) {
    let bestIdx = -1;
    let bestMMR = -Infinity;

    for (let idx = 0; idx < chunkCount; idx++) {
      if (!isRemaining[idx]) continue;

      const relevance = normalizedScores[idx];
      const candidateChunk = chunks[idx];
      const candidateNoteId = candidateChunk.noteId;
      const candidateEmbedding = candidateChunk.embedding;

      // Calculate max similarity to already selected chunks
      let maxSimilarity = 0;
      let isSemanticDuplicate = false;

      const selectedCount = selected.length;
      for (let s = 0; s < selectedCount; s++) {
        const selectedNoteId = selectedNoteIds[s];

        // Fast path: same note = high similarity (skip expensive embedding calc)
        if (candidateNoteId === selectedNoteId) {
          maxSimilarity = Math.max(maxSimilarity, 0.8);
          continue;
        }

        // Text-based deduplication (catches exact copies from different sources)
        const selectedText = selected[s].text;
        const textSim = textSimilarity(candidateChunk.text, selectedText);
        if (textSim >= TEXT_DEDUP_THRESHOLD) {
          isSemanticDuplicate = true;
          break; // Early exit - near-duplicate text detected
        }

        // Compute embedding similarity for semantic deduplication
        const selectedEmbedding = selectedEmbeddings[s];
        if (candidateEmbedding && selectedEmbedding) {
          const embeddingSim = cosineSimilarity(candidateEmbedding, selectedEmbedding);

          // If very similar embeddings, mark as semantic duplicate
          if (embeddingSim >= SEMANTIC_DEDUP_THRESHOLD) {
            isSemanticDuplicate = true;
            break; // Early exit - no need to check other selected chunks
          }
          // Use embedding similarity to influence diversity
          const adjustedSim = embeddingSim * 0.6;
          if (adjustedSim > maxSimilarity) {
            maxSimilarity = adjustedSim;
          }
        }
      }

      // Skip semantic duplicates entirely
      if (isSemanticDuplicate) {
        isRemaining[idx] = 0;
        remainingCount--;
        semanticDupsFiltered++;
        continue;
      }

      // MMR score calculation
      const mmrScore = lambda * relevance - oneMinusLambda * maxSimilarity;

      if (mmrScore > bestMMR) {
        bestMMR = mmrScore;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      const selectedChunk = chunks[bestIdx];
      selected.push(selectedChunk);
      selectedEmbeddings.push(selectedChunk.embedding);
      selectedNoteIds.push(selectedChunk.noteId);
      isRemaining[bestIdx] = 0;
      remainingCount--;
    } else {
      break;
    }
  }

  if (semanticDupsFiltered > 0) {
    logInfo('Semantic deduplication applied', {
      duplicatesFiltered: semanticDupsFiltered,
      selectedCount: selected.length,
    });
  }

  return selected;
}

/**
 * Fast text deduplication to remove near-identical chunks after reranking.
 * This is a lightweight pass that catches duplicates that may have been
 * reordered by cross-encoder or LLM reranking.
 */
function deduplicateByText(chunks: ScoredChunk[], threshold: number = TEXT_DEDUP_THRESHOLD): ScoredChunk[] {
  if (chunks.length <= 1) return chunks;

  const result: ScoredChunk[] = [];
  const selectedTexts: string[] = [];

  for (const chunk of chunks) {
    // Check if this chunk's text is too similar to any already selected chunk
    let isDuplicate = false;
    for (const selectedText of selectedTexts) {
      const similarity = textSimilarity(chunk.text, selectedText);
      if (similarity >= threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.push(chunk);
      selectedTexts.push(chunk.text);
    }
  }

  if (result.length < chunks.length) {
    logInfo('Post-rerank text deduplication applied', {
      inputCount: chunks.length,
      outputCount: result.length,
      duplicatesRemoved: chunks.length - result.length,
    });
  }

  return result;
}

/**
 * Apply diversity reranking to avoid too many chunks from the same note
 * while still allowing sufficient context from relevant notes
 * (Fallback when MMR is disabled)
 */
function applyDiversityReranking(chunks: ScoredChunk[], maxPerNote: number = MAX_CHUNKS_PER_NOTE): ScoredChunk[] {
  const noteCount = new Map<string, number>();
  const result: ScoredChunk[] = [];

  for (const chunk of chunks) {
    const count = noteCount.get(chunk.noteId) || 0;

    if (count < maxPerNote) {
      result.push(chunk);
      noteCount.set(chunk.noteId, count + 1);
    } else {
      // Apply penalty for over-represented notes
      const penalizedChunk = {
        ...chunk,
        score: chunk.score * (1 - DIVERSITY_PENALTY * (count - maxPerNote + 1)),
      };
      result.push(penalizedChunk);
    }
  }

  // Re-sort after applying penalties
  result.sort((a, b) => b.score - a.score);
  return result;
}

/**
 * Check if query contains unique identifiers that warrant expanded search
 */
function hasUniqueIdentifiers(keywords: string[]): boolean {
  return keywords.some(isUniqueIdentifier);
}

/**
 * Check if query suggests searching all time (not just recent)
 */
function suggestsAllTimeSearch(query: string): boolean {
  return ALL_TIME_PATTERNS.some(pattern => pattern.test(query));
}

/**
 * Apply unique-ID precision boost
 * Ensures chunks containing unique identifiers from the query are prioritized
 */
function applyUniqueIdPrecisionBoost(
  chunks: ScoredChunk[],
  keywords: string[]
): ScoredChunk[] {
  const uniqueIds = keywords.filter(isUniqueIdentifier);
  if (uniqueIds.length === 0) {
    return chunks;
  }

  // Boost chunks that contain unique IDs
  return chunks.map(chunk => {
    const chunkLower = chunk.text.toLowerCase();
    let matchCount = 0;

    for (const uid of uniqueIds) {
      if (chunkLower.includes(uid.toLowerCase())) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      // Significant boost for unique ID matches
      return {
        ...chunk,
        score: chunk.score * (1 + 0.5 * matchCount),
      };
    }
    return chunk;
  }).sort((a, b) => b.score - a.score);
}

/**
 * Apply coverage-aware reranking
 * Ensures keywords from the query are represented in the final results
 *
 * Optimizations:
 * - Pre-compute lowercase text for all chunks once
 * - Pre-compute lowercase keywords once
 * - Use index-based tracking instead of array splice (O(1) vs O(n))
 * - Early exit when all keywords covered
 */
function applyCoverageReranking(
  chunks: ScoredChunk[],
  keywords: string[],
  targetCount: number
): ScoredChunk[] {
  const chunkCount = chunks.length;
  if (chunkCount <= targetCount || keywords.length === 0) {
    return chunks.slice(0, targetCount);
  }

  // Pre-compute lowercase text for all chunks (avoid repeated toLowerCase)
  const lowerTexts = chunks.map(c => c.text.toLowerCase());

  // Pre-compute lowercase keywords
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const keywordCount = lowerKeywords.length;

  const selected: ScoredChunk[] = [];
  const coveredKeywords = new Uint8Array(keywordCount); // 0 = not covered, 1 = covered
  let coveredCount = 0;

  // Track which chunks are still available (faster than splice)
  const isAvailable = new Uint8Array(chunkCount);
  for (let i = 0; i < chunkCount; i++) isAvailable[i] = 1;

  // First pass: ensure keyword coverage
  for (let ki = 0; ki < keywordCount; ki++) {
    if (selected.length >= targetCount) break;
    if (coveredKeywords[ki]) continue;

    const keyword = lowerKeywords[ki];

    // Find best chunk that covers this keyword
    let matchingIdx = -1;
    for (let ci = 0; ci < chunkCount; ci++) {
      if (!isAvailable[ci]) continue;
      if (lowerTexts[ci].includes(keyword)) {
        matchingIdx = ci;
        break;
      }
    }

    if (matchingIdx >= 0) {
      const chunk = chunks[matchingIdx];
      const chunkLower = lowerTexts[matchingIdx];
      selected.push(chunk);
      isAvailable[matchingIdx] = 0;

      // Mark all keywords covered by this chunk
      for (let kj = 0; kj < keywordCount; kj++) {
        if (!coveredKeywords[kj] && chunkLower.includes(lowerKeywords[kj])) {
          coveredKeywords[kj] = 1;
          coveredCount++;
        }
      }

      // Early exit if all keywords covered
      if (coveredCount >= keywordCount) break;
    }
  }

  // Second pass: fill with highest scoring remaining
  for (let ci = 0; ci < chunkCount; ci++) {
    if (selected.length >= targetCount) break;
    if (isAvailable[ci]) {
      selected.push(chunks[ci]);
    }
  }

  // Re-sort by score for final ordering
  selected.sort((a, b) => b.score - a.score);
  return selected;
}

/**
 * Apply score gap detection to filter out trailing low-relevance sources
 *
 * When there's a significant score drop-off between consecutive results,
 * we truncate the list to avoid including irrelevant "noise" sources that
 * dilute precision. This is especially important for focused queries where
 * we have strong top results but weaker trailing matches.
 *
 * @param chunks - Sorted chunks (highest score first)
 * @returns Filtered chunks up to the score gap cutoff
 */
function applyScoreGapDetection(chunks: ScoredChunk[]): { chunks: ScoredChunk[]; gapFound: boolean; cutoffIndex?: number } {
  if (chunks.length <= SCORE_GAP_MIN_RETAIN) {
    return { chunks, gapFound: false };
  }

  const topScore = chunks[0]?.score ?? 0;

  // Only apply gap detection if top result is strong enough
  if (topScore < SCORE_GAP_MIN_TOP_SCORE) {
    return { chunks, gapFound: false };
  }

  // Look for significant score gaps between consecutive results
  for (let i = SCORE_GAP_MIN_RETAIN - 1; i < chunks.length - 1; i++) {
    const currentScore = chunks[i].score;
    const nextScore = chunks[i + 1].score;
    const gap = currentScore - nextScore;

    // If we find a large gap, truncate here
    if (gap >= SCORE_GAP_THRESHOLD) {
      logInfo('Score gap detection triggered', {
        cutoffIndex: i + 1,
        currentScore: Math.round(currentScore * 100) / 100,
        nextScore: Math.round(nextScore * 100) / 100,
        gap: Math.round(gap * 100) / 100,
        originalCount: chunks.length,
        newCount: i + 1,
      });
      return {
        chunks: chunks.slice(0, i + 1),
        gapFound: true,
        cutoffIndex: i + 1
      };
    }
  }

  return { chunks, gapFound: false };
}

/**
 * Detailed retrieval result with candidate counts for observability
 */
export interface RetrievalResult {
  chunks: ScoredChunk[];
  strategy: string;
  candidateCount: number;
  candidateCounts: CandidateCounts;
  timings?: RetrievalTimingsStage;
  scoreDistribution?: {
    topScore: number;
    scoreGap: number;
    uniqueNoteCount: number;
  };
  elapsedMs: number;
}

/**
 * Main retrieval function with multi-stage candidate generation
 *
 * Pipeline stages:
 * 1. Vector candidate generation (PRIMARY at scale via Vertex)
 * 2. Lexical candidate generation (exact-match recall via terms[])
 * 3. Recency candidates (soft support for "recent" intents)
 * 4. Merge and deduplicate
 * 5. Score with normalized features
 * 6. MMR/diversity reranking
 * 7. Final context assembly
 */
export async function retrieveRelevantChunks(
  query: string,
  options: RetrievalOptions
): Promise<RetrievalResult> {
  const startTime = Date.now();
  const timings: RetrievalTimingsStage = {
    queryParseMs: 0,
    embeddingMs: 0,
    vectorSearchMs: 0,
    lexicalSearchMs: 0,
    firestoreFetchMs: 0,
    scoringMs: 0,
    rerankMs: 0,
    totalMs: 0,
  };

  // Initialize candidate counts for observability
  const candidateCounts: CandidateCounts = {
    vectorK: 0,
    lexicalK: 0,
    recencyK: 0,
    mergedK: 0,
    rerankedK: 0,
    finalK: 0,
  };

  // Stage 1: Query analysis
  const parseStart = Date.now();
  const analysis = analyzeQuery(query);
  const keywords = options.keywords ?? analysis.boostTerms ?? analysis.keywords;

  // Extract terms for lexical search (same normalization as indexing)
  const queryTerms = extractTermsForIndexing(query);

  timings.queryParseMs = Date.now() - parseStart;

  // Determine time window - expand for entity queries or all-time hints
  const hasEntities = hasUniqueIdentifiers(keywords);
  const wantsAllTime = suggestsAllTimeSearch(query);
  const expandTimeWindow = hasEntities || wantsAllTime;

  const maxAgeDays = options.maxAgeDays ??
    (expandTimeWindow ? ENTITY_EXPANDED_DAYS :
      (analysis.timeHint?.days ?? RETRIEVAL_DEFAULT_DAYS));

  // Check retrieval cache (skip for very short queries that might be ambiguous)
  const cacheKey = makeRetrievalCacheKey(options.tenantId, analysis.normalizedQuery, maxAgeDays);
  if (query.length >= 5) {
    const cached = getCachedRetrieval<RetrievalResult>(cacheKey);
    if (cached) {
      logInfo('Retrieval cache hit', {
        query: query.slice(0, 50),
        tenantId: options.tenantId,
        cachedChunks: cached.chunks.length,
        elapsedMs: Date.now() - startTime,
      });
      return {
        ...cached,
        strategy: cached.strategy + '_cached',
        elapsedMs: Date.now() - startTime,
      };
    }
  }

  let strategy = 'multistage';
  if (expandTimeWindow) strategy += '_expanded';

  // Stage 2: Parallel candidate generation
  let vectorChunks: ChunkDoc[] = [];
  let lexicalChunks: ChunkDoc[] = [];
  let recencyChunks: ChunkDoc[] = [];
  let queryEmbedding: number[] | null = null;

  const useVector = VECTOR_SEARCH_ENABLED && isEmbeddingsAvailable();

  // Generate embedding first (needed for both vector search and scoring)
  if (useVector) {
    const embeddingStart = Date.now();
    try {
      queryEmbedding = await generateQueryEmbedding(query);
      timings.embeddingMs = Date.now() - embeddingStart;
    } catch (err) {
      logError('Embedding generation failed', err);
      timings.embeddingMs = Date.now() - embeddingStart;
    }
  }

  // Run vector, lexical, and recency searches in parallel
  // Track each stage independently for accurate timing
  const parallelSearchStart = Date.now();
  const searchPromises: Promise<void>[] = [];

  // Track individual stage timings (set inside async closures)
  let vectorSearchMs = 0;
  let vectorHydrationMs = 0;
  let recencySearchMs = 0;

  // Vector search (primary at scale)
  if (queryEmbedding) {
    searchPromises.push((async () => {
      const vectorStart = Date.now();
      try {
        const vectorIndex = getVectorIndex();
        const vectorTopK = expandTimeWindow ? ENTITY_EXPANDED_LIMIT : RETRIEVAL_VECTOR_TOP_K;
        const vectorResults = await vectorIndex.search(queryEmbedding!, options.tenantId, vectorTopK);

        // Track vector search time (before hydration)
        vectorSearchMs = Date.now() - vectorStart;

        // Batch hydrate chunk docs from Firestore using efficient getAll()
        // Preserves ordering by vector score and caps at BATCH_HYDRATION_MAX
        // Also performs drift detection to identify orphan Vertex datapoints
        if (vectorResults.length > 0) {
          const hydrationStart = Date.now();
          const { chunks, cappedAt, driftDetected } = await batchHydrateChunks(
            vectorResults,
            options.tenantId
          );
          vectorChunks = chunks;
          vectorHydrationMs = Date.now() - hydrationStart;

          if (cappedAt) {
            strategy += `_hydration_capped(${cappedAt})`;
          }
          if (driftDetected) {
            strategy += '_drift_detected';
          }
        }

        candidateCounts.vectorK = vectorChunks.length;
        strategy += `_vector(${vectorIndex.getName()})`;
      } catch (err) {
        vectorSearchMs = Date.now() - vectorStart;
        logError('Vector search failed', err);
      }
    })());
  }

  // Lexical search (for exact-match recall)
  // Optionally expand query for better synonym coverage
  if (queryTerms.length > 0) {
    searchPromises.push((async () => {
      const lexStart = Date.now();

      // Use query expansion if enabled
      let allTerms = queryTerms;
      if (isQueryExpansionAvailable()) {
        try {
          const expandedQueries = await expandQuery(query);
          // Extract terms from all expanded queries
          const expandedTerms = new Set(queryTerms);
          for (const eq of expandedQueries.slice(1)) { // Skip original
            const terms = extractTermsForIndexing(eq);
            terms.forEach(t => expandedTerms.add(t));
          }
          allTerms = Array.from(expandedTerms).slice(0, RETRIEVAL_LEXICAL_MAX_TERMS);
          if (allTerms.length > queryTerms.length) {
            strategy += '_expanded';
          }
        } catch (err) {
          logWarn('Query expansion failed, using original terms', { error: String(err) });
        }
      }

      lexicalChunks = await fetchLexicalCandidates(
        options.tenantId,
        allTerms,
        RETRIEVAL_LEXICAL_TOP_K
      );
      candidateCounts.lexicalK = lexicalChunks.length;
      timings.lexicalSearchMs = Date.now() - lexStart;
      if (lexicalChunks.length > 0) {
        strategy += '_lexical';
      }
    })());
  }

  // Recency search (soft support)
  searchPromises.push((async () => {
    const recencyStart = Date.now();
    recencyChunks = await fetchRecentCandidates(
      options.tenantId,
      RETRIEVAL_RECENCY_TOP_K
    );
    candidateCounts.recencyK = recencyChunks.length;
    recencySearchMs = Date.now() - recencyStart;
  })());

  await Promise.all(searchPromises);

  // Record individual stage timings (parallel execution)
  // Note: These ran in parallel, so total wall time is max(all stages)
  // Record individual stage timings (parallel execution)
  // Note: These ran in parallel, so total wall time is max(all stages)
  timings.vectorSearchMs = vectorSearchMs;
  timings.firestoreFetchMs = vectorHydrationMs;

  // Fallback: if no vector results AND no lexical results, use traditional Firestore fetch
  // This indicates either:
  // 1. Vertex Vector Search is not configured/enabled
  // 2. Vector search returned no results (empty index or query issue)
  // 3. Embeddings are not available
  // 4. Lexical terms didn't match indexed terms
  const isInFallbackMode = vectorChunks.length === 0 && lexicalChunks.length === 0;

  if (isInFallbackMode) {
    const fetchStart = Date.now();
    const candidateLimit = expandTimeWindow ? ENTITY_EXPANDED_LIMIT : Math.max(options.topK * 4, 150);

    // Determine specific fallback reason for debugging
    let fallbackReason: string;
    if (!isEmbeddingsAvailable()) {
      fallbackReason = 'embeddings_unavailable';
    } else if (!queryEmbedding) {
      fallbackReason = 'embedding_generation_failed';
    } else if (!VECTOR_SEARCH_ENABLED) {
      fallbackReason = 'vector_search_disabled';
    } else {
      fallbackReason = 'no_matching_results';
    }

    // Log fallback with detailed diagnostics
    logWarn('Retrieval using Firestore fallback mode', {
      reason: fallbackReason,
      tenantId: options.tenantId,
      query: query.slice(0, 50),
      keywordCount: keywords.length,
      candidateLimit,
      maxAgeDays,
      embeddingsAvailable: isEmbeddingsAvailable(),
      vectorSearchEnabled: VECTOR_SEARCH_ENABLED,
      hint: 'Consider enabling Vertex Vector Search for better recall at scale',
    });

    const fallbackChunks = await fetchCandidates(options.tenantId, maxAgeDays, candidateLimit);
    vectorChunks = fallbackChunks;
    candidateCounts.vectorK = fallbackChunks.length;
    // Fallback fetch replaces hydration timing
    timings.firestoreFetchMs = Date.now() - fetchStart;
    strategy += '_fallback';

    // In fallback mode, apply keyword boosting to improve precision
    // since we don't have vector similarity scores
    if (keywords.length > 0) {
      strategy += '_keyword_boost';
    }
  }

  // Stage 3: Merge candidates
  let { chunks: mergedChunks, sources } = mergeCandidates(vectorChunks, lexicalChunks, recencyChunks);
  candidateCounts.mergedK = mergedChunks.length;

  // Apply time-hint hard filtering for aggregation intents with explicit time windows
  // This ensures summarize/list/action_item/decision queries respect time boundaries
  const aggregationIntents: QueryIntent[] = ['summarize', 'list', 'action_item', 'decision'];
  const isAggregationIntent = aggregationIntents.includes(analysis.intent);
  const hasExplicitTimeHint = analysis.timeHint?.days !== undefined;

  if (isAggregationIntent && hasExplicitTimeHint && analysis.timeHint?.days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - analysis.timeHint.days);

    const beforeFilterCount = mergedChunks.length;
    mergedChunks = mergedChunks.filter(chunk => {
      const createdAt = chunk.createdAt instanceof Timestamp
        ? chunk.createdAt.toDate()
        : new Date();
      return createdAt >= cutoffDate;
    });

    // Update sources map to only include filtered chunks
    const filteredChunkIds = new Set(mergedChunks.map(c => c.chunkId));
    sources = new Map(
      Array.from(sources.entries()).filter(([id]) => filteredChunkIds.has(id))
    );

    if (beforeFilterCount !== mergedChunks.length) {
      logInfo('Applied time-hint hard filter for aggregation intent', {
        intent: analysis.intent,
        timeHintDays: analysis.timeHint.days,
        beforeCount: beforeFilterCount,
        afterCount: mergedChunks.length,
        filteredOut: beforeFilterCount - mergedChunks.length,
      });
      strategy += `_time_filtered(${analysis.timeHint.days}d)`;
    }
  }

  // For aggregation intents (summarize, list), use recency chunks as fallback
  // when vector/lexical search finds no results
  if (mergedChunks.length === 0 && recencyChunks.length > 0 && isAggregationIntent) {
    logInfo('Using recency fallback for aggregation intent with no keyword matches', {
      intent: analysis.intent,
      recencyChunkCount: recencyChunks.length,
      query: query.slice(0, 50),
    });
    mergedChunks = recencyChunks;
    // Mark all as recency-sourced
    sources = new Map(recencyChunks.map(c => [c.chunkId, new Set(['recency'] as const)]));
    strategy += '_recency_fallback';
  }

  if (mergedChunks.length === 0) {
    return {
      chunks: [],
      strategy: strategy + '_no_candidates',
      candidateCount: 0,
      candidateCounts,
      timings,
      elapsedMs: Date.now() - startTime,
    };
  }

  // Stage 4: Score all candidates
  const scoringStart = Date.now();

  // Compute vector scores for merged candidates
  let vectorScores = new Map<string, number>();
  if (queryEmbedding) {
    vectorScores = scoreByVector(mergedChunks, queryEmbedding);
  }

  // Compute keyword and recency scores
  const keywordScores = scoreByKeywords(mergedChunks, keywords);
  const recencyScores = scoreByRecency(mergedChunks, maxAgeDays);

  // Combine scores with configurable weights
  const hasVectorSearch = vectorScores.size > 0;
  let scored = combineScoresWeighted(
    mergedChunks,
    vectorScores,
    keywordScores,
    recencyScores,
    sources,
    hasVectorSearch
  );

  timings.scoringMs = Date.now() - scoringStart;

  // Sort by combined score first to enable precision boost analysis
  scored.sort((a, b) => b.score - a.score);

  // Apply precision boost: when top results are very strong, filter more aggressively
  // This improves precision without sacrificing recall for focused queries
  let effectiveMinScore = MIN_COMBINED_SCORE;
  if (scored.length >= 5) {
    const topScore = scored[0]?.score || 0;
    const fifthScore = scored[4]?.score || 0;
    const scoreGap = topScore - fifthScore;

    if (topScore >= PRECISION_BOOST_TOP_SCORE_THRESHOLD && scoreGap >= PRECISION_BOOST_GAP_THRESHOLD) {
      effectiveMinScore = PRECISION_BOOST_MIN_SCORE;
      strategy += '_precboost';
      logInfo('Precision boost applied', {
        topScore: Math.round(topScore * 100) / 100,
        fifthScore: Math.round(fifthScore * 100) / 100,
        scoreGap: Math.round(scoreGap * 100) / 100,
        newMinScore: effectiveMinScore,
      });
    }
  }

  // Filter out low quality results with effective threshold
  scored = scored.filter(chunk => chunk.score >= effectiveMinScore);

  // Stage 5: Reranking
  const rerankStart = Date.now();

  // Apply MMR diversity reranking if enabled
  if (RETRIEVAL_MMR_ENABLED && scored.length > 1) {
    scored = applyMMRReranking(scored, RETRIEVAL_MMR_LAMBDA, options.topK);
    strategy += '_mmr';
  } else if (RERANKING_ENABLED && scored.length > 1) {
    // Fallback to simpler diversity reranking
    scored = applyDiversityReranking(scored, MAX_CHUNKS_PER_NOTE);
    strategy += '_diverse';
  }

  // Apply unique-ID precision boost for queries with identifiers
  if (hasUniqueIdentifiers(keywords) && scored.length > 1) {
    scored = applyUniqueIdPrecisionBoost(scored, keywords);
    strategy += '_uidboost';
  }

  // Apply coverage-aware reranking to ensure keywords are represented
  if (keywords.length > 1 && scored.length > options.rerankTo) {
    scored = applyCoverageReranking(scored, keywords, options.rerankTo);
    strategy += '_coverage';
  }

  // Apply cross-encoder reranking for high-precision scoring
  if (CROSS_ENCODER_ENABLED && isCrossEncoderAvailable() && scored.length > 1) {
    try {
      scored = await crossEncoderRerank(query, scored, Math.min(scored.length, 25));
      strategy += '_crossenc';
    } catch (err) {
      logError('Cross-encoder rerank failed, using heuristic order', err);
    }
  }

  // Apply LLM reranking if enabled (optional, behind feature flag)
  if (LLM_RERANK_ENABLED && isLLMRerankerAvailable() && scored.length > 1) {
    try {
      scored = await llmRerank(query, scored, options.rerankTo);
      strategy += '_llm';
    } catch (err) {
      logError('LLM rerank failed, using heuristic order', err);
    }
  }

  // Apply post-rerank text deduplication to catch any duplicates that
  // were reordered by cross-encoder or LLM reranking
  if (scored.length > 1) {
    scored = deduplicateByText(scored);
    strategy += '_dedup';
  }

  // Apply score gap detection to filter out trailing low-relevance sources
  // Only for non-aggregation intents (aggregation needs broader coverage)
  if (!isAggregationIntent && scored.length > SCORE_GAP_MIN_RETAIN) {
    const gapResult = applyScoreGapDetection(scored);
    if (gapResult.gapFound) {
      scored = gapResult.chunks;
      strategy += '_scoregap';
    }
  }

  // Filter out chunks below minimum relevance threshold
  // This ensures only high-quality matches are included in context
  // Use lower threshold for aggregation intents to include more diverse sources
  const relevanceThreshold = isAggregationIntent
    ? Math.min(RETRIEVAL_MIN_RELEVANCE, 0.10) // Lower threshold for summarize/list
    : RETRIEVAL_MIN_RELEVANCE;
  const preFilterCount = scored.length;
  scored = scored.filter(chunk => chunk.score >= relevanceThreshold);
  if (scored.length < preFilterCount) {
    logInfo('Low relevance chunks filtered', {
      beforeCount: preFilterCount,
      afterCount: scored.length,
      threshold: relevanceThreshold,
      isAggregation: isAggregationIntent,
    });
  }

  // Trim to final count
  if (scored.length > options.rerankTo) {
    scored = scored.slice(0, options.rerankTo);
  }
  candidateCounts.rerankedK = scored.length;
  timings.rerankMs = Date.now() - rerankStart;

  // Stage 6: Context assembly with dynamic context budget
  // Use LLM_CONTEXT_BUDGET_CHARS (default 100K) instead of hard-coded limits
  // This allows "unlimited" sources within the model's context window
  const contextBudget = options.contextBudget ?? (LLM_CONTEXT_BUDGET_CHARS - LLM_CONTEXT_RESERVE_CHARS);

  // For aggregation intents, prefer unique notes to provide broader coverage
  const MAX_CHUNKS_PER_NOTE_AGGREGATION = 3; // Increased for better coverage
  const MAX_CHUNKS_PER_NOTE_DEFAULT = 6; // Increased for more context

  const maxChunksPerNote = isAggregationIntent
    ? MAX_CHUNKS_PER_NOTE_AGGREGATION
    : MAX_CHUNKS_PER_NOTE_DEFAULT;

  let totalChars = 0;
  const limitedChunks: ScoredChunk[] = [];
  const noteChunkCounts = new Map<string, number>();
  const skippedChunks: ScoredChunk[] = []; // Track skipped chunks for potential backfill

  // First pass: select chunks with diversification
  for (const chunk of scored) {
    // Check context budget (dynamic, not hard-coded)
    if (totalChars + chunk.text.length > contextBudget) {
      // Don't break - track skipped chunks in case we have budget remaining
      skippedChunks.push(chunk);
      continue;
    }

    // Check per-note cap for diversification
    const currentNoteCount = noteChunkCounts.get(chunk.noteId) || 0;
    if (currentNoteCount >= maxChunksPerNote) {
      // Skip this chunk to prefer chunks from other notes
      skippedChunks.push(chunk);
      continue;
    }

    limitedChunks.push(chunk);
    totalChars += chunk.text.length;
    noteChunkCounts.set(chunk.noteId, currentNoteCount + 1);
  }

  // Second pass: backfill with skipped chunks if we have remaining budget
  // This allows smaller high-scoring chunks from over-represented notes
  // to fill in unused context space
  const BACKFILL_SCORE_THRESHOLD = 0.5; // Only backfill chunks with decent scores
  if (skippedChunks.length > 0 && totalChars < contextBudget * 0.9) {
    for (const chunk of skippedChunks) {
      if (chunk.score < BACKFILL_SCORE_THRESHOLD) break; // Skipped chunks are score-ordered
      if (totalChars + chunk.text.length > contextBudget) continue;

      limitedChunks.push(chunk);
      totalChars += chunk.text.length;

      // Update note counts for logging accuracy
      const currentNoteCount = noteChunkCounts.get(chunk.noteId) || 0;
      noteChunkCounts.set(chunk.noteId, currentNoteCount + 1);
    }

    // Re-sort by score after backfill to maintain score ordering
    limitedChunks.sort((a, b) => b.score - a.score);
  }

  // Log diversification stats for aggregation intents
  if (isAggregationIntent && limitedChunks.length > 0) {
    const uniqueNotes = noteChunkCounts.size;
    const skippedForDiversity = scored.length - limitedChunks.length;
    if (skippedForDiversity > 0) {
      logInfo('Note-level diversification applied', {
        intent: analysis.intent,
        maxChunksPerNote,
        uniqueNotes,
        chunksSelected: limitedChunks.length,
        chunksSkipped: skippedForDiversity,
      });
      strategy += `_diversified(${uniqueNotes}notes)`;
    }
  }

  candidateCounts.finalK = limitedChunks.length;

  // Compute score distribution for observability
  const scoreDistribution = limitedChunks.length > 0 ? {
    topScore: limitedChunks[0].score,
    scoreGap: limitedChunks.length > 1
      ? limitedChunks[0].score - limitedChunks[1].score
      : 0,
    uniqueNoteCount: new Set(limitedChunks.map(c => c.noteId)).size,
  } : undefined;

  timings.totalMs = Date.now() - startTime;

  // Estimate Firestore reads for observability
  // Reads come from: lexical search, recency search, fallback fetch, hydration
  const estimatedFirestoreReads =
    candidateCounts.lexicalK + // Lexical search results
    candidateCounts.recencyK + // Recency search results
    (candidateCounts.vectorK > 0 ? candidateCounts.vectorK : 0); // Hydration reads (may be cached)

  logInfo('Multi-stage retrieval complete', {
    query: query.slice(0, 50),
    intent: analysis.intent,
    candidateCounts,
    scoreDistribution,
    strategy,
    hasVectorSearch,
    expandedTimeWindow: expandTimeWindow,
    maxAgeDays,
    timings,
    estimatedFirestoreReads,
    uniqueNotesInContext: scoreDistribution?.uniqueNoteCount ?? 0,
  });

  const result: RetrievalResult = {
    chunks: limitedChunks,
    strategy,
    candidateCount: candidateCounts.mergedK,
    candidateCounts,
    timings,
    scoreDistribution,
    elapsedMs: timings.totalMs,
  };

  // Cache the result for future identical queries
  if (query.length >= 5 && limitedChunks.length > 0) {
    setCachedRetrieval(cacheKey, result);
  }

  return result;
}

/**
 * Combine scores with configurable weights and source boost
 */
/**
 * Combine scores from different retrieval stages with configurable weights.
 *
 * Optimizations:
 * - Pre-allocate result array to avoid dynamic resizing
 * - Cache weight values outside loop
 * - Avoid creating new Set for missing sources
 * - Reuse Date objects where possible
 */
function combineScoresWeighted(
  chunks: ChunkDoc[],
  vectorScores: Map<string, number>,
  keywordScores: Map<string, number>,
  recencyScores: Map<string, number>,
  sources: Map<string, Set<'vector' | 'lexical' | 'recency'>>,
  hasVectorSearch: boolean
): ScoredChunk[] {
  const chunkCount = chunks.length;
  if (chunkCount === 0) return [];

  // Pre-allocate result array for better memory efficiency
  const results: ScoredChunk[] = new Array(chunkCount);

  // Cache weights outside loop (avoid repeated ternary checks)
  const vectorWeight = hasVectorSearch ? SCORE_WEIGHT_VECTOR : 0;
  const keywordWeight = hasVectorSearch ? SCORE_WEIGHT_LEXICAL : 0.75;
  const recencyWeight = hasVectorSearch ? SCORE_WEIGHT_RECENCY : 0.25;

  // Cache default date for chunks without valid createdAt
  const defaultDate = new Date();

  for (let i = 0; i < chunkCount; i++) {
    const chunk = chunks[i];
    const chunkId = chunk.chunkId;

    // Get scores with cached Map lookups
    const vectorScore = vectorScores.get(chunkId) || 0;
    const keywordScore = keywordScores.get(chunkId) || 0;
    const recencyScore = recencyScores.get(chunkId) || 0;
    const positionBonus = getPositionBonus(chunk.position);

    // Boost chunks found by multiple retrieval stages
    // Avoid creating new Set - check for undefined explicitly
    const chunkSources = sources.get(chunkId);
    const sourceCount = chunkSources ? chunkSources.size : 0;
    const multiSourceBoost = sourceCount > 1 ? 0.1 * (sourceCount - 1) : 0;

    // Combine weighted scores (multiply-add is well optimized by V8)
    const rawCombinedScore =
      vectorWeight * vectorScore +
      keywordWeight * keywordScore +
      recencyWeight * recencyScore +
      positionBonus +
      multiSourceBoost;

    // Cap score at 1.0 for consistent relevance interpretation
    const combinedScore = Math.min(rawCombinedScore, 1.0);

    // Convert createdAt efficiently
    const createdAt = chunk.createdAt instanceof Timestamp
      ? chunk.createdAt.toDate()
      : defaultDate;

    // Direct assignment to pre-allocated slot
    results[i] = {
      chunkId,
      noteId: chunk.noteId,
      tenantId: chunk.tenantId,
      text: chunk.text,
      position: chunk.position,
      createdAt,
      score: combinedScore,
      vectorScore,
      keywordScore,
      recencyScore,
      embedding: chunk.embedding,
    };
  }

  return results;
}

