/**
 * AuroraNotes API - Retrieval and Citation Logger
 *
 * Provides structured observability for the retrieval pipeline:
 * - Request/response tracing with latency breakdown
 * - Multi-stage candidate counts (vector, lexical, recency)
 * - Per-citation metadata (score, noteId, chunkId)
 * - Quality flags (citation coverage, validation results)
 * - Score distribution summaries for debugging
 * - BigQuery-compatible structured logging
 */

import { v4 as uuid } from 'uuid';
import { logInfo, logWarn } from './utils';
import { CandidateCounts, RetrievalTimingsStage, ScoredChunk } from './types';

export interface RetrievalTimings {
  queryParseMs?: number;
  embeddingMs?: number;
  vectorSearchMs?: number;
  lexicalSearchMs?: number;  // Renamed from keywordSearchMs
  firestoreFetchMs?: number; // Fallback fetch time
  rerankMs?: number;
  contextAssemblyMs?: number;
  generationMs?: number;
  validationMs?: number;
  repairMs?: number;      // Time spent on citation repair
  retrievalMs?: number;   // Total retrieval time
  totalMs: number;
}

export interface CitationLogEntry {
  cid: string;
  noteId: string;
  chunkId: string;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  recencyScore?: number;
  overlapScore?: number;  // Citation verification overlap score
  snippetLength: number;
}

export interface QualityFlags {
  citationCoveragePct: number;
  invalidCitationsRemoved: number;
  fallbackUsed: boolean;
  insufficientEvidence: boolean;
  regenerationAttempted: boolean;
  diversityScore?: number;
  queryExpanded?: boolean;  // Whether query expansion was used
  mmrApplied?: boolean;     // Whether MMR reranking was applied
}

/**
 * Score distribution summary for debugging retrieval quality
 */
export interface ScoreDistribution {
  topScore: number;
  medianScore: number;
  minScore: number;
  scoreGap: number;        // Gap between top and second score
  uniqueNoteCount: number;
  scoreStdDev: number;
}

export interface RetrievalLogEntry {
  requestId: string;
  traceId: string;
  tenantId: string;
  query: string;
  queryLength: number;
  intent: string;
  retrievalMode: 'vector' | 'hybrid' | 'keyword_only' | 'fallback';
  candidateCounts: {
    vectorK: number;
    keywordK: number;  // Kept for backward compatibility (maps to lexicalK)
    mergedK: number;
    afterRerank: number;
    finalChunks: number;
  };
  stageDetails?: {
    vectorK: number;
    lexicalK: number;
    recencyK: number;
    mergedK: number;
    rerankedK: number;
    finalK: number;
  };
  scoreDistribution?: ScoreDistribution;
  rerankMethod: string;
  citations: CitationLogEntry[];
  timings: RetrievalTimings;
  quality: QualityFlags;
  answerLength: number;
  timestamp: string;
}

/**
 * Creates a new retrieval log entry with a fresh request ID
 */
export function createRetrievalLog(
  tenantId: string,
  query: string,
  requestId?: string
): Partial<RetrievalLogEntry> {
  return {
    requestId: requestId || `req_${uuid().slice(0, 8)}`,
    traceId: uuid(),
    tenantId,
    query: query.slice(0, 500), // Truncate for logging
    queryLength: query.length,
    timestamp: new Date().toISOString(),
    candidateCounts: {
      vectorK: 0,
      keywordK: 0,
      mergedK: 0,
      afterRerank: 0,
      finalChunks: 0,
    },
    citations: [],
    quality: {
      citationCoveragePct: 0,
      invalidCitationsRemoved: 0,
      fallbackUsed: false,
      insufficientEvidence: false,
      regenerationAttempted: false,
    },
    timings: {
      totalMs: 0,
    },
  };
}

/**
 * Logs a complete retrieval/citation entry
 */
export function logRetrieval(entry: RetrievalLogEntry): void {
  // Structured log for Cloud Logging / BigQuery export
  logInfo('Retrieval/citation trace', {
    requestId: entry.requestId,
    traceId: entry.traceId,
    tenantId: entry.tenantId,
    queryLength: entry.queryLength,
    intent: entry.intent,
    retrievalMode: entry.retrievalMode,
    candidateCounts: entry.candidateCounts,
    stageDetails: entry.stageDetails,
    scoreDistribution: entry.scoreDistribution,
    rerankMethod: entry.rerankMethod,
    citationCount: entry.citations.length,
    // Per-citation summary (not full snippets)
    citationSummary: entry.citations.map(c => ({
      cid: c.cid,
      noteId: c.noteId.slice(0, 8),
      score: Math.round(c.score * 1000) / 1000,
      vectorScore: c.vectorScore ? Math.round(c.vectorScore * 1000) / 1000 : undefined,
    })),
    timings: entry.timings,
    quality: entry.quality,
    answerLength: entry.answerLength,
  });

  // Warn on potential quality issues
  if (entry.quality.citationCoveragePct < 50 && entry.citations.length > 0) {
    logWarn('Low citation coverage in response', {
      requestId: entry.requestId,
      coverage: entry.quality.citationCoveragePct,
      citationCount: entry.citations.length,
    });
  }

  if (entry.scoreDistribution && entry.scoreDistribution.scoreGap > 0.3) {
    logWarn('Large score gap detected (potential single-source dominance)', {
      requestId: entry.requestId,
      topScore: entry.scoreDistribution.topScore,
      scoreGap: entry.scoreDistribution.scoreGap,
    });
  }
}

/**
 * Calculate citation coverage percentage
 * Counts sentences with at least one citation vs total sentences
 */
export function calculateCitationCoverage(answer: string): number {
  const sentences = answer
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // Only count substantial sentences

  if (sentences.length === 0) return 100;

  const citedSentences = sentences.filter(s => /\[N\d+\]/.test(s));
  return Math.round((citedSentences.length / sentences.length) * 100);
}

/**
 * Parse citation IDs from answer text
 */
export function parseCitationIds(answer: string): string[] {
  const matches = answer.match(/\[N\d+\]/g) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))]; // Remove brackets, dedupe
}

/**
 * Compute score distribution summary from scored chunks
 */
export function computeScoreDistribution(chunks: ScoredChunk[]): ScoreDistribution | undefined {
  if (chunks.length === 0) return undefined;

  const scores = chunks.map(c => c.score).sort((a, b) => b - a);
  const topScore = scores[0];
  const minScore = scores[scores.length - 1];
  const medianScore = scores[Math.floor(scores.length / 2)];
  const scoreGap = scores.length > 1 ? scores[0] - scores[1] : 0;
  const uniqueNoteCount = new Set(chunks.map(c => c.noteId)).size;

  // Calculate standard deviation
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const scoreStdDev = Math.sqrt(variance);

  return {
    topScore: Math.round(topScore * 1000) / 1000,
    medianScore: Math.round(medianScore * 1000) / 1000,
    minScore: Math.round(minScore * 1000) / 1000,
    scoreGap: Math.round(scoreGap * 1000) / 1000,
    uniqueNoteCount,
    scoreStdDev: Math.round(scoreStdDev * 1000) / 1000,
  };
}

/**
 * Convert CandidateCounts to stage details for logging
 */
export function candidateCountsToStageDetails(counts: CandidateCounts): RetrievalLogEntry['stageDetails'] {
  return {
    vectorK: counts.vectorK,
    lexicalK: counts.lexicalK,
    recencyK: counts.recencyK,
    mergedK: counts.mergedK,
    rerankedK: counts.rerankedK,
    finalK: counts.finalK,
  };
}

