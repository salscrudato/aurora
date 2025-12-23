/**
 * AuroraNotes API - Unified Citation Pipeline v2
 *
 * A single-pass citation verification system that ensures:
 * 1. Every citation token [N#] in the answer maps to a valid source
 * 2. Citations are scored for relevance using lexical overlap
 * 3. Weak/invalid citations are removed or flagged
 * 4. Contract compliance: answer citations ⊆ returned sources
 *
 * This is the CANONICAL citation processing module.
 * All citation validation flows through this pipeline.
 *
 * Design principles:
 * - Single pass for performance (no multi-pass verification)
 * - Lexical overlap as primary signal (fast, reliable)
 * - Semantic scoring optional (for enhanced accuracy)
 * - Contract-first: guarantee citation-source consistency
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

// Pipeline configuration
const PIPELINE_CONFIG = {
  minLexicalOverlap: 0.12,     // Minimum keyword overlap for valid citation
  minConfidenceThreshold: 0.35, // Below this, citation is flagged as weak
  enableSemanticCheck: false,   // Semantic scoring (disabled by default for speed)
  strictMode: true,             // Remove weak citations from response
  warnOnLowCoverage: true,      // Log warning if < 50% of sources cited
  enableHallucinationCheck: true, // Check for potential hallucinations
};

// Hallucination detection patterns - claims that are likely hallucinated
const HALLUCINATION_PATTERNS = [
  // Specific numbers/dates without source support
  /\b(exactly|precisely|specifically)\s+\d+/i,
  // False certainty markers when sources are weak
  /\b(definitely|certainly|absolutely|always|never)\b/i,
  // Made-up quotes
  /"[^"]{50,}"(?!\s*\[N\d+\])/,  // Long quotes without citation
];

// Common LLM fabrication indicators
const FABRICATION_INDICATORS = [
  'as mentioned in your notes',
  'your notes indicate',
  'according to your notes',
].map(s => s.toLowerCase());

// ============================================
// Core Types
// ============================================

/**
 * Citation validation result for a single citation
 */
export interface CitationValidation {
  cid: string;
  isValid: boolean;
  lexicalScore: number;
  semanticScore?: number;
  combinedScore: number;
  matchQuality: 'strong' | 'moderate' | 'weak' | 'none';
  reason?: string;
}

/**
 * Complete pipeline result - the contract for citation processing
 */
export interface PipelineResult {
  // Validated response (citations cleaned/removed as needed)
  validatedAnswer: string;
  // Citations that passed validation (ordered by first appearance)
  validatedCitations: Citation[];

  // Validation details
  citationValidations: CitationValidation[];
  overallConfidence: number;      // 0-1 aggregate confidence
  citationAccuracy: number;       // % of answer citations that are valid

  // Quality signals
  invalidCitationsRemoved: string[];  // CIDs removed from answer
  weakCitations: string[];            // CIDs with low but passing scores
  hasContradictions: boolean;         // Detected contradictions
  potentialHallucinations: string[];  // Segments that may be hallucinated

  // Contract compliance
  contractCompliant: boolean;     // Every answer citation exists in sources
  danglingCitations: string[];    // Citations in answer not in sources

  // Timing
  processingTimeMs: number;
}

// ============================================
// Helper Functions
// ============================================

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'and', 'or', 'but', 'if', 'this', 'that', 'these', 'those', 'it',
  'based', 'notes', 'according', 'mentioned', 'stated', 'using', 'used',
]);

/**
 * Extract keywords from text for overlap calculation
 */
function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/\[N?\d+\]/g, '') // Remove citation markers
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/**
 * Detect potential hallucinations in the answer
 * Returns array of potentially hallucinated segments
 */
function detectPotentialHallucinations(
  answer: string,
  citationValidations: CitationValidation[]
): string[] {
  if (!PIPELINE_CONFIG.enableHallucinationCheck) return [];

  const hallucinations: string[] = [];
  const answerLower = answer.toLowerCase();

  // Check for fabrication indicators without valid citations nearby
  for (const indicator of FABRICATION_INDICATORS) {
    const idx = answerLower.indexOf(indicator);
    if (idx >= 0) {
      // Get the surrounding context (50 chars before/after)
      const start = Math.max(0, idx - 30);
      const end = Math.min(answer.length, idx + indicator.length + 50);
      const context = answer.slice(start, end);

      // Check if there's a valid citation in this context
      const citationMatch = context.match(/\[N(\d+)\]/);
      if (!citationMatch) {
        hallucinations.push(`Unsupported claim: "${context.trim()}"`);
      } else {
        // Check if the citation is actually valid
        const cid = `N${citationMatch[1]}`;
        const validation = citationValidations.find(v => v.cid === cid);
        if (validation && validation.matchQuality === 'none') {
          hallucinations.push(`Weakly supported: "${context.trim()}"`);
        }
      }
    }
  }

  // Check for specific claims that might be fabricated
  for (const pattern of HALLUCINATION_PATTERNS) {
    const match = answer.match(pattern);
    if (match) {
      hallucinations.push(`Potential fabrication: "${match[0].slice(0, 50)}..."`);
    }
  }

  return hallucinations.slice(0, 3); // Limit to top 3 concerns
}

/**
 * Extract all citation IDs from answer text
 * Returns array of cids in order of appearance (e.g., ["N1", "N2", "N1"])
 */
export function extractCitationIds(answer: string): string[] {
  const pattern = /\[N(\d+)\]/g;
  const cids: string[] = [];
  let match;
  while ((match = pattern.exec(answer)) !== null) {
    cids.push(`N${match[1]}`);
  }
  return cids;
}

/**
 * Get unique citation IDs in order of first appearance
 */
export function getUniqueCitationIds(answer: string): string[] {
  const cids = extractCitationIds(answer);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const cid of cids) {
    if (!seen.has(cid)) {
      seen.add(cid);
      unique.push(cid);
    }
  }
  return unique;
}

/**
 * Calculate lexical overlap between answer and source text
 * Uses Szymkiewicz–Simpson coefficient (overlap / min size)
 */
function calculateLexicalOverlap(answerText: string, sourceText: string): number {
  const answerWords = extractKeywords(answerText);
  const sourceWords = extractKeywords(sourceText);

  if (answerWords.size === 0 || sourceWords.size === 0) return 0;

  let intersection = 0;
  for (const word of answerWords) {
    if (sourceWords.has(word)) intersection++;
  }

  // Use min-based overlap (more lenient than Jaccard)
  const minSize = Math.min(answerWords.size, sourceWords.size);
  return intersection / minSize;
}

/**
 * Determine match quality based on lexical score
 */
function determineMatchQuality(score: number): CitationValidation['matchQuality'] {
  if (score >= 0.4) return 'strong';
  if (score >= 0.25) return 'moderate';
  if (score >= PIPELINE_CONFIG.minLexicalOverlap) return 'weak';
  return 'none';
}

/**
 * Remove citation markers from answer text
 */
function removeCitationMarker(answer: string, cid: string): string {
  // Remove [N#] pattern, handling spaces around it
  const pattern = new RegExp(`\\s*\\[${cid}\\]`, 'g');
  return answer.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Clean up citation formatting in answer
 */
function cleanCitationFormatting(answer: string): string {
  return answer
    // Remove duplicate adjacent citations [N1][N1] -> [N1]
    .replace(/(\[N\d+\])(\s*\1)+/g, '$1')
    // Clean up spaces around citations: "word [N1] ." -> "word [N1]."
    .replace(/\s+([.!?,;:])/g, '$1')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    // Remove empty brackets
    .replace(/\[\s*\]/g, '')
    .trim();
}

// ============================================
// Main Pipeline
// ============================================

/**
 * Validate a single citation against the answer and source
 */
function validateCitation(
  cid: string,
  citation: Citation,
  chunk: ScoredChunk | undefined,
  answer: string
): CitationValidation {
  // Get source text from chunk or citation snippet
  const sourceText = chunk?.text || citation.snippet;

  // Calculate lexical overlap between answer and source
  const lexicalScore = calculateLexicalOverlap(answer, sourceText);

  // Semantic scoring (optional, disabled by default for speed)
  let semanticScore: number | undefined;
  // Note: Semantic scoring would require async embedding generation
  // For now, we use lexical-only scoring for performance

  // Combined score (lexical only when semantic disabled)
  const combinedScore = lexicalScore;

  // Determine match quality
  const matchQuality = determineMatchQuality(combinedScore);

  // Determine if valid
  const isValid = matchQuality !== 'none';

  return {
    cid,
    isValid,
    lexicalScore: Math.round(lexicalScore * 1000) / 1000,
    semanticScore,
    combinedScore: Math.round(combinedScore * 1000) / 1000,
    matchQuality,
    reason: isValid ? undefined : `Low overlap score (${(lexicalScore * 100).toFixed(0)}%)`,
  };
}

/**
 * Main unified citation verification pipeline
 *
 * This is the CANONICAL entry point for citation processing.
 * It performs single-pass validation ensuring contract compliance:
 * - Every citation token in answer exists in returned sources
 * - Citations are scored for relevance
 * - Invalid/weak citations are removed (in strict mode)
 *
 * @param answer - The LLM-generated answer with [N#] citations
 * @param citations - Available citations from sources
 * @param chunks - Full chunk data for overlap verification
 * @param queryIntent - Optional query intent for context
 * @returns PipelineResult with validated answer and citations
 */
export async function runUnifiedCitationPipeline(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[],
  queryIntent?: QueryIntent
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Build lookup maps
  const citationMap = new Map(citations.map(c => [c.cid, c]));
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  // Extract all citation IDs from answer (in order of appearance)
  const answerCids = getUniqueCitationIds(answer);
  const validCidSet = new Set(citations.map(c => c.cid));

  // Check contract compliance: every answer citation must exist in sources
  const danglingCitations: string[] = [];
  for (const cid of answerCids) {
    if (!validCidSet.has(cid)) {
      danglingCitations.push(cid);
    }
  }

  // Validate each citation
  const citationValidations: CitationValidation[] = [];
  const invalidCitationsRemoved: string[] = [];
  const weakCitations: string[] = [];

  for (const cid of answerCids) {
    const citation = citationMap.get(cid);

    if (!citation) {
      // Dangling citation - not in sources
      citationValidations.push({
        cid,
        isValid: false,
        lexicalScore: 0,
        combinedScore: 0,
        matchQuality: 'none',
        reason: 'Citation not found in sources',
      });
      invalidCitationsRemoved.push(cid);
      continue;
    }

    // Find matching chunk
    const chunk = chunkMap.get(citation.chunkId);

    // Validate citation
    const validation = validateCitation(cid, citation, chunk, answer);
    citationValidations.push(validation);

    if (!validation.isValid) {
      invalidCitationsRemoved.push(cid);
    } else if (validation.matchQuality === 'weak') {
      weakCitations.push(cid);
    }
  }

  // Build validated answer (remove invalid citations in strict mode)
  let validatedAnswer = answer;
  if (PIPELINE_CONFIG.strictMode) {
    for (const cid of invalidCitationsRemoved) {
      validatedAnswer = removeCitationMarker(validatedAnswer, cid);
    }
  }
  validatedAnswer = cleanCitationFormatting(validatedAnswer);

  // Build validated citations list (ordered by first appearance)
  const validCids = new Set(
    citationValidations
      .filter(v => v.isValid)
      .map(v => v.cid)
  );
  const validatedCitations = answerCids
    .filter(cid => validCids.has(cid))
    .map(cid => citationMap.get(cid)!)
    .filter(Boolean);

  // Calculate metrics
  const validCount = citationValidations.filter(v => v.isValid).length;
  const totalCount = citationValidations.length;
  const citationAccuracy = totalCount > 0 ? validCount / totalCount : 1;

  const avgScore = citationValidations.length > 0
    ? citationValidations.reduce((sum, v) => sum + v.combinedScore, 0) / citationValidations.length
    : 0;
  const overallConfidence = Math.round(avgScore * 1000) / 1000;

  // Contract compliance check
  const contractCompliant = danglingCitations.length === 0;

  // Log results
  if (invalidCitationsRemoved.length > 0) {
    logWarn('[UnifiedPipeline] Removed invalid citations', {
      removed: invalidCitationsRemoved,
      reason: 'Low overlap or not in sources',
    });
  }

  if (PIPELINE_CONFIG.warnOnLowCoverage && validatedCitations.length < citations.length * 0.5) {
    logWarn('[UnifiedPipeline] Low citation coverage', {
      used: validatedCitations.length,
      available: citations.length,
      coverage: `${Math.round((validatedCitations.length / citations.length) * 100)}%`,
    });
  }

  // Detect potential hallucinations
  const potentialHallucinations = detectPotentialHallucinations(answer, citationValidations);

  const processingTimeMs = Date.now() - startTime;

  return {
    validatedAnswer,
    validatedCitations,
    citationValidations,
    overallConfidence,
    citationAccuracy,
    invalidCitationsRemoved,
    weakCitations,
    hasContradictions: false, // Contradiction detection removed for simplicity
    potentialHallucinations,
    contractCompliant,
    danglingCitations,
    processingTimeMs,
  };
}

/**
 * Quick verification check - lighter weight than full pipeline
 * Use this for real-time feedback during streaming
 */
export function quickVerifyCitation(
  claimText: string,
  sourceText: string
): { isValid: boolean; confidence: number; matchQuality: string } {
  const lexicalScore = calculateLexicalOverlap(claimText, sourceText);
  const matchQuality = determineMatchQuality(lexicalScore);
  const isValid = matchQuality !== 'none';

  return {
    isValid,
    confidence: Math.round(lexicalScore * 1000) / 1000,
    matchQuality,
  };
}

/**
 * Get pipeline configuration (for debugging/testing)
 */
export function getPipelineConfig() {
  return { ...PIPELINE_CONFIG };
}

/**
 * Update pipeline configuration
 */
export function updatePipelineConfig(updates: Partial<typeof PIPELINE_CONFIG>) {
  Object.assign(PIPELINE_CONFIG, updates);
}

/**
 * Analyze contradictions between claim and source (simplified)
 * Kept for backwards compatibility with existing code
 */
export interface ContradictionAnalysis {
  hasContradiction: boolean;
  contradictionType?: 'negation' | 'antonym' | 'numerical' | 'semantic';
  confidence: number;
  explanation?: string;
}

export function analyzeContradiction(claim: string, source: string): ContradictionAnalysis {
  // Simplified contradiction detection - just check for obvious negation patterns
  const claimLower = claim.toLowerCase();
  const sourceLower = source.toLowerCase();

  const claimHasNot = /\bnot\b|\bn't\b/.test(claimLower);
  const sourceHasNot = /\bnot\b|\bn't\b/.test(sourceLower);

  // Check if one has negation and other doesn't, with sufficient overlap
  if (claimHasNot !== sourceHasNot) {
    const overlap = calculateLexicalOverlap(claim, source);
    if (overlap > 0.3) {
      return {
        hasContradiction: true,
        contradictionType: 'negation',
        confidence: 0.7,
        explanation: 'Claim and source have opposing negation',
      };
    }
  }

  return { hasContradiction: false, confidence: 0 };
}

