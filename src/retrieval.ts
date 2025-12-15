/**
 * AuroraNotes API - Retrieval Module
 *
 * Implements hybrid retrieval with vector similarity, BM25-like keyword matching, and recency.
 * Includes score normalization, diversity scoring, position bonuses, and quality thresholds.
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
} from "./config";
import { ChunkDoc, ScoredChunk, RetrievalOptions, QueryAnalysis } from "./types";
import { generateQueryEmbedding, isEmbeddingsAvailable } from "./embeddings";
import { cosineSimilarity, logInfo, logError } from "./utils";
import { analyzeQuery } from "./query";
import { llmRerank, isLLMRerankerAvailable } from "./reranker";

// Quality thresholds (tuned for better precision)
const MIN_VECTOR_SCORE = 0.25;     // Minimum cosine similarity to consider
const MIN_COMBINED_SCORE = 0.10;   // Minimum combined score for final results
const DIVERSITY_PENALTY = 0.12;    // Penalty for chunks from same note

// BM25 parameters
const BM25_K1 = 1.5;  // Term frequency saturation parameter
const BM25_B = 0.75;  // Document length normalization

// Position bonus for chunks earlier in a note (more likely to be introduction/summary)
const POSITION_BONUS_MAX = 0.08;

// Re-export analyzeQuery for backward compatibility
export { analyzeQuery } from "./query";

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
 * Score chunks based on keyword overlap with BM25-like weighting
 * BM25 provides better relevance ranking than simple TF-IDF
 */
function scoreByKeywords(
  chunks: ChunkDoc[],
  keywords: string[]
): Map<string, number> {
  const scores = new Map<string, number>();

  if (keywords.length === 0) return scores;

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

    for (const keyword of keywords) {
      // Count term frequency
      const matches = chunkLower.match(new RegExp(escapeRegex(keyword), 'g')) || [];
      const tf = matches.length;

      if (tf > 0) {
        // BM25 IDF calculation: log((N - df + 0.5) / (df + 0.5) + 1)
        const df = docFreq.get(keyword) || 1;
        const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);

        // BM25 term frequency saturation with length normalization
        const tfNormalized = (tf * (BM25_K1 + 1)) /
          (tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength)));

        weightedScore += idf * tfNormalized;

        // Bonus for exact phrase matches at beginning of chunk
        if (chunkLower.startsWith(keyword) || chunkLower.indexOf(keyword) < 50) {
          weightedScore += idf * 0.3; // Position boost for early matches
        }
      }
    }

    scores.set(chunk.chunkId, weightedScore / keywords.length);
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
 * Combine scores with dynamic weights based on available signals
 * Includes position bonus for chunks at the start of notes
 */
function combineScores(
  chunks: ChunkDoc[],
  vectorScores: Map<string, number>,
  keywordScores: Map<string, number>,
  recencyScores: Map<string, number>,
  hasVectorSearch: boolean
): ScoredChunk[] {
  // Dynamic weights based on available signals
  let vectorWeight: number;
  let keywordWeight: number;
  let recencyWeight: number;

  if (hasVectorSearch && vectorScores.size > 0) {
    // Full hybrid mode - balanced weights
    vectorWeight = 0.50;  // Semantic understanding
    keywordWeight = 0.35; // Keyword matching (BM25)
    recencyWeight = 0.15; // Freshness
  } else {
    // Keyword-only fallback
    vectorWeight = 0;
    keywordWeight = 0.70;
    recencyWeight = 0.30;
  }

  return chunks.map(chunk => {
    const vectorScore = vectorScores.get(chunk.chunkId) || 0;
    const keywordScore = keywordScores.get(chunk.chunkId) || 0;
    const recencyScore = recencyScores.get(chunk.chunkId) || 0;
    const positionBonus = getPositionBonus(chunk.position);

    // Combine weighted scores plus position bonus
    const combinedScore =
      vectorWeight * vectorScore +
      keywordWeight * keywordScore +
      recencyWeight * recencyScore +
      positionBonus;

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

/**
 * Apply diversity reranking to avoid too many chunks from the same note
 */
function applyDiversityReranking(chunks: ScoredChunk[], maxPerNote: number = 3): ScoredChunk[] {
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
 * Main retrieval function with enhanced scoring and diversity
 */
export async function retrieveRelevantChunks(
  query: string,
  options: RetrievalOptions
): Promise<{ chunks: ScoredChunk[]; strategy: string; candidateCount: number }> {
  const startTime = Date.now();

  // Analyze query with enhanced understanding
  const analysis = analyzeQuery(query);
  const maxAgeDays = options.maxAgeDays ?? analysis.timeHint?.days ?? RETRIEVAL_DEFAULT_DAYS;
  // Use boost terms if available for better keyword matching
  const keywords = options.keywords ?? analysis.boostTerms ?? analysis.keywords;

  // Fetch candidates (fetch more for better ranking after diversity reranking)
  const candidateLimit = Math.max(options.topK * 4, 150);
  const candidates = await fetchCandidates(options.tenantId, maxAgeDays, candidateLimit);

  if (candidates.length === 0) {
    return { chunks: [], strategy: 'no_candidates', candidateCount: 0 };
  }

  let strategy = 'keyword_recency';
  let vectorScores = new Map<string, number>();
  let hasVectorSearch = false;

  // Generate query embedding for vector search if enabled and available
  const useVector = VECTOR_SEARCH_ENABLED &&
    isEmbeddingsAvailable() &&
    candidates.some(c => c.embedding);

  if (useVector) {
    try {
      const queryEmbedding = await generateQueryEmbedding(query);
      vectorScores = scoreByVector(candidates, queryEmbedding);
      hasVectorSearch = vectorScores.size > 0;
      if (hasVectorSearch) {
        strategy = 'hybrid';
      }
    } catch (err) {
      logError('Query embedding failed, falling back to keyword', err);
    }
  }

  // Score by keywords and recency
  const keywordScores = scoreByKeywords(candidates, keywords);
  const recencyScores = scoreByRecency(candidates, maxAgeDays);

  // Combine scores with dynamic weights
  let scored = combineScores(candidates, vectorScores, keywordScores, recencyScores, hasVectorSearch);

  // Filter out very low quality results
  scored = scored.filter(chunk => chunk.score >= MIN_COMBINED_SCORE);

  // Sort by combined score
  scored.sort((a, b) => b.score - a.score);

  // Take top K before diversity reranking
  scored = scored.slice(0, options.topK);

  // Apply diversity reranking
  if (RERANKING_ENABLED && scored.length > 1) {
    scored = applyDiversityReranking(scored, 3);
    strategy += '_diverse';
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
    strategy += '_reranked';
  }

  // Limit total context size
  let totalChars = 0;
  const limitedChunks: ScoredChunk[] = [];

  for (const chunk of scored) {
    if (totalChars + chunk.text.length > RETRIEVAL_MAX_CONTEXT_CHARS) break;
    limitedChunks.push(chunk);
    totalChars += chunk.text.length;
  }

  const elapsedMs = Date.now() - startTime;
  logInfo('Retrieval complete', {
    query: query.slice(0, 50),
    intent: analysis.intent,
    candidateCount: candidates.length,
    filteredCount: scored.length,
    resultCount: limitedChunks.length,
    strategy,
    hasVectorSearch,
    elapsedMs,
  });

  return {
    chunks: limitedChunks,
    strategy,
    candidateCount: candidates.length,
  };
}

