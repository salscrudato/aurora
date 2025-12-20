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
export type StreamEventType = 'token' | 'sources' | 'done' | 'error';

export interface StreamSource {
  id: string;
  noteId: string;
  preview: string;
  date: string;
}

export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  sources?: StreamSource[];
  meta?: {
    model: string;
    requestId?: string;
    responseTimeMs: number;
    confidence: ConfidenceLevel;
    sourceCount: number;
  };
  error?: string;
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
  } = {}
): Promise<{ fullText: string; tokenCount: number }> {
  const {
    model = CHAT_MODEL,
    temperature = 0.7,
    maxTokens = 2000,
    requestId,
  } = options;

  const startTime = Date.now();
  let fullText = '';
  let tokenCount = 0;

  try {
    const client = getGenAIClient();

    // Build human-readable sources for streaming display
    // Send ALL sources - no artificial cap (was slice(0, 5))
    const streamSources: StreamSource[] = Array.from(sourcesPack.citationsMap.entries())
      .map(([cid, citation]) => ({
        id: cid.replace('N', ''),
        noteId: citation.noteId,
        preview: citation.snippet.length > 100 ? citation.snippet.slice(0, 97) + '...' : citation.snippet,
        date: new Date(citation.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      }));

    // Send sources first so client can display them
    sendSSEEvent(res, { type: 'sources', sources: streamSources });

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
      },
    });

    logInfo('Stream completed', {
      requestId,
      tokenCount,
      elapsedMs,
      model,
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

