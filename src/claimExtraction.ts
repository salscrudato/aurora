/**
 * AuroraNotes API - Claim-Level Citation Extraction
 *
 * Extracts individual claims from LLM responses and matches them
 * to specific sources for precise per-claim citations.
 *
 * This enables:
 * - More granular citation accuracy verification
 * - Better source attribution at the claim level
 * - Identification of unsupported claims
 * - Improved response consistency
 */

import { Citation, ScoredChunk } from './types';
import { cosineSimilarity } from './utils';
import { generateQueryEmbedding, isEmbeddingsAvailable } from './embeddings';
import { logInfo, logWarn } from './utils';

/**
 * A single claim extracted from an LLM response
 */
export interface ExtractedClaim {
  id: string;
  text: string;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
  claimType: 'factual' | 'definitional' | 'procedural' | 'comparative' | 'opinion';
  citedSources: string[];  // CIDs from the original response
  confidence: number;
}

/**
 * A claim matched to its best supporting source
 */
export interface ClaimSourceMatch {
  claim: ExtractedClaim;
  bestMatch: {
    chunk: ScoredChunk;
    citation: Citation;
    matchScore: number;
    matchType: 'exact' | 'paraphrase' | 'inferred' | 'weak';
  } | null;
  alternativeMatches: Array<{
    chunk: ScoredChunk;
    citation: Citation;
    matchScore: number;
  }>;
  isSupported: boolean;
  supportConfidence: number;
}

/**
 * Classify the type of claim based on linguistic patterns
 */
function classifyClaimType(text: string): ExtractedClaim['claimType'] {
  const lowerText = text.toLowerCase();

  // Definitional claims (is, are, means, refers to)
  if (/\b(is|are|means|refers to|defined as|known as)\b/.test(lowerText)) {
    return 'definitional';
  }

  // Procedural claims (how to, steps, process)
  if (/\b(to|by|through|steps?|process|procedure|method)\b/.test(lowerText)) {
    return 'procedural';
  }

  // Comparative claims (more, less, better, worse, compared)
  if (/\b(more|less|better|worse|compared|than|versus|vs)\b/.test(lowerText)) {
    return 'comparative';
  }

  // Opinion indicators (may, might, could, suggests, appears)
  if (/\b(may|might|could|suggests?|appears?|seems?|likely|probably)\b/.test(lowerText)) {
    return 'opinion';
  }

  // Default to factual
  return 'factual';
}

/**
 * Extract individual claims from a response text
 */
export function extractClaims(responseText: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];

  // Split into sentences
  const sentencePattern = /[^.!?]+[.!?]+/g;
  const sentences = responseText.match(sentencePattern) || [];

  let currentOffset = 0;
  let claimId = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    const startOffset = responseText.indexOf(sentence, currentOffset);
    const endOffset = startOffset + sentence.length;
    currentOffset = endOffset;

    // Skip very short sentences or meta-sentences
    if (sentence.length < 15) continue;
    if (/^(note:|disclaimer:|however,|additionally,|furthermore,)$/i.test(sentence.trim())) continue;

    // Extract cited sources from this sentence
    const citedSources: string[] = [];
    const citationMatches = sentence.matchAll(/\[N?(\d+)\]/g);
    for (const match of citationMatches) {
      const cid = match[1].startsWith('N') ? match[1] : `N${match[1]}`;
      if (!citedSources.includes(cid)) {
        citedSources.push(cid);
      }
    }

    // Clean the claim text (remove citation markers)
    const cleanText = sentence.replace(/\s*\[N?\d+\]/g, '').trim();

    if (cleanText.length < 10) continue;

    claims.push({
      id: `claim_${claimId++}`,
      text: cleanText,
      sentenceIndex: i,
      startOffset,
      endOffset,
      claimType: classifyClaimType(cleanText),
      citedSources,
      confidence: citedSources.length > 0 ? 0.8 : 0.5,
    });
  }

  return claims;
}

/**
 * Calculate semantic similarity between claim and chunk
 */
async function calculateSemanticMatch(
  claimText: string,
  chunk: ScoredChunk
): Promise<number> {
  if (!isEmbeddingsAvailable() || !chunk.embedding) {
    return 0;
  }

  try {
    const claimEmbedding = await generateQueryEmbedding(claimText);
    return cosineSimilarity(claimEmbedding, chunk.embedding);
  } catch {
    return 0;
  }
}

/**
 * Calculate lexical overlap between claim and chunk
 */
function calculateLexicalMatch(claimText: string, chunkText: string): number {
  const claimWords = new Set(
    claimText.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );

  const chunkWords = new Set(
    chunkText.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );

  if (claimWords.size === 0) return 0;

  let matches = 0;
  for (const word of claimWords) {
    if (chunkWords.has(word)) matches++;
  }

  return matches / claimWords.size;
}

/**
 * Determine match type based on score
 */
function getMatchType(score: number): ClaimSourceMatch['bestMatch'] extends null ? never : NonNullable<ClaimSourceMatch['bestMatch']>['matchType'] {
  if (score >= 0.85) return 'exact';
  if (score >= 0.65) return 'paraphrase';
  if (score >= 0.45) return 'inferred';
  return 'weak';
}

/**
 * Match a single claim to the best supporting source
 */
export async function matchClaimToSources(
  claim: ExtractedClaim,
  chunks: ScoredChunk[],
  citations: Citation[],
  options: { useSemanticMatching?: boolean } = {}
): Promise<ClaimSourceMatch> {
  const { useSemanticMatching = true } = options;

  const citationMap = new Map(citations.map(c => [c.chunkId, c]));
  const matches: Array<{ chunk: ScoredChunk; citation: Citation; matchScore: number }> = [];

  for (const chunk of chunks) {
    const citation = citationMap.get(chunk.chunkId);
    if (!citation) continue;

    // Calculate combined match score
    let semanticScore = 0;
    if (useSemanticMatching) {
      semanticScore = await calculateSemanticMatch(claim.text, chunk);
    }

    const lexicalScore = calculateLexicalMatch(claim.text, chunk.text);

    // Weighted combination
    const matchScore = useSemanticMatching
      ? semanticScore * 0.6 + lexicalScore * 0.4
      : lexicalScore;

    matches.push({ chunk, citation, matchScore });
  }

  // Sort by match score
  matches.sort((a, b) => b.matchScore - a.matchScore);

  const bestMatch = matches[0];
  const isSupported = bestMatch && bestMatch.matchScore >= 0.45;

  return {
    claim,
    bestMatch: bestMatch ? {
      chunk: bestMatch.chunk,
      citation: bestMatch.citation,
      matchScore: bestMatch.matchScore,
      matchType: getMatchType(bestMatch.matchScore),
    } : null,
    alternativeMatches: matches.slice(1, 4), // Top 3 alternatives
    isSupported,
    supportConfidence: bestMatch?.matchScore || 0,
  };
}

/**
 * Match all claims in a response to their sources
 */
export async function matchAllClaims(
  responseText: string,
  chunks: ScoredChunk[],
  citations: Citation[],
  options: { useSemanticMatching?: boolean } = {}
): Promise<{
  claims: ExtractedClaim[];
  matches: ClaimSourceMatch[];
  supportedCount: number;
  unsupportedCount: number;
  overallSupportRate: number;
}> {
  const claims = extractClaims(responseText);
  const matches: ClaimSourceMatch[] = [];

  let supportedCount = 0;
  let unsupportedCount = 0;

  for (const claim of claims) {
    const match = await matchClaimToSources(claim, chunks, citations, options);
    matches.push(match);

    if (match.isSupported) {
      supportedCount++;
    } else {
      unsupportedCount++;
    }
  }

  const overallSupportRate = claims.length > 0
    ? supportedCount / claims.length
    : 0;

  if (unsupportedCount > 0) {
    logWarn('Unsupported claims detected', {
      unsupportedCount,
      totalClaims: claims.length,
      unsupportedClaims: matches
        .filter(m => !m.isSupported)
        .map(m => m.claim.text.substring(0, 50) + '...'),
    });
  }

  return {
    claims,
    matches,
    supportedCount,
    unsupportedCount,
    overallSupportRate,
  };
}

/**
 * Identify claims that need better citations
 */
export function identifyWeaklyCitedClaims(
  matches: ClaimSourceMatch[],
  minConfidence: number = 0.5
): {
  weakClaims: ClaimSourceMatch[];
  strongClaims: ClaimSourceMatch[];
  recommendations: string[];
} {
  const weakClaims: ClaimSourceMatch[] = [];
  const strongClaims: ClaimSourceMatch[] = [];
  const recommendations: string[] = [];

  for (const match of matches) {
    if (!match.isSupported || match.supportConfidence < minConfidence) {
      weakClaims.push(match);

      // Generate recommendation
      if (!match.bestMatch) {
        recommendations.push(
          `Claim "${match.claim.text.substring(0, 40)}..." has no supporting source`
        );
      } else if (match.bestMatch.matchType === 'weak') {
        recommendations.push(
          `Claim "${match.claim.text.substring(0, 40)}..." has weak support (${Math.round(match.supportConfidence * 100)}%)`
        );
      }
    } else {
      strongClaims.push(match);
    }
  }

  return { weakClaims, strongClaims, recommendations };
}

/**
 * Semantic anchoring result for pre-response source analysis
 */
export interface SemanticAnchor {
  sourceId: string;
  sourceText: string;
  keyFacts: string[];
  bestForTopics: string[];
  semanticCluster: number;
  confidence: number;
}

/**
 * Pre-compute semantic anchors for sources
 * This helps the LLM understand which sources best support which topics
 */
export async function computeSemanticAnchors(
  chunks: ScoredChunk[],
  query: string
): Promise<SemanticAnchor[]> {
  const anchors: SemanticAnchor[] = [];

  // Extract query topics
  const queryTopics = extractKeyTopics(query);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const cid = `N${i + 1}`;

    // Extract key facts from this chunk
    const keyFacts = extractKeyFacts(chunk.text);

    // Determine which query topics this chunk addresses
    const bestForTopics = queryTopics.filter(topic =>
      chunk.text.toLowerCase().includes(topic.toLowerCase()) ||
      keyFacts.some(fact => fact.toLowerCase().includes(topic.toLowerCase()))
    );

    // Simple clustering by content similarity
    const semanticCluster = computeContentCluster(chunk.text, chunks, i);

    // Confidence based on relevance to query
    const confidence = chunk.score || 0.5;

    anchors.push({
      sourceId: cid,
      sourceText: chunk.text.slice(0, 200),
      keyFacts,
      bestForTopics,
      semanticCluster,
      confidence,
    });
  }

  return anchors;
}

/**
 * Extract key topics from query
 */
function extractKeyTopics(query: string): string[] {
  const stopWords = new Set([
    'what', 'how', 'why', 'when', 'where', 'who', 'which',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'can', 'about', 'with',
    'for', 'from', 'to', 'of', 'in', 'on', 'at', 'by', 'and', 'or',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Extract key facts from source text
 */
function extractKeyFacts(text: string): string[] {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);

  // Prioritize sentences with specific information
  const factPatterns = [
    /\b\d+\b/,                    // Contains numbers
    /\b(is|are|was|were|has|have)\b/i,  // Declarative statements
    /\b(because|therefore|thus|hence)\b/i, // Causal statements
    /\b(first|second|third|finally)\b/i,   // Sequential info
  ];

  const factSentences = sentences.filter(sentence =>
    factPatterns.some(pattern => pattern.test(sentence))
  );

  // Return top 3 fact-like sentences
  return factSentences.slice(0, 3).map(s => s.trim());
}

/**
 * Compute a simple content cluster ID based on lexical similarity
 */
function computeContentCluster(
  text: string,
  allChunks: ScoredChunk[],
  currentIndex: number
): number {
  // Simple heuristic: group by first significant word
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  if (words.length === 0) return currentIndex;

  // Find chunks with similar first words
  const firstWord = words[0];
  for (let i = 0; i < currentIndex; i++) {
    const otherWords = allChunks[i].text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    if (otherWords[0] === firstWord) {
      return i; // Same cluster as earlier chunk
    }
  }

  return currentIndex; // New cluster
}

/**
 * Build source anchor hints for the prompt
 * This provides the LLM with guidance on which sources support which topics
 */
export function buildSourceAnchorHints(anchors: SemanticAnchor[]): string {
  if (anchors.length === 0) return '';

  const hints = anchors
    .filter(a => a.bestForTopics.length > 0 || a.keyFacts.length > 0)
    .slice(0, 5)  // Limit to top 5 most informative
    .map(anchor => {
      const topics = anchor.bestForTopics.length > 0
        ? `Topics: ${anchor.bestForTopics.join(', ')}`
        : '';
      const facts = anchor.keyFacts.length > 0
        ? `Key info: ${anchor.keyFacts[0].slice(0, 80)}...`
        : '';
      return `${anchor.sourceId}: ${topics} ${facts}`.trim();
    });

  if (hints.length === 0) return '';

  return `\nSOURCE HINTS (which source is best for what):\n${hints.join('\n')}\n`;
}

