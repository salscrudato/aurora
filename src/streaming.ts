/**
 * AuroraNotes API - Streaming Response Module
 *
 * Provides Server-Sent Events (SSE) streaming for chat responses.
 * Reduces perceived latency by streaming tokens as they're generated.
 *
 * Event format:
 * - data: {"type": "sources", "sources": [...]}    // Sent first, shows sources being used
 * - data: {"type": "token", "content": "..."}      // Streaming answer tokens
 * - data: {"type": "done", "meta": {...}}          // Final metadata with confidence, timing
 * - data: {"type": "error", "error": "..."}        // Error if something goes wrong
 */

import { Response } from "express";
import { Citation, SourcesPack, Source, ConfidenceLevel } from "./types";
import { getGenAIClient } from "./genaiClient";
import { logInfo, logError } from "./utils";
import { CHAT_MODEL } from "./config";

// SSE Event types
export type StreamEventType = 'token' | 'sources' | 'done' | 'error' | 'heartbeat' | 'followups' | 'context_sources';

export interface StreamSource {
  id: string;
  noteId: string;
  preview: string;
  date: string;
  /** Start character offset in original note (for highlighting) */
  startOffset?: number;
  /** End character offset in original note (for highlighting) */
  endOffset?: number;
  /** Anchor text for deep-linking */
  anchor?: string;
}

/** Context source - a source that was retrieved but not cited */
export interface ContextSource {
  noteId: string;
  preview: string;
  date: string;
  relevance: number;
}

export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  sources?: StreamSource[];
  contextSources?: ContextSource[];
  followups?: string[];
  meta?: {
    model: string;
    requestId?: string;
    responseTimeMs: number;
    confidence: ConfidenceLevel;
    sourceCount: number;
    contextSourceCount?: number;
  };
  error?: string;
  /** Heartbeat sequence number */
  seq?: number;
}

/**
 * Initialize SSE response headers
 */
export function initSSEResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
}

/**
 * Send an SSE event
 */
export function sendSSEEvent(res: Response, event: StreamEvent): void {
  const data = JSON.stringify(event);
  res.write(`data: ${data}\n\n`);
}

/**
 * Close SSE connection
 */
export function closeSSE(res: Response): void {
  res.end();
}

/**
 * Generate follow-up suggestions based on response content
 */
function generateFollowUps(fullText: string, sourceCount: number): string[] {
  const followups: string[] = [];

  // If we mentioned multiple topics or sources, suggest drilling down
  if (sourceCount >= 3) {
    followups.push('Can you elaborate on the most important point?');
  }

  // If response mentions lists or items
  if (/\d+\.\s|•\s|-\s/.test(fullText)) {
    followups.push('Tell me more about the first item');
  }

  // If response asks a question or implies uncertainty
  if (/\?/.test(fullText) || /I'm not sure|unclear|might|could be/.test(fullText)) {
    followups.push('What additional context would help?');
  }

  // General follow-ups
  if (followups.length === 0) {
    followups.push('Can you summarize this in a single sentence?');
  }

  followups.push('What related notes should I review?');

  return followups.slice(0, 3); // Return max 3 suggestions
}

/**
 * Stream a chat response using Gemini's streaming API
 *
 * @param res - Express response object
 * @param prompt - Full prompt with sources
 * @param sourcesPack - Sources pack for citations
 * @param options - Additional options
 */
export async function streamChatResponse(
  res: Response,
  prompt: string,
  sourcesPack: SourcesPack,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestId?: string;
    /** Include context sources (retrieved but not cited) */
    includeContextSources?: boolean;
    /** All retrieved chunks for context sources */
    allChunks?: Array<{ noteId: string; text: string; score: number; createdAt: Date }>;
  } = {}
): Promise<{ fullText: string; tokenCount: number }> {
  const {
    model = CHAT_MODEL,
    temperature = 0.7,
    maxTokens = 2000,
    requestId,
    includeContextSources = true,
    allChunks = [],
  } = options;

  const startTime = Date.now();
  let fullText = '';
  let tokenCount = 0;
  let heartbeatSeq = 0;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  try {
    const client = getGenAIClient();

    // Build human-readable sources for streaming display
    // Send ALL sources - no artificial cap (was slice(0, 5))
    const citedNoteIds = new Set<string>();
    const streamSources: StreamSource[] = Array.from(sourcesPack.citationsMap.entries())
      .map(([cid, citation]) => {
        citedNoteIds.add(citation.noteId);
        return {
          id: cid.replace('N', ''),
          noteId: citation.noteId,
          preview: citation.snippet.length > 100 ? citation.snippet.slice(0, 97) + '...' : citation.snippet,
          date: new Date(citation.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          // Include offset information for precise citation anchoring
          startOffset: citation.startOffset,
          endOffset: citation.endOffset,
          anchor: citation.anchor,
        };
      });

    // Send sources first so client can display them
    sendSSEEvent(res, { type: 'sources', sources: streamSources });

    // Build context sources (chunks that were retrieved but not cited)
    if (includeContextSources && allChunks.length > 0) {
      const contextSources: ContextSource[] = [];
      const seenNoteIds = new Set<string>();

      for (const chunk of allChunks) {
        // Skip if this note was cited or already included
        if (citedNoteIds.has(chunk.noteId) || seenNoteIds.has(chunk.noteId)) {
          continue;
        }
        seenNoteIds.add(chunk.noteId);

        contextSources.push({
          noteId: chunk.noteId,
          preview: chunk.text.length > 100 ? chunk.text.slice(0, 97) + '...' : chunk.text,
          date: chunk.createdAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          relevance: chunk.score,
        });

        // Limit to 5 context sources
        if (contextSources.length >= 5) break;
      }

      if (contextSources.length > 0) {
        sendSSEEvent(res, { type: 'context_sources', contextSources });
      }
    }

    // Start heartbeat to keep connection alive during long operations
    heartbeatInterval = setInterval(() => {
      heartbeatSeq++;
      sendSSEEvent(res, { type: 'heartbeat', seq: heartbeatSeq });
    }, STREAMING_CONFIG.heartbeatIntervalMs);

    // Stream generation
    const response = await client.models.generateContentStream({
      model,
      contents: prompt,
      config: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    });

    // Process stream chunks, normalizing citations from [N#] to [#]
    for await (const chunk of response) {
      let text = chunk.text || '';
      if (text) {
        // Normalize citation format for cleaner display
        text = text.replace(/\[N(\d+)\]/g, '[$1]');
        fullText += text;
        tokenCount++;
        sendSSEEvent(res, { type: 'token', content: text });
      }
    }

    // Stop heartbeat
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    // Generate and send follow-up suggestions
    const followups = generateFollowUps(fullText, sourcesPack.sourceCount);
    if (followups.length > 0) {
      sendSSEEvent(res, { type: 'followups', followups });
    }

    // Send done event with metadata
    const elapsedMs = Date.now() - startTime;

    // Determine confidence based on source count and generation success
    const confidence: ConfidenceLevel = sourcesPack.sourceCount >= 3 ? 'high' :
      sourcesPack.sourceCount >= 1 ? 'medium' : 'low';

    sendSSEEvent(res, {
      type: 'done',
      meta: {
        model,
        requestId,
        responseTimeMs: elapsedMs,
        confidence,
        sourceCount: sourcesPack.sourceCount,
        contextSourceCount: allChunks.length - citedNoteIds.size,
      },
    });

    logInfo('Stream completed', {
      requestId,
      tokenCount,
      elapsedMs,
      model,
      followupCount: followups.length,
    });

    return { fullText, tokenCount };
  } catch (err) {
    logError('Stream error', err, { requestId });
    sendSSEEvent(res, {
      type: 'error',
      error: err instanceof Error ? err.message : 'Stream generation failed',
    });
    throw err;
  } finally {
    // Ensure heartbeat is stopped
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    closeSSE(res);
  }
}

/**
 * Check if client accepts SSE
 */
export function clientAcceptsSSE(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) return false;
  return acceptHeader.includes('text/event-stream');
}

/**
 * Streaming configuration
 */
export const STREAMING_CONFIG = {
  enabled: process.env.STREAMING_ENABLED !== 'false',
  flushIntervalMs: 50, // How often to flush buffer
  heartbeatIntervalMs: 15000, // Keep-alive heartbeat
};

