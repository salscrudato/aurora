/**
 * AuroraNotes API - Response Post-Processor
 *
 * Ensures consistent response formatting, citation placement,
 * and answer structure based on query intent.
 *
 * Features:
 * - Citation normalization and deduplication
 * - Response structure enforcement
 * - Format consistency (lists, paragraphs, etc.)
 * - Citation placement optimization
 * - Answer coherence validation
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

/**
 * Post-processing configuration
 */
export interface PostProcessorConfig {
  normalizeCitations: boolean;
  enforceStructure: boolean;
  deduplicateCitations: boolean;
  validateCoherence: boolean;
  maxCitationsPerSentence: number;
  preferredFormat: 'paragraph' | 'list' | 'structured' | 'auto';
}

const DEFAULT_CONFIG: PostProcessorConfig = {
  normalizeCitations: true,
  enforceStructure: true,
  deduplicateCitations: true,
  validateCoherence: true,
  maxCitationsPerSentence: 3,
  preferredFormat: 'auto',
};

/**
 * Post-processed response result
 */
export interface PostProcessedResponse {
  originalAnswer: string;
  processedAnswer: string;
  citations: Citation[];
  modifications: string[];
  coherenceScore: number;
  structureType: 'paragraph' | 'list' | 'structured' | 'mixed';
}

/**
 * Normalize citation format to consistent [N1], [N2], etc.
 */
function normalizeCitationFormat(text: string): { text: string; mapping: Map<string, string> } {
  const mapping = new Map<string, string>();
  let citationCounter = 1;

  // Find all citation patterns
  const citationPattern = /\[(?:N)?(\d+)\]/g;
  const usedCids = new Set<string>();

  // First pass: collect all unique citations
  let match;
  while ((match = citationPattern.exec(text)) !== null) {
    const originalCid = match[0];
    if (!usedCids.has(originalCid)) {
      usedCids.add(originalCid);
      const normalizedCid = `[N${citationCounter}]`;
      mapping.set(originalCid, normalizedCid);
      citationCounter++;
    }
  }

  // Second pass: replace all citations with normalized format
  let normalizedText = text;
  for (const [original, normalized] of mapping) {
    normalizedText = normalizedText.split(original).join(normalized);
  }

  return { text: normalizedText, mapping };
}

/**
 * Deduplicate adjacent citations
 */
function deduplicateAdjacentCitations(text: string): string {
  // Remove duplicate adjacent citations like [N1][N1]
  return text.replace(/(\[N\d+\])(\s*\1)+/g, '$1');
}

/**
 * Limit citations per sentence
 */
function limitCitationsPerSentence(text: string, maxCitations: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/);

  return sentences.map(sentence => {
    const citations = sentence.match(/\[N\d+\]/g) || [];
    if (citations.length <= maxCitations) return sentence;

    // Keep only the first maxCitations citations
    let count = 0;
    return sentence.replace(/\[N\d+\]/g, (match) => {
      count++;
      return count <= maxCitations ? match : '';
    }).replace(/\s+/g, ' ').trim();
  }).join(' ');
}

/**
 * Detect the structure type of a response
 */
function detectStructureType(text: string): PostProcessedResponse['structureType'] {
  const lines = text.split('\n').filter(l => l.trim());

  // Check for list patterns
  const listPatterns = /^[\s]*[-*•]\s|^[\s]*\d+[.)]\s|^[\s]*[a-z][.)]\s/i;
  const listLines = lines.filter(l => listPatterns.test(l)).length;

  // Check for structured patterns (headers, sections)
  const headerPatterns = /^#+\s|^[A-Z][^.!?]*:$/;
  const headerLines = lines.filter(l => headerPatterns.test(l)).length;

  if (headerLines > 0 && listLines > 0) return 'structured';
  if (listLines > lines.length * 0.5) return 'list';
  if (headerLines > 0) return 'structured';
  if (lines.length <= 3) return 'paragraph';

  return 'mixed';
}

/**
 * Determine preferred format based on query intent
 */
function getPreferredFormat(intent: QueryIntent): PostProcessorConfig['preferredFormat'] {
  switch (intent) {
    case 'question':
      return 'paragraph';
    case 'list':
    case 'action_item':
      return 'list';
    case 'decision':
      return 'structured';
    case 'summarize':
      return 'structured';
    case 'search':
    default:
      return 'auto';
  }
}

/**
 * Calculate coherence score based on various factors
 */
function calculateCoherenceScore(text: string, _citations: Citation[]): number {
  let score = 1.0;

  // Penalize for orphaned citations (citations without context)
  const orphanedPattern = /^\s*\[N\d+\]\s*$/gm;
  const orphanedCount = (text.match(orphanedPattern) || []).length;
  score -= orphanedCount * 0.1;

  // Penalize for citation clusters (too many citations in one place)
  const clusterPattern = /(\[N\d+\]\s*){4,}/g;
  const clusterCount = (text.match(clusterPattern) || []).length;
  score -= clusterCount * 0.15;

  // Reward for even citation distribution
  const sentences = text.split(/(?<=[.!?])\s+/);
  const citedSentences = sentences.filter(s => /\[N\d+\]/.test(s)).length;
  const citationDistribution = sentences.length > 0 ? citedSentences / sentences.length : 0;
  if (citationDistribution > 0.3 && citationDistribution < 0.8) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Update citation references in citations array based on mapping
 */
function remapCitations(
  citations: Citation[],
  mapping: Map<string, string>
): Citation[] {
  const reverseMapping = new Map<string, string>();
  for (const [original, normalized] of mapping) {
    // Extract the number from [N1] format
    const originalNum = original.match(/\d+/)?.[0];
    const normalizedNum = normalized.match(/\d+/)?.[0];
    if (originalNum && normalizedNum) {
      reverseMapping.set(`N${originalNum}`, `N${normalizedNum}`);
    }
  }

  return citations.map(citation => {
    const newCid = reverseMapping.get(citation.cid);
    if (newCid) {
      return { ...citation, cid: newCid };
    }
    return citation;
  });
}

/**
 * Main post-processing function
 */
export function postProcessResponse(
  answer: string,
  citations: Citation[],
  queryIntent: QueryIntent,
  config: Partial<PostProcessorConfig> = {}
): PostProcessedResponse {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const modifications: string[] = [];

  let processedAnswer = answer;
  let processedCitations = [...citations];

  // Step 1: Normalize citation format
  if (fullConfig.normalizeCitations) {
    const { text: normalizedText, mapping } = normalizeCitationFormat(processedAnswer);
    if (mapping.size > 0) {
      processedAnswer = normalizedText;
      processedCitations = remapCitations(processedCitations, mapping);
      modifications.push(`Normalized ${mapping.size} citation formats`);
    }
  }

  // Step 2: Deduplicate adjacent citations
  if (fullConfig.deduplicateCitations) {
    const beforeLength = processedAnswer.length;
    processedAnswer = deduplicateAdjacentCitations(processedAnswer);
    if (processedAnswer.length !== beforeLength) {
      modifications.push('Removed duplicate adjacent citations');
    }
  }

  // Step 3: Limit citations per sentence
  if (fullConfig.maxCitationsPerSentence > 0) {
    const beforeAnswer = processedAnswer;
    processedAnswer = limitCitationsPerSentence(
      processedAnswer,
      fullConfig.maxCitationsPerSentence
    );
    if (processedAnswer !== beforeAnswer) {
      modifications.push(`Limited citations to ${fullConfig.maxCitationsPerSentence} per sentence`);
    }
  }

  // Step 4: Detect and validate structure
  const structureType = detectStructureType(processedAnswer);
  const preferredFormat = fullConfig.preferredFormat === 'auto'
    ? getPreferredFormat(queryIntent)
    : fullConfig.preferredFormat;

  if (fullConfig.enforceStructure && preferredFormat !== 'auto' && structureType !== preferredFormat) {
    logInfo('Structure mismatch detected', {
      detected: structureType,
      preferred: preferredFormat,
      queryIntent,
    });
    // Note: We log but don't force restructure to avoid breaking the response
  }

  // Step 5: Calculate coherence score
  const coherenceScore = fullConfig.validateCoherence
    ? calculateCoherenceScore(processedAnswer, processedCitations)
    : 1.0;

  if (coherenceScore < 0.7) {
    logWarn('Low coherence score detected', {
      coherenceScore,
      modifications,
    });
  }

  return {
    originalAnswer: answer,
    processedAnswer,
    citations: processedCitations,
    modifications,
    coherenceScore,
    structureType,
  };
}

/**
 * Quick validation of response quality
 */
export function validateResponseQuality(
  answer: string,
  citations: Citation[]
): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for empty or very short answers
  if (answer.trim().length < 20) {
    issues.push('Answer is too short');
  }

  // Check for uncited claims (sentences without citations)
  const sentences = answer.split(/(?<=[.!?])\s+/);
  const uncitedSentences = sentences.filter(s =>
    s.length > 30 && !/\[N?\d+\]/.test(s)
  );
  if (uncitedSentences.length > sentences.length * 0.5) {
    issues.push('More than half of sentences lack citations');
    suggestions.push('Add citations to support key claims');
  }

  // Check for citation-only responses
  const citationOnlyPattern = /^[\s\[N\d\]]+$/;
  if (citationOnlyPattern.test(answer)) {
    issues.push('Response contains only citations without content');
  }

  // Check for broken citation references
  const citedNumbers = new Set(
    (answer.match(/\[N?(\d+)\]/g) || []).map(c => c.match(/\d+/)?.[0])
  );
  const availableCids = new Set(citations.map(c => c.cid.replace('N', '')));
  for (const num of citedNumbers) {
    if (num && !availableCids.has(num)) {
      issues.push(`Citation [N${num}] references non-existent source`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
  };
}

/**
 * Get post-processor configuration for observability
 */
export function getPostProcessorConfig(): PostProcessorConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Response consistency result
 */
export interface ConsistencyResult {
  isConsistent: boolean;
  toneConsistency: number;
  formatConsistency: number;
  citationConsistency: number;
  issues: string[];
  corrections: string[];
}

/**
 * Enforce consistent response formatting
 * Ensures deterministic output structure
 */
export function enforceResponseConsistency(
  answer: string,
  queryIntent: QueryIntent
): { correctedAnswer: string; result: ConsistencyResult } {
  const issues: string[] = [];
  const corrections: string[] = [];
  let correctedAnswer = answer;

  // 1. Normalize whitespace and line breaks
  const beforeWhitespace = correctedAnswer;
  correctedAnswer = correctedAnswer
    .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
    .replace(/[ \t]+/g, ' ')     // Single spaces only
    .trim();
  if (correctedAnswer !== beforeWhitespace) {
    corrections.push('Normalized whitespace');
  }

  // 2. Ensure consistent list formatting
  const hasNumberedList = /^\s*\d+[.)]\s/m.test(correctedAnswer);
  const hasBulletList = /^\s*[-*•]\s/m.test(correctedAnswer);
  if (hasNumberedList && hasBulletList) {
    issues.push('Mixed list formats (numbered and bullet)');
    // Convert bullets to numbered if more numbered items
    const numCount = (correctedAnswer.match(/^\s*\d+[.)]\s/gm) || []).length;
    const bulletCount = (correctedAnswer.match(/^\s*[-*•]\s/gm) || []).length;
    if (numCount >= bulletCount) {
      let counter = numCount + 1;
      correctedAnswer = correctedAnswer.replace(/^\s*[-*•]\s/gm, () => `${counter++}. `);
      corrections.push('Converted bullets to numbered list');
    } else {
      correctedAnswer = correctedAnswer.replace(/^\s*\d+[.)]\s/gm, '- ');
      corrections.push('Converted numbered to bullet list');
    }
  }

  // 3. Ensure consistent citation format
  const beforeCitation = correctedAnswer;
  correctedAnswer = correctedAnswer
    .replace(/\[\s*N\s*(\d+)\s*\]/g, '[N$1]')  // Normalize spacing
    .replace(/\[(\d+)\]/g, '[N$1]');           // Ensure N prefix
  if (correctedAnswer !== beforeCitation) {
    corrections.push('Normalized citation format');
  }

  // 4. Remove trailing citation-only sentences
  const beforeTrailing = correctedAnswer;
  correctedAnswer = correctedAnswer.replace(/\.\s*(\[N\d+\]\s*)+$/g, '.');
  if (correctedAnswer !== beforeTrailing) {
    corrections.push('Removed trailing citation-only content');
  }

  // 5. Calculate consistency scores
  const toneConsistency = calculateToneConsistency(correctedAnswer);
  const formatConsistency = issues.length === 0 ? 1.0 : Math.max(0.5, 1 - issues.length * 0.15);
  const citationConsistency = calculateCitationConsistency(correctedAnswer);

  const isConsistent = toneConsistency > 0.7 && formatConsistency > 0.7 && citationConsistency > 0.7;

  return {
    correctedAnswer,
    result: {
      isConsistent,
      toneConsistency,
      formatConsistency,
      citationConsistency,
      issues,
      corrections,
    },
  };
}

/**
 * Calculate tone consistency across the response
 */
function calculateToneConsistency(text: string): number {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 10);
  if (sentences.length < 2) return 1.0;

  let inconsistencies = 0;

  // Check for tone shifts
  const formalIndicators = /\b(therefore|furthermore|moreover|consequently|thus)\b/gi;
  const casualIndicators = /\b(basically|kind of|sort of|pretty much|gonna|wanna)\b/gi;

  const hasFormal = formalIndicators.test(text);
  const hasCasual = casualIndicators.test(text);

  if (hasFormal && hasCasual) {
    inconsistencies++;
  }

  // Check for person consistency (I vs we vs you)
  const firstPerson = /\b(I|my|mine)\b/g.test(text);
  const secondPerson = /\b(you|your|yours)\b/g.test(text);
  const thirdPerson = /\b(it|they|the user|the system)\b/g.test(text);

  const personCount = [firstPerson, secondPerson, thirdPerson].filter(Boolean).length;
  if (personCount > 1) {
    inconsistencies += 0.5;
  }

  return Math.max(0, 1 - inconsistencies * 0.2);
}

/**
 * Calculate citation placement consistency
 */
function calculateCitationConsistency(text: string): number {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
  if (sentences.length === 0) return 1.0;

  let score = 1.0;

  // Check for citation placement consistency
  const citedSentences = sentences.filter(s => /\[N\d+\]/.test(s));
  const endCitations = citedSentences.filter(s => /\[N\d+\]\s*[.!?]?\s*$/.test(s));
  const midCitations = citedSentences.filter(s => /\[N\d+\](?!\s*[.!?]?\s*$)/.test(s));

  // Prefer consistent placement (either mostly end or mostly mid)
  if (endCitations.length > 0 && midCitations.length > 0) {
    const ratio = Math.min(endCitations.length, midCitations.length) /
                  Math.max(endCitations.length, midCitations.length);
    if (ratio > 0.5) {
      score -= 0.15; // Inconsistent placement
    }
  }

  // Check for citation clustering
  const clusterPattern = /(\[N\d+\]\s*){4,}/g;
  const clusterCount = (text.match(clusterPattern) || []).length;
  score -= clusterCount * 0.1;

  return Math.max(0, score);
}

/**
 * Validate and fix response for production use
 */
export function validateAndFixResponse(
  answer: string,
  citations: Citation[],
  queryIntent: QueryIntent
): {
  finalAnswer: string;
  finalCitations: Citation[];
  qualityScore: number;
  wasModified: boolean;
} {
  // Step 1: Post-process response
  const postProcessed = postProcessResponse(answer, citations, queryIntent);

  // Step 2: Enforce consistency
  const { correctedAnswer, result: consistencyResult } = enforceResponseConsistency(
    postProcessed.processedAnswer,
    queryIntent
  );

  // Step 3: Validate quality
  const qualityValidation = validateResponseQuality(correctedAnswer, postProcessed.citations);

  // Calculate overall quality score
  const qualityScore = (
    postProcessed.coherenceScore * 0.3 +
    consistencyResult.toneConsistency * 0.25 +
    consistencyResult.formatConsistency * 0.25 +
    consistencyResult.citationConsistency * 0.2
  );

  const wasModified = postProcessed.modifications.length > 0 ||
                      consistencyResult.corrections.length > 0;

  if (wasModified) {
    logInfo('Response modified for consistency', {
      modifications: postProcessed.modifications,
      corrections: consistencyResult.corrections,
      qualityScore: Math.round(qualityScore * 100) / 100,
    });
  }

  return {
    finalAnswer: correctedAnswer,
    finalCitations: postProcessed.citations,
    qualityScore,
    wasModified,
  };
}

