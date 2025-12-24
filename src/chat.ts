/**
 * Chat Service
 *
 * RAG-powered chat with inline citations, retry logic, and structured retrieval logging.
 */

// =============================================================================
// Imports
// =============================================================================

// Configuration
import {
  CHAT_MODEL,
  CHAT_TIMEOUT_MS,
  CHAT_MAX_QUERY_LENGTH,
  CHAT_TEMPERATURE,
  CHAT_TOP_P,
  CHAT_TOP_K,
  LLM_MAX_OUTPUT_TOKENS,
  RETRIEVAL_TOP_K,
  LLM_CONTEXT_BUDGET_CHARS,
  LLM_CONTEXT_RESERVE_CHARS,
  CITATION_RETRY_ENABLED,
  CITATION_VERIFICATION_ENABLED,
  CITATION_MIN_OVERLAP_SCORE,
} from './config';

// Types
import {
  ChatRequest,
  ChatResponse,
  Citation,
  ScoredChunk,
  QueryIntent,
  SourcesPack,
  Source,
  ConfidenceLevel,
} from './types';

// Core modules
import { retrieveRelevantChunks, analyzeQuery, calculateAdaptiveK } from './retrieval';
import { logInfo, logError, logWarn, sanitizeText, isValidTenantId } from './utils';
import { validateCitationsWithChunks } from './citationValidator';
import { getGenAIClient, isGenAIAvailable } from './genaiClient';

// Retrieval logging
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
} from './retrievalLogger';

// Response processing
import {
  postProcessResponse,
  validateResponseQuality,
  enforceResponseConsistency,
} from './responsePostProcessor';
import { calculateResponseConfidence, getConfidenceSummary } from './responseConfidence';
import {
  extractClaimCitationPairs,
  batchScoreCitations,
  filterByConfidence,
  aggregateConfidenceScores,
} from './citationConfidence';

// Citation verification pipeline
import { runUnifiedCitationPipeline } from './unifiedCitationPipeline';
import { buildCompleteEnhancedPrompt } from './enhancedPrompts';
import { buildCompleteAgenticPrompt, ResponseFormat } from './agenticPrompts';

// Response validation
import { anchorClaims, isClaimAnchoringEnabled, AnchoringResult } from './claimAnchoring';
import { validateAndRepair } from './responseValidation';

// =============================================================================
// Configuration
// =============================================================================

/** LLM retry configuration */
const LLM_CONFIG = {
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
} as const;

/** Citation coverage thresholds */
const CITATION_THRESHOLDS = {
  MIN_COVERAGE: 0.5,        // Trigger repair if < 50% of sources cited
  MIN_COVERAGE_STRICT: 0.6, // Warn if < 60% coverage after repair
} as const;

/** Feature flags */
const FEATURES = {
  UNIFIED_PIPELINE: true,        // Use unified citation verification pipeline
  CONSISTENCY_ENFORCEMENT: true, // Enforce response consistency
  ENHANCED_PROMPTS: true,        // Use optimized v2 prompts
  AGENTIC_PROMPTS: true,         // Use agentic prompt framework (overrides ENHANCED_PROMPTS)
} as const;

/** Context source filtering */
const CONTEXT_SOURCE_CONFIG = {
  MIN_RELEVANCE: 0.40,  // Minimum relevance for context sources
  MAX_COUNT: 4,         // Maximum context sources to include
} as const;

// =============================================================================
// Custom Error Classes
// =============================================================================

/** Error for server configuration issues (not client errors) */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/** Error for rate limiting */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/** Create a timeout promise that rejects after specified milliseconds */
function createTimeout<T>(ms: number, context: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${context}`)), ms);
  });
}

/** Sleep for specified milliseconds */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Check if error message indicates non-retryable error */
function isNonRetryableError(message: string): boolean {
  return message.includes('INVALID_ARGUMENT') ||
         message.includes('PERMISSION_DENIED') ||
         message.includes('API key');
}

/** Check if error message indicates rate limiting */
function isRateLimitError(message: string): boolean {
  return message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
}

/** Retry LLM call with exponential backoff and hard timeout */
async function withLLMRetry<T>(
  fn: () => Promise<T>,
  context: string,
  timeoutMs: number = CHAT_TIMEOUT_MS
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= LLM_CONFIG.MAX_RETRIES; attempt++) {
    try {
      return await Promise.race([fn(), createTimeout<T>(timeoutMs, context)]);
    } catch (err) {
      lastError = err;
      const errMessage = err instanceof Error ? err.message : String(err);

      if (isNonRetryableError(errMessage)) throw err;
      if (isRateLimitError(errMessage)) throw new RateLimitError('API rate limit exceeded');

      if (errMessage.includes('Timeout')) {
        logWarn(`${context} timeout`, { attempt: attempt + 1, timeoutMs });
      }

      if (attempt < LLM_CONFIG.MAX_RETRIES) {
        const delay = LLM_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt);
        logWarn(`${context} retry`, { attempt: attempt + 1, delayMs: delay });
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// =============================================================================
// Snippet Extraction
// =============================================================================

/** Pre-compiled regex for sentence splitting */
const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+/;

/** Count query terms appearing in text (case-insensitive) */
function countQueryTermMatches(lowerText: string, queryTermsLower: string[]): number {
  let count = 0;
  for (const term of queryTermsLower) {
    if (lowerText.includes(term)) count++;
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

// =============================================================================
// Source Building
// =============================================================================

/**
 * Build a SourcesPack from scored chunks - single source of truth for sources/citations.
 * All chunks passed in are "source-worthy" (already filtered in retrieval).
 */
export function buildSourcesPack(chunks: ScoredChunk[], queryTerms: string[] = []): SourcesPack {
  const citationsMap = new Map<string, Citation>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const cid = `N${i + 1}`;
    const citation: Citation = {
      cid,
      noteId: chunk.noteId,
      chunkId: chunk.chunkId,
      createdAt: chunk.createdAt.toISOString(),
      snippet: extractBestSnippet(chunk.text, 250, queryTerms),
      score: Math.round(chunk.score * 100) / 100,
    };

    // Include offset information for precise citation anchoring
    if (chunk.startOffset !== undefined) citation.startOffset = chunk.startOffset;
    if (chunk.endOffset !== undefined) citation.endOffset = chunk.endOffset;
    if (chunk.anchor) citation.anchor = chunk.anchor;

    citationsMap.set(cid, citation);
  }

  return { sources: chunks, citationsMap, sourceCount: chunks.length };
}

/** Topic patterns for context hints */
const TOPIC_PATTERNS = [
  /\b(meeting|sprint|planning|decision|architecture|design)\b/gi,
  /\b(RAG|pipeline|chunking|embedding|retrieval|vector)\b/gi,
  /\b(Cloud Run|Firestore|API|backend|frontend)\b/gi,
  /\b(pagination|scaling|performance|optimization)\b/gi,
];

/** Extract key topics from chunks for context hints */
function extractTopicsFromChunks(chunks: ScoredChunk[]): string[] {
  const topics = new Set<string>();
  const allText = chunks.map(c => c.text).join(' ').toLowerCase();

  for (const pattern of TOPIC_PATTERNS) {
    const matches = allText.match(pattern);
    if (matches) {
      matches.slice(0, 3).forEach(m => topics.add(m.toLowerCase()));
    }
  }

  return Array.from(topics).slice(0, 5);
}

/** Convert citations to human-readable Source objects */
function citationsToSources(citations: Citation[]): Source[] {
  return citations.map(c => {
    const source: Source = {
      id: c.cid.replace('N', ''),
      noteId: c.noteId,
      preview: c.snippet.length > 120 ? c.snippet.slice(0, 117) + '...' : c.snippet,
      date: new Date(c.createdAt).toLocaleDateString('en-US', DATE_FORMAT_OPTIONS),
      relevance: Math.round(c.score * 100) / 100,
    };
    if (c.startOffset !== undefined) source.startOffset = c.startOffset;
    if (c.endOffset !== undefined) source.endOffset = c.endOffset;
    if (c.anchor) source.anchor = c.anchor;
    return source;
  });
}

/** Build contextSources from chunks used as context but not cited */
function buildContextSources(
  allChunks: ScoredChunk[],
  citedChunkIds: Set<string>,
  startId: number
): Source[] {
  const uncitedChunks = allChunks
    .filter(chunk => !citedChunkIds.has(chunk.chunkId) && chunk.score >= CONTEXT_SOURCE_CONFIG.MIN_RELEVANCE)
    .sort((a, b) => b.score - a.score)
    .slice(0, CONTEXT_SOURCE_CONFIG.MAX_COUNT);

  return uncitedChunks.map((chunk, index) => ({
    id: String(startId + index),
    noteId: chunk.noteId,
    preview: chunk.text.length > 120 ? chunk.text.slice(0, 117) + '...' : chunk.text,
    date: chunk.createdAt.toLocaleDateString('en-US', DATE_FORMAT_OPTIONS),
    relevance: Math.round(chunk.score * 100) / 100,
  }));
}

// =============================================================================
// Confidence Calculation
// =============================================================================

/** Determine confidence level based on citation coverage and scores */
function calculateConfidence(
  citationCount: number,
  sourceCount: number,
  avgScore: number,
  looksLikeUncertainty: boolean,
  enhancedLevel?: 'very_high' | 'high' | 'medium' | 'low' | 'very_low'
): ConfidenceLevel {
  if (looksLikeUncertainty || citationCount === 0) return 'none';

  // Map enhanced confidence to ConfidenceLevel
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

  // Fallback to legacy calculation
  const coverage = sourceCount > 0 ? citationCount / sourceCount : 0;
  if (coverage >= 0.4 && avgScore >= 0.5) return 'high';
  if (coverage >= 0.2 && avgScore >= 0.3) return 'medium';
  return 'low';
}

/** Normalize citation format from [N#] to [#] for cleaner display */
function normalizeCitationFormat(answer: string): string {
  return answer.replace(/\[N(\d+)\]/g, '[$1]');
}

// =============================================================================
// Prompt Building
// =============================================================================

/** Intent-specific formatting guidance */
const INTENT_GUIDANCE: Record<QueryIntent, { format: string; tone: string }> = {
  summarize: {
    format: 'Start with a one-sentence overview, then use bullet points (•) for 2-4 key details.',
    tone: 'Synthesize information naturally. Avoid repeating the same facts.',
  },
  list: {
    format: 'Use bullet points (•) or numbers. One item per line. Group related items together.',
    tone: 'Be scannable and organized.',
  },
  decision: {
    format: 'State the decision clearly first. Then explain the reasoning in 1-2 sentences.',
    tone: 'Be definitive. Use "decided to" or "chose" language.',
  },
  action_item: {
    format: 'Use bullet points (•) for each action. Include who/when if mentioned in notes.',
    tone: 'Be actionable and clear.',
  },
  question: {
    format: 'Answer directly in the first sentence. Add brief context only if it helps understanding.',
    tone: 'Be conversational but precise.',
  },
  search: {
    format: 'Write 1-3 short paragraphs. Use bullet points if listing multiple related items.',
    tone: 'Be helpful and natural.',
  },
};

/** Get intent-specific formatting guidance */
function getIntentGuidance(intent: QueryIntent): { format: string; tone: string } {
  return INTENT_GUIDANCE[intent] || INTENT_GUIDANCE.search;
}

/** Date format options for consistent date display */
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/** Pre-built prompt template parts */
const PROMPT_TEMPLATES = {
  START: `You are a helpful assistant answering questions from the user's personal notes.

## Your Task
Answer the user's question using ONLY the information in the sources below. **Provide a COMPREHENSIVE response that cites ALL relevant sources.** If the sources don't contain relevant information, say "I don't have notes about that."

## Response Guidelines
1. **CITE ALL RELEVANT SOURCES** - Every source containing related information must be cited
2. **Synthesize comprehensively** - Combine information from ALL sources to give a complete answer
3. **Be natural and conversational** - Write like you're explaining to a friend
4. **Structure for readability** - Use bullet points or numbered lists when listing multiple items
5. **Lead with the answer** - Start with the most important information first

## How to Cite
- Cite ALL sources that contain relevant information: [N1][N3][N5]
- Add citations at the END of each paragraph or logical section
- Use format: [N1] or [N1][N2][N3] for multiple sources
- Example: "React Hooks let you use state in functional components. useState manages local state, while useEffect handles side effects like API calls. [N1][N2][N4]"

**CRITICAL:** Do not omit any source that adds useful information. The user wants to see EVERYTHING their notes contain about this topic.

## Formatting
`,
  SOURCES: `\n\n## Sources (`,
  QUESTION: ` total)\n`,
  END: `\n\n## Question\n`,
  ANSWER: `\n\n## Answer`,
} as const;

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

  return PROMPT_TEMPLATES.START +
    guidance.format + '\n' +
    guidance.tone +
    PROMPT_TEMPLATES.SOURCES +
    sourceCount +
    PROMPT_TEMPLATES.QUESTION +
    sourcesText +
    PROMPT_TEMPLATES.END +
    query +
    PROMPT_TEMPLATES.ANSWER;
}

// =============================================================================
// Citation Cleanup
// =============================================================================

// NOTE: Citation validation functions consolidated in src/citationValidator.ts

/** Find citation references that don't map to valid citations */
function findDanglingCitationReferences(answer: string, validCitations: Citation[]): string[] {
  const validCids = new Set(validCitations.map(c => c.cid));
  const citationPattern = /\[N(\d+)\]/g;
  const danglingRefs: string[] = [];

  let match;
  while ((match = citationPattern.exec(answer)) !== null) {
    const cid = `N${match[1]}`;
    if (!validCids.has(cid)) danglingRefs.push(cid);
  }

  return [...new Set(danglingRefs)];
}

/** Remove dangling citation references from the answer */
function removeDanglingReferences(answer: string, danglingRefs: string[]): string {
  let cleaned = answer;
  for (const ref of danglingRefs) {
    cleaned = cleaned.replace(new RegExp(`\\[${ref}\\]`, 'g'), '');
  }
  return cleaned.replace(/  +/g, ' ').trim();
}

/** Build a repair prompt to fix missing or invalid citations */
function buildCitationRepairPrompt(
  originalAnswer: string,
  citations: Map<string, Citation>,
  invalidCids?: string[]
): string {
  const citationList = Array.from(citations.entries())
    .map(([cid, c]) => `[${cid}]: "${c.snippet.slice(0, 200)}${c.snippet.length > 200 ? '...' : ''}"`)
    .join('\n');

  const invalidFeedback = invalidCids?.length
    ? `\nPROBLEM: The following citations are INVALID and must be removed or replaced: ${invalidCids.join(', ')}\nThese citations do not match their claimed source content.\n`
    : '';

  return `Fix the citations in this answer. Use ONLY [N1], [N2], etc. matching the sources below.
${invalidFeedback}
AVAILABLE SOURCES (use ONLY these - cite ALL that are relevant):
${citationList}

ANSWER TO FIX:
${originalAnswer}

STRICT RULES:
1. CITE ALL SOURCES that contain relevant information - do not omit any
2. Every factual claim MUST have a citation [N#] immediately after it
3. Only use citation IDs that exist in the sources above
4. Each citation must ACTUALLY support the claim (don't cite randomly)
5. Don't change the meaning or add new information
6. Combine citations for related claims: [N1][N3][N5]

REWRITE WITH COMPREHENSIVE CITATIONS:`;
}

// =============================================================================
// Main Chat Function
// =============================================================================

/** Generate chat response with RAG */
export async function generateChatResponse(request: ChatRequest): Promise<ChatResponse> {
  const startTime = Date.now();

  // Check GenAI availability early to return 503 instead of 500
  if (!isGenAIAvailable()) {
    throw new ConfigurationError('Chat service is not configured. Set GOOGLE_API_KEY/GEMINI_API_KEY or configure Vertex AI.');
  }

  // Sanitize and validate input
  const query = sanitizeText(request.message, CHAT_MAX_QUERY_LENGTH + 100).trim();
  const tenantId = request.tenantId;

  // SECURITY: tenantId is required - never fall back to 'public'
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

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
  // Priority: Agentic prompts > Enhanced prompts (v2) > Legacy prompts
  let prompt: string;
  let systemInstruction: string | undefined;
  let responseFormat: ResponseFormat | undefined;

  if (FEATURES.AGENTIC_PROMPTS) {
    // Agentic prompts: intelligent response generation with format optimization
    const agenticResult = buildCompleteAgenticPrompt(query, chunks, queryAnalysis.intent);
    systemInstruction = agenticResult.systemPrompt;
    prompt = agenticResult.userPrompt;
    responseFormat = agenticResult.format;

    logInfo('Using agentic prompt framework', {
      intent: queryAnalysis.intent,
      format: responseFormat,
      sourceCount,
    });
  } else if (FEATURES.ENHANCED_PROMPTS) {
    // Enhanced v2 prompts: separate system instruction + user prompt
    const { systemPrompt, userPrompt } = buildCompleteEnhancedPrompt(query, chunks, queryAnalysis.intent);
    systemInstruction = systemPrompt;
    prompt = userPrompt;
  } else {
    // Legacy prompts: single combined prompt string
    prompt = buildPrompt(query, sourcesPack, queryAnalysis.intent);
  }

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
          ...(systemInstruction && { systemInstruction }),
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
  const citationCoverage = sourceCount > 0 ? usedCitations.length / sourceCount : 1;
  const hasLowCoverage = sourceCount >= 3 && citationCoverage < CITATION_THRESHOLDS.MIN_COVERAGE && !looksLikeUncertainty;

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

  // Run unified citation verification pipeline
  let pipelineResult;
  if (FEATURES.UNIFIED_PIPELINE) {
    try {
      pipelineResult = await runUnifiedCitationPipeline(
        cleanedAnswer,
        usedCitations,
        chunks,
        queryAnalysis.intent
      );

      logInfo('Unified pipeline verification complete', {
        overallConfidence: Math.round(pipelineResult.overallConfidence * 100) / 100,
        citationAccuracy: Math.round(pipelineResult.citationAccuracy * 100) / 100,
        contractCompliant: pipelineResult.contractCompliant,
        hasContradictions: pipelineResult.hasContradictions,
        weakCitationCount: pipelineResult.weakCitations.length,
        invalidRemoved: pipelineResult.invalidCitationsRemoved.length,
        processingTimeMs: pipelineResult.processingTimeMs,
      });

      cleanedAnswer = pipelineResult.validatedAnswer;
      usedCitations = pipelineResult.validatedCitations;

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

  // Enforce response consistency
  if (FEATURES.CONSISTENCY_ENFORCEMENT) {
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

  // Warn if coverage is below strict threshold
  if (finalCoverage < CITATION_THRESHOLDS.MIN_COVERAGE_STRICT * 100 && sourceCount >= 3 && !looksLikeUncertainty) {
    logWarn('Low citation coverage detected', {
      requestId: retrievalLog.requestId,
      coverage: `${finalCoverage}%`,
      threshold: `${CITATION_THRESHOLDS.MIN_COVERAGE_STRICT * 100}%`,
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
    ? buildContextSources(chunks, citedChunkIds, lastCitedId + 1)
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

// ============================================================================
// Enhanced Chat Interface (for new API schema)
// ============================================================================

/** Conversation message for multi-turn context */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Note filters for scoped retrieval */
export interface ChatNoteFilters {
  noteIds?: string[];
  excludeNoteIds?: string[];
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

/** Response format options */
export type ResponseFormatType = 'default' | 'concise' | 'detailed' | 'bullet' | 'structured';

/** Enhanced chat options */
export interface EnhancedChatOptions {
  temperature?: number;
  maxTokens?: number;
  topK?: number;
  minRelevance?: number;
  includeSources?: boolean;
  includeContextSources?: boolean;
  verifyCitations?: boolean;
  responseFormat?: ResponseFormatType;
  systemPrompt?: string;
  language?: string;
}

/** Enhanced chat request */
export interface EnhancedChatRequest {
  query: string;
  tenantId: string;
  threadId?: string;
  conversationHistory?: ConversationMessage[];
  filters?: ChatNoteFilters;
  options?: EnhancedChatOptions;
  saveToThread?: boolean;
}

/** Build conversation context string from history */
export function buildConversationContext(history: ConversationMessage[], maxMessages: number = 10): string {
  if (!history || history.length === 0) return '';

  // Take last N messages
  const recentHistory = history.slice(-maxMessages);

  const parts = recentHistory.map(msg => {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    return `${role}: ${msg.content}`;
  });

  return `\n--- Conversation History ---\n${parts.join('\n\n')}\n--- End History ---\n\n`;
}

/** Response format instructions */
const FORMAT_INSTRUCTIONS: Record<ResponseFormatType, string> = {
  concise: 'Be concise - aim for 2-3 sentences maximum. Get straight to the point.',
  detailed: 'Provide a comprehensive answer with full context and explanations.',
  bullet: 'Format your response as a bulleted list with clear, actionable points.',
  structured: 'Use markdown formatting with headers, bullet points, and emphasis where appropriate.',
  default: 'Respond naturally and conversationally.',
};

/** Get response format instructions */
function getResponseFormatInstructions(format: ResponseFormatType = 'default'): string {
  return FORMAT_INSTRUCTIONS[format] || FORMAT_INSTRUCTIONS.default;
}

// =============================================================================
// Enhanced Chat Function
// =============================================================================

/** Generate enhanced chat response with conversation context, filters, and format options */
export async function generateEnhancedChatResponse(request: EnhancedChatRequest): Promise<ChatResponse> {
  const startTime = Date.now();

  // Check GenAI availability early
  if (!isGenAIAvailable()) {
    throw new ConfigurationError('Chat service is not configured. Set GOOGLE_API_KEY/GEMINI_API_KEY or configure Vertex AI.');
  }

  const { query, tenantId, conversationHistory, filters, options = {} } = request;
  const {
    temperature = CHAT_TEMPERATURE,
    maxTokens = LLM_MAX_OUTPUT_TOKENS,
    topK = RETRIEVAL_TOP_K,
    minRelevance,
    includeSources = true,
    includeContextSources = false,
    verifyCitations = true,
    responseFormat = 'default',
    systemPrompt,
    language,
  } = options;

  // Sanitize and validate input
  const sanitizedQuery = sanitizeText(query, CHAT_MAX_QUERY_LENGTH + 100).trim();

  if (!sanitizedQuery) {
    throw new Error('query is required');
  }

  if (sanitizedQuery.length > CHAT_MAX_QUERY_LENGTH) {
    throw new Error(`query too long (max ${CHAT_MAX_QUERY_LENGTH} chars)`);
  }

  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  // Initialize retrieval log
  const retrievalLog = createRetrievalLog(tenantId, sanitizedQuery) as RetrievalLogEntry;

  // Analyze query for intent and keywords
  const queryAnalysis = analyzeQuery(sanitizedQuery);

  // Calculate adaptive K
  const adaptiveK = calculateAdaptiveK(sanitizedQuery, queryAnalysis.intent, queryAnalysis.keywords);
  const rerankTo = Math.min(adaptiveK * 3, maxTokens > 2000 ? 20 : 15);

  // Build note filters for retrieval
  const noteFilters = filters ? {
    noteIds: filters.noteIds,
    excludeNoteIds: filters.excludeNoteIds,
    tags: filters.tags,
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
  } : undefined;

  // Retrieve relevant chunks with filters
  const retrievalStart = Date.now();
  const contextBudget = LLM_CONTEXT_BUDGET_CHARS - LLM_CONTEXT_RESERVE_CHARS;

  let { chunks, strategy, candidateCount } = await retrieveRelevantChunks(sanitizedQuery, {
    tenantId,
    topK,
    rerankTo,
    contextBudget,
    noteFilters,
    minRelevance,
  });

  const retrievalMs = Date.now() - retrievalStart;

  // Handle no results
  if (chunks.length === 0) {
    const noResultsMessage = filters
      ? "I couldn't find any relevant notes matching your filters. Try broadening your search or adjusting the filters."
      : "I don't have any notes to search through. Try creating some notes first!";

    return {
      answer: noResultsMessage,
      sources: [],
      meta: {
        model: CHAT_MODEL,
        requestId: retrievalLog.requestId,
        responseTimeMs: Date.now() - startTime,
        intent: queryAnalysis.intent,
        confidence: 'none',
        sourceCount: 0,
      },
    };
  }

  // Build sources pack
  const queryTerms = queryAnalysis.keywords || [];
  const sourcesPack = buildSourcesPack(chunks, queryTerms);

  // Build the conversation context if provided
  const conversationContext = conversationHistory
    ? buildConversationContext(conversationHistory)
    : '';

  // Build response format instructions
  const formatInstructions = getResponseFormatInstructions(responseFormat);

  // Build enhanced prompt with context
  let prompt: string;
  if (systemPrompt) {
    // Use custom system prompt
    prompt = systemPrompt + '\n\n' + conversationContext +
      `SOURCES (${sourcesPack.sourceCount}):\n` +
      Array.from(sourcesPack.citationsMap.entries())
        .map(([cid, c]) => `[${cid}] ${c.snippet}`)
        .join('\n\n') +
      `\n\nQuestion: ${sanitizedQuery}\n\nAnswer:`;
  } else {
    // Use standard prompt building with enhancements
    const basePrompt = buildPrompt(sanitizedQuery, sourcesPack, queryAnalysis.intent);
    const languageHint = language ? `\nRespond in ${language}.` : '';
    prompt = conversationContext + formatInstructions + languageHint + '\n\n' + basePrompt;
  }

  // Generate LLM response
  const genStart = Date.now();
  const client = getGenAIClient();

  let answer: string;
  try {
    const response = await withLLMRetry(
      async () => client.models.generateContent({
        model: CHAT_MODEL,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          temperature,
          topP: CHAT_TOP_P,
          topK: CHAT_TOP_K,
          maxOutputTokens: maxTokens,
        },
      }),
      'generateEnhancedChatResponse'
    );
    answer = response.text?.trim() || '';
  } catch (error) {
    logError('LLM generation failed', error);
    throw error;
  }

  const generationMs = Date.now() - genStart;

  // Extract and validate citations
  const allCitations = Array.from(sourcesPack.citationsMap.values());
  let validCitations = allCitations;

  if (verifyCitations) {
    const validation = validateCitationsWithChunks(answer, allCitations, chunks);
    validCitations = validation.validatedCitations;
  }

  // Build sources for response
  const sources = includeSources ? citationsToSources(validCitations) : [];

  // Build context sources if requested
  const citedChunkIds = new Set(validCitations.map(c => c.chunkId));
  const contextSources = includeContextSources
    ? buildContextSources(chunks, citedChunkIds, validCitations.length + 1)
    : undefined;

  // Calculate confidence using existing function
  const confidenceBreakdown = calculateResponseConfidence(answer, validCitations, chunks, queryAnalysis.intent);
  const confidence = confidenceBreakdown.confidenceLevel as ConfidenceLevel;

  // Log the request
  logInfo('Enhanced chat response generated', {
    requestId: retrievalLog.requestId,
    tenantId,
    hasConversationHistory: !!conversationHistory,
    hasFilters: !!filters,
    responseFormat,
    sourceCount: sources.length,
    retrievalMs,
    generationMs,
  });

  return {
    answer,
    sources,
    contextSources,
    meta: {
      model: CHAT_MODEL,
      requestId: retrievalLog.requestId,
      responseTimeMs: Date.now() - startTime,
      intent: queryAnalysis.intent,
      confidence,
      sourceCount: sources.length,
      retrieval: {
        strategy,
        candidateCount,
        k: rerankTo,
      },
    },
  };
}

