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

import { logWarn, logInfo } from './utils';
import { Citation, ScoredChunk } from './types';

// Re-export Citation type for convenience
export type { Citation } from './types';

// Configuration for overlap verification
const DEFAULT_MIN_OVERLAP_SCORE = 0.15;  // Min keyword overlap for validity

/**
 * Result from citation validation pipeline
 */
export interface ValidationResult {
  validatedAnswer: string;
  validatedCitations: Citation[];
  invalidCitationsRemoved: string[];
  droppedCitations: string[];        // Citations dropped due to low overlap
  suspiciousCitations: string[];     // Citations with low but non-zero overlap
  citationCoveragePct: number;
  allCitationsValid: boolean;
  orderedByFirstAppearance: boolean;
  overlapScores: Map<string, number>;  // Overlap scores for each citation
}

/**
 * Options for citation validation
 */
export interface ValidationOptions {
  strictMode?: boolean;           // Drop citations below overlap threshold
  minOverlapScore?: number;       // Min overlap score (default: 0.15)
  verifyRelevance?: boolean;      // Whether to verify overlap (default: true)
  requestId?: string;             // For logging
}

/**
 * Parse citation tokens from answer text
 * Returns array of cid strings (e.g., "N1", "N2")
 */
export function parseCitationTokens(answer: string): string[] {
  const pattern = /\[N(\d+)\]/g;
  const tokens: string[] = [];
  let match;
  while ((match = pattern.exec(answer)) !== null) {
    tokens.push(`N${match[1]}`);
  }
  return tokens;
}

/**
 * Get unique citation IDs in order of first appearance
 */
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

/**
 * Remove invalid citation tokens from answer text while preserving formatting
 */
export function removeInvalidCitations(
  answer: string,
  validCids: Set<string>
): { cleaned: string; removed: string[] } {
  const removed: string[] = [];

  const cleaned = answer.replace(/\[N(\d+)\]/g, (match, num) => {
    const cid = `N${num}`;
    if (validCids.has(cid)) {
      return match; // Keep valid citation
    } else {
      removed.push(cid);
      return ''; // Remove invalid citation
    }
  });

  // Clean up extra spaces/tabs without destroying newlines
  const normalized = cleaned
    .replace(/[ \t]+/g, ' ')         // Collapse multiple spaces/tabs to single space
    .replace(/\n{3,}/g, '\n\n')      // Normalize multiple newlines to double
    .replace(/[ \t]+$/gm, '')        // Trim trailing whitespace from each line
    .trim();

  return { cleaned: normalized, removed };
}

/**
 * Calculate citation coverage: % of factual sentences with citations
 */
export function calculateCitationCoverage(answer: string): number {
  // Split into sentences
  const sentences = answer
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15); // Substantial sentences only

  if (sentences.length === 0) return 100;

  // Count sentences with at least one citation
  const citedCount = sentences.filter(s => /\[N\d+\]/.test(s)).length;

  return Math.round((citedCount / sentences.length) * 100);
}

/**
 * Clean up citation formatting issues in answer while preserving newlines
 */
export function cleanCitationFormatting(answer: string): string {
  return answer
    // Remove duplicate adjacent citations [N1][N1] -> [N1]
    .replace(/(\[N\d+\])(\s*\1)+/g, '$1')
    // Clean up spaces around citations: "word [N1] ." -> "word [N1]."
    .replace(/\s+([.!?,;:])/g, '$1')
    // Collapse multiple spaces/tabs on same line (preserve newlines)
    .replace(/[ \t]+/g, ' ')
    // Normalize multiple consecutive newlines to double newline (paragraph break)
    .replace(/\n{3,}/g, '\n\n')
    // Trim trailing whitespace from each line
    .replace(/[ \t]+$/gm, '')
    // Remove any leftover empty brackets
    .replace(/\[\s*\]/g, '')
    .trim();
}

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'and', 'or', 'but', 'if', 'this', 'that', 'these', 'those', 'it',
  'based', 'notes', 'according', 'mentioned', 'stated', 'using', 'used'
]);

/**
 * Extract keywords from text for overlap verification
 */
export function extractVerificationKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/\[N\d+\]/g, '') // Remove citation markers
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word))
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

  const minSize = Math.min(set1.size, set2.size);
  return intersection / minSize;
}

/**
 * Verify citation relevance using keyword overlap
 * Returns citations that have sufficient keyword overlap with the answer
 */
export function verifyCitationRelevance(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[],
  options: { strictMode?: boolean; minOverlapScore?: number } = {}
): {
  validCitations: Citation[];
  droppedCitations: string[];
  suspiciousCitations: string[];
  overlapScores: Map<string, number>;
} {
  const { strictMode = true, minOverlapScore = DEFAULT_MIN_OVERLAP_SCORE } = options;

  const answerKeywords = extractVerificationKeywords(answer);
  const validCitations: Citation[] = [];
  const droppedCitations: string[] = [];
  const suspiciousCitations: string[] = [];
  const overlapScores = new Map<string, number>();

  for (const citation of citations) {
    // Find the full chunk text for this citation
    const chunk = chunks.find(c => c.chunkId === citation.chunkId);
    const sourceText = chunk?.text || citation.snippet;
    const sourceKeywords = extractVerificationKeywords(sourceText);

    // Calculate overlap score (0 to 1)
    const overlapScore = calculateOverlapScore(answerKeywords, sourceKeywords);
    overlapScores.set(citation.cid, overlapScore);

    if (overlapScore >= minOverlapScore) {
      validCitations.push(citation);
    } else if (overlapScore === 0 && strictMode) {
      droppedCitations.push(citation.cid);
    } else if (overlapScore < minOverlapScore && strictMode) {
      droppedCitations.push(citation.cid);
    } else {
      validCitations.push(citation);
      if (overlapScore < minOverlapScore * 0.5) {
        suspiciousCitations.push(citation.cid);
      }
    }
  }

  return { validCitations, droppedCitations, suspiciousCitations, overlapScores };
}

/**
 * Full citation validation pipeline
 *
 * Performs all citation validation steps:
 * 1. Remove invalid citations (not in source list)
 * 2. Clean formatting (duplicate citations, spacing)
 * 3. Reorder by first appearance
 * 4. Optionally verify overlap relevance
 * 5. Calculate coverage metrics
 *
 * @param answer - The LLM answer text
 * @param citations - Available citations from sources
 * @param chunks - Full chunk data for overlap verification
 * @param options - Validation options
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

  // Build map of valid cids
  const validCids = new Set(citations.map(c => c.cid));

  // Step 1: Remove invalid citations
  const { cleaned: cleanedInvalid, removed } = removeInvalidCitations(answer, validCids);

  if (removed.length > 0) {
    logWarn('Removed invalid citations from answer', {
      requestId,
      removedCount: removed.length,
      removedCids: removed,
    });
  }

  // Step 2: Clean formatting
  const cleanedAnswer = cleanCitationFormatting(cleanedInvalid);

  // Step 3: Get citations actually used in the answer (in order)
  const usedCids = getOrderedUniqueCitations(cleanedAnswer);
  const usedCidSet = new Set(usedCids);

  // Filter citations to only those actually cited
  let usedCitations = citations.filter(c => usedCidSet.has(c.cid));

  // Reorder by first appearance
  usedCitations = usedCids
    .map(cid => usedCitations.find(c => c.cid === cid))
    .filter((c): c is Citation => c !== undefined);

  // Step 4: Verify overlap relevance
  let droppedCitations: string[] = [];
  let suspiciousCitations: string[] = [];
  let overlapScores = new Map<string, number>();

  if (verifyRelevance && usedCitations.length > 0) {
    const verifyResult = verifyCitationRelevance(cleanedAnswer, usedCitations, chunks, {
      strictMode,
      minOverlapScore,
    });

    usedCitations = verifyResult.validCitations;
    droppedCitations = verifyResult.droppedCitations;
    suspiciousCitations = verifyResult.suspiciousCitations;
    overlapScores = verifyResult.overlapScores;

    if (droppedCitations.length > 0) {
      logWarn('Dropped unsupported citations (low keyword overlap)', {
        requestId,
        droppedCitations,
        threshold: minOverlapScore,
      });
    }
  }

  // Step 5: Calculate coverage
  const coveragePct = calculateCitationCoverage(cleanedAnswer);

  return {
    validatedAnswer: cleanedAnswer,
    validatedCitations: usedCitations,
    invalidCitationsRemoved: removed,
    droppedCitations,
    suspiciousCitations,
    citationCoveragePct: coveragePct,
    allCitationsValid: removed.length === 0 && droppedCitations.length === 0,
    orderedByFirstAppearance: true,
    overlapScores,
  };
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
  // Use simplified validation without chunk data (no overlap verification)
  const validCids = new Set(citations.map(c => c.cid));
  const { cleaned, removed } = removeInvalidCitations(answer, validCids);

  if (removed.length > 0) {
    logWarn('Removed invalid citations from answer', {
      requestId,
      removedCount: removed.length,
      removedCids: removed,
    });
  }

  const cleanedAnswer = cleanCitationFormatting(cleaned);
  const usedCids = getOrderedUniqueCitations(cleanedAnswer);
  const usedCidSet = new Set(usedCids);
  const usedCitations = citations.filter(c => usedCidSet.has(c.cid));

  const orderedCitations = usedCids
    .map(cid => usedCitations.find(c => c.cid === cid))
    .filter((c): c is Citation => c !== undefined);

  const coveragePct = calculateCitationCoverage(cleanedAnswer);

  return {
    validatedAnswer: cleanedAnswer,
    validatedCitations: orderedCitations,
    invalidCitationsRemoved: removed,
    droppedCitations: [],
    suspiciousCitations: [],
    citationCoveragePct: coveragePct,
    allCitationsValid: removed.length === 0,
    orderedByFirstAppearance: true,
    overlapScores: new Map(),
  };
}

/**
 * Check if answer needs regeneration due to low citation coverage
 */
export function needsRegeneration(
  coveragePct: number,
  threshold: number = 50
): boolean {
  return coveragePct < threshold;
}

/**
 * Calculate source utilization: % of available sources that were cited
 */
export function calculateSourceUtilization(
  usedCitationCount: number,
  totalSourceCount: number
): number {
  if (totalSourceCount === 0) return 100;
  return Math.round((usedCitationCount / totalSourceCount) * 100);
}

