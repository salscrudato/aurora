/**
 * AuroraNotes API - Chat Service
 *
 * RAG-powered chat with inline citations, retry logic, and enhanced error handling.
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
} from "./config";
import { ChatRequest, ChatResponse, Citation, ScoredChunk, QueryIntent } from "./types";
import { retrieveRelevantChunks, analyzeQuery } from "./retrieval";
import { logInfo, logError, logWarn, sanitizeText, isValidTenantId } from "./utils";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

// Retry configuration
const MAX_LLM_RETRIES = 2;
const LLM_RETRY_DELAY_MS = 1000;

// Citation accuracy thresholds (tuned for better recall while maintaining precision)
const MIN_CITATION_COVERAGE = 0.5;        // Trigger repair if < 50% of sources cited
const MIN_CITATION_COVERAGE_STRICT = 0.6; // Warn if < 60% coverage after repair
const MIN_KEYWORD_OVERLAP = 2;            // Min keyword matches for citation validity
const MIN_CITATION_SCORE = 0.15;          // Minimum chunk score to be included as citation

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
 * Retry LLM call with exponential backoff
 */
async function withLLMRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      return await fn();
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
 * Build citations from scored chunks with improved snippets
 * Only includes chunks that meet the minimum score threshold
 */
function buildCitations(chunks: ScoredChunk[]): Map<string, Citation> {
  const citations = new Map<string, Citation>();

  // Filter chunks by minimum score threshold to reduce spurious citations
  const qualifiedChunks = chunks.filter(chunk => chunk.score >= MIN_CITATION_SCORE);

  qualifiedChunks.forEach((chunk, index) => {
    const cid = `N${index + 1}`;
    citations.set(cid, {
      cid,
      noteId: chunk.noteId,
      chunkId: chunk.chunkId,
      createdAt: chunk.createdAt.toISOString(),
      snippet: extractBestSnippet(chunk.text, 250),
      score: Math.round(chunk.score * 100) / 100,
    });
  });

  return citations;
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
 * Build the RAG prompt with sources and intent-aware instructions
 */
function buildPrompt(
  query: string,
  chunks: ScoredChunk[],
  citations: Map<string, Citation>,
  intent: QueryIntent = 'search'
): string {
  // Format sources with clear structure and metadata
  const sourcesText = Array.from(citations.entries())
    .map(([cid, citation]) => {
      const chunk = chunks.find(c => c.chunkId === citation.chunkId);
      const text = chunk?.text || citation.snippet;
      const date = new Date(citation.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      return `[${cid}] (${date}):\n${text}`;
    })
    .join('\n\n---\n\n');

  // Extract topics from notes for context
  const noteTopics = extractTopicsFromChunks(chunks);
  const topicsHint = noteTopics.length > 0
    ? `The notes contain information about: ${noteTopics.join(', ')}.`
    : '';

  // Get intent-specific instructions
  const intentInstructions = getIntentInstructions(intent);
  const intentSection = intentInstructions ? `\n${intentInstructions}` : '';

  return `You are an intelligent assistant helping the user with their personal notes. Answer questions using ONLY the provided note excerpts.

CITATION FORMAT (CRITICAL):
• Format: [N1], [N2], [N3], etc.
• Place IMMEDIATELY after the fact, BEFORE punctuation: "The budget is $50,000 [N1]."
• Multiple sources for same fact: "decided on AWS [N1][N3]"
• Different facts from different sources: "uses React [N1] and PostgreSQL [N2]"

CITATION REQUIREMENTS:
1. EVERY factual statement MUST have at least one citation
2. If you have ${chunks.length} sources, aim to cite most of them if they're relevant
3. NEVER make up citation IDs - only use N1 through N${chunks.length}
4. If a source is relevant to your answer, you MUST cite it somewhere
5. Check each source and ask: "Did I cite this?" If relevant and not cited, add it.

EXAMPLE (with 3 sources):
Bad: "The project uses React and costs $50,000." (missing citations)
Good: "The project uses React [N1] and costs $50,000 [N2]. The timeline is 6 months [N3]."

RESPONSE GUIDELINES:
• Answer the question directly first, then elaborate
• Only state facts from the sources - never infer or assume
• If sources don't fully answer, acknowledge what's missing
${intentSection}

${topicsHint}

=== USER'S NOTE EXCERPTS (${chunks.length} sources) ===
${sourcesText}
=== END OF NOTES ===

Question: ${query}

Answer using the notes above. EVERY fact must have a citation [N#]:`;
}

/**
 * Parse and validate citations from response with enhanced cleaning
 */
function validateCitations(
  answer: string,
  validCitations: Map<string, Citation>
): { cleanedAnswer: string; usedCitations: Citation[]; invalidCitations: string[]; hasCitations: boolean } {
  // Match various citation formats the LLM might produce
  const citationPattern = /\[N(\d+)\]/g;
  const foundCitations = answer.match(citationPattern) || [];

  const usedCitationIds = new Set<string>();
  const invalidCitations: string[] = [];

  for (const match of foundCitations) {
    const cid = match.slice(1, -1); // Remove brackets to get "N1", "N2", etc.
    if (validCitations.has(cid)) {
      usedCitationIds.add(cid);
    } else {
      invalidCitations.push(cid);
    }
  }

  // Clean up the answer
  let cleanedAnswer = answer;

  // Remove invalid citations
  for (const invalid of invalidCitations) {
    cleanedAnswer = cleanedAnswer.replace(new RegExp(`\\[${invalid}\\]`, 'g'), '');
  }

  // Fix common citation formatting issues
  cleanedAnswer = cleanedAnswer
    // Remove duplicate adjacent citations [N1][N1] -> [N1]
    .replace(/(\[N\d+\])(\s*\1)+/g, '$1')
    // Clean up spaces around citations: "word [N1] ." -> "word [N1]."
    .replace(/\s+([.!?,;:])/g, '$1')
    // Fix multiple spaces
    .replace(/\s+/g, ' ')
    // Remove any leftover weird brackets
    .replace(/\[\s*\]/g, '')
    .trim();

  // Order citations by first appearance in the answer (not numeric order)
  // This provides better UX as citations appear in the order they're referenced
  const citationFirstAppearance = new Map<string, number>();
  for (const cid of usedCitationIds) {
    const pattern = new RegExp(`\\[${cid}\\]`);
    const match = cleanedAnswer.match(pattern);
    if (match && match.index !== undefined) {
      citationFirstAppearance.set(cid, match.index);
    } else {
      // Fallback: put at end if not found (shouldn't happen)
      citationFirstAppearance.set(cid, Infinity);
    }
  }

  const usedCitations = Array.from(usedCitationIds)
    .sort((a, b) => {
      const posA = citationFirstAppearance.get(a) ?? Infinity;
      const posB = citationFirstAppearance.get(b) ?? Infinity;
      return posA - posB;
    })
    .map(cid => validCitations.get(cid)!)
    .filter(Boolean);

  return {
    cleanedAnswer,
    usedCitations,
    invalidCitations,
    hasCitations: usedCitations.length > 0,
  };
}

/**
 * Extract keywords from text for citation verification
 */
function extractVerificationKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'and', 'or', 'but', 'if', 'this', 'that', 'these', 'those', 'it',
    'based', 'notes', 'according', 'mentioned', 'stated', 'using', 'used'
  ]);

  return new Set(
    text.toLowerCase()
      .replace(/\[N\d+\]/g, '') // Remove citation markers
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
  );
}

/**
 * Verify that citations semantically support the claims in the answer
 * Returns citations that have sufficient keyword overlap with the answer
 */
function verifyCitationRelevance(
  answer: string,
  usedCitations: Citation[],
  chunks: ScoredChunk[]
): { validCitations: Citation[]; suspiciousCitations: string[] } {
  const answerKeywords = extractVerificationKeywords(answer);
  const validCitations: Citation[] = [];
  const suspiciousCitations: string[] = [];

  for (const citation of usedCitations) {
    // Find the full chunk text for this citation
    const chunk = chunks.find(c => c.chunkId === citation.chunkId);
    const sourceText = chunk?.text || citation.snippet;
    const sourceKeywords = extractVerificationKeywords(sourceText);

    // Count overlapping keywords
    let overlapCount = 0;
    for (const keyword of answerKeywords) {
      if (sourceKeywords.has(keyword)) {
        overlapCount++;
      }
    }

    // Citation is valid if it has sufficient keyword overlap
    if (overlapCount >= MIN_KEYWORD_OVERLAP) {
      validCitations.push(citation);
    } else {
      // Still include the citation but log it as suspicious
      validCitations.push(citation);
      if (overlapCount === 0) {
        suspiciousCitations.push(citation.cid);
      }
    }
  }

  return { validCitations, suspiciousCitations };
}

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

  // Timing metrics for observability
  const timing: {
    retrievalMs?: number;
    rerankMs?: number;
    generationMs?: number;
    repairMs?: number;
    totalMs?: number;
  } = {};

  // Sanitize and validate input
  const query = sanitizeText(request.message, CHAT_MAX_QUERY_LENGTH + 100).trim();
  const tenantId = request.tenantId || DEFAULT_TENANT_ID;

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
  let { chunks, strategy, candidateCount } = await retrieveRelevantChunks(query, {
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

  // Build citations map
  const citationsMap = buildCitations(chunks);

  // Build prompt with intent-aware instructions
  const prompt = buildPrompt(query, chunks, citationsMap, queryAnalysis.intent);

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

  // Validate citations
  let { cleanedAnswer, usedCitations, invalidCitations, hasCitations } = validateCitations(
    answer,
    citationsMap
  );

  // Log if we had to clean up invalid citations
  if (invalidCitations.length > 0) {
    logInfo('Cleaned invalid citations', {
      invalidCount: invalidCitations.length,
      invalidCitations,
    });
  }

  // Detect if response looks like uncertainty about the question
  const looksLikeUncertainty =
    cleanedAnswer.toLowerCase().includes("don't have") ||
    cleanedAnswer.toLowerCase().includes("don't see") ||
    cleanedAnswer.toLowerCase().includes("cannot find") ||
    cleanedAnswer.toLowerCase().includes("no notes about") ||
    cleanedAnswer.toLowerCase().includes("no information");

  // Verify citation relevance - ensure citations semantically support the answer
  if (hasCitations && usedCitations.length > 0) {
    const { validCitations, suspiciousCitations } = verifyCitationRelevance(
      cleanedAnswer,
      usedCitations,
      chunks
    );

    if (suspiciousCitations.length > 0) {
      logWarn('Suspicious citations detected (low keyword overlap)', {
        suspiciousCitations,
        totalCitations: usedCitations.length,
      });
    }

    // Keep all citations but log the verification results
    usedCitations = validCitations;
  }

  // Calculate citation coverage - are we citing enough sources?
  const citationCoverage = chunks.length > 0 ? usedCitations.length / chunks.length : 1;
  const hasLowCoverage = chunks.length >= 3 && citationCoverage < MIN_CITATION_COVERAGE && !looksLikeUncertainty;

  // Retry if no citations found OR low citation coverage (citation repair)
  if ((!hasCitations || hasLowCoverage) && !looksLikeUncertainty && CITATION_RETRY_ENABLED && chunks.length > 0) {
    const repairStart = Date.now();
    const repairReason = !hasCitations ? 'no citations' : `low coverage (${Math.round(citationCoverage * 100)}%)`;
    logInfo('Attempting citation repair', { reason: repairReason, citationCount: usedCitations.length, sourceCount: chunks.length });

    try {
      const repairPrompt = buildCitationRepairPrompt(answer, citationsMap);
      const repairResult = await client.models.generateContent({
        model: CHAT_MODEL,
        contents: repairPrompt,
        config: {
          temperature: 0.1, // Low temp for repair
          maxOutputTokens: 1024,
        },
      });

      const repairedAnswer = repairResult.text || '';
      if (repairedAnswer) {
        const repaired = validateCitations(repairedAnswer, citationsMap);
        // Accept repair if it improved citation coverage
        const repairedCoverage = repaired.usedCitations.length / chunks.length;
        if (repaired.hasCitations && repairedCoverage > citationCoverage) {
          cleanedAnswer = repaired.cleanedAnswer;
          usedCitations = repaired.usedCitations;
          invalidCitations = repaired.invalidCitations;
          hasCitations = true;
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
  if (!hasCitations && !looksLikeUncertainty) {
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
  const finalCoverage = chunks.length > 0 ? Math.round((usedCitations.length / chunks.length) * 100) : 100;

  // Log comprehensive metrics for observability
  logInfo('Chat response generated', {
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
  if (finalCoverage < MIN_CITATION_COVERAGE_STRICT * 100 && chunks.length >= 3 && !looksLikeUncertainty) {
    logWarn('Low citation coverage detected', {
      coverage: `${finalCoverage}%`,
      threshold: `${MIN_CITATION_COVERAGE_STRICT * 100}%`,
      citationCount: usedCitations.length,
      sourceCount: chunks.length,
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

