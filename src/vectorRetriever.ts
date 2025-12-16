/**
 * AuroraNotes API - Vector Retriever Interface
 *
 * High-level abstraction for vector search with enriched results.
 * Uses VectorIndex from vectorIndex.ts for the underlying search,
 * then enriches results with chunk text and metadata.
 *
 * This module provides:
 * - VectorSearchResult with full chunk data (text, createdAt)
 * - VectorSearchOptions for filtering (maxAgeDays, excludeNoteIds, minScore)
 * - Convenience function vectorSearch() that handles embedding generation
 */

import { getDb } from './firestore';
import { generateQueryEmbedding } from './embeddings';
import { logInfo, logWarn } from './utils';
import { RETRIEVAL_TOP_K, CHUNKS_COLLECTION } from './config';
import { getVectorIndex, VectorSearchResult as VectorIndexResult } from './vectorIndex';
import { ChunkDoc } from './types';

/**
 * Enriched vector search result with full chunk data
 */
export interface VectorSearchResult {
  chunkId: string;
  noteId: string;
  text: string;
  score: number;
  createdAt: Date;
}

export interface VectorSearchOptions {
  maxAgeDays?: number;
  excludeNoteIds?: string[];
  minScore?: number;
}

/**
 * Vector retriever that uses VectorIndex and enriches results
 *
 * Uses the configured VectorIndex (Firestore or Vertex) for search,
 * then fetches full chunk data from Firestore for enrichment.
 */
export class EnrichedVectorRetriever {
  private readonly overFetchMultiplier: number;

  constructor(overFetchMultiplier: number = 2) {
    this.overFetchMultiplier = overFetchMultiplier;
  }

  async search(
    queryEmbedding: number[],
    tenantId: string,
    k: number,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const minScore = options.minScore ?? 0.3;
    const excludeSet = new Set(options.excludeNoteIds ?? []);
    const maxAgeDays = options.maxAgeDays ?? 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    // Get the configured vector index (Firestore or Vertex)
    const vectorIndex = getVectorIndex();

    // Over-fetch to account for filtering
    const overFetchK = k * this.overFetchMultiplier;
    const indexResults = await vectorIndex.search(queryEmbedding, tenantId, overFetchK);

    // Filter by score and exclusions
    const filteredResults = indexResults.filter(r =>
      r.score >= minScore && !excludeSet.has(r.noteId)
    );

    // Take top k after filtering
    const topResults = filteredResults.slice(0, k);

    // Enrich with chunk data from Firestore using batch getAll()
    // This is O(1) network round-trips instead of O(n)
    const db = getDb();
    const enrichedResults: VectorSearchResult[] = [];

    if (topResults.length === 0) {
      return enrichedResults;
    }

    try {
      // Build document references for batch fetch
      const chunkRefs = topResults.map(r =>
        db.collection(CHUNKS_COLLECTION).doc(r.chunkId)
      );

      // Batch fetch all chunks in a single call
      const chunkDocs = await db.getAll(...chunkRefs);

      // Build map for quick lookup
      const chunkDataMap = new Map<string, ChunkDoc>();
      for (const doc of chunkDocs) {
        if (doc.exists) {
          chunkDataMap.set(doc.id, doc.data() as ChunkDoc);
        }
      }

      // Process results maintaining order from vector search
      for (const result of topResults) {
        const data = chunkDataMap.get(result.chunkId);
        if (data) {
          const createdAt = data.createdAt && 'toDate' in data.createdAt
            ? data.createdAt.toDate()
            : new Date();

          // Apply time filter
          if (createdAt >= cutoffDate) {
            enrichedResults.push({
              chunkId: result.chunkId,
              noteId: result.noteId,
              text: data.text || '',
              score: result.score,
              createdAt,
            });
          }
        }
      }
    } catch (err) {
      logWarn('Batch chunk fetch failed', { chunkCount: topResults.length, error: err });
    }

    return enrichedResults;
  }
}

// Singleton instance
let retrieverInstance: EnrichedVectorRetriever | null = null;

/**
 * Get configured vector retriever
 */
export function getVectorRetriever(): EnrichedVectorRetriever {
  if (!retrieverInstance) {
    retrieverInstance = new EnrichedVectorRetriever();
  }
  return retrieverInstance;
}

/**
 * Convenience function to search with embedding generation
 */
export async function vectorSearch(
  query: string,
  tenantId: string,
  k: number,
  options: VectorSearchOptions = {},
  requestId?: string
): Promise<{ results: VectorSearchResult[]; embeddingMs: number }> {
  const startTime = Date.now();

  // Generate query embedding (returns single embedding array, not array of arrays)
  const embedding = await generateQueryEmbedding(query);
  const embeddingMs = Date.now() - startTime;

  if (!embedding || embedding.length === 0) {
    logWarn('Failed to generate query embedding', { query: query.slice(0, 50), requestId });
    return { results: [], embeddingMs };
  }

  // Search with configured retriever
  const retriever = getVectorRetriever();
  const results = await retriever.search(embedding, tenantId, k, options);

  return { results, embeddingMs };
}

