/**
 * AuroraNotes API - Claim-Level Citation Anchoring
 *
 * Implements fine-grained claim extraction and source matching:
 * 1. Extract individual claims from generated responses
 * 2. Match each claim to source chunks using semantic similarity
 * 3. Verify that citations actually support the claims they're attached to
 * 4. Flag or repair misattributed citations
 *
 * This ensures each factual claim is properly grounded in source material.
 */

import { ScoredChunk } from './types';
import { logInfo, logWarn } from './utils';

// =============================================================================
// Constants
// =============================================================================

// Configuration
const CLAIM_ANCHORING_CONFIG = {
  enabled: true,
  minClaimLength: 10,
  maxClaimLength: 500,
  semanticMatchThreshold: 0.65,
  keywordOverlapWeight: 0.3,
  semanticWeight: 0.7,
  requireExplicitSupport: true,
};

// Thresholds
const SUPPORT_THRESHOLD_MULTIPLIER = 0.5;
const PROCEDURAL_MATCH_THRESHOLD = 0.5;
const CLAIM_TEXT_PREVIEW_LENGTH = 100;
const MIN_KEYWORD_LENGTH = 2;

// Pre-compiled regex patterns
const SENTENCE_PATTERN = /[^.!?]+[.!?]+/g;
const CITATION_PATTERN = /\[N(\d+)\]/g;
const MISATTRIBUTION_PATTERN = /Citation (N\d+)/;
const NON_WORD_CHARS = /[^\w\s]/g;

// Claim classification patterns
const DEFINITION_PATTERNS = [' is defined as ', ' refers to ', ' means '];
const DEFINITION_REGEX = /^[a-z]+ is (a|an|the) /;
const PROCEDURAL_PATTERNS = ['to do this', 'you can ', 'you should ', 'steps to '];
const PROCEDURAL_REGEX = /^(first|then|next|finally),? /;
const OPINION_PATTERNS = ['i think', 'in my opinion', 'it seems', 'arguably'];

// Stopwords for keyword extraction
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
  'this', 'that', 'these', 'those', 'it', 'its'
]);

// =============================================================================
// Types
// =============================================================================

/** Claim type classification */
export type ClaimType = 'factual' | 'opinion' | 'procedural' | 'definition';

/** Extracted claim from response */
export interface ExtractedClaim {
  text: string;
  startIndex: number;
  endIndex: number;
  citationIds: string[];
  claimType: ClaimType;
}

/** Claim verification result */
export interface ClaimVerification {
  claim: ExtractedClaim;
  isSupported: boolean;
  supportingChunks: ScoredChunk[];
  matchScore: number;
  suggestedCitations: string[];
  issues: string[];
}

/** Overall anchoring result */
export interface AnchoringResult {
  claims: ClaimVerification[];
  overallScore: number;
  unsupportedClaims: ExtractedClaim[];
  misattributedCitations: string[];
  repairSuggestions: RepairSuggestion[];
}

/** Suggestion for repairing citation issues */
export interface RepairSuggestion {
  claimText: string;
  issue: string;
  suggestedFix: string;
  confidence: number;
}

// =============================================================================
// Keyword Extraction Helpers
// =============================================================================

/** Extract keywords from text for matching */
function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(NON_WORD_CHARS, '')
      .split(/\s+/)
      .filter(w => w.length > MIN_KEYWORD_LENGTH && !STOPWORDS.has(w))
  );
}

/** Calculate keyword overlap between claim and chunk (0-1) */
function calculateKeywordOverlap(claim: string, chunkText: string): number {
  const claimKeywords = extractKeywords(claim);
  const chunkKeywords = extractKeywords(chunkText);

  if (claimKeywords.size === 0) return 0;

  let overlap = 0;
  for (const kw of claimKeywords) {
    if (chunkKeywords.has(kw)) overlap++;
  }

  return overlap / claimKeywords.size;
}

// =============================================================================
// Claim Classification
// =============================================================================

/** Check if text matches any pattern in list */
function matchesAnyPattern(text: string, patterns: string[]): boolean {
  return patterns.some(p => text.includes(p));
}

/** Classify the type of claim */
function classifyClaimType(sentence: string): ClaimType {
  const lower = sentence.toLowerCase();

  if (matchesAnyPattern(lower, DEFINITION_PATTERNS) || DEFINITION_REGEX.test(lower)) {
    return 'definition';
  }
  if (matchesAnyPattern(lower, PROCEDURAL_PATTERNS) || PROCEDURAL_REGEX.test(lower)) {
    return 'procedural';
  }
  if (matchesAnyPattern(lower, OPINION_PATTERNS)) {
    return 'opinion';
  }
  return 'factual';
}

/** Extract citation IDs from a sentence */
function extractCitationIds(sentence: string): string[] {
  // Reset lastIndex for global regex
  CITATION_PATTERN.lastIndex = 0;
  const ids: string[] = [];
  let match;
  while ((match = CITATION_PATTERN.exec(sentence)) !== null) {
    ids.push(`N${match[1]}`);
  }
  return ids;
}

// =============================================================================
// Claim Extraction
// =============================================================================

/** Extract claims from response text using sentence boundaries */
export function extractClaims(responseText: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];

  // Reset lastIndex for global regex
  SENTENCE_PATTERN.lastIndex = 0;
  let match;

  while ((match = SENTENCE_PATTERN.exec(responseText)) !== null) {
    const sentence = match[0].trim();
    const { minClaimLength, maxClaimLength } = CLAIM_ANCHORING_CONFIG;

    // Skip if outside valid length range
    if (sentence.length < minClaimLength || sentence.length > maxClaimLength) {
      continue;
    }

    claims.push({
      text: sentence,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      citationIds: extractCitationIds(sentence),
      claimType: classifyClaimType(sentence),
    });
  }

  return claims;
}

// =============================================================================
// Chunk Matching
// =============================================================================

/** Calculate combined score for a chunk matching a claim */
function calculateCombinedScore(claimText: string, chunk: ScoredChunk): number {
  const { keywordOverlapWeight, semanticWeight } = CLAIM_ANCHORING_CONFIG;
  const keywordScore = calculateKeywordOverlap(claimText, chunk.text);
  const semanticScore = chunk.score;
  return keywordOverlapWeight * keywordScore + semanticWeight * semanticScore;
}

/** Find the best matching chunk for a claim */
export function findBestMatchingChunk(
  claim: ExtractedClaim,
  chunks: ScoredChunk[]
): { chunk: ScoredChunk | null; score: number } {
  let bestChunk: ScoredChunk | null = null;
  let bestScore = 0;

  for (const chunk of chunks) {
    const score = calculateCombinedScore(claim.text, chunk);
    if (score > bestScore) {
      bestScore = score;
      bestChunk = chunk;
    }
  }

  return { chunk: bestChunk, score: bestScore };
}

// =============================================================================
// Claim Verification
// =============================================================================

/** Check if a claim type is inherently supported without source citation */
function isInherentlySupported(claimType: ClaimType, matchScore: number): boolean {
  return claimType === 'opinion' || (claimType === 'procedural' && matchScore > PROCEDURAL_MATCH_THRESHOLD);
}

/** Verify a single claim against source chunks */
export function verifyClaim(
  claim: ExtractedClaim,
  chunks: ScoredChunk[],
  chunkIdMap: Map<string, ScoredChunk>
): ClaimVerification {
  const issues: string[] = [];
  const supportingChunks: ScoredChunk[] = [];
  const suggestedCitations: string[] = [];
  const supportThreshold = CLAIM_ANCHORING_CONFIG.semanticMatchThreshold * SUPPORT_THRESHOLD_MULTIPLIER;

  // Check if cited chunks actually support this claim
  for (const citId of claim.citationIds) {
    const chunk = chunkIdMap.get(citId);
    if (!chunk) {
      issues.push(`Citation ${citId} not found in source chunks`);
      continue;
    }

    const keywordScore = calculateKeywordOverlap(claim.text, chunk.text);
    if (keywordScore >= supportThreshold) {
      supportingChunks.push(chunk);
    } else {
      issues.push(`Citation ${citId} may not directly support this claim (overlap: ${(keywordScore * 100).toFixed(0)}%)`);
    }
  }

  // Find best matching chunk
  const { chunk: bestMatch, score: matchScore } = findBestMatchingChunk(claim, chunks);

  // Suggest citation if match is good enough
  if (bestMatch && matchScore >= CLAIM_ANCHORING_CONFIG.semanticMatchThreshold) {
    for (const [id, c] of chunkIdMap.entries()) {
      if (c === bestMatch && !suggestedCitations.includes(id)) {
        suggestedCitations.push(id);
      }
    }
  }

  // Determine if claim is supported
  const isSupported = supportingChunks.length > 0 || isInherentlySupported(claim.claimType, matchScore);

  if (!isSupported && claim.claimType === 'factual') {
    issues.push('Factual claim lacks sufficient source support');
  }

  return { claim, isSupported, supportingChunks, matchScore, suggestedCitations, issues };
}

// =============================================================================
// Anchoring Pipeline
// =============================================================================

/** Build chunk ID map from chunks array */
function buildChunkIdMap(chunks: ScoredChunk[]): Map<string, ScoredChunk> {
  return new Map(chunks.map((chunk, idx) => [`N${idx + 1}`, chunk]));
}

/** Extract misattributed citation from issue text */
function extractMisattributedCitation(issue: string): string | null {
  if (!issue.includes('may not directly support')) return null;
  const match = issue.match(MISATTRIBUTION_PATTERN);
  return match ? match[1] : null;
}

/** Truncate claim text for repair suggestion */
function truncateClaimText(text: string): string {
  return text.length > CLAIM_TEXT_PREVIEW_LENGTH
    ? text.substring(0, CLAIM_TEXT_PREVIEW_LENGTH) + '...'
    : text;
}

/** Process a single claim verification and collect results */
function processVerification(
  verification: ClaimVerification,
  unsupportedClaims: ExtractedClaim[],
  misattributedCitations: string[],
  repairSuggestions: RepairSuggestion[]
): void {
  if (!verification.isSupported) {
    unsupportedClaims.push(verification.claim);
  }

  // Check for misattributed citations
  for (const issue of verification.issues) {
    const citId = extractMisattributedCitation(issue);
    if (citId && !misattributedCitations.includes(citId)) {
      misattributedCitations.push(citId);
    }
  }

  // Generate repair suggestions
  if (verification.issues.length > 0 && verification.suggestedCitations.length > 0) {
    repairSuggestions.push({
      claimText: truncateClaimText(verification.claim.text),
      issue: verification.issues[0],
      suggestedFix: `Consider using citation ${verification.suggestedCitations[0]} instead`,
      confidence: verification.matchScore,
    });
  }
}

/** Anchor all claims in a response to source chunks */
export function anchorClaims(responseText: string, chunks: ScoredChunk[]): AnchoringResult {
  const claims = extractClaims(responseText);
  const chunkIdMap = buildChunkIdMap(chunks);

  const verifications: ClaimVerification[] = [];
  const unsupportedClaims: ExtractedClaim[] = [];
  const misattributedCitations: string[] = [];
  const repairSuggestions: RepairSuggestion[] = [];

  for (const claim of claims) {
    const verification = verifyClaim(claim, chunks, chunkIdMap);
    verifications.push(verification);
    processVerification(verification, unsupportedClaims, misattributedCitations, repairSuggestions);
  }

  const supportedCount = verifications.filter(v => v.isSupported).length;
  const overallScore = verifications.length > 0 ? supportedCount / verifications.length : 1;

  logInfo(`Claim anchoring: ${supportedCount}/${verifications.length} claims supported, score: ${overallScore.toFixed(2)}`);

  if (misattributedCitations.length > 0) {
    logWarn(`Claim anchoring: ${misattributedCitations.length} potentially misattributed citations`);
  }

  return { claims: verifications, overallScore, unsupportedClaims, misattributedCitations, repairSuggestions };
}

// =============================================================================
// Configuration API
// =============================================================================

/** Get claim anchoring configuration (returns a copy) */
export function getClaimAnchoringConfig() {
  return { ...CLAIM_ANCHORING_CONFIG };
}

/** Check if claim anchoring is enabled */
export function isClaimAnchoringEnabled(): boolean {
  return CLAIM_ANCHORING_CONFIG.enabled;
}
