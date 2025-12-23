/**
 * LLM Reranker - Optional LLM-based reranking for improved retrieval quality
 */

import { ScoredChunk } from "./types";
import { logInfo, logError, logWarn } from "./utils";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

const RERANK_MODEL = process.env.RERANK_MODEL || 'gemini-2.0-flash';
const MAX_CHUNKS = 20;
const MAX_TOKENS = 200;
const TIMEOUT_MS = 5000;

const buildPrompt = (query: string, chunks: ScoredChunk[]): string =>
  `Query: "${query}"\n\nRank by relevance (return comma-separated numbers): ${chunks.map((c, i) => `[${i + 1}] ${c.text.slice(0, 150)}`).join('\n')}\n\nRanking:`;

function parseResponse(response: string, count: number): number[] {
  const nums = response.match(/\d+/g);
  if (!nums) return [];
  const seen = new Set<number>();
  return nums
    .map(n => parseInt(n, 10))
    .filter(n => n >= 1 && n <= count && !seen.has(n) && seen.add(n))
    .map(n => n - 1);
}

export const isLLMRerankerAvailable = (): boolean => isGenAIAvailable();

export async function llmRerank(query: string, chunks: ScoredChunk[], maxResults: number): Promise<ScoredChunk[]> {
  if (chunks.length <= 1) return chunks;

  const client = getGenAIClient();
  if (!client) {
    logWarn('Reranker unavailable');
    return chunks.slice(0, maxResults);
  }

  const toRerank = chunks.slice(0, MAX_CHUNKS);

  try {
    const result = await Promise.race([
      client.models.generateContent({
        model: RERANK_MODEL,
        contents: buildPrompt(query, toRerank),
        config: { temperature: 0.1, maxOutputTokens: MAX_TOKENS },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)),
    ]);

    const indices = parseResponse(result.text || '', toRerank.length);
    if (!indices.length) {
      logWarn('Rerank parse failed');
      return chunks.slice(0, maxResults);
    }

    const used = new Set(indices);
    const reranked = indices.slice(0, maxResults).map(i => toRerank[i]);

    // Fill remaining slots with unused chunks
    for (let i = 0; reranked.length < maxResults && i < toRerank.length; i++) {
      if (!used.has(i)) reranked.push(toRerank[i]);
    }

    logInfo('Rerank complete', { input: toRerank.length, output: reranked.length });
    return reranked;
  } catch (err) {
    logError('Rerank failed', err);
    return chunks.slice(0, maxResults);
  }
}
