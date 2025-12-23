/**
 * AuroraNotes API - Cross-Encoder Reranker
 *
 * High-precision reranking using cross-encoder models.
 * Supports Gemini (default) and Cohere backends.
 * Typical improvement: +15-20% precision over bi-encoder only.
 */

import { ScoredChunk } from "./types";
import { logInfo, logError, logWarn, fastHashWithLength } from "./utils";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";
import {
  CROSS_ENCODER_ENABLED,
  CROSS_ENCODER_BACKEND,
  CROSS_ENCODER_MAX_CHUNKS,
  CROSS_ENCODER_TIMEOUT_MS,
} from "./config";

// =============================================================================
// Constants
// =============================================================================

// Cohere configuration (not in main config since it's optional)
const COHERE_API_KEY = process.env.COHERE_API_KEY || '';
const COHERE_RERANK_MODEL = process.env.COHERE_RERANK_MODEL || 'rerank-v3.5';
const CROSS_ENCODER_MODEL = process.env.CROSS_ENCODER_MODEL || 'gemini-2.0-flash';

// Cache configuration
const CACHE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_EVICT_RATIO = 0.2;

// Scoring weights
const CROSS_ENCODER_WEIGHT = 0.7;
const ORIGINAL_WEIGHT = 0.3;

// Text limits
const MAX_PASSAGE_LENGTH = 300;
const MAX_OUTPUT_TOKENS = 200;
const TEMPERATURE = 0.1;

// Pre-compiled regex
const JSON_SCORES_REGEX = /\[[\d,\s.]+\]/;

// =============================================================================
// Types
// =============================================================================

interface CrossEncoderScore {
  chunkId: string;
  relevanceScore: number;
  originalRank: number;
}

interface CacheEntry {
  scores: CrossEncoderScore[];
  timestamp: number;
}

type QueryType = 'factual' | 'procedural' | 'exploratory' | 'temporal';

// =============================================================================
// Cache
// =============================================================================

const cache = new Map<string, CacheEntry>();

function makeCacheKey(query: string, chunkIds: string[]): string {
  const sortedIds = [...chunkIds].sort().join(',');
  return fastHashWithLength(`${query}:${sortedIds}`);
}

function evictCache(): void {
  if (cache.size < CACHE_SIZE) return;

  const now = Date.now();
  const expired: string[] = [];

  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      expired.push(key);
    }
  }

  // Evict expired entries
  for (const key of expired) {
    cache.delete(key);
  }

  // If still over capacity, evict oldest
  if (cache.size >= CACHE_SIZE) {
    const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toEvict = Math.ceil(CACHE_SIZE * CACHE_EVICT_RATIO);
    for (let i = 0; i < toEvict && i < entries.length; i++) {
      cache.delete(entries[i][0]);
    }
  }
}

// =============================================================================
// Query Type Detection
// =============================================================================

const TEMPORAL_PATTERN = /\b(when|date|time|yesterday|today|last|recent|week|month)\b/;
const PROCEDURAL_PATTERN = /\b(how|steps|process|procedure|guide|tutorial|instructions)\b/;
const FACTUAL_PATTERN = /\b(what is|who is|define|explain|meaning)\b/;

function detectQueryType(query: string): QueryType {
  const lower = query.toLowerCase();
  if (TEMPORAL_PATTERN.test(lower)) return 'temporal';
  if (PROCEDURAL_PATTERN.test(lower)) return 'procedural';
  if (FACTUAL_PATTERN.test(lower)) return 'factual';
  return 'exploratory';
}

const SCORING_GUIDANCE: Record<QueryType, string> = {
  factual: '- Direct answer=9-10, Contains info=7-8, Related=4-6, Tangential=1-3',
  procedural: '- Complete steps=9-10, Partial=7-8, Related=4-6, Mentions=1-3',
  temporal: '- Exact dates=9-10, Temporal info=7-8, Timeline=4-6, None=1-3',
  exploratory: '- Comprehensive=9-10, Significant=7-8, Some context=4-6, Peripheral=1-3',
};

// =============================================================================
// Prompt Building
// =============================================================================

function buildPrompt(query: string, passages: string, queryType: QueryType): string {
  return `You are a relevance scoring system. Score each passage's relevance to the query on a scale of 0-10.

Query: "${query}"

Passages:
${passages}

For each passage, output ONLY a JSON array of scores in order, like: [8, 3, 9, 5, ...]
Scoring criteria for this ${queryType} query:
${SCORING_GUIDANCE[queryType]}
- Not relevant = 0

Scores:`;
}

// =============================================================================
// Public API
// =============================================================================

export function isCrossEncoderAvailable(): boolean {
  if (!CROSS_ENCODER_ENABLED) return false;
  if (CROSS_ENCODER_BACKEND === 'cohere') return !!COHERE_API_KEY;
  return isGenAIAvailable();
}

// =============================================================================
// Scoring Backends
// =============================================================================

function fallbackScores(chunks: ScoredChunk[]): CrossEncoderScore[] {
  return chunks.map((c, i) => ({ chunkId: c.chunkId, relevanceScore: c.score, originalRank: i }));
}

async function scoreWithGemini(query: string, chunks: ScoredChunk[]): Promise<CrossEncoderScore[]> {
  const client = getGenAIClient();
  const chunksToScore = chunks.slice(0, CROSS_ENCODER_MAX_CHUNKS);

  // Build passages
  const passages = chunksToScore.map((c, i) => {
    const text = c.text.length > MAX_PASSAGE_LENGTH ? c.text.slice(0, MAX_PASSAGE_LENGTH) : c.text;
    return `[${i + 1}] ${text}`;
  }).join('\n\n');

  const queryType = detectQueryType(query);
  const prompt = buildPrompt(query, passages, queryType);

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Cross-encoder timeout')), CROSS_ENCODER_TIMEOUT_MS);
    });

    const result = await Promise.race([
      client.models.generateContent({
        model: CROSS_ENCODER_MODEL,
        contents: prompt,
        config: { temperature: TEMPERATURE, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      timeoutPromise,
    ]);

    const response = result.text || '';
    const jsonMatch = response.match(JSON_SCORES_REGEX);
    if (!jsonMatch) {
      logWarn('Cross-encoder: failed to parse scores', { response: response.slice(0, 100) });
      return fallbackScores(chunksToScore);
    }

    const scores: number[] = JSON.parse(jsonMatch[0]);
    return chunksToScore.slice(0, scores.length).map((c, i) => ({
      chunkId: c.chunkId,
      relevanceScore: (scores[i] || 0) / 10,
      originalRank: i,
    }));
  } catch (err) {
    logError('Gemini cross-encoder failed', err);
    return fallbackScores(chunksToScore);
  }
}

async function scoreWithCohere(query: string, chunks: ScoredChunk[]): Promise<CrossEncoderScore[]> {
  if (!COHERE_API_KEY) return fallbackScores(chunks);

  try {
    const documents = chunks.slice(0, CROSS_ENCODER_MAX_CHUNKS).map(c => c.text);

    const response = await fetch('https://api.cohere.ai/v1/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: COHERE_RERANK_MODEL,
        query,
        documents,
        top_n: documents.length,
        return_documents: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.status}`);
    }

    const data = await response.json() as {
      results: Array<{ index: number; relevance_score: number }>;
    };

    const scoreMap = new Map<number, number>();
    for (const result of data.results) {
      scoreMap.set(result.index, result.relevance_score);
    }

    return chunks.slice(0, CROSS_ENCODER_MAX_CHUNKS).map((chunk, i) => ({
      chunkId: chunk.chunkId,
      relevanceScore: scoreMap.get(i) || 0,
      originalRank: i,
    }));
  } catch (err) {
    logError('Cohere rerank failed', err);
    return fallbackScores(chunks);
  }
}

// =============================================================================
// Main Rerank Function
// =============================================================================

export async function crossEncoderRerank(
  query: string,
  chunks: ScoredChunk[],
  topK?: number
): Promise<ScoredChunk[]> {
  if (!isCrossEncoderAvailable() || chunks.length === 0) {
    return topK ? chunks.slice(0, topK) : chunks;
  }

  const startTime = Date.now();
  const chunksToScore = chunks.slice(0, CROSS_ENCODER_MAX_CHUNKS);

  // Check cache
  const chunkIds = chunksToScore.map(c => c.chunkId);
  const cacheKey = makeCacheKey(query, chunkIds);
  const cached = cache.get(cacheKey);

  let scores: CrossEncoderScore[];
  let cacheHit = false;

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    scores = cached.scores;
    cacheHit = true;
  } else {
    scores = CROSS_ENCODER_BACKEND === 'cohere'
      ? await scoreWithCohere(query, chunksToScore)
      : await scoreWithGemini(query, chunksToScore);

    evictCache();
    cache.set(cacheKey, { scores, timestamp: Date.now() });
  }

  // Build chunk lookup
  const chunkMap = new Map<string, ScoredChunk>();
  for (const chunk of chunks) {
    chunkMap.set(chunk.chunkId, chunk);
  }

  // Combine scores and rerank
  const rerankedChunks: ScoredChunk[] = [];
  for (const score of scores) {
    const chunk = chunkMap.get(score.chunkId);
    if (!chunk) continue;

    rerankedChunks.push({
      ...chunk,
      score: score.relevanceScore * CROSS_ENCODER_WEIGHT + chunk.score * ORIGINAL_WEIGHT,
      crossEncoderScore: score.relevanceScore,
    });
  }

  rerankedChunks.sort((a, b) => b.score - a.score);

  logInfo('Cross-encoder reranking complete', {
    inputChunks: chunks.length,
    scoredChunks: scores.length,
    backend: CROSS_ENCODER_BACKEND,
    cacheHit,
    elapsedMs: Date.now() - startTime,
  });

  return topK ? rerankedChunks.slice(0, topK) : rerankedChunks;
}
