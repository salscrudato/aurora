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

import { ScoredChunk, Citation } from './types';
import { logInfo, logWarn, logError } from './utils';

// Configuration
const CLAIM_ANCHORING_CONFIG = {
  enabled: true,
  minClaimLength: 10,               // Minimum characters for a valid claim
  maxClaimLength: 500,              // Maximum characters for a claim
  semanticMatchThreshold: 0.65,     // Min similarity for claim-source match
  keywordOverlapWeight: 0.3,        // Weight for keyword overlap in matching
  semanticWeight: 0.7,              // Weight for semantic similarity
  requireExplicitSupport: true,     // Require explicit evidence for claims
};

/**
 * Extracted claim from response
 */
export interface ExtractedClaim {
  text: string;                     // The claim text
  startIndex: number;               // Position in original response
  endIndex: number;
  citationIds: string[];            // Citations attached to this claim
  claimType: 'factual' | 'opinion' | 'procedural' | 'definition';
}

/**
 * Claim verification result
 */
export interface ClaimVerification {
  claim: ExtractedClaim;
  isSupported: boolean;
  supportingChunks: ScoredChunk[];  // Chunks that support this claim
  matchScore: number;               // How well the claim matches sources
  suggestedCitations: string[];     // Recommended citation IDs
  issues: string[];                 // Any problems found
}

/**
 * Overall anchoring result
 */
export interface AnchoringResult {
  claims: ClaimVerification[];
  overallScore: number;             // 0-1 how well grounded the response is
  unsupportedClaims: ExtractedClaim[];
  misattributedCitations: string[];
  repairSuggestions: RepairSuggestion[];
}

/**
 * Suggestion for repairing citation issues
 */
export interface RepairSuggestion {
  claimText: string;
  issue: string;
  suggestedFix: string;
  confidence: number;
}

/**
 * Extract claims from response text
 * Uses sentence boundaries and citation markers to identify claims
 */
export function extractClaims(responseText: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];

  // Split by sentence boundaries while preserving positions
  const sentencePattern = /[^.!?]+[.!?]+/g;
  let match;

  while ((match = sentencePattern.exec(responseText)) !== null) {
    const sentence = match[0].trim();
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;

    // Skip if too short or too long
    if (sentence.length < CLAIM_ANCHORING_CONFIG.minClaimLength ||
        sentence.length > CLAIM_ANCHORING_CONFIG.maxClaimLength) {
      continue;
    }

    // Extract citation IDs from this sentence
    const citationPattern = /\[N(\d+)\]/g;
    const citationIds: string[] = [];
    let citMatch;
    while ((citMatch = citationPattern.exec(sentence)) !== null) {
      citationIds.push(`N${citMatch[1]}`);
    }

    // Classify claim type
    const claimType = classifyClaimType(sentence);

    claims.push({
      text: sentence,
      startIndex,
      endIndex,
      citationIds,
      claimType,
    });
  }

  return claims;
}

/**
 * Classify the type of claim
 */
function classifyClaimType(sentence: string): ExtractedClaim['claimType'] {
  const lower = sentence.toLowerCase();

  // Definition patterns
  if (lower.includes(' is defined as ') ||
      lower.includes(' refers to ') ||
      lower.includes(' means ') ||
      /^[a-z]+ is (a|an|the) /.test(lower)) {
    return 'definition';
  }

  // Procedural patterns
  if (lower.includes('to do this') ||
      lower.includes('you can ') ||
      lower.includes('you should ') ||
      lower.includes('steps to ') ||
      /^(first|then|next|finally),? /.test(lower)) {
    return 'procedural';
  }

  // Opinion patterns
  if (lower.includes('i think') ||
      lower.includes('in my opinion') ||
      lower.includes('it seems') ||
      lower.includes('arguably')) {
    return 'opinion';
  }

  // Default to factual
  return 'factual';
}

/**
 * Calculate keyword overlap between claim and chunk
 */
function calculateKeywordOverlap(claim: string, chunkText: string): number {
  const extractKeywords = (text: string): Set<string> => {
    const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of',
      'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then',
      'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
      'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
      'this', 'that', 'these', 'those', 'it', 'its']);

    return new Set(
      text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopwords.has(w))
    );
  };

  const claimKeywords = extractKeywords(claim);
  const chunkKeywords = extractKeywords(chunkText);

  if (claimKeywords.size === 0) return 0;

  let overlap = 0;
  for (const kw of claimKeywords) {
    if (chunkKeywords.has(kw)) overlap++;
  }

  return overlap / claimKeywords.size;
}

/**
 * Find the best matching chunk for a claim
 */
export function findBestMatchingChunk(
  claim: ExtractedClaim,
  chunks: ScoredChunk[]
): { chunk: ScoredChunk | null; score: number } {
  let bestChunk: ScoredChunk | null = null;
  let bestScore = 0;

  for (const chunk of chunks) {
    // Calculate keyword overlap
    const keywordScore = calculateKeywordOverlap(claim.text, chunk.text);

    // Use chunk's existing score as a proxy for semantic relevance
    // In production, you'd compute actual semantic similarity here
    const semanticScore = chunk.score;

    // Combined score
    const combinedScore =
      CLAIM_ANCHORING_CONFIG.keywordOverlapWeight * keywordScore +
      CLAIM_ANCHORING_CONFIG.semanticWeight * semanticScore;

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestChunk = chunk;
    }
  }

  return { chunk: bestChunk, score: bestScore };
}

/**
 * Verify a single claim against source chunks
 */
export function verifyClaim(
  claim: ExtractedClaim,
  chunks: ScoredChunk[],
  chunkIdMap: Map<string, ScoredChunk>
): ClaimVerification {
  const issues: string[] = [];
  const supportingChunks: ScoredChunk[] = [];
  const suggestedCitations: string[] = [];

  // Check if cited chunks actually support this claim
  for (const citId of claim.citationIds) {
    const chunk = chunkIdMap.get(citId);
    if (!chunk) {
      issues.push(`Citation ${citId} not found in source chunks`);
      continue;
    }

    const keywordScore = calculateKeywordOverlap(claim.text, chunk.text);
    if (keywordScore >= CLAIM_ANCHORING_CONFIG.semanticMatchThreshold * 0.5) {
      supportingChunks.push(chunk);
    } else {
      issues.push(`Citation ${citId} may not directly support this claim (overlap: ${(keywordScore * 100).toFixed(0)}%)`);
    }
  }

  // Find best matching chunk if no citations or citations don't match
  const { chunk: bestMatch, score: matchScore } = findBestMatchingChunk(claim, chunks);

  if (bestMatch && matchScore >= CLAIM_ANCHORING_CONFIG.semanticMatchThreshold) {
    // Find the citation ID for this chunk
    for (const [id, c] of chunkIdMap.entries()) {
      if (c === bestMatch && !suggestedCitations.includes(id)) {
        suggestedCitations.push(id);
      }
    }
  }

  // Determine if claim is supported
  const isSupported = supportingChunks.length > 0 ||
    (claim.claimType === 'opinion') ||
    (claim.claimType === 'procedural' && matchScore > 0.5);

  if (!isSupported && claim.claimType === 'factual') {
    issues.push('Factual claim lacks sufficient source support');
  }

  return {
    claim,
    isSupported,
    supportingChunks,
    matchScore,
    suggestedCitations,
    issues,
  };
}

/**
 * Anchor all claims in a response to source chunks
 */
export function anchorClaims(
  responseText: string,
  chunks: ScoredChunk[]
): AnchoringResult {
  // Extract claims
  const claims = extractClaims(responseText);

  // Build chunk ID map
  const chunkIdMap = new Map<string, ScoredChunk>();
  chunks.forEach((chunk, idx) => {
    chunkIdMap.set(`N${idx + 1}`, chunk);
  });

  // Verify each claim
  const verifications: ClaimVerification[] = [];
  const unsupportedClaims: ExtractedClaim[] = [];
  const misattributedCitations: string[] = [];
  const repairSuggestions: RepairSuggestion[] = [];

  for (const claim of claims) {
    const verification = verifyClaim(claim, chunks, chunkIdMap);
    verifications.push(verification);

    if (!verification.isSupported) {
      unsupportedClaims.push(claim);
    }

    // Check for misattributed citations
    for (const issue of verification.issues) {
      if (issue.includes('may not directly support')) {
        const citMatch = issue.match(/Citation (N\d+)/);
        if (citMatch && !misattributedCitations.includes(citMatch[1])) {
          misattributedCitations.push(citMatch[1]);
        }
      }
    }

    // Generate repair suggestions
    if (verification.issues.length > 0 && verification.suggestedCitations.length > 0) {
      repairSuggestions.push({
        claimText: claim.text.substring(0, 100) + (claim.text.length > 100 ? '...' : ''),
        issue: verification.issues[0],
        suggestedFix: `Consider using citation ${verification.suggestedCitations[0]} instead`,
        confidence: verification.matchScore,
      });
    }
  }

  // Calculate overall score
  const supportedCount = verifications.filter(v => v.isSupported).length;
  const overallScore = verifications.length > 0 ? supportedCount / verifications.length : 1;

  logInfo(`Claim anchoring: ${supportedCount}/${verifications.length} claims supported, score: ${overallScore.toFixed(2)}`);

  if (misattributedCitations.length > 0) {
    logWarn(`Claim anchoring: ${misattributedCitations.length} potentially misattributed citations`);
  }

  return {
    claims: verifications,
    overallScore,
    unsupportedClaims,
    misattributedCitations,
    repairSuggestions,
  };
}

/**
 * Configuration getter
 */
export function getClaimAnchoringConfig() {
  return { ...CLAIM_ANCHORING_CONFIG };
}

/**
 * Check if claim anchoring is enabled
 */
export function isClaimAnchoringEnabled(): boolean {
  return CLAIM_ANCHORING_CONFIG.enabled;
}

