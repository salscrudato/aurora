/**
 * AuroraNotes API - Self-Consistency Verification
 *
 * Implements self-consistency sampling for more reliable responses:
 * 1. Generate multiple answer candidates with varied temperature
 * 2. Extract and align citations across candidates
 * 3. Score candidates based on citation consistency and quality
 * 4. Select or merge the most consistent response
 *
 * This significantly improves response reliability by detecting
 * and filtering out hallucinated or inconsistent citations.
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

// Configuration
const SELF_CONSISTENCY_CONFIG = {
  enabled: true,
  numSamples: 3,                    // Number of candidates to generate
  temperatureVariance: 0.15,        // Temperature variance across samples
  minConsensusThreshold: 0.6,       // Min fraction of samples agreeing on citation
  citationAlignmentWeight: 0.5,     // Weight for citation consistency
  answerSimilarityWeight: 0.3,      // Weight for answer text similarity
  sourceQualityWeight: 0.2,         // Weight for source quality scores
};

/**
 * Candidate response from LLM
 */
export interface ResponseCandidate {
  answer: string;
  citations: string[];              // Extracted citation IDs (e.g., ["N1", "N3"])
  temperature: number;
  generationTimeMs: number;
}

/**
 * Self-consistency verification result
 */
export interface ConsistencyResult {
  selectedAnswer: string;
  consensusCitations: string[];     // Citations agreed upon by majority
  inconsistentCitations: string[];  // Citations not consistently used
  consensusScore: number;           // 0-1 how consistent the samples were
  candidateCount: number;
  selectionReason: string;
}

/**
 * Extract citation IDs from answer text
 */
export function extractCitationIds(answer: string): string[] {
  const pattern = /\[N(\d+)\]/g;
  const citations: string[] = [];
  let match;

  while ((match = pattern.exec(answer)) !== null) {
    const cid = `N${match[1]}`;
    if (!citations.includes(cid)) {
      citations.push(cid);
    }
  }

  return citations;
}

/**
 * Calculate citation consensus across candidates
 * Returns citations that appear in >= threshold fraction of candidates
 */
function calculateCitationConsensus(
  candidates: ResponseCandidate[],
  threshold: number = SELF_CONSISTENCY_CONFIG.minConsensusThreshold
): { consensus: string[]; inconsistent: string[] } {
  const citationCounts = new Map<string, number>();
  const allCitations = new Set<string>();

  // Count occurrences of each citation
  for (const candidate of candidates) {
    for (const cid of candidate.citations) {
      allCitations.add(cid);
      citationCounts.set(cid, (citationCounts.get(cid) || 0) + 1);
    }
  }

  const minCount = Math.ceil(candidates.length * threshold);
  const consensus: string[] = [];
  const inconsistent: string[] = [];

  for (const cid of allCitations) {
    const count = citationCounts.get(cid) || 0;
    if (count >= minCount) {
      consensus.push(cid);
    } else {
      inconsistent.push(cid);
    }
  }

  return { consensus, inconsistent };
}

/**
 * Calculate text similarity between two answers using Jaccard on n-grams
 */
function calculateAnswerSimilarity(answer1: string, answer2: string): number {
  const getNgrams = (text: string, n: number = 3): Set<string> => {
    const clean = text.toLowerCase().replace(/\[N\d+\]/g, '').replace(/[^\w\s]/g, '');
    const words = clean.split(/\s+/).filter(w => w.length > 2);
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  };

  const ngrams1 = getNgrams(answer1);
  const ngrams2 = getNgrams(answer2);

  if (ngrams1.size === 0 || ngrams2.size === 0) return 0.5;

  let intersection = 0;
  for (const ng of ngrams1) {
    if (ngrams2.has(ng)) intersection++;
  }

  const union = new Set([...ngrams1, ...ngrams2]).size;
  return intersection / union;
}

/**
 * Score a candidate based on its alignment with other candidates
 */
function scoreCandidate(
  candidate: ResponseCandidate,
  allCandidates: ResponseCandidate[],
  consensusCitations: string[]
): number {
  // Citation alignment: how many of the candidate's citations are in consensus
  const citationAlignment = candidate.citations.length > 0
    ? candidate.citations.filter(c => consensusCitations.includes(c)).length / candidate.citations.length
    : 0;

  // Answer similarity: average similarity to other candidates
  const similarities = allCandidates
    .filter(c => c !== candidate)
    .map(c => calculateAnswerSimilarity(candidate.answer, c.answer));
  const avgSimilarity = similarities.length > 0
    ? similarities.reduce((a, b) => a + b, 0) / similarities.length
    : 0.5;

  // Combined score
  return (
    SELF_CONSISTENCY_CONFIG.citationAlignmentWeight * citationAlignment +
    SELF_CONSISTENCY_CONFIG.answerSimilarityWeight * avgSimilarity +
    SELF_CONSISTENCY_CONFIG.sourceQualityWeight * (candidate.citations.length > 0 ? 1 : 0)
  );
}

/**
 * Select or merge the best response from candidates
 */
export function selectBestResponse(
  candidates: ResponseCandidate[]
): ConsistencyResult {
  if (candidates.length === 0) {
    return {
      selectedAnswer: '',
      consensusCitations: [],
      inconsistentCitations: [],
      consensusScore: 0,
      candidateCount: 0,
      selectionReason: 'No candidates provided',
    };
  }

  if (candidates.length === 1) {
    return {
      selectedAnswer: candidates[0].answer,
      consensusCitations: candidates[0].citations,
      inconsistentCitations: [],
      consensusScore: 1,
      candidateCount: 1,
      selectionReason: 'Single candidate - no consensus needed',
    };
  }

  // Calculate citation consensus
  const { consensus, inconsistent } = calculateCitationConsensus(candidates);

  // Score each candidate
  const scoredCandidates = candidates.map(c => ({
    candidate: c,
    score: scoreCandidate(c, candidates, consensus),
  }));

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  const best = scoredCandidates[0];

  // Calculate overall consensus score
  const avgScore = scoredCandidates.reduce((sum, sc) => sum + sc.score, 0) / scoredCandidates.length;

  // Log inconsistent citations for debugging
  if (inconsistent.length > 0) {
    logWarn(`Self-consistency: ${inconsistent.length} citations not in consensus: ${inconsistent.join(', ')}`);
  }

  logInfo(`Self-consistency: Selected candidate with score ${best.score.toFixed(3)}, consensus score ${avgScore.toFixed(3)}`);

  return {
    selectedAnswer: best.candidate.answer,
    consensusCitations: consensus,
    inconsistentCitations: inconsistent,
    consensusScore: avgScore,
    candidateCount: candidates.length,
    selectionReason: `Selected highest-scoring candidate (${best.score.toFixed(3)}) from ${candidates.length} samples`,
  };
}

/**
 * Filter answer to remove non-consensus citations
 * Replaces inconsistent citations with the text only (no citation marker)
 */
export function filterInconsistentCitations(
  answer: string,
  inconsistentCitations: string[]
): string {
  let filtered = answer;

  for (const cid of inconsistentCitations) {
    // Remove the citation marker but keep surrounding text
    const pattern = new RegExp(`\\[${cid}\\]`, 'g');
    filtered = filtered.replace(pattern, '');
  }

  // Clean up any double spaces
  filtered = filtered.replace(/\s+/g, ' ').trim();

  return filtered;
}

/**
 * Generate temperature values for multi-sample generation
 */
export function generateTemperatures(
  baseTemperature: number,
  numSamples: number,
  variance: number = SELF_CONSISTENCY_CONFIG.temperatureVariance
): number[] {
  const temperatures: number[] = [];

  for (let i = 0; i < numSamples; i++) {
    // Spread temperatures around the base
    const offset = (i - (numSamples - 1) / 2) * variance;
    const temp = Math.max(0, Math.min(1, baseTemperature + offset));
    temperatures.push(temp);
  }

  return temperatures;
}

/**
 * Configuration getter
 */
export function getSelfConsistencyConfig() {
  return { ...SELF_CONSISTENCY_CONFIG };
}

/**
 * Check if self-consistency is enabled
 */
export function isSelfConsistencyEnabled(): boolean {
  return SELF_CONSISTENCY_CONFIG.enabled;
}

