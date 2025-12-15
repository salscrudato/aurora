/**
 * AuroraNotes API - Chat Service
 *
 * RAG-powered chat with inline citations, retry logic, and enhanced error handling.
 */

import { GoogleGenAI } from "@google/genai";
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

let genaiClient: GoogleGenAI | null = null;

// Retry configuration
const MAX_LLM_RETRIES = 2;
const LLM_RETRY_DELAY_MS = 1000;

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

function getGenAIClient(): GoogleGenAI {
  if (!genaiClient) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ConfigurationError('GOOGLE_API_KEY or GEMINI_API_KEY required');
    }
    genaiClient = new GoogleGenAI({ apiKey });
  }
  return genaiClient;
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
 */
function buildCitations(chunks: ScoredChunk[]): Map<string, Citation> {
  const citations = new Map<string, Citation>();

  chunks.forEach((chunk, index) => {
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

CITATION RULES (CRITICAL):
• Every factual statement MUST have a citation like [N1] or [N2] immediately after it
• Use the exact citation IDs provided (N1, N2, N3, etc.) - never invent citation IDs
• When information comes from multiple sources, cite all: "...decided to use React [N1][N3]"
• Place citations at the end of the sentence or clause they support
• If you're unsure which source supports a claim, don't make the claim

RESPONSE GUIDELINES:
• Be direct and specific - answer the question first, then elaborate
• Only use information explicitly stated in the sources - never infer or assume
• If the sources don't fully answer the question, say what you CAN answer and note what's missing
• Keep responses focused and avoid unnecessary filler
${intentSection}

${topicsHint}

=== USER'S NOTE EXCERPTS ===
${sourcesText}
=== END OF NOTES ===

Question: ${query}

Answer using only the notes above, with inline citations:`;
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

  // Sort citations in order of appearance for consistent output
  const usedCitations = Array.from(usedCitationIds)
    .sort((a, b) => {
      const numA = parseInt(a.replace('N', ''));
      const numB = parseInt(b.replace('N', ''));
      return numA - numB;
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
 * Build a repair prompt to fix missing citations
 */
function buildCitationRepairPrompt(
  originalAnswer: string,
  citations: Map<string, Citation>
): string {
  const citationList = Array.from(citations.entries())
    .map(([cid, c]) => `${cid}: "${c.snippet}"`)
    .join('\n');

  return `Your previous answer had no valid citations. Rewrite it with proper citation references.

AVAILABLE CITATIONS (use exactly these IDs):
${citationList}

ORIGINAL ANSWER:
${originalAnswer}

RULES:
1. Keep the same meaning and content
2. Add [N1], [N2], etc. citations after relevant statements
3. Only use citation IDs from the list above
4. Do not add any new information

Rewrite with citations:`;
}

/**
 * Generate chat response with RAG
 */
export async function generateChatResponse(request: ChatRequest): Promise<ChatResponse> {
  const startTime = Date.now();

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
  let { chunks, strategy, candidateCount } = await retrieveRelevantChunks(query, {
    tenantId,
    topK: RETRIEVAL_TOP_K,
    rerankTo: Math.min(RETRIEVAL_RERANK_TO, MAX_CHUNKS_IN_CONTEXT),
  });

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

    if (!answer) {
      throw new Error('Empty response from model');
    }
  } catch (err) {
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

  // Retry if no citations found but we have sources to cite (citation repair)
  const looksLikeUncertainty =
    cleanedAnswer.toLowerCase().includes("don't have") ||
    cleanedAnswer.toLowerCase().includes("don't see") ||
    cleanedAnswer.toLowerCase().includes("cannot find") ||
    cleanedAnswer.toLowerCase().includes("no notes about") ||
    cleanedAnswer.toLowerCase().includes("no information");

  if (!hasCitations && !looksLikeUncertainty && CITATION_RETRY_ENABLED && chunks.length > 0) {
    logInfo('Attempting citation repair');

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
        if (repaired.hasCitations) {
          cleanedAnswer = repaired.cleanedAnswer;
          usedCitations = repaired.usedCitations;
          invalidCitations = repaired.invalidCitations;
          hasCitations = true;
          strategy += '_repaired';
          logInfo('Citation repair successful', { citationCount: usedCitations.length });
        } else {
          logWarn('Citation repair failed, using original');
        }
      }
    } catch (repairErr) {
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

  const elapsedMs = Date.now() - startTime;
  logInfo('Chat response generated', {
    queryLength: query.length,
    intent: queryAnalysis.intent,
    chunkCount: chunks.length,
    citationCount: usedCitations.length,
    strategy,
    elapsedMs,
  });

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
        timeMs: elapsedMs,
      },
    },
  };
}

