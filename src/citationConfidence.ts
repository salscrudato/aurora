/**
 * AuroraNotes API - Enhanced Citation Confidence Scoring
 *
 * Multi-factor citation confidence scoring that combines:
 * - Semantic similarity (embedding-based)
 * - Lexical overlap (keyword-based)
 * - N-gram overlap for phrase matching
 * - Entity alignment (named entities in claim vs source)
 *
 * This provides more accurate citations by scoring how well each
 * source actually supports the claim it's cited for.
 */

import { Citation, ScoredChunk } from './types';
import { cosineSimilarity, logWarn } from './utils';
import { generateQueryEmbedding, isEmbeddingsAvailable } from './embeddings';

// =============================================================================
// Constants
// =============================================================================

// Scoring weights (must sum to 1.0)
const SEMANTIC_WEIGHT = 0.40;
const LEXICAL_WEIGHT = 0.25;
const NGRAM_WEIGHT = 0.20;
const ENTITY_WEIGHT = 0.15;

// Confidence thresholds
const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.50;
const MIN_ACCEPTABLE_CONFIDENCE = 0.30;

// N-gram weights for phrase matching
const BIGRAM_WEIGHT = 0.4;
const TRIGRAM_WEIGHT = 0.6;

// Aggregation settings
const TOP_CITATIONS_COUNT = 3;
const LOWEST_THIRD_WEIGHT = 0.4;
const OVERALL_AVG_WEIGHT = 0.6;

// Intent-specific threshold adjustments
const INTENT_THRESHOLD_ADJUSTMENTS: Record<string, number> = {
  factual: 0.05,
  procedural: 0.0,
  conceptual: -0.05,
  comparative: 0.0,
  exploratory: -0.05,
  clarification: 0.0,
  summarize: -0.03,
  list: 0.0,
  decision: 0.03,
  action_item: 0.02,
  question: 0.0,
  search: 0.0,
};

// =============================================================================
// Types
// =============================================================================

/** Confidence level for citations */
export type ConfidenceLevelType = 'high' | 'medium' | 'low' | 'insufficient';

/** Multi-factor citation confidence score result */
export interface CitationConfidenceScore {
  cid: string;
  claim: string;
  overallScore: number;
  semanticScore: number;
  lexicalScore: number;
  ngramScore: number;
  entityScore: number;
  confidenceLevel: ConfidenceLevelType;
  explanation?: string;
}

/** Claim-citation pair for batch scoring */
export interface ClaimCitationPair {
  claim: string;
  cid: string;
}

/** Aggregate confidence score for entire response */
export interface ResponseConfidenceAggregate {
  overallScore: number;
  scoreDistribution: Record<ConfidenceLevelType, number>;
  weakestCitations: Array<{ cid: string; score: number }>;
  strongestCitations: Array<{ cid: string; score: number }>;
  confidenceLevel: ConfidenceLevelType;
  recommendation: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Round to 3 decimal places for consistent output */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Normalize text for comparison (lowercase, remove punctuation, split to words) */
function normalizeToWords(text: string, minLength = 2): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= minLength);
}

// =============================================================================
// Text Analysis Functions
// =============================================================================

/** Extract n-grams from text for phrase matching */
function extractNgrams(text: string, n: number): Set<string> {
  const words = normalizeToWords(text);
  const ngrams = new Set<string>();

  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/** Calculate set overlap ratio */
function calculateSetOverlap(claimSet: Set<string>, sourceSet: Set<string>): number {
  if (claimSet.size === 0) return 0;

  let overlap = 0;
  for (const item of claimSet) {
    if (sourceSet.has(item)) overlap++;
  }
  return overlap / claimSet.size;
}

/** Extract named entities (proper nouns, numbers, dates, identifiers) */
function extractEntities(text: string): Set<string> {
  const entities = new Set<string>();

  // Capitalized proper nouns (2+ consecutive)
  const properNouns = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
  properNouns.forEach(e => entities.add(e.toLowerCase()));

  // Single capitalized words (potential names/projects)
  const singleCaps = text.match(/\b([A-Z][a-z]{2,})\b/g) || [];
  singleCaps.forEach(e => entities.add(e.toLowerCase()));

  // Numbers and dates
  const numbers = text.match(/\b(\d+(?:\.\d+)?%?)\b/g) || [];
  numbers.forEach(e => entities.add(e));

  // Identifiers (UPPERCASE_WITH_UNDERSCORES)
  const identifiers = text.match(/\b([A-Z][A-Z0-9_]{2,})\b/g) || [];
  identifiers.forEach(e => entities.add(e.toLowerCase()));

  return entities;
}

// =============================================================================
// Scoring Functions
// =============================================================================

/** Calculate lexical overlap score using Jaccard coefficient on keywords */
function calculateLexicalOverlap(claim: string, source: string): number {
  const claimWords = new Set(normalizeToWords(claim, 3));
  const sourceWords = new Set(normalizeToWords(source, 3));

  if (claimWords.size === 0 || sourceWords.size === 0) return 0;

  let intersection = 0;
  for (const word of claimWords) {
    if (sourceWords.has(word)) intersection++;
  }

  // Jaccard coefficient
  const union = new Set([...claimWords, ...sourceWords]).size;
  return intersection / union;
}

/** Calculate n-gram overlap score (bigrams and trigrams) */
function calculateNgramOverlap(claim: string, source: string): number {
  const claimBigrams = extractNgrams(claim, 2);
  const claimTrigrams = extractNgrams(claim, 3);
  const sourceBigrams = extractNgrams(source, 2);
  const sourceTrigrams = extractNgrams(source, 3);

  const bigramScore = calculateSetOverlap(claimBigrams, sourceBigrams);
  const trigramScore = calculateSetOverlap(claimTrigrams, sourceTrigrams);

  // Weight trigrams higher (more specific phrases)
  return bigramScore * BIGRAM_WEIGHT + trigramScore * TRIGRAM_WEIGHT;
}

/** Calculate entity alignment score */
function calculateEntityAlignment(claim: string, source: string): number {
  const claimEntities = extractEntities(claim);
  const sourceEntities = extractEntities(source);

  if (claimEntities.size === 0) return 1.0; // No entities to verify

  const sourceLower = source.toLowerCase();
  let matches = 0;
  for (const entity of claimEntities) {
    if (sourceEntities.has(entity) || sourceLower.includes(entity)) {
      matches++;
    }
  }

  return matches / claimEntities.size;
}

/** Determine confidence level from overall score */
function getConfidenceLevel(score: number): ConfidenceLevelType {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (score >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
  if (score >= MIN_ACCEPTABLE_CONFIDENCE) return 'low';
  return 'insufficient';
}

/** Compute weighted overall confidence score */
function computeOverallScore(
  semanticScore: number,
  lexicalScore: number,
  ngramScore: number,
  entityScore: number
): number {
  return (
    SEMANTIC_WEIGHT * semanticScore +
    LEXICAL_WEIGHT * lexicalScore +
    NGRAM_WEIGHT * ngramScore +
    ENTITY_WEIGHT * entityScore
  );
}

// =============================================================================
// Public API
// =============================================================================

/** Score a single claim-citation pair */
export async function scoreCitationConfidence(
  claim: string,
  citation: Citation,
  chunk: ScoredChunk | undefined,
  options: { useSemanticScoring?: boolean } = {}
): Promise<CitationConfidenceScore> {
  const sourceText = chunk?.text || citation.snippet;
  const { useSemanticScoring = true } = options;

  // Calculate component scores
  const lexicalScore = calculateLexicalOverlap(claim, sourceText);
  const ngramScore = calculateNgramOverlap(claim, sourceText);
  const entityScore = calculateEntityAlignment(claim, sourceText);

  // Semantic score (if embeddings available and enabled)
  let semanticScore = 0.5; // Default neutral if not computed
  if (useSemanticScoring && isEmbeddingsAvailable() && chunk?.embedding) {
    try {
      const claimEmbedding = await generateQueryEmbedding(claim);
      semanticScore = cosineSimilarity(claimEmbedding, chunk.embedding);
    } catch {
      // Fallback to lexical-only scoring
      semanticScore = lexicalScore;
    }
  } else if (!useSemanticScoring) {
    // Weight other scores higher when semantic is disabled
    semanticScore = (lexicalScore + ngramScore) / 2;
  }

  const overallScore = computeOverallScore(semanticScore, lexicalScore, ngramScore, entityScore);

  return {
    cid: citation.cid,
    claim,
    overallScore: round3(overallScore),
    semanticScore: round3(semanticScore),
    lexicalScore: round3(lexicalScore),
    ngramScore: round3(ngramScore),
    entityScore: round3(entityScore),
    confidenceLevel: getConfidenceLevel(overallScore),
  };
}

export async function batchScoreCitations(
  claimPairs: ClaimCitationPair[],
  citations: Citation[],
  chunks: ScoredChunk[],
  options: { useSemanticScoring?: boolean } = {}
): Promise<{
  scores: CitationConfidenceScore[];
  highConfidenceCount: number;
  insufficientCount: number;
  averageConfidence: number;
}> {
  const citationMap = new Map(citations.map(c => [c.cid, c]));
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  const scores: CitationConfidenceScore[] = [];
  let highCount = 0;
  let insufficientCount = 0;
  let totalScore = 0;

  for (const pair of claimPairs) {
    const citation = citationMap.get(pair.cid);
    if (!citation) continue;

    const chunk = chunkMap.get(citation.chunkId);
    const score = await scoreCitationConfidence(pair.claim, citation, chunk, options);
    scores.push(score);
    totalScore += score.overallScore;

    if (score.confidenceLevel === 'high') highCount++;
    if (score.confidenceLevel === 'insufficient') insufficientCount++;
  }

  return {
    scores,
    highConfidenceCount: highCount,
    insufficientCount: insufficientCount,
    averageConfidence: scores.length > 0 ? totalScore / scores.length : 0,
  };
}

/**
 * Extract claim-citation pairs from an answer
 * A claim is a sentence or phrase followed by one or more citations
 */
export function extractClaimCitationPairs(answer: string): ClaimCitationPair[] {
  const pairs: ClaimCitationPair[] = [];

  // Split into sentences
  const sentences = answer.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    // Find all citations in this sentence
    const citationMatches = sentence.matchAll(/\[N?(\d+)\]/g);

    for (const match of citationMatches) {
      const cid = match[1].startsWith('N') ? match[1] : `N${match[1]}`;
      // Extract the claim (sentence without citation markers)
      const claim = sentence.replace(/\[N?\d+\]/g, '').trim();

      if (claim.length > 10) {
        pairs.push({ claim, cid });
      }
    }
  }

  return pairs;
}

/** Filter result with accepted and rejected citations */
interface FilterResult {
  accepted: CitationConfidenceScore[];
  rejected: CitationConfidenceScore[];
}

/** Core filtering logic shared by all filter functions */
function partitionByThreshold(
  scores: CitationConfidenceScore[],
  threshold: number
): FilterResult {
  const accepted: CitationConfidenceScore[] = [];
  const rejected: CitationConfidenceScore[] = [];

  for (const score of scores) {
    if (score.overallScore >= threshold) {
      accepted.push(score);
    } else {
      rejected.push(score);
    }
  }

  return { accepted, rejected };
}

/** Filter citations by confidence threshold */
export function filterByConfidence(
  scores: CitationConfidenceScore[],
  minConfidence: number = MIN_ACCEPTABLE_CONFIDENCE
): FilterResult {
  const result = partitionByThreshold(scores, minConfidence);

  if (result.rejected.length > 0) {
    logWarn('Citations rejected due to low confidence', {
      rejectedCount: result.rejected.length,
      rejectedCids: result.rejected.map(r => r.cid),
      lowestScore: Math.min(...result.rejected.map(r => r.overallScore)),
    });
  }

  return result;
}

/** Get adjusted threshold based on query intent */
export function getAdjustedThreshold(baseThreshold: number, intent: string): number {
  const adjustment = INTENT_THRESHOLD_ADJUSTMENTS[intent] || 0;
  return Math.max(0.2, Math.min(0.9, baseThreshold + adjustment));
}

/** Filter citations with intent-aware thresholds */
export function filterByConfidenceWithIntent(
  scores: CitationConfidenceScore[],
  intent: string,
  baseMinConfidence: number = MIN_ACCEPTABLE_CONFIDENCE
): FilterResult & { adjustedThreshold: number } {
  const adjustedThreshold = getAdjustedThreshold(baseMinConfidence, intent);
  const result = partitionByThreshold(scores, adjustedThreshold);

  if (result.rejected.length > 0) {
    logWarn('Citations rejected due to low confidence (intent-adjusted)', {
      intent,
      adjustedThreshold,
      rejectedCount: result.rejected.length,
      rejectedCids: result.rejected.map(r => r.cid),
    });
  }

  return { ...result, adjustedThreshold };
}

/** Export configuration for observability */
export function getCitationConfidenceConfig() {
  return {
    weights: {
      semantic: SEMANTIC_WEIGHT,
      lexical: LEXICAL_WEIGHT,
      ngram: NGRAM_WEIGHT,
      entity: ENTITY_WEIGHT,
    },
    thresholds: {
      high: HIGH_CONFIDENCE_THRESHOLD,
      medium: MEDIUM_CONFIDENCE_THRESHOLD,
      minimum: MIN_ACCEPTABLE_CONFIDENCE,
    },
    intentAdjustments: INTENT_THRESHOLD_ADJUSTMENTS,
  };
}

/** Create empty aggregate result */
function createEmptyAggregate(): ResponseConfidenceAggregate {
  return {
    overallScore: 0,
    scoreDistribution: { high: 0, medium: 0, low: 0, insufficient: 0 },
    weakestCitations: [],
    strongestCitations: [],
    confidenceLevel: 'insufficient',
    recommendation: 'No citations to evaluate',
  };
}

/** Generate recommendation based on score distribution */
function generateRecommendation(
  distribution: Record<ConfidenceLevelType, number>,
  totalCount: number
): string {
  if (distribution.insufficient > 0) {
    return `${distribution.insufficient} citation(s) have insufficient support - consider removing or finding better sources`;
  }
  if (distribution.low > totalCount / 2) {
    return 'Majority of citations have low confidence - consider verifying claims';
  }
  if (distribution.high > totalCount / 2) {
    return 'Response is well-grounded with high-confidence citations';
  }
  return 'Response has moderate citation confidence';
}

/** Aggregate confidence scores across all citations in a response */
export function aggregateConfidenceScores(
  scores: CitationConfidenceScore[]
): ResponseConfidenceAggregate {
  if (scores.length === 0) {
    return createEmptyAggregate();
  }

  // Calculate distribution
  const distribution: Record<ConfidenceLevelType, number> = {
    high: 0,
    medium: 0,
    low: 0,
    insufficient: 0,
  };
  for (const score of scores) {
    distribution[score.confidenceLevel]++;
  }

  // Calculate overall score (weighted average favoring lower scores)
  const sortedScores = scores.map(s => s.overallScore).sort((a, b) => a - b);
  const lowestThird = sortedScores.slice(0, Math.max(1, Math.floor(sortedScores.length / 3)));
  const lowestAvg = lowestThird.reduce((a, b) => a + b, 0) / lowestThird.length;
  const overallAvg = sortedScores.reduce((a, b) => a + b, 0) / sortedScores.length;

  // Weight towards lower scores (pessimistic aggregation)
  const overallScore = lowestAvg * LOWEST_THIRD_WEIGHT + overallAvg * OVERALL_AVG_WEIGHT;

  // Get weakest and strongest
  const sorted = [...scores].sort((a, b) => a.overallScore - b.overallScore);
  const weakestCitations = sorted.slice(0, TOP_CITATIONS_COUNT).map(s => ({ cid: s.cid, score: s.overallScore }));
  const strongestCitations = sorted.slice(-TOP_CITATIONS_COUNT).reverse().map(s => ({ cid: s.cid, score: s.overallScore }));

  return {
    overallScore: round3(overallScore),
    scoreDistribution: distribution,
    weakestCitations,
    strongestCitations,
    confidenceLevel: getConfidenceLevel(overallScore),
    recommendation: generateRecommendation(distribution, scores.length),
  };
}

// =============================================================================
// Factual Alignment
// =============================================================================

// Factual alignment scoring constants
const UNMATCHED_NUMBER_PENALTY = 0.15;
const UNMATCHED_QUOTE_PENALTY = 0.20;
const NEUTRAL_FACTUAL_SCORE = 0.7;
const FACTUAL_ALIGNMENT_WEIGHT = 0.15;

/** Calculate factual alignment score - checks if numbers and quotes match */
export function calculateFactualAlignment(claim: string, source: string): number {
  let alignmentScore = 1.0;
  let factCount = 0;

  // Extract and compare numbers
  const claimNumbers = claim.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
  const sourceNumbers = new Set(source.match(/\b\d+(?:\.\d+)?%?\b/g) || []);

  for (const num of claimNumbers) {
    factCount++;
    if (!sourceNumbers.has(num)) {
      alignmentScore -= UNMATCHED_NUMBER_PENALTY;
    }
  }

  // Extract and compare quoted phrases
  const claimQuotes = claim.match(/"[^"]+"/g) || [];
  for (const quote of claimQuotes) {
    factCount++;
    if (!source.includes(quote.replace(/"/g, ''))) {
      alignmentScore -= UNMATCHED_QUOTE_PENALTY;
    }
  }

  // If no specific facts, return neutral
  if (factCount === 0) return NEUTRAL_FACTUAL_SCORE;

  return Math.max(0, Math.min(1, alignmentScore));
}

/** Enhanced score with factual alignment */
export async function scoreWithFactualAlignment(
  claim: string,
  citation: Citation,
  chunk: ScoredChunk | undefined,
  options: { useSemanticScoring?: boolean } = {}
): Promise<CitationConfidenceScore & { factualScore: number }> {
  const baseScore = await scoreCitationConfidence(claim, citation, chunk, options);
  const sourceText = chunk?.text || citation.snippet;
  const factualScore = calculateFactualAlignment(claim, sourceText);

  // Adjust overall score based on factual alignment
  const adjustedOverall = baseScore.overallScore * (1 - FACTUAL_ALIGNMENT_WEIGHT) + factualScore * FACTUAL_ALIGNMENT_WEIGHT;

  return {
    ...baseScore,
    overallScore: round3(adjustedOverall),
    confidenceLevel: getConfidenceLevel(adjustedOverall),
    factualScore: round3(factualScore),
    explanation: factualScore < 0.5
      ? 'Some specific facts in claim may not match source'
      : baseScore.explanation,
  };
}
