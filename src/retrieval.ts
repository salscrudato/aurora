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
import { ChunkDoc, ScoredChunk, RetrievalOptions, QueryAnalysis, CandidateCounts, RetrievalTimingsStage } from "./types";
import { generateQueryEmbedding, isEmbeddingsAvailable } from "./embeddings";
import { cosineSimilarity, logInfo, logError, logWarn, extractTermsForIndexing } from "./utils";
import { analyzeQuery } from "./query";
import { llmRerank, isLLMRerankerAvailable } from "./reranker";
import { getVectorIndex, VectorSearchResult } from "./vectorIndex";
import { expandQuery, isQueryExpansionAvailable } from "./queryExpansion";

// Quality thresholds (tuned for better recall while maintaining precision)
const MIN_VECTOR_SCORE = 0.15;     // Lower threshold for recall-first (was 0.20)
const MIN_COMBINED_SCORE = 0.05;   // Lower for better recall (was 0.08)
const DIVERSITY_PENALTY = 0.10;    // Penalty for over-represented notes
const MAX_CHUNKS_PER_NOTE = 4;     // Max chunks from single note before diversity penalty

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

/**
 * Batch hydrate chunk documents from Firestore using getAll().
 * Preserves ordering from vectorResults by score.
 *
 * Uses Firestore Admin SDK batch getAll for efficient multi-document fetch.
 * Caps to BATCH_HYDRATION_MAX to prevent excessive memory usage.
 *
 * @param vectorResults - Results from vector search with chunkId and score
 * @returns ChunkDoc array ordered by original score ranking
 */
async function batchHydrateChunks(
  vectorResults: VectorSearchResult[]
): Promise<{ chunks: ChunkDoc[]; hydratedCount: number; cappedAt: number | null }> {
  if (vectorResults.length === 0) {
    return { chunks: [], hydratedCount: 0, cappedAt: null };
  }

  const db = getDb();
  const cappedAt = vectorResults.length > BATCH_HYDRATION_MAX ? BATCH_HYDRATION_MAX : null;
  const resultsToFetch = vectorResults.slice(0, BATCH_HYDRATION_MAX);

  // Build document references for batch fetch
  const docRefs = resultsToFetch.map(r =>
    db.collection(CHUNKS_COLLECTION).doc(r.chunkId)
  );

  // Use getAll for efficient batch fetch (single round-trip to Firestore)
  const startTime = Date.now();
  const snapshots = await db.getAll(...docRefs);

  // Build a map of chunkId -> ChunkDoc for reordering
  const chunkMap = new Map<string, ChunkDoc>();
  for (const snap of snapshots) {
    if (snap.exists) {
      const data = snap.data() as ChunkDoc;
      chunkMap.set(snap.id, data);
    }
  }

  // Preserve ordering by vector score (resultsToFetch order)
  const orderedChunks: ChunkDoc[] = [];
  for (const r of resultsToFetch) {
    const chunk = chunkMap.get(r.chunkId);
    if (chunk) {
      orderedChunks.push(chunk);
    }
  }

  if (cappedAt) {
    logWarn('Batch hydration capped due to size limit', {
      requestedCount: vectorResults.length,
      cappedAt: BATCH_HYDRATION_MAX,
      hydratedCount: orderedChunks.length,
      elapsedMs: Date.now() - startTime,
    });
  } else {
    logInfo('Batch hydration complete', {
      requestedCount: vectorResults.length,
      hydratedCount: orderedChunks.length,
      elapsedMs: Date.now() - startTime,
    });
  }

  return {
    chunks: orderedChunks,
    hydratedCount: orderedChunks.length,
    cappedAt,
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

/**
 * Fetch chunks via lexical search using terms[] field
 *
 * Uses Firestore array-contains-any for indexed term matching.
 * This provides exact-match recall for identifiers, codes, and specific terms.
 * Requires Firestore index: noteChunks(tenantId, terms array-contains-any)
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

  // Firestore array-contains-any supports max 10 values
  const searchTerms = queryTerms.slice(0, RETRIEVAL_LEXICAL_MAX_TERMS);

  try {
    // Query chunks where terms[] contains any of the search terms
    const snap = await db
      .collection(CHUNKS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('terms', 'array-contains-any', searchTerms)
      .limit(limit)
      .get();

    const chunks = snap.docs.map(d => d.data() as ChunkDoc);

    logInfo('Lexical search complete', {
      tenantId,
      searchTerms: searchTerms.length,
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
 */
function mergeCandidates(
  vectorChunks: ChunkDoc[],
  lexicalChunks: ChunkDoc[],
  recencyChunks: ChunkDoc[]
): { chunks: ChunkDoc[]; sources: Map<string, Set<'vector' | 'lexical' | 'recency'>> } {
  const chunkMap = new Map<string, ChunkDoc>();
  const sources = new Map<string, Set<'vector' | 'lexical' | 'recency'>>();

  // Add vector candidates
  for (const chunk of vectorChunks) {
    chunkMap.set(chunk.chunkId, chunk);
    sources.set(chunk.chunkId, new Set(['vector']));
  }

  // Add lexical candidates
  for (const chunk of lexicalChunks) {
    if (chunkMap.has(chunk.chunkId)) {
      sources.get(chunk.chunkId)!.add('lexical');
    } else {
      chunkMap.set(chunk.chunkId, chunk);
      sources.set(chunk.chunkId, new Set(['lexical']));
    }
  }

  // Add recency candidates
  for (const chunk of recencyChunks) {
    if (chunkMap.has(chunk.chunkId)) {
      sources.get(chunk.chunkId)!.add('recency');
    } else {
      chunkMap.set(chunk.chunkId, chunk);
      sources.set(chunk.chunkId, new Set(['recency']));
    }
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

/**
 * Check if a keyword looks like a unique identifier (uppercase with numbers/underscores)
 */
function isUniqueIdentifier(keyword: string): boolean {
  // Match patterns like CITE_TEST_002, PROJECT_ALPHA, TEST123
  return /^[a-z][a-z0-9_]*[0-9_][a-z0-9_]*$/i.test(keyword) ||
         /^[a-z]+_[a-z0-9_]+$/i.test(keyword);
}

/**
 * Score chunks based on keyword overlap with BM25-like weighting
 * BM25 provides better relevance ranking than simple TF-IDF
 * Unique identifiers get significantly boosted scoring
 */
function scoreByKeywords(
  chunks: ChunkDoc[],
  keywords: string[]
): Map<string, number> {
  const scores = new Map<string, number>();

  if (keywords.length === 0) return scores;

  // Separate unique identifiers from regular keywords
  const uniqueIds = keywords.filter(isUniqueIdentifier);
  const regularKeywords = keywords.filter(k => !isUniqueIdentifier(k));

  // Calculate document frequency for each keyword
  const docFreq = new Map<string, number>();
  for (const keyword of keywords) {
    let count = 0;
    for (const chunk of chunks) {
      if (chunk.text.toLowerCase().includes(keyword)) {
        count++;
      }
    }
    docFreq.set(keyword, count || 1);
  }

  const totalDocs = chunks.length || 1;

  // Calculate average document length for BM25
  const avgDocLength = chunks.reduce((sum, c) => sum + c.text.length, 0) / totalDocs;

  for (const chunk of chunks) {
    const chunkLower = chunk.text.toLowerCase();
    const docLength = chunk.text.length;
    let weightedScore = 0;
    let uniqueIdMatchCount = 0;

    // First pass: check unique identifier matches (these are critical)
    for (const uniqueId of uniqueIds) {
      if (chunkLower.includes(uniqueId.toLowerCase())) {
        uniqueIdMatchCount++;
        // Unique IDs get massive boost - they're the most specific signals
        weightedScore += 3.0; // High fixed score for unique ID match
      }
    }

    // Second pass: regular keywords with BM25
    for (const keyword of regularKeywords) {
      const keywordLower = keyword.toLowerCase();
      const matches = chunkLower.match(new RegExp(escapeRegex(keywordLower), 'g')) || [];
      const tf = matches.length;

      if (tf > 0) {
        const df = docFreq.get(keyword) || 1;
        const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);

        const tfNormalized = (tf * (BM25_K1 + 1)) /
          (tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength)));

        weightedScore += idf * tfNormalized;

        // Position boost for early matches (intro/summary detection)
        if (chunkLower.startsWith(keywordLower) || chunkLower.indexOf(keywordLower) < 50) {
          weightedScore += idf * 0.3;
        }

        // Exact word boundary match bonus (not just substring)
        const wordBoundaryPattern = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'g');
        const exactMatches = chunkLower.match(wordBoundaryPattern) || [];
        if (exactMatches.length > 0) {
          weightedScore += idf * 0.4 * exactMatches.length; // Bonus for exact word matches
        }
      }
    }

    // Penalize chunks that don't match unique IDs when unique IDs are present in query
    if (uniqueIds.length > 0 && uniqueIdMatchCount === 0) {
      weightedScore *= 0.2; // Strong penalty for missing required unique ID
    }

    scores.set(chunk.chunkId, weightedScore / Math.max(keywords.length, 1));
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
 */
function normalizeScores(scores: Map<string, number>): Map<string, number> {
  if (scores.size === 0) return scores;

  let min = Infinity;
  let max = -Infinity;

  for (const score of scores.values()) {
    min = Math.min(min, score);
    max = Math.max(max, score);
  }

  if (max === min) return scores; // All scores are equal

  const normalized = new Map<string, number>();
  for (const [key, value] of scores.entries()) {
    normalized.set(key, (value - min) / (max - min));
  }

  return normalized;
}

/**
 * Calculate position bonus - earlier chunks in a note often contain key info
 */
function getPositionBonus(position: number): number {
  // Position 0 (first chunk) gets max bonus, decays quickly
  return POSITION_BONUS_MAX * Math.exp(-position * 0.5);
}

/**
 * MMR (Maximal Marginal Relevance) reranking for diversity
 *
 * Balances relevance with diversity to avoid returning 8 chunks from one note
 * unless the query really requires it.
 *
 * MMR score = λ * relevance - (1-λ) * max_similarity_to_selected
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
  if (chunks.length <= targetK) {
    return chunks;
  }

  const selected: ScoredChunk[] = [];
  const remaining = new Set(chunks.map((_, i) => i));

  // Normalize scores to [0, 1] for MMR calculation
  const maxScore = Math.max(...chunks.map(c => c.score), 0.001);
  const normalizedScores = chunks.map(c => c.score / maxScore);

  while (selected.length < targetK && remaining.size > 0) {
    let bestIdx = -1;
    let bestMMR = -Infinity;

    for (const idx of remaining) {
      const relevance = normalizedScores[idx];

      // Calculate max similarity to already selected chunks
      let maxSimilarity = 0;
      for (const selectedChunk of selected) {
        // Use note-based similarity: same note = high similarity
        // This encourages diversity across notes
        const sameNote = chunks[idx].noteId === selectedChunk.noteId;
        const textSim = sameNote ? 0.8 : 0; // Penalize same note

        // Could also compute actual text/embedding similarity here
        // but note-based is efficient and effective
        maxSimilarity = Math.max(maxSimilarity, textSim);
      }

      // MMR score
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestMMR) {
        bestMMR = mmrScore;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      selected.push(chunks[bestIdx]);
      remaining.delete(bestIdx);
    } else {
      break;
    }
  }

  return selected;
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
 */
function applyCoverageReranking(
  chunks: ScoredChunk[],
  keywords: string[],
  targetCount: number
): ScoredChunk[] {
  if (chunks.length <= targetCount || keywords.length === 0) {
    return chunks.slice(0, targetCount);
  }

  const selected: ScoredChunk[] = [];
  const coveredKeywords = new Set<string>();
  const remaining = [...chunks];

  // First pass: ensure keyword coverage
  for (const keyword of keywords) {
    if (selected.length >= targetCount) break;
    if (coveredKeywords.has(keyword)) continue;

    // Find best chunk that covers this keyword
    const matchingIdx = remaining.findIndex(c =>
      c.text.toLowerCase().includes(keyword.toLowerCase())
    );

    if (matchingIdx >= 0) {
      const chunk = remaining[matchingIdx];
      selected.push(chunk);
      remaining.splice(matchingIdx, 1);

      // Mark all keywords covered by this chunk
      for (const kw of keywords) {
        if (chunk.text.toLowerCase().includes(kw.toLowerCase())) {
          coveredKeywords.add(kw);
        }
      }
    }
  }

  // Second pass: fill with highest scoring remaining
  for (const chunk of remaining) {
    if (selected.length >= targetCount) break;
    selected.push(chunk);
  }

  // Re-sort by score for final ordering
  selected.sort((a, b) => b.score - a.score);
  return selected;
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
        if (vectorResults.length > 0) {
          const hydrationStart = Date.now();
          const { chunks, cappedAt } = await batchHydrateChunks(vectorResults);
          vectorChunks = chunks;
          vectorHydrationMs = Date.now() - hydrationStart;

          if (cappedAt) {
            strategy += `_hydration_capped(${cappedAt})`;
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
  const { chunks: mergedChunks, sources } = mergeCandidates(vectorChunks, lexicalChunks, recencyChunks);
  candidateCounts.mergedK = mergedChunks.length;

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

  // Filter out very low quality results
  scored = scored.filter(chunk => chunk.score >= MIN_COMBINED_SCORE);

  // Sort by combined score
  scored.sort((a, b) => b.score - a.score);

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

  // Apply LLM reranking if enabled (optional, behind feature flag)
  if (LLM_RERANK_ENABLED && isLLMRerankerAvailable() && scored.length > 1) {
    try {
      scored = await llmRerank(query, scored, options.rerankTo);
      strategy += '_llm';
    } catch (err) {
      logError('LLM rerank failed, using heuristic order', err);
    }
  }

  // Trim to final count
  if (scored.length > options.rerankTo) {
    scored = scored.slice(0, options.rerankTo);
  }
  candidateCounts.rerankedK = scored.length;
  timings.rerankMs = Date.now() - rerankStart;

  // Stage 6: Context assembly (limit total size)
  let totalChars = 0;
  const limitedChunks: ScoredChunk[] = [];

  for (const chunk of scored) {
    if (totalChars + chunk.text.length > RETRIEVAL_MAX_CONTEXT_CHARS) break;
    limitedChunks.push(chunk);
    totalChars += chunk.text.length;
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
  });

  return {
    chunks: limitedChunks,
    strategy,
    candidateCount: candidateCounts.mergedK,
    candidateCounts,
    timings,
    scoreDistribution,
    elapsedMs: timings.totalMs,
  };
}

/**
 * Combine scores with configurable weights and source boost
 */
function combineScoresWeighted(
  chunks: ChunkDoc[],
  vectorScores: Map<string, number>,
  keywordScores: Map<string, number>,
  recencyScores: Map<string, number>,
  sources: Map<string, Set<'vector' | 'lexical' | 'recency'>>,
  hasVectorSearch: boolean
): ScoredChunk[] {
  // Use configurable weights
  const vectorWeight = hasVectorSearch ? SCORE_WEIGHT_VECTOR : 0;
  const keywordWeight = hasVectorSearch ? SCORE_WEIGHT_LEXICAL : 0.75;
  const recencyWeight = hasVectorSearch ? SCORE_WEIGHT_RECENCY : 0.25;

  return chunks.map(chunk => {
    const vectorScore = vectorScores.get(chunk.chunkId) || 0;
    const keywordScore = keywordScores.get(chunk.chunkId) || 0;
    const recencyScore = recencyScores.get(chunk.chunkId) || 0;
    const positionBonus = getPositionBonus(chunk.position);

    // Boost chunks found by multiple retrieval stages
    const chunkSources = sources.get(chunk.chunkId) || new Set();
    const multiSourceBoost = chunkSources.size > 1 ? 0.1 * (chunkSources.size - 1) : 0;

    // Combine weighted scores
    const combinedScore =
      vectorWeight * vectorScore +
      keywordWeight * keywordScore +
      recencyWeight * recencyScore +
      positionBonus +
      multiSourceBoost;

    const createdAt = chunk.createdAt instanceof Timestamp
      ? chunk.createdAt.toDate()
      : new Date();

    return {
      chunkId: chunk.chunkId,
      noteId: chunk.noteId,
      tenantId: chunk.tenantId,
      text: chunk.text,
      position: chunk.position,
      createdAt,
      score: combinedScore,
      vectorScore,
      keywordScore,
      recencyScore,
    };
  });
}

