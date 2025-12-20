/**
 * AuroraNotes API - Enhanced Citation Confidence Scoring
 *
 * Multi-factor citation confidence scoring that combines:
 * - Semantic similarity (embedding-based)
 * - Lexical overlap (keyword-based)
 * - Position-aware scoring (claim location matching)
 * - N-gram overlap for phrase matching
 * - Entity alignment (named entities in claim vs source)
 *
 * This provides more accurate citations by scoring how well each
 * source actually supports the claim it's cited for.
 */

import { Citation, ScoredChunk } from './types';
import { cosineSimilarity } from './utils';
import { generateQueryEmbedding, isEmbeddingsAvailable } from './embeddings';
import { logInfo, logWarn } from './utils';

// Configuration for confidence scoring
const SEMANTIC_WEIGHT = 0.40;       // Weight for embedding similarity
const LEXICAL_WEIGHT = 0.25;        // Weight for keyword overlap
const NGRAM_WEIGHT = 0.20;          // Weight for n-gram phrase matching
const ENTITY_WEIGHT = 0.15;         // Weight for entity alignment

// Thresholds
const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.50;
const MIN_ACCEPTABLE_CONFIDENCE = 0.30;

/**
 * Multi-factor citation confidence score result
 */
export interface CitationConfidenceScore {
  cid: string;
  claim: string;
  overallScore: number;
  semanticScore: number;
  lexicalScore: number;
  ngramScore: number;
  entityScore: number;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  explanation?: string;
}

/**
 * Extract n-grams from text for phrase matching
 */
function extractNgrams(text: string, n: number): Set<string> {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Extract named entities (proper nouns, numbers, dates, identifiers)
 */
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

/**
 * Calculate lexical overlap score using Jaccard coefficient on keywords
 */
function calculateLexicalOverlap(claim: string, source: string): number {
  const claimWords = new Set(
    claim.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );

  const sourceWords = new Set(
    source.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );

  if (claimWords.size === 0 || sourceWords.size === 0) return 0;

  let intersection = 0;
  for (const word of claimWords) {
    if (sourceWords.has(word)) intersection++;
  }

  // Jaccard coefficient
  const union = new Set([...claimWords, ...sourceWords]).size;
  return intersection / union;
}

/**
 * Calculate n-gram overlap score (bigrams and trigrams)
 */
function calculateNgramOverlap(claim: string, source: string): number {
  const claimBigrams = extractNgrams(claim, 2);
  const claimTrigrams = extractNgrams(claim, 3);
  const sourceBigrams = extractNgrams(source, 2);
  const sourceTrigrams = extractNgrams(source, 3);

  let bigramOverlap = 0;
  for (const bg of claimBigrams) {
    if (sourceBigrams.has(bg)) bigramOverlap++;
  }

  let trigramOverlap = 0;
  for (const tg of claimTrigrams) {
    if (sourceTrigrams.has(tg)) trigramOverlap++;
  }

  const bigramScore = claimBigrams.size > 0 ? bigramOverlap / claimBigrams.size : 0;
  const trigramScore = claimTrigrams.size > 0 ? trigramOverlap / claimTrigrams.size : 0;

  // Weight trigrams higher (more specific phrases)
  return bigramScore * 0.4 + trigramScore * 0.6;
}

/**
 * Calculate entity alignment score
 */
function calculateEntityAlignment(claim: string, source: string): number {
  const claimEntities = extractEntities(claim);
  const sourceEntities = extractEntities(source);

  if (claimEntities.size === 0) return 1.0; // No entities to verify

  let matches = 0;
  for (const entity of claimEntities) {
    if (sourceEntities.has(entity) || source.toLowerCase().includes(entity)) {
      matches++;
    }
  }

  return matches / claimEntities.size;
}

/**
 * Determine confidence level from overall score
 */
function getConfidenceLevel(score: number): CitationConfidenceScore['confidenceLevel'] {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (score >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
  if (score >= MIN_ACCEPTABLE_CONFIDENCE) return 'low';
  return 'insufficient';
}

/**
 * Score a single claim-citation pair
 */
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

  // Weighted combination
  const overallScore =
    SEMANTIC_WEIGHT * semanticScore +
    LEXICAL_WEIGHT * lexicalScore +
    NGRAM_WEIGHT * ngramScore +
    ENTITY_WEIGHT * entityScore;

  const confidenceLevel = getConfidenceLevel(overallScore);

  return {
    cid: citation.cid,
    claim,
    overallScore: Math.round(overallScore * 1000) / 1000,
    semanticScore: Math.round(semanticScore * 1000) / 1000,
    lexicalScore: Math.round(lexicalScore * 1000) / 1000,
    ngramScore: Math.round(ngramScore * 1000) / 1000,
    entityScore: Math.round(entityScore * 1000) / 1000,
    confidenceLevel,
  };
}

/**
 * Batch score all citations in an answer
 */
export interface ClaimCitationPair {
  claim: string;
  cid: string;
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

/**
 * Filter citations by confidence threshold
 * Returns only citations that meet minimum confidence requirements
 */
export function filterByConfidence(
  scores: CitationConfidenceScore[],
  minConfidence: number = MIN_ACCEPTABLE_CONFIDENCE
): {
  accepted: CitationConfidenceScore[];
  rejected: CitationConfidenceScore[];
} {
  const accepted: CitationConfidenceScore[] = [];
  const rejected: CitationConfidenceScore[] = [];

  for (const score of scores) {
    if (score.overallScore >= minConfidence) {
      accepted.push(score);
    } else {
      rejected.push(score);
    }
  }

  if (rejected.length > 0) {
    logWarn('Citations rejected due to low confidence', {
      rejectedCount: rejected.length,
      rejectedCids: rejected.map(r => r.cid),
      lowestScore: Math.min(...rejected.map(r => r.overallScore)),
    });
  }

  return { accepted, rejected };
}

// Intent-specific threshold adjustments
const INTENT_THRESHOLD_ADJUSTMENTS: Record<string, number> = {
  factual: 0.05,      // Stricter for factual queries
  procedural: 0.0,
  conceptual: -0.05,  // Slightly more lenient for conceptual
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

/**
 * Get adjusted threshold based on query intent
 */
export function getAdjustedThreshold(
  baseThreshold: number,
  intent: string
): number {
  const adjustment = INTENT_THRESHOLD_ADJUSTMENTS[intent] || 0;
  return Math.max(0.2, Math.min(0.9, baseThreshold + adjustment));
}

/**
 * Filter citations with intent-aware thresholds
 */
export function filterByConfidenceWithIntent(
  scores: CitationConfidenceScore[],
  intent: string,
  baseMinConfidence: number = MIN_ACCEPTABLE_CONFIDENCE
): {
  accepted: CitationConfidenceScore[];
  rejected: CitationConfidenceScore[];
  adjustedThreshold: number;
} {
  const adjustedThreshold = getAdjustedThreshold(baseMinConfidence, intent);

  const accepted: CitationConfidenceScore[] = [];
  const rejected: CitationConfidenceScore[] = [];

  for (const score of scores) {
    if (score.overallScore >= adjustedThreshold) {
      accepted.push(score);
    } else {
      rejected.push(score);
    }
  }

  if (rejected.length > 0) {
    logWarn('Citations rejected due to low confidence (intent-adjusted)', {
      intent,
      adjustedThreshold,
      rejectedCount: rejected.length,
      rejectedCids: rejected.map(r => r.cid),
    });
  }

  return { accepted, rejected, adjustedThreshold };
}

// Export configuration for observability
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

/**
 * Aggregate confidence score for entire response
 */
export interface ResponseConfidenceAggregate {
  overallScore: number;
  scoreDistribution: {
    high: number;
    medium: number;
    low: number;
    insufficient: number;
  };
  weakestCitations: Array<{ cid: string; score: number }>;
  strongestCitations: Array<{ cid: string; score: number }>;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  recommendation: string;
}

/**
 * Aggregate confidence scores across all citations in a response
 */
export function aggregateConfidenceScores(
  scores: CitationConfidenceScore[]
): ResponseConfidenceAggregate {
  if (scores.length === 0) {
    return {
      overallScore: 0,
      scoreDistribution: { high: 0, medium: 0, low: 0, insufficient: 0 },
      weakestCitations: [],
      strongestCitations: [],
      confidenceLevel: 'insufficient',
      recommendation: 'No citations to evaluate',
    };
  }

  // Calculate distribution
  const distribution = { high: 0, medium: 0, low: 0, insufficient: 0 };
  for (const score of scores) {
    distribution[score.confidenceLevel]++;
  }

  // Calculate overall score (weighted average favoring lower scores)
  const sortedScores = scores.map(s => s.overallScore).sort((a, b) => a - b);
  const lowestThird = sortedScores.slice(0, Math.max(1, Math.floor(sortedScores.length / 3)));
  const lowestAvg = lowestThird.reduce((a, b) => a + b, 0) / lowestThird.length;
  const overallAvg = sortedScores.reduce((a, b) => a + b, 0) / sortedScores.length;

  // Weight towards lower scores (pessimistic aggregation)
  const overallScore = lowestAvg * 0.4 + overallAvg * 0.6;

  // Get weakest and strongest
  const sorted = [...scores].sort((a, b) => a.overallScore - b.overallScore);
  const weakestCitations = sorted.slice(0, 3).map(s => ({ cid: s.cid, score: s.overallScore }));
  const strongestCitations = sorted.slice(-3).reverse().map(s => ({ cid: s.cid, score: s.overallScore }));

  // Determine overall level
  const confidenceLevel = getConfidenceLevel(overallScore);

  // Generate recommendation
  let recommendation: string;
  if (distribution.insufficient > 0) {
    recommendation = `${distribution.insufficient} citation(s) have insufficient support - consider removing or finding better sources`;
  } else if (distribution.low > scores.length / 2) {
    recommendation = 'Majority of citations have low confidence - consider verifying claims';
  } else if (distribution.high > scores.length / 2) {
    recommendation = 'Response is well-grounded with high-confidence citations';
  } else {
    recommendation = 'Response has moderate citation confidence';
  }

  return {
    overallScore: Math.round(overallScore * 1000) / 1000,
    scoreDistribution: distribution,
    weakestCitations,
    strongestCitations,
    confidenceLevel,
    recommendation,
  };
}

/**
 * Calculate factual alignment score
 * Checks if numerical values, dates, and specific facts match
 */
export function calculateFactualAlignment(claim: string, source: string): number {
  let alignmentScore = 1.0;
  let factCount = 0;

  // Extract and compare numbers
  const claimNumbers = claim.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
  const sourceNumbers = new Set(source.match(/\b\d+(?:\.\d+)?%?\b/g) || []);

  for (const num of claimNumbers) {
    factCount++;
    if (!sourceNumbers.has(num)) {
      alignmentScore -= 0.15; // Penalty for unmatched number
    }
  }

  // Extract and compare quoted phrases
  const claimQuotes = claim.match(/"[^"]+"/g) || [];
  for (const quote of claimQuotes) {
    factCount++;
    if (!source.includes(quote.replace(/"/g, ''))) {
      alignmentScore -= 0.2; // Penalty for unmatched quote
    }
  }

  // If no specific facts, return neutral
  if (factCount === 0) return 0.7;

  return Math.max(0, Math.min(1, alignmentScore));
}

/**
 * Enhanced score with factual alignment
 */
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
  const adjustedOverall = baseScore.overallScore * 0.85 + factualScore * 0.15;
  const adjustedLevel = getConfidenceLevel(adjustedOverall);

  return {
    ...baseScore,
    overallScore: Math.round(adjustedOverall * 1000) / 1000,
    confidenceLevel: adjustedLevel,
    factualScore: Math.round(factualScore * 1000) / 1000,
    explanation: factualScore < 0.5
      ? 'Some specific facts in claim may not match source'
      : baseScore.explanation,
  };
}

