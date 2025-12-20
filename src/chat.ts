/**
 * AuroraNotes API - Chat Service
 *
 * RAG-powered chat with inline citations, retry logic, and enhanced error handling.
 * Includes structured retrieval logging for observability.
 */

import {
  CHAT_MODEL,
  CHAT_TIMEOUT_MS,
  CHAT_MAX_QUERY_LENGTH,
  CHAT_TEMPERATURE,
  CHAT_TOP_P,
  CHAT_TOP_K,
  LLM_MAX_OUTPUT_TOKENS,
  RETRIEVAL_TOP_K,
  RETRIEVAL_RERANK_TO,
  DEFAULT_TENANT_ID,
  LLM_CONTEXT_BUDGET_CHARS,
  LLM_CONTEXT_RESERVE_CHARS,
  CITATION_RETRY_ENABLED,
  CITATION_VERIFICATION_ENABLED,
  CITATION_MIN_OVERLAP_SCORE,
} from "./config";
import { ChatRequest, ChatResponse, Citation, ScoredChunk, QueryIntent, SourcesPack, Source, ConfidenceLevel, ResponseMeta } from "./types";
import { retrieveRelevantChunks, analyzeQuery, calculateAdaptiveK } from "./retrieval";
import { logInfo, logError, logWarn, sanitizeText, isValidTenantId } from "./utils";
import { validateCitationsWithChunks } from "./citationValidator";
import {
  createRetrievalLog,
  logRetrieval,
  RetrievalLogEntry,
  RetrievalTimings,
  QualityFlags,
  CitationLogEntry,
  CitationValidationStats,
  computeScoreDistribution,
  candidateCountsToStageDetails,
} from "./retrievalLogger";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

// Enhanced response quality modules
import { postProcessResponse, validateResponseQuality, validateAndFixResponse, enforceResponseConsistency } from "./responsePostProcessor";
import { calculateResponseConfidence, getConfidenceSummary } from "./responseConfidence";
import { extractClaimCitationPairs, batchScoreCitations, filterByConfidence, aggregateConfidenceScores } from "./citationConfidence";

// New enhanced modules for improved citation accuracy
import { runUnifiedCitationPipeline, quickVerifyCitation, analyzeContradiction } from "./unifiedCitationPipeline";
import { buildEnhancedSystemPrompt, buildCompleteEnhancedPrompt } from "./enhancedPrompts";
import { computeSemanticAnchors, buildSourceAnchorHints } from "./claimExtraction";

// Additional enhancement modules for response consistency and citation accuracy
import { selectBestResponse, extractCitationIds, filterInconsistentCitations, isSelfConsistencyEnabled, ResponseCandidate } from "./selfConsistency";
import { anchorClaims, isClaimAnchoringEnabled, AnchoringResult } from "./claimAnchoring";
import { validateAndRepair, validateResponse, getValidationConfig } from "./responseValidation";

// Retry configuration
const MAX_LLM_RETRIES = 2;
const LLM_RETRY_DELAY_MS = 1000;

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
function createTimeout<T>(ms: number, context: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms: ${context}`));
    }, ms);
  });
}

// Citation accuracy thresholds (tuned for better recall while maintaining precision)
const MIN_CITATION_COVERAGE = 0.5;        // Trigger repair if < 50% of sources cited
const MIN_CITATION_COVERAGE_STRICT = 0.6; // Warn if < 60% coverage after repair

// Feature flags for enhanced verification
const UNIFIED_PIPELINE_ENABLED = true;    // Use new unified citation verification pipeline
const CONSISTENCY_ENFORCEMENT_ENABLED = true;  // Enforce response consistency
const ENHANCED_PROMPTS_ENABLED = false;    // Use enhanced prompts with chain-of-citation (optional)

// NOTE: MIN_CITATION_SCORE filtering is now done in retrieval (MIN_COMBINED_SCORE)
// to ensure prompt source count == citationsMap.size EXACTLY.
// All chunks returned from retrieval are "source-worthy" and included in citations.

/**
 * Custom error for server configuration issues (not client errors)
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Custom error for rate limiting
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Retry LLM call with exponential backoff and hard timeout
 */
async function withLLMRetry<T>(
  fn: () => Promise<T>,
  context: string,
  timeoutMs: number = CHAT_TIMEOUT_MS
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      // Race between LLM call and timeout
      const result = await Promise.race([
        fn(),
        createTimeout<T>(timeoutMs, context),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      const errMessage = err instanceof Error ? err.message : String(err);

      // Don't retry on certain errors
      if (errMessage.includes('INVALID_ARGUMENT') ||
          errMessage.includes('PERMISSION_DENIED') ||
          errMessage.includes('API key')) {
        throw err;
      }

      // Check for rate limiting
      if (errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED')) {
        throw new RateLimitError('API rate limit exceeded');
      }

      // Log timeout errors with context for debugging
      if (errMessage.includes('Timeout')) {
        logWarn(`${context} timeout`, { attempt: attempt + 1, timeoutMs });
      }

      if (attempt < MAX_LLM_RETRIES) {
        const delay = LLM_RETRY_DELAY_MS * Math.pow(2, attempt);
        logWarn(`${context} retry`, { attempt: attempt + 1, delayMs: delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Pre-compiled regex for sentence splitting
const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+/;

/**
 * Count how many query terms appear in a text (case-insensitive)
 * Optimized: pre-lowercase text once, use indexOf for speed
 */
function countQueryTermMatches(lowerText: string, queryTermsLower: string[]): number {
  let count = 0;
  for (const term of queryTermsLower) {
    if (lowerText.includes(term)) {
      count++;
    }
  }
  return count;
}

/**
 * Extract the most informative snippet from a chunk
 * Query-aware: prioritizes sentences containing the most query terms
 * Falls back to sentence-complete excerpts if no query terms provided
 *
 * Optimizations:
 * - Pre-lowercase text and query terms once
 * - Use indexOf instead of includes for faster matching
 * - Avoid unnecessary array allocations
 */
function extractBestSnippet(
  text: string,
  maxLength: number = 200,
  queryTerms: string[] = []
): string {
  if (text.length <= maxLength) return text;

  // Split into sentences
  const sentences = text.split(SENTENCE_SPLIT_REGEX);

  // If we have query terms, find the best sentence(s) containing them
  if (queryTerms.length > 0 && sentences.length > 1) {
    // Pre-lowercase query terms once
    const queryTermsLower = queryTerms.map(t => t.toLowerCase());

    // Score each sentence by query term matches
    let bestMatchIdx = -1;
    let bestMatchCount = 0;
    let bestMatchLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceLower = sentence.toLowerCase();
      const matchCount = countQueryTermMatches(sentenceLower, queryTermsLower);

      // Better match if: more matches, or same matches but earlier position
      if (matchCount > bestMatchCount ||
          (matchCount === bestMatchCount && matchCount > 0 && sentence.length <= maxLength && bestMatchLength > maxLength)) {
        if (sentence.length <= maxLength) {
          bestMatchIdx = i;
          bestMatchCount = matchCount;
          bestMatchLength = sentence.length;
        }
      }
    }

    if (bestMatchIdx >= 0 && bestMatchCount > 0) {
      let snippet = sentences[bestMatchIdx];

      // Try to add adjacent sentences if they fit
      // Check previous sentence
      if (bestMatchIdx > 0) {
        const prevSentence = sentences[bestMatchIdx - 1];
        if (snippet.length + prevSentence.length + 1 <= maxLength) {
          snippet = prevSentence + ' ' + snippet;
        }
      }
      // Check next sentence
      if (bestMatchIdx < sentences.length - 1) {
        const nextSentence = sentences[bestMatchIdx + 1];
        if (snippet.length + nextSentence.length + 1 <= maxLength) {
          snippet = snippet + ' ' + nextSentence;
        }
      }
      return snippet;
    }
  }

  // Fallback: use first sentence(s) that fit
  if (sentences[0] && sentences[0].length <= maxLength) {
    let snippet = sentences[0];
    for (let i = 1; i < sentences.length; i++) {
      if (snippet.length + sentences[i].length + 1 <= maxLength) {
        snippet += ' ' + sentences[i];
      } else {
        break;
      }
    }
    return snippet;
  }

  // Final fallback: truncate at word boundary
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + '…';
  }
  return truncated + '…';
}

/**
 * Build a SourcesPack from scored chunks - the single source of truth for sources/citations.
 *
 * IMPORTANT: No filtering here! All chunks passed in are "source-worthy"
 * (already filtered by MIN_COMBINED_SCORE in retrieval).
 * This ensures prompt source count == citationsMap.size EXACTLY.
 *
 * Optimizations:
 * - Pre-allocate Map with expected size
 * - Use for loop instead of forEach for better performance
 * - Cache date conversion
 *
 * @param chunks - The exact chunks to use as sources (already filtered/reranked)
 * @param queryTerms - Optional query terms for query-aware snippet extraction
 * @returns SourcesPack with 1:1 mapping between sources and citations
 */
export function buildSourcesPack(chunks: ScoredChunk[], queryTerms: string[] = []): SourcesPack {
  const citationsMap = new Map<string, Citation>();
  const chunkCount = chunks.length;

  // Create 1:1 mapping - every chunk becomes a citation
  for (let i = 0; i < chunkCount; i++) {
    const chunk = chunks[i];
    const cid = `N${i + 1}`;
    citationsMap.set(cid, {
      cid,
      noteId: chunk.noteId,
      chunkId: chunk.chunkId,
      createdAt: chunk.createdAt.toISOString(),
      snippet: extractBestSnippet(chunk.text, 250, queryTerms),
      score: Math.round(chunk.score * 100) / 100,
    });
  }

  return {
    sources: chunks,
    citationsMap,
    sourceCount: chunkCount, // Equals citationsMap.size
  };
}

/**
 * Extract key topics from chunks for context hints
 */
function extractTopicsFromChunks(chunks: ScoredChunk[]): string[] {
  const topicPatterns = [
    /\b(meeting|sprint|planning|decision|architecture|design)\b/gi,
    /\b(RAG|pipeline|chunking|embedding|retrieval|vector)\b/gi,
    /\b(Cloud Run|Firestore|API|backend|frontend)\b/gi,
    /\b(pagination|scaling|performance|optimization)\b/gi,
  ];

  const topics = new Set<string>();
  const allText = chunks.map(c => c.text).join(' ').toLowerCase();

  for (const pattern of topicPatterns) {
    const matches = allText.match(pattern);
    if (matches) {
      matches.slice(0, 3).forEach(m => topics.add(m.toLowerCase()));
    }
  }

  return Array.from(topics).slice(0, 5);
}

/**
 * Convert citations to human-readable Source objects for the new response format
 */
function citationsToSources(citations: Citation[]): Source[] {
  return citations.map(c => ({
    id: c.cid.replace('N', ''),
    noteId: c.noteId,
    preview: c.snippet.length > 120 ? c.snippet.slice(0, 117) + '...' : c.snippet,
    date: new Date(c.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    relevance: Math.round(c.score * 100) / 100,
  }));
}

/**
 * Build contextSources from chunks that were used as context but not cited in the answer.
 * These are sources the LLM had access to but didn't directly quote.
 *
 * @param allChunks - All chunks used as context for the LLM (after reranking)
 * @param citedChunkIds - Set of chunkIds that were cited in the answer
 * @param startId - Starting ID number for context sources (should be lastCitedId + 1)
 * @param queryTerms - Query terms for snippet extraction
 * @returns Array of Source objects for uncited context sources
 */
// Minimum relevance threshold for context sources (filter out noise)
// Increased to 0.30 to avoid showing irrelevant context for out-of-scope queries
const CONTEXT_SOURCE_MIN_RELEVANCE = 0.30;
const CONTEXT_SOURCE_MAX_COUNT = 5;  // Reduced for cleaner responses

function buildContextSources(
  allChunks: ScoredChunk[],
  citedChunkIds: Set<string>,
  startId: number,
  queryTerms: string[] = []
): Source[] {
  // Filter out cited chunks and keep only uncited context sources
  // Also filter by minimum relevance to avoid noise
  const uncitedChunks = allChunks.filter(chunk =>
    !citedChunkIds.has(chunk.chunkId) && chunk.score >= CONTEXT_SOURCE_MIN_RELEVANCE
  );

  // Sort by score (highest first) to show most relevant context sources first
  uncitedChunks.sort((a, b) => b.score - a.score);

  // Limit count for cleaner responses
  const topChunks = uncitedChunks.slice(0, CONTEXT_SOURCE_MAX_COUNT);

  // Convert to Source objects with sequential IDs
  return topChunks.map((chunk, index) => {
    const preview = chunk.text.length > 120 ? chunk.text.slice(0, 117) + '...' : chunk.text;
    return {
      id: String(startId + index),
      noteId: chunk.noteId,
      preview,
      date: chunk.createdAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      relevance: Math.round(chunk.score * 100) / 100,
    };
  });
}

/**
 * Determine confidence level based on citation coverage and scores
 *
 * Uses a multi-factor approach:
 * 1. If LLM expresses uncertainty → 'none'
 * 2. If no citations → 'none'
 * 3. Otherwise, use enhanced confidence breakdown
 *
 * Thresholds calibrated to match enhanced confidence levels:
 * - high: overall >= 0.70 (was too strict at 0.7 score requirement)
 * - medium: overall >= 0.50
 * - low: everything else
 */
function calculateConfidence(
  citationCount: number,
  sourceCount: number,
  avgScore: number,
  looksLikeUncertainty: boolean,
  enhancedLevel?: 'very_high' | 'high' | 'medium' | 'low' | 'very_low'
): ConfidenceLevel {
  if (looksLikeUncertainty || citationCount === 0) return 'none';

  // If enhanced confidence is available, map it to ConfidenceLevel
  if (enhancedLevel) {
    switch (enhancedLevel) {
      case 'very_high':
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
      case 'very_low':
        return 'low';
    }
  }

  // Fallback to legacy calculation with relaxed thresholds
  const coverage = sourceCount > 0 ? citationCount / sourceCount : 0;
  if (coverage >= 0.4 && avgScore >= 0.5) return 'high';
  if (coverage >= 0.2 && avgScore >= 0.3) return 'medium';
  return 'low';
}

/**
 * Normalize citation format from [N#] to [#] for cleaner display
 */
function normalizeCitationFormat(answer: string): string {
  return answer.replace(/\[N(\d+)\]/g, '[$1]');
}

/**
 * Get intent-specific formatting guidance for cleaner output
 */
function getIntentGuidance(intent: QueryIntent): { format: string; tone: string } {
  switch (intent) {
    case 'summarize':
      return {
        format: 'Start with a one-sentence overview, then use bullet points (•) for 2-4 key details.',
        tone: 'Synthesize information naturally. Avoid repeating the same facts.',
      };
    case 'list':
      return {
        format: 'Use bullet points (•) or numbers. One item per line. Group related items together.',
        tone: 'Be scannable and organized.',
      };
    case 'decision':
      return {
        format: 'State the decision clearly first. Then explain the reasoning in 1-2 sentences.',
        tone: 'Be definitive. Use "decided to" or "chose" language.',
      };
    case 'action_item':
      return {
        format: 'Use bullet points (•) for each action. Include who/when if mentioned in notes.',
        tone: 'Be actionable and clear.',
      };
    case 'question':
      return {
        format: 'Answer directly in the first sentence. Add brief context only if it helps understanding.',
        tone: 'Be conversational but precise.',
      };
    default:
      return {
        format: 'Write 1-3 short paragraphs. Use bullet points if listing multiple related items.',
        tone: 'Be helpful and natural.',
      };
  }
}

// Pre-built prompt template parts (avoid string concatenation in hot path)
const PROMPT_TEMPLATE_START = `You are a helpful assistant answering questions from the user's personal notes.

## Your Task
Answer the user's question using ONLY the information in the sources below. If the sources don't contain relevant information, say "I don't have notes about that."

## Response Guidelines
1. **Be natural and conversational** - Write like you're explaining to a friend, not listing facts
2. **Structure for readability** - Use bullet points or numbered lists when listing multiple items
3. **Lead with the answer** - Start with the most important information first
4. **Be concise** - Don't repeat information; synthesize related points

## How to Cite
- Add citations at the END of each paragraph or logical section, not after every sentence
- Use format: [N1] or [N1][N2] for multiple sources
- Only cite when introducing NEW information from a source
- Example: "React Hooks let you use state in functional components. useState manages local state, while useEffect handles side effects like API calls. [N1]"

## Formatting
`;

const PROMPT_TEMPLATE_SOURCES = `

## Sources (`;
const PROMPT_TEMPLATE_QUESTION = ` total)
`;
const PROMPT_TEMPLATE_END = `

## Question
`;
const PROMPT_TEMPLATE_ANSWER = `

## Answer`;

// Cache date format options to avoid repeated object creation
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/**
 * Build an optimized RAG prompt with clean formatting instructions.
 * Uses numbered citations [1], [2] for cleaner display.
 *
 * Optimizations:
 * - Pre-built template strings to reduce concatenation
 * - Build source index map for O(1) lookups instead of O(n) find()
 * - Pre-allocate array for source parts
 * - Cached date format options
 */
export function buildPrompt(
  query: string,
  sourcesPack: SourcesPack,
  intent: QueryIntent = 'search'
): string {
  const { sources, citationsMap, sourceCount } = sourcesPack;
  const guidance = getIntentGuidance(intent);

  // Build a chunkId -> source map for O(1) lookups (vs O(n) find per citation)
  const sourceMap = new Map<string, ScoredChunk>();
  for (const source of sources) {
    sourceMap.set(source.chunkId, source);
  }

  // Pre-allocate array for source text parts
  const sourceParts: string[] = new Array(citationsMap.size);
  let idx = 0;

  for (const [cid, citation] of citationsMap) {
    const chunk = sourceMap.get(citation.chunkId);
    const text = chunk?.text || citation.snippet;
    const date = new Date(citation.createdAt).toLocaleDateString('en-US', DATE_FORMAT_OPTIONS);
    sourceParts[idx++] = `[${cid}] ${date}\n${text}`;
  }

  const sourcesText = sourceParts.join('\n\n');

  // Build final prompt using pre-built template parts
  return PROMPT_TEMPLATE_START +
    guidance.format + '\n' +
    guidance.tone +
    PROMPT_TEMPLATE_SOURCES +
    sourceCount +
    PROMPT_TEMPLATE_QUESTION +
    sourcesText +
    PROMPT_TEMPLATE_END +
    query +
    PROMPT_TEMPLATE_ANSWER;
}

// NOTE: Citation validation functions (validateCitations, extractVerificationKeywords,
// calculateOverlapScore, verifyCitationRelevance) have been consolidated into
// src/citationValidator.ts as the single canonical validation module.
// Use validateCitationsWithChunks() for all citation validation.

/**
 * Find citation references in the answer that don't map to valid citations.
 * Returns array of dangling reference strings like ["N5", "N7"]
 */
function findDanglingCitationReferences(answer: string, validCitations: Citation[]): string[] {
  const validCids = new Set(validCitations.map(c => c.cid));
  const citationPattern = /\[N(\d+)\]/g;
  const danglingRefs: string[] = [];

  let match;
  while ((match = citationPattern.exec(answer)) !== null) {
    const cid = `N${match[1]}`;
    if (!validCids.has(cid)) {
      danglingRefs.push(cid);
    }
  }

  // Return unique dangling refs
  return [...new Set(danglingRefs)];
}

/**
 * Remove dangling citation references from the answer.
 * Cleans up [N#] patterns that don't map to valid citations.
 */
function removeDanglingReferences(answer: string, danglingRefs: string[]): string {
  let cleaned = answer;
  for (const ref of danglingRefs) {
    // Remove the [N#] pattern, handling multiple occurrences
    const pattern = new RegExp(`\\[${ref}\\]`, 'g');
    cleaned = cleaned.replace(pattern, '');
  }
  // Clean up any double spaces left behind
  cleaned = cleaned.replace(/  +/g, ' ').trim();
  return cleaned;
}

/**
 * Build a repair prompt to fix missing or invalid citations
 * Provides specific feedback about what needs to be fixed
 */
function buildCitationRepairPrompt(
  originalAnswer: string,
  citations: Map<string, Citation>,
  invalidCids?: string[] // Optional: list of invalid citation IDs to remove
): string {
  const citationList = Array.from(citations.entries())
    .map(([cid, c]) => {
      return `[${cid}]: "${c.snippet.slice(0, 200)}${c.snippet.length > 200 ? '...' : ''}"`;
    })
    .join('\n');

  // Build feedback about invalid citations if provided
  const invalidFeedback = invalidCids && invalidCids.length > 0
    ? `\nPROBLEM: The following citations are INVALID and must be removed or replaced: ${invalidCids.join(', ')}\nThese citations do not match their claimed source content.\n`
    : '';

  return `Fix the citations in this answer. Use ONLY [N1], [N2], etc. matching the sources below.
${invalidFeedback}
AVAILABLE SOURCES (use ONLY these):
${citationList}

ANSWER TO FIX:
${originalAnswer}

STRICT RULES:
1. Every factual claim MUST have a citation [N#] immediately after it
2. Only use citation IDs that exist in the sources above
3. Each citation must ACTUALLY support the claim (don't cite randomly)
4. Don't change the meaning or add new information
5. If a claim has no supporting source, either remove the claim or state "according to my notes" without a citation

REWRITE WITH CORRECT CITATIONS:`;
}

/**
 * Generate chat response with RAG
 */
export async function generateChatResponse(request: ChatRequest): Promise<ChatResponse> {
  const startTime = Date.now();

  // Check GenAI availability early to return 503 instead of 500
  if (!isGenAIAvailable()) {
    throw new ConfigurationError('Chat service is not configured. Set GOOGLE_API_KEY/GEMINI_API_KEY or configure Vertex AI.');
  }

  // Sanitize and validate input
  const query = sanitizeText(request.message, CHAT_MAX_QUERY_LENGTH + 100).trim();
  const tenantId = request.tenantId || DEFAULT_TENANT_ID;

  // Initialize structured retrieval log (generate requestId if not provided)
  const retrievalLog = createRetrievalLog(tenantId, query) as RetrievalLogEntry;

  // Timing metrics for observability
  const timing: RetrievalTimings = {
    totalMs: 0,
  };

  // Quality flags for logging
  const qualityFlags: QualityFlags = {
    citationCoveragePct: 0,
    invalidCitationsRemoved: 0,
    fallbackUsed: false,
    insufficientEvidence: false,
    regenerationAttempted: false,
  };

  if (!query) {
    throw new Error('message is required');
  }

  if (query.length > CHAT_MAX_QUERY_LENGTH) {
    throw new Error(`message too long (max ${CHAT_MAX_QUERY_LENGTH} chars)`);
  }

  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  // Analyze query for intent and keywords
  const queryAnalysis = analyzeQuery(query);

  // Calculate adaptive K based on query complexity
  // With dynamic context budget, we no longer cap rerankTo to a small fixed number
  const adaptiveK = calculateAdaptiveK(query, queryAnalysis.intent, queryAnalysis.keywords);
  const rerankTo = adaptiveK * 3; // Allow more candidates for dynamic selection

  // Calculate context budget for sources (leave room for system prompt + query)
  const contextBudget = LLM_CONTEXT_BUDGET_CHARS - LLM_CONTEXT_RESERVE_CHARS;

  // Retrieve relevant chunks with dynamic context budget
  const retrievalStart = Date.now();
  let { chunks, strategy, candidateCount, candidateCounts } = await retrieveRelevantChunks(query, {
    tenantId,
    topK: RETRIEVAL_TOP_K,
    rerankTo,
    contextBudget,
  });
  timing.retrievalMs = Date.now() - retrievalStart;

  // Handle no results
  if (chunks.length === 0) {
    return {
      answer: "I don't have any notes to search through. Try creating some notes first!",
      sources: [],
      meta: {
        model: CHAT_MODEL,
        requestId: retrievalLog.requestId,
        responseTimeMs: Date.now() - startTime,
        intent: queryAnalysis.intent,
        confidence: 'none' as ConfidenceLevel,
        sourceCount: 0,
        debug: { strategy: 'no_results' },
      },
      citations: [], // Backwards compatibility
    };
  }

  // Build SourcesPack - single source of truth for sources/citations
  // This ensures prompt source count == citationsMap.size EXACTLY
  // Pass query keywords for query-aware snippet extraction
  const queryTerms = queryAnalysis.keywords || [];
  const sourcesPack = buildSourcesPack(chunks, queryTerms);
  const { citationsMap, sourceCount } = sourcesPack;

  // Build prompt with intent-aware instructions using SourcesPack
  const prompt = buildPrompt(query, sourcesPack, queryAnalysis.intent);

  // Call LLM with retry logic
  const client = getGenAIClient();
  let answer: string;

  const generationStart = Date.now();
  try {
    const result = await withLLMRetry(async () => {
      return await client.models.generateContent({
        model: CHAT_MODEL,
        contents: prompt,
        config: {
          temperature: CHAT_TEMPERATURE,
          topP: CHAT_TOP_P,
          topK: CHAT_TOP_K,
          maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
        },
      });
    }, 'LLM generation');

    answer = result.text || '';
    timing.generationMs = Date.now() - generationStart;

    // Log token usage and cost estimates
    // Gemini Flash pricing: ~$0.075 per 1M input tokens, ~$0.30 per 1M output tokens
    const inputTokenEstimate = Math.ceil(prompt.length / 4); // Rough estimate
    const outputTokenEstimate = Math.ceil(answer.length / 4);
    const inputCostUsd = (inputTokenEstimate / 1000000) * 0.075;
    const outputCostUsd = (outputTokenEstimate / 1000000) * 0.30;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    logInfo('LLM generation complete', {
      model: CHAT_MODEL,
      inputTokensEstimate: inputTokenEstimate,
      outputTokensEstimate: outputTokenEstimate,
      estimatedCostUsd: Math.round(totalCostUsd * 1000000) / 1000000,
      elapsedMs: timing.generationMs,
    });

    if (!answer) {
      throw new Error('Empty response from model');
    }
  } catch (err) {
    timing.generationMs = Date.now() - generationStart;
    if (err instanceof RateLimitError) {
      logError('LLM rate limit hit', err);
      throw err; // Let the handler return 429
    }
    if (err instanceof ConfigurationError) {
      logError('LLM configuration error', err);
      throw err; // Let the handler return 503
    }
    // Check for configuration-related errors from the GenAI client
    const errMessage = err instanceof Error ? err.message : String(err);
    if (errMessage.includes('API key') ||
        errMessage.includes('GOOGLE_API_KEY') ||
        errMessage.includes('GEMINI_API_KEY') ||
        errMessage.includes('GOOGLE_CLOUD_PROJECT') ||
        errMessage.includes('credentials')) {
      logError('LLM configuration error', err);
      throw new ConfigurationError(`Chat service configuration error: ${errMessage}`);
    }
    logError('LLM generation failed', err);
    throw new Error('Failed to generate response');
  }

  // Unified citation validation pipeline using citationValidator
  // This consolidates: invalid citation removal, formatting cleanup, overlap verification
  const citationsList = Array.from(citationsMap.values());
  const validationResult = validateCitationsWithChunks(
    answer,
    citationsList,
    chunks,
    {
      strictMode: true,
      minOverlapScore: CITATION_MIN_OVERLAP_SCORE,
      verifyRelevance: CITATION_VERIFICATION_ENABLED,
      requestId: retrievalLog.requestId,
    }
  );

  let cleanedAnswer = validationResult.validatedAnswer;
  let usedCitations = validationResult.validatedCitations;
  // Use a function to check hasCitations dynamically (usedCitations may be updated by repair)
  const checkHasCitations = () => usedCitations.length > 0;

  // Track citation quality metrics
  const totalRemovedCount = validationResult.invalidCitationsRemoved.length + validationResult.droppedCitations.length;
  if (totalRemovedCount > 0) {
    qualityFlags.invalidCitationsRemoved = totalRemovedCount;
  }

  // Detect if response looks like uncertainty about the question
  const looksLikeUncertainty =
    cleanedAnswer.toLowerCase().includes("don't have") ||
    cleanedAnswer.toLowerCase().includes("don't see") ||
    cleanedAnswer.toLowerCase().includes("cannot find") ||
    cleanedAnswer.toLowerCase().includes("no notes about") ||
    cleanedAnswer.toLowerCase().includes("no information");

  // Calculate citation coverage using sourceCount (== citationsMap.size)
  // This ensures we compute coverage against the EXACT number of sources in the prompt
  const citationCoverage = sourceCount > 0 ? usedCitations.length / sourceCount : 1;
  const hasLowCoverage = sourceCount >= 3 && citationCoverage < MIN_CITATION_COVERAGE && !looksLikeUncertainty;

  // Also trigger repair if validation removed invalid citations
  const invalidCidsFromValidation = validationResult.invalidCitationsRemoved.concat(validationResult.droppedCitations);
  const hasInvalidCitations = invalidCidsFromValidation.length > 0;

  // Retry if no citations found OR low citation coverage OR invalid citations removed
  if ((!checkHasCitations() || hasLowCoverage || hasInvalidCitations) && !looksLikeUncertainty && CITATION_RETRY_ENABLED && sourceCount > 0) {
    const repairStart = Date.now();
    const repairReason = !checkHasCitations()
      ? 'no citations'
      : hasInvalidCitations
        ? `invalid citations removed (${invalidCidsFromValidation.join(', ')})`
        : `low coverage (${Math.round(citationCoverage * 100)}%)`;
    qualityFlags.regenerationAttempted = true;
    logInfo('Attempting citation repair', {
      reason: repairReason,
      citationCount: usedCitations.length,
      sourceCount,
      invalidRemoved: invalidCidsFromValidation,
    });

    try {
      // Pass invalid citations to repair prompt for better feedback
      const repairPrompt = buildCitationRepairPrompt(answer, citationsMap, invalidCidsFromValidation);
      // Use shorter timeout for repair since it's a secondary operation
      const repairResult = await withLLMRetry(async () => {
        return await client.models.generateContent({
          model: CHAT_MODEL,
          contents: repairPrompt,
          config: {
            temperature: 0.1, // Low temp for repair
            maxOutputTokens: 1024,
          },
        });
      }, 'Citation repair', CHAT_TIMEOUT_MS / 2);

      const repairedAnswer = repairResult.text || '';
      if (repairedAnswer) {
        // Use unified validation for repaired answer
        const repairedValidation = validateCitationsWithChunks(
          repairedAnswer,
          citationsList,
          chunks,
          {
            strictMode: true,
            minOverlapScore: CITATION_MIN_OVERLAP_SCORE,
            verifyRelevance: CITATION_VERIFICATION_ENABLED,
            requestId: retrievalLog.requestId,
          }
        );
        const repairedHasCitations = repairedValidation.validatedCitations.length > 0;
        // Accept repair if it improved citation coverage (using sourceCount)
        const repairedCoverage = repairedValidation.validatedCitations.length / sourceCount;
        if (repairedHasCitations && repairedCoverage > citationCoverage) {
          cleanedAnswer = repairedValidation.validatedAnswer;
          usedCitations = repairedValidation.validatedCitations;
          strategy += '_repaired';
          logInfo('Citation repair successful', {
            citationCount: usedCitations.length,
            coverageBefore: Math.round(citationCoverage * 100),
            coverageAfter: Math.round(repairedCoverage * 100),
          });
        } else {
          logWarn('Citation repair did not improve coverage, using original');
        }
      }
      timing.repairMs = Date.now() - repairStart;
    } catch (repairErr) {
      timing.repairMs = Date.now() - repairStart;
      logError('Citation repair error', repairErr);
      // Continue with original answer
    }
  }

  // Final consistency check: ensure no dangling citation references in the answer
  // This catches any [N#] references that don't map to valid citations
  const danglingRefs = findDanglingCitationReferences(cleanedAnswer, usedCitations);
  if (danglingRefs.length > 0) {
    logWarn('Dangling citation references detected, removing', {
      danglingRefs,
      usedCitationCids: usedCitations.map(c => c.cid),
    });
    // Remove dangling references from the answer
    cleanedAnswer = removeDanglingReferences(cleanedAnswer, danglingRefs);
    qualityFlags.danglingRefsRemoved = danglingRefs.length;
  }

  // If still no valid citations and answer doesn't acknowledge uncertainty, provide helpful fallback
  if (!checkHasCitations() && !looksLikeUncertainty) {
    qualityFlags.insufficientEvidence = true;
    qualityFlags.fallbackUsed = true;
    logInfo('No citations found, using fallback response');

    // Build a helpful response mentioning what topics ARE in the notes
    const noteTopics = extractTopicsFromChunks(chunks);
    let fallbackAnswer: string;

    if (noteTopics.length > 0) {
      fallbackAnswer = `I couldn't find notes specifically about that. Your notes currently cover topics like ${noteTopics.join(', ')}. Try creating a note about what you're looking for!`;
    } else {
      fallbackAnswer = "I couldn't find notes about that topic. Try rephrasing your question, or create a note about this topic so I can help you next time!";
    }

    return {
      answer: fallbackAnswer,
      sources: [],
      meta: {
        model: CHAT_MODEL,
        requestId: retrievalLog.requestId,
        responseTimeMs: Date.now() - startTime,
        intent: queryAnalysis.intent,
        confidence: 'none' as ConfidenceLevel,
        sourceCount: 0,
        debug: {
          strategy,
          candidateCount,
          rerankCount: chunks.length,
        },
      },
      citations: [], // Backwards compatibility
    };
  }

  // ===== ENHANCED RESPONSE PROCESSING =====
  // Apply post-processing for consistency and quality

  const postProcessStart = Date.now();

  // 0. Run unified citation verification pipeline (new enhanced verification)
  let pipelineResult;
  if (UNIFIED_PIPELINE_ENABLED) {
    try {
      pipelineResult = await runUnifiedCitationPipeline(
        cleanedAnswer,
        usedCitations,
        chunks,
        queryAnalysis.intent
      );

      // Log pipeline results
      logInfo('Unified pipeline verification complete', {
        overallConfidence: Math.round(pipelineResult.overallConfidence * 100) / 100,
        citationAccuracy: Math.round(pipelineResult.citationAccuracy * 100) / 100,
        contractCompliant: pipelineResult.contractCompliant,
        hasContradictions: pipelineResult.hasContradictions,
        weakCitationCount: pipelineResult.weakCitations.length,
        invalidRemoved: pipelineResult.invalidCitationsRemoved.length,
        processingTimeMs: pipelineResult.processingTimeMs,
      });

      // Use validated output from pipeline
      cleanedAnswer = pipelineResult.validatedAnswer;
      usedCitations = pipelineResult.validatedCitations;

      // Update quality flags based on pipeline results
      if (pipelineResult.invalidCitationsRemoved.length > 0) {
        qualityFlags.potentialHallucinations = true;
      }
      if (pipelineResult.hasContradictions) {
        qualityFlags.contradictionsDetected = true;
      }
    } catch (pipelineError) {
      logWarn('Unified pipeline failed, continuing with standard processing',
        pipelineError instanceof Error ? { error: pipelineError.message } : undefined);
    }
  }

  // 1. Enforce response consistency (new)
  if (CONSISTENCY_ENFORCEMENT_ENABLED) {
    const { correctedAnswer, result: consistencyResult } = enforceResponseConsistency(
      cleanedAnswer,
      queryAnalysis.intent
    );
    cleanedAnswer = correctedAnswer;

    if (!consistencyResult.isConsistent) {
      logInfo('Response consistency enforced', {
        corrections: consistencyResult.corrections,
        toneConsistency: Math.round(consistencyResult.toneConsistency * 100) / 100,
        formatConsistency: Math.round(consistencyResult.formatConsistency * 100) / 100,
        citationConsistency: Math.round(consistencyResult.citationConsistency * 100) / 100,
      });
    }
  }

  // 2. Post-process response for consistent formatting
  const postProcessed = postProcessResponse(
    cleanedAnswer,
    usedCitations,
    queryAnalysis.intent
  );
  cleanedAnswer = postProcessed.processedAnswer;
  usedCitations = postProcessed.citations;

  // Log post-processing modifications
  if (postProcessed.modifications.length > 0) {
    logInfo('Response post-processed', {
      modifications: postProcessed.modifications,
      coherenceScore: postProcessed.coherenceScore,
      structureType: postProcessed.structureType,
    });
  }

  // 3. Validate response quality
  const qualityValidation = validateResponseQuality(cleanedAnswer, usedCitations);
  if (!qualityValidation.isValid) {
    logWarn('Response quality issues detected', {
      issues: qualityValidation.issues,
      suggestions: qualityValidation.suggestions,
    });
  }

  // 4. Calculate enhanced confidence metrics
  const confidenceBreakdown = calculateResponseConfidence(
    cleanedAnswer,
    usedCitations,
    chunks,
    queryAnalysis.intent
  );

  // 5. Score citation confidence (lightweight - no semantic scoring for speed)
  const claimPairs = extractClaimCitationPairs(cleanedAnswer);
  let citationConfidenceMetrics = {
    averageConfidence: 0,
    highConfidenceCount: 0,
    insufficientCount: 0,
  };

  if (claimPairs.length > 0) {
    const citationScores = await batchScoreCitations(
      claimPairs,
      usedCitations,
      chunks,
      { useSemanticScoring: false } // Disable for speed in production
    );
    citationConfidenceMetrics = {
      averageConfidence: citationScores.averageConfidence,
      highConfidenceCount: citationScores.highConfidenceCount,
      insufficientCount: citationScores.insufficientCount,
    };

    // 6. Aggregate confidence scores for overall quality assessment
    const aggregatedConfidence = aggregateConfidenceScores(citationScores.scores);

    // Log aggregate confidence
    if (aggregatedConfidence.weakestCitations.length > 0) {
      logInfo('Citation confidence aggregated', {
        overallScore: aggregatedConfidence.overallScore,
        level: aggregatedConfidence.confidenceLevel,
        distribution: aggregatedConfidence.scoreDistribution,
        recommendation: aggregatedConfidence.recommendation,
      });
    }

    // Filter out citations with insufficient confidence
    if (citationScores.insufficientCount > 0) {
      const { rejected } = filterByConfidence(citationScores.scores);
      if (rejected.length > 0) {
        logWarn('Low confidence citations detected', {
          rejectedCount: rejected.length,
          rejectedCids: rejected.map(r => r.cid),
        });
      }
    }
  }

  // 7. Enhanced response validation and repair
  const enhancedValidation = validateAndRepair(cleanedAnswer, sourceCount, queryAnalysis.intent);
  if (enhancedValidation.repair) {
    cleanedAnswer = enhancedValidation.finalResponse;
    logInfo('Response validation and repair applied', {
      issuesFixed: enhancedValidation.repair.issuesFixed,
      issuesRemaining: enhancedValidation.repair.issuesRemaining,
      repairsApplied: enhancedValidation.repair.repairsApplied,
    });
  }

  // 8. Claim anchoring verification (if enabled)
  let anchoringResult: AnchoringResult | undefined;
  if (isClaimAnchoringEnabled()) {
    anchoringResult = anchorClaims(cleanedAnswer, chunks);
    if (anchoringResult.unsupportedClaims.length > 0) {
      logWarn('Claim anchoring: unsupported claims detected', {
        unsupportedCount: anchoringResult.unsupportedClaims.length,
        overallScore: anchoringResult.overallScore,
        misattributedCitations: anchoringResult.misattributedCitations,
      });
    }
  }

  timing.postProcessMs = Date.now() - postProcessStart;
  // ===== END ENHANCED PROCESSING =====

  timing.totalMs = Date.now() - startTime;
  // Use sourceCount (== citationsMap.size) for consistent coverage calculation
  const finalCoverage = sourceCount > 0 ? Math.round((usedCitations.length / sourceCount) * 100) : 100;

  // Build citation log entries
  const citationLogEntries: CitationLogEntry[] = usedCitations.map(c => ({
    cid: c.cid,
    noteId: c.noteId,
    chunkId: c.chunkId,
    score: c.score,
    snippetLength: c.snippet.length,
  }));

  // Update quality flags
  qualityFlags.citationCoveragePct = finalCoverage;

  // Determine retrieval mode
  const retrievalMode = strategy.includes('hybrid') ? 'hybrid' :
    strategy.includes('vector') ? 'vector' :
    strategy.includes('fallback') ? 'fallback' : 'keyword_only';

  // Build citation validation stats from pipeline result (if available)
  const citationValidationStats: CitationValidationStats | undefined = pipelineResult ? {
    totalCitationsInAnswer: pipelineResult.citationValidations.length,
    validCitations: pipelineResult.validatedCitations.length,
    invalidCitationsRemoved: pipelineResult.invalidCitationsRemoved.length,
    weakCitations: pipelineResult.weakCitations.length,
    contractCompliant: pipelineResult.contractCompliant,
    overallConfidence: pipelineResult.overallConfidence,
    citationAccuracy: pipelineResult.citationAccuracy,
  } : undefined;

  // Complete the retrieval log entry with comprehensive observability
  const finalLog: RetrievalLogEntry = {
    ...retrievalLog,
    intent: queryAnalysis.intent,
    retrievalMode: retrievalMode as 'vector' | 'hybrid' | 'keyword_only' | 'fallback',
    candidateCounts: {
      vectorK: candidateCounts?.vectorK || 0,
      keywordK: candidateCounts?.lexicalK || 0,
      mergedK: candidateCounts?.mergedK || candidateCount,
      afterRerank: candidateCounts?.rerankedK || chunks.length,
      finalChunks: candidateCounts?.finalK || chunks.length,
    },
    // Add detailed stage counts for debugging retrieval issues
    stageDetails: candidateCounts ? candidateCountsToStageDetails(candidateCounts) : undefined,
    // Score distribution helps identify single-source dominance or sparse results
    scoreDistribution: computeScoreDistribution(chunks),
    rerankMethod: strategy,
    citations: citationLogEntries,
    timings: timing,
    quality: qualityFlags,
    answerLength: cleanedAnswer.length,
    // New Phase 5 observability fields
    totalSourcesReturned: usedCitations.length,
    llmContextBudgetChars: contextBudget,
    citationValidation: citationValidationStats,
    pipelineProcessingMs: pipelineResult?.processingTimeMs,
  };

  // Log the structured retrieval trace
  logRetrieval(finalLog);

  // Log comprehensive metrics for observability (existing log)
  logInfo('Chat response generated', {
    requestId: retrievalLog.requestId,
    queryLength: query.length,
    intent: queryAnalysis.intent,
    // Counts
    candidatesFetched: candidateCount,
    chunksUsed: chunks.length,
    citationsUsed: usedCitations.length,
    citationCoverage: `${finalCoverage}%`,
    strategy,
    // Latency breakdown
    timing: {
      retrievalMs: timing.retrievalMs || 0,
      generationMs: timing.generationMs || 0,
      repairMs: timing.repairMs || 0,
      totalMs: timing.totalMs,
    },
  });

  // Warn if coverage is below strict threshold (helps identify issues in production)
  if (finalCoverage < MIN_CITATION_COVERAGE_STRICT * 100 && sourceCount >= 3 && !looksLikeUncertainty) {
    logWarn('Low citation coverage detected', {
      requestId: retrievalLog.requestId,
      coverage: `${finalCoverage}%`,
      threshold: `${MIN_CITATION_COVERAGE_STRICT * 100}%`,
      citationCount: usedCitations.length,
      sourceCount,
      query: query.slice(0, 100),
    });
  }

  // Final observability summary log
  logInfo('Chat request complete', {
    requestId: retrievalLog.requestId,
    tenantId,
    intent: queryAnalysis.intent,
    sourceCount,
    citationCount: usedCitations.length,
    citationCoveragePct: finalCoverage,
    uniqueNotesInContext: new Set(chunks.map(c => c.noteId)).size,
    answerLength: cleanedAnswer.length,
    qualityFlags: {
      repairAttempted: qualityFlags.regenerationAttempted,
      danglingRefsRemoved: qualityFlags.danglingRefsRemoved ?? 0,
      invalidCitationsRemoved: qualityFlags.invalidCitationsRemoved,
    },
    timingMs: {
      retrieval: timing.retrievalMs,
      generation: timing.generationMs,
      repair: timing.repairMs,
      postProcess: timing.postProcessMs,
      total: timing.totalMs,
    },
    enhancedConfidence: confidenceBreakdown.overallConfidence,
  });

  // Normalize answer to use clean citation format [1] instead of [N1]
  const normalizedAnswer = normalizeCitationFormat(cleanedAnswer);

  // Calculate average relevance score for confidence
  const avgScore = usedCitations.length > 0
    ? usedCitations.reduce((sum, c) => sum + c.score, 0) / usedCitations.length
    : 0;

  // Build human-readable sources (cited in the answer)
  const sources = citationsToSources(usedCitations);

  // Build contextSources (all context sources not cited in the answer)
  // These are sources the LLM had access to but didn't directly quote
  // Skip context sources when:
  // 1. Answer indicates uncertainty (no relevant notes found)
  // 2. Confidence is very low, which means context isn't actually helpful
  // 3. Top chunk score is too low (out-of-scope query)
  const citedChunkIds = new Set(usedCitations.map(c => c.chunkId));
  const lastCitedId = usedCitations.length; // IDs are 1-indexed, so next ID is length + 1

  // Only show context sources when we have truly relevant context
  // Stricter threshold: at least 0.35 relevance on top chunk AND we have citations
  // For out-of-scope queries with no citations, don't show irrelevant context
  const hasRelevantContext = usedCitations.length > 0 &&
    (chunks.length > 0 && chunks[0].score >= 0.35);

  const contextSources = hasRelevantContext
    ? buildContextSources(chunks, citedChunkIds, lastCitedId + 1, queryTerms)
    : [];

  // Get enhanced confidence summary
  const enhancedConfidenceSummary = getConfidenceSummary(confidenceBreakdown);

  // Determine confidence level - now uses enhanced confidence as primary signal
  const confidence = calculateConfidence(
    usedCitations.length,
    sourceCount,
    avgScore,
    looksLikeUncertainty,
    confidenceBreakdown.confidenceLevel  // Pass enhanced level for accurate mapping
  );

  return {
    answer: normalizedAnswer,
    sources,
    contextSources: contextSources.length > 0 ? contextSources : undefined,
    meta: {
      model: CHAT_MODEL,
      requestId: retrievalLog.requestId,
      responseTimeMs: timing.totalMs,
      intent: queryAnalysis.intent,
      confidence,
      sourceCount: usedCitations.length,
      debug: {
        strategy,
        candidateCount,
        rerankCount: chunks.length,
        // Enhanced quality metrics
        enhancedConfidence: {
          overall: enhancedConfidenceSummary.score,
          level: enhancedConfidenceSummary.level,
          isReliable: enhancedConfidenceSummary.isReliable,
          breakdown: {
            citationDensity: confidenceBreakdown.citationDensity,
            sourceRelevance: confidenceBreakdown.sourceRelevance,
            answerCoherence: confidenceBreakdown.answerCoherence,
            claimSupport: confidenceBreakdown.claimSupport,
          },
        },
        citationQuality: {
          averageConfidence: citationConfidenceMetrics.averageConfidence,
          highConfidenceCount: citationConfidenceMetrics.highConfidenceCount,
          insufficientCount: citationConfidenceMetrics.insufficientCount,
        },
        postProcessing: {
          modifications: postProcessed.modifications.length,
          coherenceScore: postProcessed.coherenceScore,
          structureType: postProcessed.structureType,
        },
        // Phase 5: Validation pipeline observability
        validation: pipelineResult ? {
          contractCompliant: pipelineResult.contractCompliant,
          citationAccuracy: Math.round(pipelineResult.citationAccuracy * 100) / 100,
          overallConfidence: Math.round(pipelineResult.overallConfidence * 100) / 100,
          invalidRemoved: pipelineResult.invalidCitationsRemoved.length,
          pipelineMs: pipelineResult.processingTimeMs,
        } : undefined,
      },
    },
    // Backwards compatibility
    citations: usedCitations,
  };
}

