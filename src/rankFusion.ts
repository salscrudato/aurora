/**
 * AuroraNotes API - Rank Fusion Module
 *
 * Implements Reciprocal Rank Fusion (RRF) and other fusion strategies
 * for combining multiple retrieval signals (vector, lexical, recency).
 *
 * RRF is parameter-free and robust to different score distributions,
 * making it ideal for hybrid retrieval without careful weight tuning.
 *
 * Reference: Cormack et al., "Reciprocal Rank Fusion outperforms Condorcet
 * and individual Rank Learning Methods" (2009)
 */

import { ChunkDoc, ScoredChunk } from "./types";
import { Timestamp } from "firebase-admin/firestore";
import { logInfo } from "./utils";

// RRF constant (k=60 is standard, lower values give more weight to top ranks)
const RRF_K = 60;

// Source weights for weighted RRF (optional enhancement)
const SOURCE_WEIGHTS = {
  vector: 1.0,
  lexical: 0.8,
  recency: 0.3,
};

/**
 * Ranking from a single retrieval source
 */
export interface SourceRanking {
  source: 'vector' | 'lexical' | 'recency';
  rankings: Map<string, number>; // chunkId -> rank (1-indexed)
  scores?: Map<string, number>;  // Optional raw scores for debugging
}

/**
 * RRF result with detailed scoring breakdown
 */
export interface RRFResult {
  chunkId: string;
  rrfScore: number;
  contributingSources: ('vector' | 'lexical' | 'recency')[];
  sourceRanks: Map<string, number>;
}

/**
 * Standard Reciprocal Rank Fusion
 *
 * Combines multiple rankings into a single ranking using:
 * RRF_score(d) = Σ 1/(k + rank_i(d))
 *
 * where k is a constant (typically 60) and rank_i(d) is the rank of
 * document d in the i-th ranking (1-indexed, missing = infinity).
 *
 * @param rankings - Array of rankings from different sources
 * @param k - RRF constant (default 60)
 * @returns Map of chunkId -> RRF score
 */
export function reciprocalRankFusion(
  rankings: SourceRanking[],
  k: number = RRF_K
): Map<string, RRFResult> {
  const results = new Map<string, RRFResult>();

  for (const { source, rankings: sourceRanks } of rankings) {
    for (const [chunkId, rank] of sourceRanks) {
      const existing = results.get(chunkId);

      if (existing) {
        existing.rrfScore += 1 / (k + rank);
        existing.contributingSources.push(source);
        existing.sourceRanks.set(source, rank);
      } else {
        results.set(chunkId, {
          chunkId,
          rrfScore: 1 / (k + rank),
          contributingSources: [source],
          sourceRanks: new Map([[source, rank]]),
        });
      }
    }
  }

  return results;
}

/**
 * Weighted Reciprocal Rank Fusion
 *
 * Like standard RRF but applies source-specific weights:
 * WRRF_score(d) = Σ w_i / (k + rank_i(d))
 *
 * This allows prioritizing certain retrieval sources.
 */
export function weightedRRF(
  rankings: SourceRanking[],
  weights: typeof SOURCE_WEIGHTS = SOURCE_WEIGHTS,
  k: number = RRF_K
): Map<string, RRFResult> {
  const results = new Map<string, RRFResult>();

  for (const { source, rankings: sourceRanks } of rankings) {
    const weight = weights[source] || 1.0;

    for (const [chunkId, rank] of sourceRanks) {
      const existing = results.get(chunkId);
      const contribution = weight / (k + rank);

      if (existing) {
        existing.rrfScore += contribution;
        existing.contributingSources.push(source);
        existing.sourceRanks.set(source, rank);
      } else {
        results.set(chunkId, {
          chunkId,
          rrfScore: contribution,
          contributingSources: [source],
          sourceRanks: new Map([[source, rank]]),
        });
      }
    }
  }

  return results;
}

/**
 * Convert scored chunks to a ranking (ordered by score desc)
 */
export function scoresToRanking(
  chunkScores: Map<string, number>,
  source: 'vector' | 'lexical' | 'recency'
): SourceRanking {
  // Sort by score descending
  const sorted = Array.from(chunkScores.entries())
    .sort((a, b) => b[1] - a[1]);

  // Convert to 1-indexed ranks
  const rankings = new Map<string, number>();
  sorted.forEach(([chunkId], index) => {
    rankings.set(chunkId, index + 1);
  });

  return { source, rankings, scores: chunkScores };
}

/**
 * Apply RRF to combine vector, lexical, and recency signals
 *
 * This is the main entry point for hybrid retrieval fusion.
 */
export function applyRRFScoring(
  chunks: ChunkDoc[],
  vectorScores: Map<string, number>,
  keywordScores: Map<string, number>,
  recencyScores: Map<string, number>,
  sources: Map<string, Set<'vector' | 'lexical' | 'recency'>>,
  useWeighted: boolean = true
): ScoredChunk[] {
  // Convert scores to rankings
  const rankings: SourceRanking[] = [];

  if (vectorScores.size > 0) {
    rankings.push(scoresToRanking(vectorScores, 'vector'));
  }
  if (keywordScores.size > 0) {
    rankings.push(scoresToRanking(keywordScores, 'lexical'));
  }
  if (recencyScores.size > 0) {
    rankings.push(scoresToRanking(recencyScores, 'recency'));
  }

  // Apply RRF
  const rrfResults = useWeighted
    ? weightedRRF(rankings)
    : reciprocalRankFusion(rankings);

  // Convert to ScoredChunk array
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));
  const scoredChunks: ScoredChunk[] = [];

  for (const [chunkId, result] of rrfResults) {
    const chunk = chunkMap.get(chunkId);
    if (!chunk) continue;

    const createdAt = chunk.createdAt instanceof Timestamp
      ? chunk.createdAt.toDate()
      : new Date();

    const scoredChunk: ScoredChunk = {
      chunkId: chunk.chunkId,
      noteId: chunk.noteId,
      tenantId: chunk.tenantId,
      text: chunk.text,
      position: chunk.position,
      createdAt,
      score: result.rrfScore,
      vectorScore: vectorScores.get(chunkId) || 0,
      keywordScore: keywordScores.get(chunkId) || 0,
      recencyScore: recencyScores.get(chunkId) || 0,
      // Additional RRF metadata
      sourceCount: result.contributingSources.length,
    };
    // Include offset information for precise citation anchoring (if available)
    if (chunk.startOffset !== undefined) scoredChunk.startOffset = chunk.startOffset;
    if (chunk.endOffset !== undefined) scoredChunk.endOffset = chunk.endOffset;
    if (chunk.anchor) scoredChunk.anchor = chunk.anchor;
    scoredChunks.push(scoredChunk);
  }

  // Sort by RRF score descending
  scoredChunks.sort((a, b) => b.score - a.score);

  logInfo('RRF scoring applied', {
    inputChunks: chunks.length,
    outputChunks: scoredChunks.length,
    rankingSources: rankings.length,
    useWeighted,
  });

  return scoredChunks;
}

/**
 * Multi-source boost: chunks found by multiple sources get a bonus
 *
 * This is applied on top of RRF when we want to further prioritize
 * chunks that appear in multiple retrieval paths.
 */
export function applyMultiSourceBoost(
  chunks: ScoredChunk[],
  boostFactor: number = 0.15
): ScoredChunk[] {
  return chunks.map(chunk => {
    const sourceCount = chunk.sourceCount || 1;
    if (sourceCount > 1) {
      return {
        ...chunk,
        score: chunk.score * (1 + boostFactor * (sourceCount - 1)),
      };
    }
    return chunk;
  }).sort((a, b) => b.score - a.score);
}

