/**
 * AuroraNotes API - Vector Index Abstraction
 * 
 * Provides a unified interface for vector search operations.
 * Supports multiple implementations:
 *   - FirestoreApproxVectorIndex: In-memory cosine similarity over Firestore docs
 *   - VertexVectorSearchIndex: Optional Vertex AI Vector Search (behind VERTEX_VECTOR_SEARCH env)
 */

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firestore";
import { ChunkDoc } from "./types";
import { cosineSimilarity, logInfo, logError } from "./utils";
import { CHUNKS_COLLECTION } from "./config";

/**
 * Result from vector search
 */
export interface VectorSearchResult {
  chunkId: string;
  noteId: string;
  score: number;
}

/**
 * Vector index interface
 */
export interface VectorIndex {
  /**
   * Search for similar chunks by query embedding
   * @param queryEmbedding The query embedding vector
   * @param tenantId Tenant to search within
   * @param topK Number of results to return
   * @returns Array of chunk IDs with scores
   */
  search(
    queryEmbedding: number[],
    tenantId: string,
    topK: number
  ): Promise<VectorSearchResult[]>;

  /**
   * Get the implementation name for logging
   */
  getName(): string;
}

/**
 * Firestore-based approximate vector search
 * 
 * Fetches chunks with embeddings and computes cosine similarity in-memory.
 * Suitable for small-medium datasets (<100k chunks).
 */
export class FirestoreApproxVectorIndex implements VectorIndex {
  private maxCandidates: number;

  constructor(maxCandidates: number = 500) {
    this.maxCandidates = maxCandidates;
  }

  getName(): string {
    return 'firestore_approx';
  }

  async search(
    queryEmbedding: number[],
    tenantId: string,
    topK: number
  ): Promise<VectorSearchResult[]> {
    const db = getDb();
    const startTime = Date.now();

    // Fetch chunks that have embeddings
    // We can't filter by hasEmbedding in Firestore easily, so we fetch and filter
    const snap = await db
      .collection(CHUNKS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .orderBy('createdAt', 'desc')
      .limit(this.maxCandidates)
      .get();

    const results: VectorSearchResult[] = [];

    for (const doc of snap.docs) {
      const chunk = doc.data() as ChunkDoc;
      if (chunk.embedding && chunk.embedding.length > 0) {
        const score = cosineSimilarity(queryEmbedding, chunk.embedding);
        results.push({
          chunkId: chunk.chunkId,
          noteId: chunk.noteId,
          score,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    logInfo('Firestore vector search complete', {
      tenantId,
      candidatesScanned: snap.docs.length,
      chunksWithEmbeddings: results.length,
      topK,
      elapsedMs: Date.now() - startTime,
    });

    return results.slice(0, topK);
  }
}

/**
 * Vertex AI Vector Search implementation (optional)
 * 
 * Uses Google Cloud Vertex AI Vector Search for scalable nearest neighbor search.
 * Requires VERTEX_VECTOR_SEARCH_ENDPOINT and VERTEX_VECTOR_SEARCH_INDEX_ID env vars.
 */
export class VertexVectorSearchIndex implements VectorIndex {
  private endpoint: string;
  private indexId: string;

  constructor() {
    this.endpoint = process.env.VERTEX_VECTOR_SEARCH_ENDPOINT || '';
    this.indexId = process.env.VERTEX_VECTOR_SEARCH_INDEX_ID || '';
  }

  getName(): string {
    return 'vertex_vector_search';
  }

  isConfigured(): boolean {
    return !!(this.endpoint && this.indexId);
  }

  async search(
    queryEmbedding: number[],
    tenantId: string,
    topK: number
  ): Promise<VectorSearchResult[]> {
    if (!this.isConfigured()) {
      logError('Vertex Vector Search not configured', null);
      return [];
    }

    // TODO: Implement actual Vertex AI Vector Search API call
    // This requires:
    // 1. Setting up a Vertex AI Vector Search index
    // 2. Syncing chunk embeddings to the index
    // 3. Making gRPC/REST calls to the endpoint
    
    logInfo('Vertex Vector Search called (not implemented)', {
      endpoint: this.endpoint,
      indexId: this.indexId,
      tenantId,
      topK,
    });

    // Fallback to empty until implemented
    return [];
  }
}

/**
 * Get the active vector index based on configuration
 */
export function getVectorIndex(): VectorIndex {
  const useVertex = process.env.VERTEX_VECTOR_SEARCH_ENABLED === 'true';
  
  if (useVertex) {
    const vertexIndex = new VertexVectorSearchIndex();
    if (vertexIndex.isConfigured()) {
      return vertexIndex;
    }
    logError('Vertex Vector Search enabled but not configured, falling back to Firestore', null);
  }
  
  return new FirestoreApproxVectorIndex();
}

