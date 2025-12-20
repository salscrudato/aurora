/**
 * AuroraNotes API - Response Confidence Calibration
 *
 * Implements calibrated confidence scores based on:
 * - Citation density (how well-cited is the response)
 * - Source relevance (how relevant are the cited sources)
 * - Answer coherence (structural and logical consistency)
 * - Claim support (how well claims are supported)
 *
 * Provides an overall confidence score that reflects
 * how trustworthy the response is.
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

/**
 * Confidence score breakdown
 */
export interface ConfidenceBreakdown {
  citationDensity: number;      // 0-1: ratio of cited sentences
  sourceRelevance: number;      // 0-1: average relevance of cited sources
  answerCoherence: number;      // 0-1: structural consistency
  claimSupport: number;         // 0-1: how well claims are supported
  overallConfidence: number;    // 0-1: weighted combination
  confidenceLevel: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
  calibrationFactors: string[]; // Factors affecting confidence
}

/**
 * Weights for confidence components
 */
const WEIGHTS = {
  citationDensity: 0.25,
  sourceRelevance: 0.30,
  answerCoherence: 0.20,
  claimSupport: 0.25,
};

/**
 * Thresholds for confidence levels
 */
const THRESHOLDS = {
  veryHigh: 0.85,
  high: 0.70,
  medium: 0.50,
  low: 0.30,
};

/**
 * Calculate citation density score
 * Measures what proportion of sentences have citations
 */
function calculateCitationDensity(answer: string): {
  score: number;
  citedSentences: number;
  totalSentences: number;
} {
  const sentences = answer.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  const citedSentences = sentences.filter(s => /\[N\d+\]/.test(s)).length;

  if (sentences.length === 0) {
    return { score: 0, citedSentences: 0, totalSentences: 0 };
  }

  // Optimal density is around 60-80% (not every sentence needs citation)
  const rawDensity = citedSentences / sentences.length;

  // Score peaks at 70% density, penalize both under and over-citation
  let score: number;
  if (rawDensity <= 0.7) {
    score = rawDensity / 0.7; // Linear increase to 70%
  } else {
    // Slight penalty for over-citation (can indicate padding)
    score = 1 - (rawDensity - 0.7) * 0.5;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    citedSentences,
    totalSentences: sentences.length,
  };
}

/**
 * Calculate source relevance score
 * Based on the retrieval scores of cited sources
 */
function calculateSourceRelevance(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[]
): {
  score: number;
  averageScore: number;
  citedCount: number;
} {
  // Find which citations are actually used in the answer
  const usedCids = new Set<string>();
  const citationMatches = answer.matchAll(/\[N(\d+)\]/g);
  for (const match of citationMatches) {
    usedCids.add(`N${match[1]}`);
  }

  if (usedCids.size === 0) {
    return { score: 0, averageScore: 0, citedCount: 0 };
  }

  // Get scores for used citations
  const citationMap = new Map(citations.map(c => [c.cid, c]));
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  let totalScore = 0;
  let count = 0;

  for (const cid of usedCids) {
    const citation = citationMap.get(cid);
    if (citation) {
      const chunk = chunkMap.get(citation.chunkId);
      if (chunk) {
        totalScore += chunk.score;
        count++;
      }
    }
  }

  const averageScore = count > 0 ? totalScore / count : 0;

  // Normalize score (assuming scores are typically 0.5-1.0 range)
  const normalizedScore = Math.min(1, (averageScore - 0.3) / 0.7);

  return {
    score: Math.max(0, normalizedScore),
    averageScore,
    citedCount: count,
  };
}

/**
 * Calculate answer coherence score
 * Measures structural and logical consistency
 */
function calculateAnswerCoherence(answer: string, intent: QueryIntent): {
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 1.0;

  // Check for abrupt endings
  if (!answer.trim().match(/[.!?]$/)) {
    issues.push('Answer ends abruptly');
    score -= 0.15;
  }

  // Check for orphaned citations
  if (/^\s*\[N\d+\]\s*$/m.test(answer)) {
    issues.push('Contains orphaned citations');
    score -= 0.2;
  }

  // Check for citation clusters
  if (/(\[N\d+\]\s*){4,}/.test(answer)) {
    issues.push('Citations are clustered');
    score -= 0.1;
  }

  // Check for very short answers (might be incomplete)
  if (answer.length < 50) {
    issues.push('Answer is very short');
    score -= 0.2;
  }

  // Intent-specific coherence checks
  if ((intent === 'list' || intent === 'action_item') && !/[-*•]\s|^\s*\d+[.)]\s/m.test(answer)) {
    issues.push('List answer lacks list formatting');
    score -= 0.1;
  }

  return {
    score: Math.max(0, score),
    issues,
  };
}

/**
 * Calculate claim support score
 * Estimates how well claims are supported by their citations
 */
function calculateClaimSupport(
  answer: string,
  citations: Citation[]
): {
  score: number;
  unsupportedClaims: number;
} {
  // Split into sentences and check citation coverage
  const sentences = answer.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 20);

  // Identify factual sentences (contain specific claims)
  const factualPatterns = [
    /\b\d+(?:\.\d+)?%?\b/,           // Numbers
    /\b(is|are|was|were|has|have)\b/, // Assertions
    /\b(always|never|must|should)\b/, // Strong claims
    /\b(because|therefore|thus)\b/,   // Causal claims
  ];

  let factualSentences = 0;
  let citedFactualSentences = 0;

  for (const sentence of sentences) {
    const isFactual = factualPatterns.some(p => p.test(sentence));
    if (isFactual) {
      factualSentences++;
      if (/\[N\d+\]/.test(sentence)) {
        citedFactualSentences++;
      }
    }
  }

  if (factualSentences === 0) {
    return { score: 1.0, unsupportedClaims: 0 };
  }

  const supportRate = citedFactualSentences / factualSentences;
  const unsupportedClaims = factualSentences - citedFactualSentences;

  return {
    score: supportRate,
    unsupportedClaims,
  };
}

/**
 * Determine confidence level from score
 */
function getConfidenceLevel(score: number): ConfidenceBreakdown['confidenceLevel'] {
  if (score >= THRESHOLDS.veryHigh) return 'very_high';
  if (score >= THRESHOLDS.high) return 'high';
  if (score >= THRESHOLDS.medium) return 'medium';
  if (score >= THRESHOLDS.low) return 'low';
  return 'very_low';
}

/**
 * Calculate calibrated confidence score for a response
 */
export function calculateResponseConfidence(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[],
  intent: QueryIntent
): ConfidenceBreakdown {
  const calibrationFactors: string[] = [];

  // Calculate component scores
  const densityResult = calculateCitationDensity(answer);
  const relevanceResult = calculateSourceRelevance(answer, citations, chunks);
  const coherenceResult = calculateAnswerCoherence(answer, intent);
  const supportResult = calculateClaimSupport(answer, citations);

  // Collect calibration factors
  if (densityResult.citedSentences === 0) {
    calibrationFactors.push('No citations found');
  } else if (densityResult.score < 0.5) {
    calibrationFactors.push('Low citation density');
  }

  if (relevanceResult.averageScore < 0.5) {
    calibrationFactors.push('Low source relevance');
  }

  if (coherenceResult.issues.length > 0) {
    calibrationFactors.push(...coherenceResult.issues);
  }

  if (supportResult.unsupportedClaims > 0) {
    calibrationFactors.push(`${supportResult.unsupportedClaims} unsupported claims`);
  }

  // Calculate weighted overall score
  const overallConfidence =
    WEIGHTS.citationDensity * densityResult.score +
    WEIGHTS.sourceRelevance * relevanceResult.score +
    WEIGHTS.answerCoherence * coherenceResult.score +
    WEIGHTS.claimSupport * supportResult.score;

  const confidenceLevel = getConfidenceLevel(overallConfidence);

  // Log if confidence is low
  if (overallConfidence < THRESHOLDS.medium) {
    logWarn('Low response confidence', {
      overallConfidence,
      calibrationFactors,
      citationDensity: densityResult.score,
      sourceRelevance: relevanceResult.score,
    });
  }

  return {
    citationDensity: Math.round(densityResult.score * 1000) / 1000,
    sourceRelevance: Math.round(relevanceResult.score * 1000) / 1000,
    answerCoherence: Math.round(coherenceResult.score * 1000) / 1000,
    claimSupport: Math.round(supportResult.score * 1000) / 1000,
    overallConfidence: Math.round(overallConfidence * 1000) / 1000,
    confidenceLevel,
    calibrationFactors,
  };
}

/**
 * Get confidence summary for API response
 */
export function getConfidenceSummary(breakdown: ConfidenceBreakdown): {
  score: number;
  level: string;
  isReliable: boolean;
  warnings: string[];
} {
  return {
    score: breakdown.overallConfidence,
    level: breakdown.confidenceLevel,
    isReliable: breakdown.overallConfidence >= THRESHOLDS.medium,
    warnings: breakdown.calibrationFactors,
  };
}

/**
 * Get confidence configuration for observability
 */
export function getConfidenceConfig() {
  return {
    weights: { ...WEIGHTS },
    thresholds: { ...THRESHOLDS },
  };
}

