/**
 * AuroraNotes API - LLM Reranker Module
 *
 * Optional LLM-based reranking for improved retrieval quality.
 * Controlled by LLM_RERANK_ENABLED feature flag.
 * Uses minimal tokens and caches results for cost control.
 */

import { ScoredChunk } from "./types";
import { logInfo, logError, logWarn } from "./utils";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

// Reranker configuration
const RERANK_MODEL = process.env.RERANK_MODEL || 'gemini-2.0-flash';
const RERANK_MAX_CHUNKS = 20;        // Max chunks to consider for reranking
const RERANK_MAX_OUTPUT_TOKENS = 200; // Limit output tokens for cost
const RERANK_TIMEOUT_MS = 5000;       // Timeout for rerank call

/**
 * Build reranking prompt
 */
function buildRerankPrompt(query: string, chunks: ScoredChunk[]): string {
  const chunkList = chunks
    .slice(0, RERANK_MAX_CHUNKS)
    .map((chunk, i) => `[${i + 1}] ${chunk.text.slice(0, 150)}`)
    .join('\n');

  return `Given this query: "${query}"

Rate these passages by relevance (most to least relevant).
Return ONLY comma-separated numbers like: 3,1,5,2,4

Passages:
${chunkList}

Ranking:`;
}

/**
 * Parse reranking response
 */
function parseRerankResponse(response: string, chunkCount: number): number[] {
  // Extract numbers from response
  const numbers = response.match(/\d+/g);
  if (!numbers) return [];

  const indices: number[] = [];
  const seen = new Set<number>();

  for (const numStr of numbers) {
    const num = parseInt(numStr, 10);
    // Validate: 1-indexed, within range, not duplicate
    if (num >= 1 && num <= chunkCount && !seen.has(num)) {
      indices.push(num - 1); // Convert to 0-indexed
      seen.add(num);
    }
  }

  return indices;
}

/**
 * LLM-based reranking of chunks
 * Returns chunks reordered by LLM relevance assessment
 */
export async function llmRerank(
  query: string,
  chunks: ScoredChunk[],
  maxResults: number
): Promise<ScoredChunk[]> {
  if (chunks.length <= 1) return chunks;

  const client = getGenAIClient();
  if (!client) {
    logWarn('LLM reranker: no API key, skipping');
    return chunks.slice(0, maxResults);
  }

  const startTime = Date.now();
  const chunksToRerank = chunks.slice(0, RERANK_MAX_CHUNKS);

  try {
    const prompt = buildRerankPrompt(query, chunksToRerank);
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Rerank timeout')), RERANK_TIMEOUT_MS);
    });

    // Race between LLM call and timeout
    const result = await Promise.race([
      client.models.generateContent({
        model: RERANK_MODEL,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: RERANK_MAX_OUTPUT_TOKENS,
        },
      }),
      timeoutPromise,
    ]);

    const response = result.text || '';
    const reorderedIndices = parseRerankResponse(response, chunksToRerank.length);

    if (reorderedIndices.length === 0) {
      logWarn('LLM reranker: failed to parse response', { response: response.slice(0, 100) });
      return chunks.slice(0, maxResults);
    }

    // Build reranked array
    const reranked: ScoredChunk[] = [];
    const usedIndices = new Set<number>();

    // Add chunks in LLM-specified order
    for (const idx of reorderedIndices) {
      if (reranked.length >= maxResults) break;
      reranked.push(chunksToRerank[idx]);
      usedIndices.add(idx);
    }

    // Add any remaining chunks by original score
    for (let i = 0; i < chunksToRerank.length && reranked.length < maxResults; i++) {
      if (!usedIndices.has(i)) {
        reranked.push(chunksToRerank[i]);
      }
    }

    const elapsedMs = Date.now() - startTime;
    logInfo('LLM rerank complete', {
      inputCount: chunksToRerank.length,
      outputCount: reranked.length,
      elapsedMs,
    });

    return reranked;
  } catch (err) {
    logError('LLM rerank failed', err);
    // Graceful degradation: return original order
    return chunks.slice(0, maxResults);
  }
}

/**
 * Check if LLM reranker is available
 */
export function isLLMRerankerAvailable(): boolean {
  return isGenAIAvailable();
}

