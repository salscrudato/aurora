/** Retrieval and Citation Logger - Structured observability for retrieval pipeline */

import { v4 as uuid } from 'uuid';
import { logInfo, logWarn } from './utils';
import { CandidateCounts, ScoredChunk } from './types';

export interface RetrievalTimings {
  queryParseMs?: number; embeddingMs?: number; vectorSearchMs?: number; lexicalSearchMs?: number;
  firestoreFetchMs?: number; rerankMs?: number; contextAssemblyMs?: number; generationMs?: number;
  validationMs?: number; repairMs?: number; retrievalMs?: number; postProcessMs?: number; totalMs: number;
}

export interface CitationLogEntry {
  cid: string; noteId: string; chunkId: string; score: number;
  vectorScore?: number; keywordScore?: number; recencyScore?: number; overlapScore?: number; snippetLength: number;
}

export interface QualityFlags {
  citationCoveragePct: number; invalidCitationsRemoved: number; fallbackUsed: boolean;
  insufficientEvidence: boolean; regenerationAttempted: boolean; diversityScore?: number;
  queryExpanded?: boolean; mmrApplied?: boolean; danglingRefsRemoved?: number;
  potentialHallucinations?: boolean; contradictionsDetected?: boolean;
}

export interface ScoreDistribution {
  topScore: number; medianScore: number; minScore: number; scoreGap: number; uniqueNoteCount: number; scoreStdDev: number;
}

export interface CitationValidationStats {
  totalCitationsInAnswer: number; validCitations: number; invalidCitationsRemoved: number;
  weakCitations: number; contractCompliant: boolean; overallConfidence: number; citationAccuracy: number;
}

export interface RetrievalLogEntry {
  requestId: string; traceId: string; tenantId: string; query: string; queryLength: number;
  intent: string; retrievalMode: 'vector' | 'hybrid' | 'keyword_only' | 'fallback';
  candidateCounts: { vectorK: number; keywordK: number; mergedK: number; afterRerank: number; finalChunks: number };
  stageDetails?: { vectorK: number; lexicalK: number; recencyK: number; mergedK: number; rerankedK: number; finalK: number };
  scoreDistribution?: ScoreDistribution; rerankMethod: string; citations: CitationLogEntry[];
  timings: RetrievalTimings; quality: QualityFlags; answerLength: number; timestamp: string;
  totalSourcesReturned?: number; llmContextBudgetChars?: number;
  citationValidation?: CitationValidationStats; pipelineProcessingMs?: number;
}

/** Creates a new retrieval log entry */
export function createRetrievalLog(tenantId: string, query: string, requestId?: string): Partial<RetrievalLogEntry> {
  return {
    requestId: requestId || `req_${uuid().slice(0, 8)}`, traceId: uuid(), tenantId,
    query: query.slice(0, 500), queryLength: query.length, timestamp: new Date().toISOString(),
    candidateCounts: { vectorK: 0, keywordK: 0, mergedK: 0, afterRerank: 0, finalChunks: 0 },
    citations: [],
    quality: { citationCoveragePct: 0, invalidCitationsRemoved: 0, fallbackUsed: false, insufficientEvidence: false, regenerationAttempted: false },
    timings: { totalMs: 0 },
  };
}

/** Logs a complete retrieval/citation entry */
export function logRetrieval(entry: RetrievalLogEntry): void {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  logInfo('Retrieval trace', {
    requestId: entry.requestId, tenantId: entry.tenantId, queryLength: entry.queryLength,
    intent: entry.intent, retrievalMode: entry.retrievalMode, candidateCounts: entry.candidateCounts,
    citationCount: entry.citations.length,
    citationSummary: entry.citations.map(c => ({ cid: c.cid, noteId: c.noteId.slice(0, 8), score: r(c.score) })),
    timings: entry.timings, quality: entry.quality, answerLength: entry.answerLength,
  });
  if (entry.quality.citationCoveragePct < 50 && entry.citations.length > 0) {
    logWarn('Low citation coverage', { requestId: entry.requestId, coverage: entry.quality.citationCoveragePct });
  }
}

/** Calculate citation coverage percentage */
export function calculateCitationCoverage(answer: string): number {
  const sentences = answer.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  if (!sentences.length) return 100;
  return Math.round((sentences.filter(s => /\[N\d+\]/.test(s)).length / sentences.length) * 100);
}

/** Parse citation IDs from answer text */
export function parseCitationIds(answer: string): string[] {
  return [...new Set((answer.match(/\[N\d+\]/g) || []).map(m => m.slice(1, -1)))];
}

/** Compute score distribution summary */
export function computeScoreDistribution(chunks: ScoredChunk[]): ScoreDistribution | undefined {
  if (!chunks.length) return undefined;
  const scores = chunks.map(c => c.score).sort((a, b) => b - a);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    topScore: r(scores[0]), medianScore: r(scores[Math.floor(scores.length / 2)]),
    minScore: r(scores[scores.length - 1]), scoreGap: r(scores.length > 1 ? scores[0] - scores[1] : 0),
    uniqueNoteCount: new Set(chunks.map(c => c.noteId)).size,
    scoreStdDev: r(Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length)),
  };
}

/** Convert CandidateCounts to stage details */
export function candidateCountsToStageDetails(counts: CandidateCounts): RetrievalLogEntry['stageDetails'] {
  return { vectorK: counts.vectorK, lexicalK: counts.lexicalK, recencyK: counts.recencyK, mergedK: counts.mergedK, rerankedK: counts.rerankedK, finalK: counts.finalK };
}
