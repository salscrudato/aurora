/** Streaming Response Module - SSE streaming for chat responses */

import { Response } from "express";
import { SourcesPack, ConfidenceLevel } from "./types";
import { getGenAIClient } from "./genaiClient";
import { logInfo, logError } from "./utils";
import { CHAT_MODEL } from "./config";

export type StreamEventType = 'token' | 'sources' | 'done' | 'error' | 'heartbeat' | 'followups' | 'context_sources';

export interface StreamSource {
  id: string; noteId: string; preview: string; date: string;
  startOffset?: number; endOffset?: number; anchor?: string;
}

export interface ContextSource { noteId: string; preview: string; date: string; relevance: number; }

export interface StreamEvent {
  type: StreamEventType; content?: string; sources?: StreamSource[]; contextSources?: ContextSource[];
  followups?: string[]; error?: string; seq?: number;
  meta?: { model: string; requestId?: string; responseTimeMs: number; confidence: ConfidenceLevel; sourceCount: number; contextSourceCount?: number };
}

export const STREAMING_CONFIG = {
  enabled: process.env.STREAMING_ENABLED !== 'false',
  flushIntervalMs: 50,
  heartbeatIntervalMs: 15000,
};

export function initSSEResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

export function sendSSEEvent(res: Response, event: StreamEvent): void { res.write(`data: ${JSON.stringify(event)}\n\n`); }
export function closeSSE(res: Response): void { res.end(); }
export function clientAcceptsSSE(acceptHeader: string | undefined): boolean { return !!acceptHeader?.includes('text/event-stream'); }

function generateFollowUps(text: string, sourceCount: number): string[] {
  const f: string[] = [];
  if (sourceCount >= 3) f.push('Can you elaborate on the most important point?');
  if (/\d+\.\s|•\s|-\s/.test(text)) f.push('Tell me more about the first item');
  if (/\?|I'm not sure|unclear|might|could be/.test(text)) f.push('What additional context would help?');
  if (!f.length) f.push('Can you summarize this in a single sentence?');
  f.push('What related notes should I review?');
  return f.slice(0, 3);
}

const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const truncate = (s: string, max = 100) => s.length > max ? s.slice(0, max - 3) + '...' : s;

/** Stream a chat response using Gemini's streaming API */
export async function streamChatResponse(
  res: Response, prompt: string, sourcesPack: SourcesPack,
  options: {
    model?: string; temperature?: number; maxTokens?: number; requestId?: string;
    includeContextSources?: boolean;
    allChunks?: Array<{ noteId: string; text: string; score: number; createdAt: Date }>;
  } = {}
): Promise<{ fullText: string; tokenCount: number }> {
  const { model = CHAT_MODEL, temperature = 0.7, maxTokens = 2000, requestId, includeContextSources = true, allChunks = [] } = options;
  const startTime = Date.now();
  let fullText = '', tokenCount = 0, heartbeatSeq = 0;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  try {
    const citedNoteIds = new Set<string>();
    const streamSources: StreamSource[] = Array.from(sourcesPack.citationsMap.entries()).map(([cid, c]) => {
      citedNoteIds.add(c.noteId);
      return { id: cid.replace('N', ''), noteId: c.noteId, preview: truncate(c.snippet), date: formatDate(new Date(c.createdAt)), startOffset: c.startOffset, endOffset: c.endOffset, anchor: c.anchor };
    });
    sendSSEEvent(res, { type: 'sources', sources: streamSources });

    // Context sources (retrieved but not cited)
    if (includeContextSources && allChunks.length) {
      const ctx: ContextSource[] = [], seen = new Set<string>();
      for (const c of allChunks) {
        if (citedNoteIds.has(c.noteId) || seen.has(c.noteId)) continue;
        seen.add(c.noteId);
        ctx.push({ noteId: c.noteId, preview: truncate(c.text), date: formatDate(c.createdAt), relevance: c.score });
        if (ctx.length >= 5) break;
      }
      if (ctx.length) sendSSEEvent(res, { type: 'context_sources', contextSources: ctx });
    }

    heartbeatInterval = setInterval(() => sendSSEEvent(res, { type: 'heartbeat', seq: ++heartbeatSeq }), STREAMING_CONFIG.heartbeatIntervalMs);

    const response = await getGenAIClient().models.generateContentStream({
      model, contents: prompt, config: { temperature, maxOutputTokens: maxTokens },
    });

    for await (const chunk of response) {
      let text = chunk.text || '';
      if (text) { text = text.replace(/\[N(\d+)\]/g, '[$1]'); fullText += text; tokenCount++; sendSSEEvent(res, { type: 'token', content: text }); }
    }

    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }

    const followups = generateFollowUps(fullText, sourcesPack.sourceCount);
    if (followups.length) sendSSEEvent(res, { type: 'followups', followups });

    const elapsedMs = Date.now() - startTime;
    const confidence: ConfidenceLevel = sourcesPack.sourceCount >= 3 ? 'high' : sourcesPack.sourceCount >= 1 ? 'medium' : 'low';
    sendSSEEvent(res, { type: 'done', meta: { model, requestId, responseTimeMs: elapsedMs, confidence, sourceCount: sourcesPack.sourceCount, contextSourceCount: allChunks.length - citedNoteIds.size } });
    logInfo('Stream completed', { requestId, tokenCount, elapsedMs });
    return { fullText, tokenCount };
  } catch (err) {
    logError('Stream error', err, { requestId });
    sendSSEEvent(res, { type: 'error', error: err instanceof Error ? err.message : 'Stream failed' });
    throw err;
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    closeSSE(res);
  }
}
