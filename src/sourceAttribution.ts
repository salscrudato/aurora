/**
 * AuroraNotes API - Source Attribution Verification
 *
 * Verifies that each cited source actually supports the specific
 * claim it's attached to using semantic entailment checking.
 *
 * Features:
 * - Semantic entailment scoring
 * - Contradiction detection
 * - Partial support identification
 * - Attribution confidence calibration
 */

import { Citation, ScoredChunk } from './types';
import { cosineSimilarity } from './utils';
import { generateQueryEmbedding, isEmbeddingsAvailable } from './embeddings';
import { logInfo, logWarn } from './utils';

/**
 * Entailment relationship types
 */
export type EntailmentType = 'entails' | 'neutral' | 'contradicts' | 'partial';

/**
 * Attribution verification result for a single claim-source pair
 */
export interface AttributionResult {
  claimText: string;
  sourceText: string;
  cid: string;
  entailmentType: EntailmentType;
  entailmentScore: number;
  isVerified: boolean;
  explanation?: string;
  keyPhraseOverlap: number;
  factualAlignment: number;
}

/**
 * Batch verification result
 */
export interface BatchVerificationResult {
  results: AttributionResult[];
  verifiedCount: number;
  contradictionCount: number;
  partialCount: number;
  neutralCount: number;
  overallVerificationRate: number;
}

/**
 * Extract key phrases from text (noun phrases, important terms)
 */
function extractKeyPhrases(text: string): Set<string> {
  const phrases = new Set<string>();

  // Extract capitalized phrases (proper nouns, titles)
  const properNouns = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g) || [];
  properNouns.forEach(p => phrases.add(p.toLowerCase()));

  // Extract quoted phrases
  const quoted = text.match(/"([^"]+)"/g) || [];
  quoted.forEach(q => phrases.add(q.replace(/"/g, '').toLowerCase()));

  // Extract technical terms (camelCase, snake_case, etc.)
  const technical = text.match(/\b([a-z]+[A-Z][a-zA-Z]*|[a-z]+_[a-z_]+)\b/g) || [];
  technical.forEach(t => phrases.add(t.toLowerCase()));

  // Extract numbers with context
  const numbersWithContext = text.match(/\b(\d+(?:\.\d+)?%?\s*[a-zA-Z]+)\b/g) || [];
  numbersWithContext.forEach(n => phrases.add(n.toLowerCase()));

  return phrases;
}

/**
 * Calculate key phrase overlap between claim and source
 */
function calculateKeyPhraseOverlap(claim: string, source: string): number {
  const claimPhrases = extractKeyPhrases(claim);
  const sourcePhrases = extractKeyPhrases(source);

  if (claimPhrases.size === 0) return 1.0; // No key phrases to verify

  let matches = 0;
  for (const phrase of claimPhrases) {
    if (sourcePhrases.has(phrase) || source.toLowerCase().includes(phrase)) {
      matches++;
    }
  }

  return matches / claimPhrases.size;
}

/**
 * Check for factual alignment (numbers, dates, names match)
 */
function checkFactualAlignment(claim: string, source: string): number {
  // Extract factual elements from claim
  const claimNumbers = claim.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
  const claimDates = claim.match(/\b\d{4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d+/gi) || [];

  const factualElements = [...claimNumbers, ...claimDates];
  if (factualElements.length === 0) return 1.0; // No factual elements to verify

  let matches = 0;
  for (const element of factualElements) {
    if (source.includes(element)) {
      matches++;
    }
  }

  return matches / factualElements.length;
}

/**
 * Detect potential contradictions between claim and source
 */
function detectContradiction(claim: string, source: string): boolean {
  const claimLower = claim.toLowerCase();
  const sourceLower = source.toLowerCase();

  // Check for negation patterns
  const negationPatterns = [
    { positive: /\bis\b/, negative: /\bis not\b|\bisn't\b/ },
    { positive: /\bcan\b/, negative: /\bcannot\b|\bcan't\b/ },
    { positive: /\bwill\b/, negative: /\bwill not\b|\bwon't\b/ },
    { positive: /\bhas\b/, negative: /\bhas not\b|\bhasn't\b/ },
    { positive: /\bdoes\b/, negative: /\bdoes not\b|\bdoesn't\b/ },
  ];

  for (const pattern of negationPatterns) {
    const claimPositive = pattern.positive.test(claimLower);
    const claimNegative = pattern.negative.test(claimLower);
    const sourcePositive = pattern.positive.test(sourceLower);
    const sourceNegative = pattern.negative.test(sourceLower);

    // Contradiction if claim is positive but source is negative (or vice versa)
    if ((claimPositive && !claimNegative && sourceNegative) ||
        (claimNegative && sourcePositive && !sourceNegative)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate semantic entailment score using embeddings
 */
async function calculateSemanticEntailment(
  claim: string,
  source: string,
  sourceEmbedding?: number[]
): Promise<number> {
  if (!isEmbeddingsAvailable()) {
    return 0.5; // Neutral if embeddings unavailable
  }

  try {
    const claimEmbedding = await generateQueryEmbedding(claim);

    if (sourceEmbedding) {
      return cosineSimilarity(claimEmbedding, sourceEmbedding);
    }

    // Generate source embedding if not provided
    const srcEmb = await generateQueryEmbedding(source);
    return cosineSimilarity(claimEmbedding, srcEmb);
  } catch {
    return 0.5;
  }
}

/**
 * Determine entailment type from scores
 */
function determineEntailmentType(
  semanticScore: number,
  keyPhraseOverlap: number,
  factualAlignment: number,
  hasContradiction: boolean
): EntailmentType {
  if (hasContradiction) return 'contradicts';

  const combinedScore = semanticScore * 0.4 + keyPhraseOverlap * 0.3 + factualAlignment * 0.3;

  if (combinedScore >= 0.7) return 'entails';
  if (combinedScore >= 0.4) return 'partial';
  return 'neutral';
}

/**
 * Verify a single claim-source attribution
 */
export async function verifyAttribution(
  claimText: string,
  sourceText: string,
  cid: string,
  sourceEmbedding?: number[]
): Promise<AttributionResult> {
  // Calculate component scores
  const keyPhraseOverlap = calculateKeyPhraseOverlap(claimText, sourceText);
  const factualAlignment = checkFactualAlignment(claimText, sourceText);
  const hasContradiction = detectContradiction(claimText, sourceText);
  const semanticScore = await calculateSemanticEntailment(claimText, sourceText, sourceEmbedding);

  // Determine entailment type
  const entailmentType = determineEntailmentType(
    semanticScore,
    keyPhraseOverlap,
    factualAlignment,
    hasContradiction
  );

  // Calculate overall entailment score
  const entailmentScore = hasContradiction
    ? 0
    : semanticScore * 0.4 + keyPhraseOverlap * 0.3 + factualAlignment * 0.3;

  // Determine if verified
  const isVerified = entailmentType === 'entails' || entailmentType === 'partial';

  // Generate explanation
  let explanation: string | undefined;
  if (hasContradiction) {
    explanation = 'Source appears to contradict the claim';
  } else if (entailmentType === 'neutral') {
    explanation = 'Source does not clearly support or contradict the claim';
  } else if (entailmentType === 'partial') {
    explanation = 'Source partially supports the claim';
  }

  return {
    claimText,
    sourceText: sourceText.substring(0, 200) + (sourceText.length > 200 ? '...' : ''),
    cid,
    entailmentType,
    entailmentScore: Math.round(entailmentScore * 1000) / 1000,
    isVerified,
    explanation,
    keyPhraseOverlap: Math.round(keyPhraseOverlap * 1000) / 1000,
    factualAlignment: Math.round(factualAlignment * 1000) / 1000,
  };
}

/**
 * Batch verify all attributions in a response
 */
export async function batchVerifyAttributions(
  claimSourcePairs: Array<{ claim: string; cid: string }>,
  citations: Citation[],
  chunks: ScoredChunk[]
): Promise<BatchVerificationResult> {
  const citationMap = new Map(citations.map(c => [c.cid, c]));
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  const results: AttributionResult[] = [];
  let verifiedCount = 0;
  let contradictionCount = 0;
  let partialCount = 0;
  let neutralCount = 0;

  for (const pair of claimSourcePairs) {
    const citation = citationMap.get(pair.cid);
    if (!citation) continue;

    const chunk = chunkMap.get(citation.chunkId);
    const sourceText = chunk?.text || citation.snippet;
    const sourceEmbedding = chunk?.embedding;

    const result = await verifyAttribution(
      pair.claim,
      sourceText,
      pair.cid,
      sourceEmbedding
    );

    results.push(result);

    switch (result.entailmentType) {
      case 'entails':
        verifiedCount++;
        break;
      case 'partial':
        partialCount++;
        break;
      case 'contradicts':
        contradictionCount++;
        break;
      case 'neutral':
        neutralCount++;
        break;
    }
  }

  const overallVerificationRate = results.length > 0
    ? (verifiedCount + partialCount * 0.5) / results.length
    : 0;

  if (contradictionCount > 0) {
    logWarn('Contradictions detected in attributions', {
      contradictionCount,
      totalPairs: results.length,
      contradictingCids: results
        .filter(r => r.entailmentType === 'contradicts')
        .map(r => r.cid),
    });
  }

  return {
    results,
    verifiedCount,
    contradictionCount,
    partialCount,
    neutralCount,
    overallVerificationRate,
  };
}

/**
 * Get attribution verification summary for observability
 */
export function getAttributionSummary(result: BatchVerificationResult): {
  status: 'good' | 'warning' | 'critical';
  message: string;
  details: Record<string, number>;
} {
  const { verifiedCount, contradictionCount, partialCount, neutralCount, overallVerificationRate } = result;

  let status: 'good' | 'warning' | 'critical';
  let message: string;

  if (contradictionCount > 0) {
    status = 'critical';
    message = `${contradictionCount} citation(s) contradict their claims`;
  } else if (overallVerificationRate < 0.5) {
    status = 'warning';
    message = `Low verification rate: ${Math.round(overallVerificationRate * 100)}%`;
  } else if (neutralCount > verifiedCount) {
    status = 'warning';
    message = 'Many citations have neutral support';
  } else {
    status = 'good';
    message = `${Math.round(overallVerificationRate * 100)}% of claims verified`;
  }

  return {
    status,
    message,
    details: {
      verified: verifiedCount,
      partial: partialCount,
      neutral: neutralCount,
      contradictions: contradictionCount,
      verificationRate: Math.round(overallVerificationRate * 100),
    },
  };
}

