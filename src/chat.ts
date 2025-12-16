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
  RETRIEVAL_TOP_K,
  RETRIEVAL_RERANK_TO,
  DEFAULT_TENANT_ID,
  MAX_CHUNKS_IN_CONTEXT,
  CITATION_RETRY_ENABLED,
  CITATION_VERIFICATION_ENABLED,
  CITATION_MIN_OVERLAP_SCORE,
} from "./config";
import { ChatRequest, ChatResponse, Citation, ScoredChunk, QueryIntent, SourcesPack } from "./types";
import { retrieveRelevantChunks, analyzeQuery } from "./retrieval";
import { logInfo, logError, logWarn, sanitizeText, isValidTenantId } from "./utils";
import { validateCitationsWithChunks } from "./citationValidator";
import {
  createRetrievalLog,
  logRetrieval,
  RetrievalLogEntry,
  RetrievalTimings,
  QualityFlags,
  CitationLogEntry,
  computeScoreDistribution,
  candidateCountsToStageDetails,
} from "./retrievalLogger";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

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

/**
 * Extract the most informative snippet from a chunk
 * Prioritizes sentence-complete excerpts and key phrases
 */
function extractBestSnippet(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;

  // Try to find a complete sentence that fits
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences[0] && sentences[0].length <= maxLength) {
    let snippet = sentences[0];
    // Add more sentences if they fit
    for (let i = 1; i < sentences.length; i++) {
      if (snippet.length + sentences[i].length + 1 <= maxLength) {
        snippet += ' ' + sentences[i];
      } else {
        break;
      }
    }
    return snippet;
  }

  // Fallback: truncate at word boundary
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
 * @param chunks - The exact chunks to use as sources (already filtered/reranked)
 * @returns SourcesPack with 1:1 mapping between sources and citations
 */
function buildSourcesPack(chunks: ScoredChunk[]): SourcesPack {
  const citationsMap = new Map<string, Citation>();

  // Create 1:1 mapping - every chunk becomes a citation
  chunks.forEach((chunk, index) => {
    const cid = `N${index + 1}`;
    citationsMap.set(cid, {
      cid,
      noteId: chunk.noteId,
      chunkId: chunk.chunkId,
      createdAt: chunk.createdAt.toISOString(),
      snippet: extractBestSnippet(chunk.text, 250),
      score: Math.round(chunk.score * 100) / 100,
    });
  });

  return {
    sources: chunks,
    citationsMap,
    sourceCount: chunks.length, // Equals citationsMap.size
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
 * Get intent-specific formatting instructions
 */
function getIntentInstructions(intent: QueryIntent): string {
  switch (intent) {
    case 'summarize':
      return `FORMAT: Summary request - structure as:
• Brief overview (1-2 sentences) with citation
• Key points as bullet list, each citing its source [N#]
• Keep it concise, focus on most important information`;

    case 'list':
      return `FORMAT: List request - structure as:
• Numbered or bulleted list
• Each item concise and cited [N#]
• Group related items if applicable`;

    case 'decision':
      return `FORMAT: Decision inquiry - structure as:
• State what was decided with citation [N#]
• Key reasons/rationale with citations
• Any trade-offs or alternatives mentioned`;

    case 'action_item':
      return `FORMAT: Action item request - structure as:
• Clear list of action items/todos
• Include any deadlines, owners, or priorities mentioned
• Cite the source for each item [N#]`;

    case 'question':
      return `FORMAT: Direct question - structure as:
• Answer directly in the first sentence with citation [N#]
• Add supporting details if relevant
• Be concise and precise`;

    default:
      return '';
  }
}

/**
 * Build the RAG prompt with sources and intent-aware instructions.
 * Uses SourcesPack to ensure prompt source count == citationsMap.size EXACTLY.
 */
function buildPrompt(
  query: string,
  sourcesPack: SourcesPack,
  intent: QueryIntent = 'search'
): string {
  const { sources, citationsMap, sourceCount } = sourcesPack;

  // Format sources with clear structure and metadata
  // Uses citationsMap to ensure 1:1 correspondence with prompt source count
  const sourcesText = Array.from(citationsMap.entries())
    .map(([cid, citation]) => {
      const chunk = sources.find(c => c.chunkId === citation.chunkId);
      const text = chunk?.text || citation.snippet;
      const date = new Date(citation.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      return `[${cid}] (${date}):\n${text}`;
    })
    .join('\n\n---\n\n');

  // Extract topics from notes for context
  const noteTopics = extractTopicsFromChunks(sources);
  const topicsHint = noteTopics.length > 0
    ? `The notes contain information about: ${noteTopics.join(', ')}.`
    : '';

  // Get intent-specific instructions
  const intentInstructions = getIntentInstructions(intent);
  const intentSection = intentInstructions ? `\n${intentInstructions}` : '';

  // CRITICAL: Use sourceCount (== citationsMap.size) for all source count references
  // This ensures the LLM prompt source count matches the valid citation range exactly
  return `You are an intelligent assistant helping the user with their personal notes. Answer questions using ONLY the provided note excerpts.

CORE RULES:
1. If the sources contain information relevant to the question, answer using that information with citations
2. If the sources do NOT contain relevant information, say: "I don't have notes about [topic]"
3. NEVER invent facts not in the sources - only state what's explicitly written

CITATION FORMAT:
• Format: [N1], [N2], [N3], etc.
• Place citations IMMEDIATELY after each fact: "The budget is $50,000 [N1]."
• Multiple sources for same fact: "decided on AWS [N1][N3]"
• Different facts from different sources: "uses React [N1] and Node [N2]"

CITATION REQUIREMENTS:
1. EVERY factual statement MUST have at least one citation
2. You have exactly ${sourceCount} sources - only use N1 through N${sourceCount}
3. If a source is relevant to your answer, cite it

RESPONSE GUIDELINES:
• Answer the question directly, then elaborate with citations
• Look carefully at each source for relevant information
• Only state facts explicitly from the sources - do not make assumptions
${intentSection}

${topicsHint}

=== USER'S NOTE EXCERPTS (${sourceCount} sources) ===
${sourcesText}
=== END OF NOTES ===

Question: ${query}

Answer based on the notes above (every fact needs a citation [N#]):`;
}

// NOTE: Citation validation functions (validateCitations, extractVerificationKeywords,
// calculateOverlapScore, verifyCitationRelevance) have been consolidated into
// src/citationValidator.ts as the single canonical validation module.
// Use validateCitationsWithChunks() for all citation validation.

/**
 * Build a repair prompt to fix missing citations
 */
function buildCitationRepairPrompt(
  originalAnswer: string,
  citations: Map<string, Citation>
): string {
  const citationList = Array.from(citations.entries())
    .map(([cid, c]) => `${cid}: "${c.snippet}"`)
    .join('\n');

  return `Your previous answer was missing citations. Rewrite it with COMPREHENSIVE citation references.

AVAILABLE SOURCES (${citations.size} total):
${citationList}

ORIGINAL ANSWER (needs citations added):
${originalAnswer}

CITATION REQUIREMENTS:
1. EVERY factual claim MUST have at least one citation [N#] immediately after it
2. Place citations BEFORE punctuation: "fact [N1]." not "fact. [N1]"
3. When combining info from multiple sources, cite ALL: "X uses React [N1] and Node [N2]"
4. If the same fact appears in multiple sources, cite all of them: "decided on X [N1][N3]"
5. ONLY use citation IDs from the list above (N1, N2, etc.)
6. Do NOT change the meaning or add new information
7. Review EVERY source and find where it should be cited

EXAMPLE:
Original: "The project uses React for frontend and PostgreSQL for database."
With citations: "The project uses React for frontend [N1] and PostgreSQL for database [N2][N4]."

Rewrite the answer with comprehensive citations (aim to cite most or all sources):`;
}

/**
 * Generate chat response with RAG
 */
export async function generateChatResponse(request: ChatRequest): Promise<ChatResponse> {
  const startTime = Date.now();

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

  // Retrieve relevant chunks
  const retrievalStart = Date.now();
  let { chunks, strategy, candidateCount, candidateCounts } = await retrieveRelevantChunks(query, {
    tenantId,
    topK: RETRIEVAL_TOP_K,
    rerankTo: Math.min(RETRIEVAL_RERANK_TO, MAX_CHUNKS_IN_CONTEXT),
  });
  timing.retrievalMs = Date.now() - retrievalStart;

  // Handle no results
  if (chunks.length === 0) {
    return {
      answer: "I don't have any notes to search through. Try creating some notes first!",
      citations: [],
      meta: {
        model: CHAT_MODEL,
        retrieval: { k: 0, strategy: 'no_results', intent: queryAnalysis.intent },
      },
    };
  }

  // Build SourcesPack - single source of truth for sources/citations
  // This ensures prompt source count == citationsMap.size EXACTLY
  const sourcesPack = buildSourcesPack(chunks);
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
          maxOutputTokens: 1024,
        },
      });
    }, 'LLM generation');

    answer = result.text || '';
    timing.generationMs = Date.now() - generationStart;

    if (!answer) {
      throw new Error('Empty response from model');
    }
  } catch (err) {
    timing.generationMs = Date.now() - generationStart;
    if (err instanceof RateLimitError) {
      logError('LLM rate limit hit', err);
      throw err; // Let the handler return 429
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

  // Retry if no citations found OR low citation coverage (citation repair)
  if ((!checkHasCitations() || hasLowCoverage) && !looksLikeUncertainty && CITATION_RETRY_ENABLED && sourceCount > 0) {
    const repairStart = Date.now();
    const repairReason = !checkHasCitations() ? 'no citations' : `low coverage (${Math.round(citationCoverage * 100)}%)`;
    qualityFlags.regenerationAttempted = true;
    logInfo('Attempting citation repair', { reason: repairReason, citationCount: usedCitations.length, sourceCount });

    try {
      const repairPrompt = buildCitationRepairPrompt(answer, citationsMap);
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
      citations: [],
      meta: {
        model: CHAT_MODEL,
        retrieval: {
          k: chunks.length,
          strategy,
          candidateCount,
          rerankCount: chunks.length,
          timeMs: Date.now() - startTime,
        },
      },
    };
  }

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

  return {
    answer: cleanedAnswer,
    citations: usedCitations,
    meta: {
      model: CHAT_MODEL,
      retrieval: {
        k: chunks.length,
        strategy,
        candidateCount,
        rerankCount: chunks.length,
        intent: queryAnalysis.intent,
        timeMs: timing.totalMs,
        // Include timing breakdown for debugging (without exposing in API)
      },
    },
  };
}

