/**
 * AuroraNotes API - Citation Validator
 *
 * Unified citation validation pipeline for RAG answers:
 * - Parse citation tokens from text
 * - Remove invalid citations (not in source list)
 * - Reorder citations by first appearance
 * - Compute citation coverage (sentence-level)
 * - Verify citation relevance using keyword overlap
 * - Clean formatting (duplicate citations, spacing)
 *
 * This is the SINGLE canonical validation module for all citation operations.
 */

import { logWarn } from './utils';
import { Citation, ScoredChunk } from './types';

// Re-export Citation type for convenience
export type { Citation } from './types';

// =============================================================================
// Constants
// =============================================================================

// Overlap verification thresholds
const DEFAULT_MIN_OVERLAP_SCORE = 0.15;
const SUSPICIOUS_SCORE_MULTIPLIER = 0.5;

// Text analysis constants
const MIN_SENTENCE_LENGTH = 15;
const MIN_WORD_LENGTH = 2;
const DEFAULT_COVERAGE_THRESHOLD = 50;

// Pre-compiled regex patterns
const CITATION_PATTERN = /\[N(\d+)\]/g;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;
const DUPLICATE_CITATIONS = /(\[N\d+\])(\s*\1)+/g;
const SPACE_BEFORE_PUNCT = /\s+([.!?,;:])/g;
const MULTI_SPACE_TAB = /[ \t]+/g;
const MULTI_NEWLINE = /\n{3,}/g;
const TRAILING_WHITESPACE = /[ \t]+$/gm;
const EMPTY_BRACKETS = /\[\s*\]/g;
const NON_WORD_CHARS = /[^\w\s]/g;

// =============================================================================
// Types
// =============================================================================

/** Result from citation validation pipeline */
export interface ValidationResult {
  validatedAnswer: string;
  validatedCitations: Citation[];
  invalidCitationsRemoved: string[];
  droppedCitations: string[];
  suspiciousCitations: string[];
  citationCoveragePct: number;
  allCitationsValid: boolean;
  orderedByFirstAppearance: boolean;
  overlapScores: Map<string, number>;
}

/** Options for citation validation */
export interface ValidationOptions {
  strictMode?: boolean;
  minOverlapScore?: number;
  verifyRelevance?: boolean;
  requestId?: string;
}

/** Result from relevance verification */
interface RelevanceResult {
  validCitations: Citation[];
  droppedCitations: string[];
  suspiciousCitations: string[];
  overlapScores: Map<string, number>;
}

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'and', 'or', 'but', 'if', 'this', 'that', 'these', 'those', 'it',
  'based', 'notes', 'according', 'mentioned', 'stated', 'using', 'used'
]);

// =============================================================================
// Text Normalization Helpers
// =============================================================================

/** Normalize whitespace while preserving newlines */
function normalizeWhitespace(text: string): string {
  return text
    .replace(MULTI_SPACE_TAB, ' ')
    .replace(MULTI_NEWLINE, '\n\n')
    .replace(TRAILING_WHITESPACE, '')
    .trim();
}

// =============================================================================
// Citation Parsing Functions
// =============================================================================

/** Parse citation tokens from answer text */
export function parseCitationTokens(answer: string): string[] {
  const tokens: string[] = [];
  let match;
  // Reset lastIndex for global regex
  CITATION_PATTERN.lastIndex = 0;
  while ((match = CITATION_PATTERN.exec(answer)) !== null) {
    tokens.push(`N${match[1]}`);
  }
  return tokens;
}

/** Get unique citation IDs in order of first appearance */
export function getOrderedUniqueCitations(answer: string): string[] {
  const tokens = parseCitationTokens(answer);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      ordered.push(token);
    }
  }
  return ordered;
}

/** Reorder citations array by order of first appearance in text */
function reorderByFirstAppearance(cids: string[], citations: Citation[]): Citation[] {
  const citationMap = new Map(citations.map(c => [c.cid, c]));
  return cids
    .map(cid => citationMap.get(cid))
    .filter((c): c is Citation => c !== undefined);
}

// =============================================================================
// Citation Cleanup Functions
// =============================================================================

/** Remove invalid citation tokens from answer text while preserving formatting */
export function removeInvalidCitations(
  answer: string,
  validCids: Set<string>
): { cleaned: string; removed: string[] } {
  const removed: string[] = [];

  const cleaned = answer.replace(CITATION_PATTERN, (match, num) => {
    const cid = `N${num}`;
    if (validCids.has(cid)) {
      return match;
    }
    removed.push(cid);
    return '';
  });

  return { cleaned: normalizeWhitespace(cleaned), removed };
}

/** Clean up citation formatting issues in answer while preserving newlines */
export function cleanCitationFormatting(answer: string): string {
  return normalizeWhitespace(
    answer
      .replace(DUPLICATE_CITATIONS, '$1')
      .replace(SPACE_BEFORE_PUNCT, '$1')
      .replace(EMPTY_BRACKETS, '')
  );
}

// =============================================================================
// Coverage Metrics
// =============================================================================

/** Calculate citation coverage: % of factual sentences with citations */
export function calculateCitationCoverage(answer: string): number {
  const sentences = answer
    .split(SENTENCE_BOUNDARY)
    .map(s => s.trim())
    .filter(s => s.length > MIN_SENTENCE_LENGTH);

  if (sentences.length === 0) return 100;

  const citedCount = sentences.filter(s => CITATION_PATTERN.test(s)).length;
  // Reset lastIndex after test
  CITATION_PATTERN.lastIndex = 0;

  return Math.round((citedCount / sentences.length) * 100);
}

// =============================================================================
// Keyword Extraction & Overlap
// =============================================================================

/** Extract keywords from text for overlap verification */
export function extractVerificationKeywords(text: string): Set<string> {
  // Reset lastIndex for global regex
  CITATION_PATTERN.lastIndex = 0;
  return new Set(
    text.toLowerCase()
      .replace(CITATION_PATTERN, '')
      .replace(NON_WORD_CHARS, ' ')
      .split(/\s+/)
      .filter(word => word.length > MIN_WORD_LENGTH && !STOP_WORDS.has(word))
  );
}

/**
 * Calculate overlap score between two keyword sets
 * Uses Szymkiewicz–Simpson coefficient (min-based overlap)
 */
export function calculateOverlapScore(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }

  return intersection / Math.min(set1.size, set2.size);
}

/** Classify a single citation based on overlap score */
function classifyCitation(
  citation: Citation,
  overlapScore: number,
  minOverlapScore: number,
  strictMode: boolean,
  result: RelevanceResult
): void {
  result.overlapScores.set(citation.cid, overlapScore);

  if (overlapScore >= minOverlapScore) {
    result.validCitations.push(citation);
  } else if (strictMode) {
    result.droppedCitations.push(citation.cid);
  } else {
    result.validCitations.push(citation);
    if (overlapScore < minOverlapScore * SUSPICIOUS_SCORE_MULTIPLIER) {
      result.suspiciousCitations.push(citation.cid);
    }
  }
}

/** Verify citation relevance using keyword overlap */
export function verifyCitationRelevance(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[],
  options: { strictMode?: boolean; minOverlapScore?: number } = {}
): RelevanceResult {
  const { strictMode = true, minOverlapScore = DEFAULT_MIN_OVERLAP_SCORE } = options;

  const answerKeywords = extractVerificationKeywords(answer);
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  const result: RelevanceResult = {
    validCitations: [],
    droppedCitations: [],
    suspiciousCitations: [],
    overlapScores: new Map(),
  };

  for (const citation of citations) {
    const chunk = chunkMap.get(citation.chunkId);
    const sourceText = chunk?.text || citation.snippet;
    const sourceKeywords = extractVerificationKeywords(sourceText);
    const overlapScore = calculateOverlapScore(answerKeywords, sourceKeywords);

    classifyCitation(citation, overlapScore, minOverlapScore, strictMode, result);
  }

  return result;
}

// =============================================================================
// Core Validation Helpers
// =============================================================================

/** Common validation steps: remove invalid, clean formatting, get ordered citations */
function performBaseValidation(
  answer: string,
  citations: Citation[],
  requestId: string
): {
  cleanedAnswer: string;
  removed: string[];
  orderedCitations: Citation[];
  usedCids: string[];
} {
  const validCids = new Set(citations.map(c => c.cid));

  // Step 1: Remove invalid citations
  const { cleaned, removed } = removeInvalidCitations(answer, validCids);

  if (removed.length > 0) {
    logWarn('Removed invalid citations from answer', {
      requestId,
      removedCount: removed.length,
      removedCids: removed,
    });
  }

  // Step 2: Clean formatting
  const cleanedAnswer = cleanCitationFormatting(cleaned);

  // Step 3: Get citations in order of appearance
  const usedCids = getOrderedUniqueCitations(cleanedAnswer);
  const usedCidSet = new Set(usedCids);
  const usedCitations = citations.filter(c => usedCidSet.has(c.cid));
  const orderedCitations = reorderByFirstAppearance(usedCids, usedCitations);

  return { cleanedAnswer, removed, orderedCitations, usedCids };
}

/** Build final validation result */
function buildValidationResult(
  cleanedAnswer: string,
  validatedCitations: Citation[],
  removed: string[],
  droppedCitations: string[] = [],
  suspiciousCitations: string[] = [],
  overlapScores: Map<string, number> = new Map()
): ValidationResult {
  return {
    validatedAnswer: cleanedAnswer,
    validatedCitations,
    invalidCitationsRemoved: removed,
    droppedCitations,
    suspiciousCitations,
    citationCoveragePct: calculateCitationCoverage(cleanedAnswer),
    allCitationsValid: removed.length === 0 && droppedCitations.length === 0,
    orderedByFirstAppearance: true,
    overlapScores,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Full citation validation pipeline
 *
 * Performs all citation validation steps:
 * 1. Remove invalid citations (not in source list)
 * 2. Clean formatting (duplicate citations, spacing)
 * 3. Reorder by first appearance
 * 4. Optionally verify overlap relevance
 * 5. Calculate coverage metrics
 */
export function validateCitationsWithChunks(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[],
  options: ValidationOptions = {}
): ValidationResult {
  const {
    strictMode = true,
    minOverlapScore = DEFAULT_MIN_OVERLAP_SCORE,
    verifyRelevance = true,
    requestId = 'unknown'
  } = options;

  const { cleanedAnswer, removed, orderedCitations } = performBaseValidation(
    answer, citations, requestId
  );

  // Step 4: Verify overlap relevance (optional)
  if (!verifyRelevance || orderedCitations.length === 0) {
    return buildValidationResult(cleanedAnswer, orderedCitations, removed);
  }

  const relevanceResult = verifyCitationRelevance(cleanedAnswer, orderedCitations, chunks, {
    strictMode,
    minOverlapScore,
  });

  if (relevanceResult.droppedCitations.length > 0) {
    logWarn('Dropped unsupported citations (low keyword overlap)', {
      requestId,
      droppedCitations: relevanceResult.droppedCitations,
      threshold: minOverlapScore,
    });
  }

  return buildValidationResult(
    cleanedAnswer,
    relevanceResult.validCitations,
    removed,
    relevanceResult.droppedCitations,
    relevanceResult.suspiciousCitations,
    relevanceResult.overlapScores
  );
}

/**
 * Simple citation validation (backwards compatible)
 * Use validateCitationsWithChunks for full pipeline with overlap verification
 */
export function validateCitations(
  answer: string,
  citations: Citation[],
  requestId: string
): ValidationResult {
  const { cleanedAnswer, removed, orderedCitations } = performBaseValidation(
    answer, citations, requestId
  );
  return buildValidationResult(cleanedAnswer, orderedCitations, removed);
}

/** Check if answer needs regeneration due to low citation coverage */
export function needsRegeneration(
  coveragePct: number,
  threshold: number = DEFAULT_COVERAGE_THRESHOLD
): boolean {
  return coveragePct < threshold;
}

/** Calculate source utilization: % of available sources that were cited */
export function calculateSourceUtilization(
  usedCitationCount: number,
  totalSourceCount: number
): number {
  if (totalSourceCount === 0) return 100;
  return Math.round((usedCitationCount / totalSourceCount) * 100);
}
