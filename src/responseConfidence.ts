/**
 * Response Confidence Calibration - Calculates trustworthiness scores for responses
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logWarn } from './utils';

export interface ConfidenceBreakdown {
  citationDensity: number;
  sourceRelevance: number;
  answerCoherence: number;
  claimSupport: number;
  overallConfidence: number;
  confidenceLevel: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
  calibrationFactors: string[];
}

const WEIGHTS = { citationDensity: 0.25, sourceRelevance: 0.30, answerCoherence: 0.20, claimSupport: 0.25 };
const THRESHOLDS = { veryHigh: 0.85, high: 0.70, medium: 0.50, low: 0.30 };

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const splitSentences = (text: string, minLen = 10) => text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > minLen);

function calcCitationDensity(answer: string) {
  const sentences = splitSentences(answer);
  const cited = sentences.filter(s => /\[N\d+\]/.test(s)).length;
  if (!sentences.length) return { score: 0, cited: 0, total: 0 };

  const density = cited / sentences.length;
  // Score peaks at 70% density, slight penalty for over-citation
  const score = density <= 0.7 ? density / 0.7 : 1 - (density - 0.7) * 0.5;
  return { score: clamp(score), cited, total: sentences.length };
}

function calcSourceRelevance(answer: string, citations: Citation[], chunks: ScoredChunk[]) {
  const usedCids = new Set([...answer.matchAll(/\[N(\d+)\]/g)].map(m => `N${m[1]}`));
  if (!usedCids.size) return { score: 0, avg: 0, count: 0 };

  const citationMap = new Map(citations.map(c => [c.cid, c]));
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  let total = 0, count = 0;
  for (const cid of usedCids) {
    const chunk = chunkMap.get(citationMap.get(cid)?.chunkId || '');
    if (chunk) { total += chunk.score; count++; }
  }

  const avg = count ? total / count : 0;
  return { score: clamp((avg - 0.3) / 0.7), avg, count };
}

const COHERENCE_CHECKS: [RegExp | ((a: string, i: QueryIntent) => boolean), string, number][] = [
  [a => !a.trim().match(/[.!?]$/), 'Answer ends abruptly', 0.15],
  [/^\s*\[N\d+\]\s*$/m, 'Orphaned citations', 0.2],
  [/(\[N\d+\]\s*){4,}/, 'Clustered citations', 0.1],
  [a => a.length < 50, 'Very short answer', 0.2],
  [(a, i) => (i === 'list' || i === 'action_item') && !/[-*•]\s|^\s*\d+[.)]\s/m.test(a), 'Missing list format', 0.1],
];

function calcCoherence(answer: string, intent: QueryIntent) {
  const issues: string[] = [];
  let score = 1.0;
  for (const [check, msg, penalty] of COHERENCE_CHECKS) {
    const fail = typeof check === 'function' ? check(answer, intent) : check.test(answer);
    if (fail) { issues.push(msg); score -= penalty; }
  }
  return { score: Math.max(0, score), issues };
}

const FACTUAL_PATTERNS = [/\b\d+(?:\.\d+)?%?\b/, /\b(is|are|was|were|has|have)\b/, /\b(always|never|must|should)\b/, /\b(because|therefore|thus)\b/];

function calcClaimSupport(answer: string) {
  const sentences = splitSentences(answer, 20);
  let factual = 0, cited = 0;
  for (const s of sentences) {
    if (FACTUAL_PATTERNS.some(p => p.test(s))) {
      factual++;
      if (/\[N\d+\]/.test(s)) cited++;
    }
  }
  return factual ? { score: cited / factual, unsupported: factual - cited } : { score: 1, unsupported: 0 };
}

const getLevel = (s: number): ConfidenceBreakdown['confidenceLevel'] =>
  s >= THRESHOLDS.veryHigh ? 'very_high' : s >= THRESHOLDS.high ? 'high' : s >= THRESHOLDS.medium ? 'medium' : s >= THRESHOLDS.low ? 'low' : 'very_low';

export function calculateResponseConfidence(answer: string, citations: Citation[], chunks: ScoredChunk[], intent: QueryIntent): ConfidenceBreakdown {
  const density = calcCitationDensity(answer);
  const relevance = calcSourceRelevance(answer, citations, chunks);
  const coherence = calcCoherence(answer, intent);
  const support = calcClaimSupport(answer);

  const factors: string[] = [];
  if (!density.cited) factors.push('No citations');
  else if (density.score < 0.5) factors.push('Low citation density');
  if (relevance.avg < 0.5) factors.push('Low source relevance');
  factors.push(...coherence.issues);
  if (support.unsupported) factors.push(`${support.unsupported} unsupported claims`);

  const overall = WEIGHTS.citationDensity * density.score + WEIGHTS.sourceRelevance * relevance.score +
                  WEIGHTS.answerCoherence * coherence.score + WEIGHTS.claimSupport * support.score;

  if (overall < THRESHOLDS.medium) {
    logWarn('Low confidence', { overall: round3(overall), factors });
  }

  return {
    citationDensity: round3(density.score),
    sourceRelevance: round3(relevance.score),
    answerCoherence: round3(coherence.score),
    claimSupport: round3(support.score),
    overallConfidence: round3(overall),
    confidenceLevel: getLevel(overall),
    calibrationFactors: factors,
  };
}

export const getConfidenceSummary = (b: ConfidenceBreakdown) => ({
  score: b.overallConfidence,
  level: b.confidenceLevel,
  isReliable: b.overallConfidence >= THRESHOLDS.medium,
  warnings: b.calibrationFactors,
});

export const getConfidenceConfig = () => ({ weights: { ...WEIGHTS }, thresholds: { ...THRESHOLDS } });
