/**
 * AuroraNotes API - Vector Index Abstraction
 *
 * Provides a unified interface for vector search operations.
 * Supports multiple implementations:
 *   - FirestoreApproxVectorIndex: In-memory cosine similarity over Firestore docs
 *   - VertexVectorSearchIndex: Optional Vertex AI Vector Search (behind VERTEX_VECTOR_SEARCH env)
 *
 * Includes scale guards to warn when Firestore fallback is used with large datasets.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firestore";
import { ChunkDoc } from "./types";
import { cosineSimilarity, logInfo, logError, logWarn } from "./utils";
import {
  CHUNKS_COLLECTION,
  FIRESTORE_FALLBACK_WARN_THRESHOLD,
  FIRESTORE_FALLBACK_MAX_SCAN,
  PROJECT_ID,
  VERTEX_VECTOR_SEARCH_REGION,
  VERTEX_INDEX_ENDPOINT_RESOURCE,
  VERTEX_INDEX_ENDPOINT_ID,
  VERTEX_VECTOR_SEARCH_ENDPOINT,
  VERTEX_VECTOR_SEARCH_INDEX_ID,
  VERTEX_DEPLOYED_INDEX_ID,
  VERTEX_DISTANCE_METRIC,
} from "./config";

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
 * Suitable for small-medium datasets (<5k chunks per tenant).
 *
 * IMPORTANT: This is a FALLBACK for development/small datasets.
 * For production at scale (100k+ notes), use Vertex Vector Search.
 *
 * Scale guards:
 * - Warns if corpus size exceeds FIRESTORE_FALLBACK_WARN_THRESHOLD
 * - Expands scan to FIRESTORE_FALLBACK_MAX_SCAN to avoid silently missing older notes
 */
export class FirestoreApproxVectorIndex implements VectorIndex {
  private maxCandidates: number;
  private warnedForTenant: Set<string> = new Set();

  constructor(maxCandidates: number = 500) {
    // Use the higher of provided limit or config-based max scan
    this.maxCandidates = Math.max(maxCandidates, FIRESTORE_FALLBACK_MAX_SCAN);
  }

  getName(): string {
    return 'firestore_approx';
  }

  /**
   * Get the total chunk count for a tenant (for scale guard warnings)
   */
  private async getTenantChunkCount(tenantId: string): Promise<number> {
    const db = getDb();
    try {
      // Use a count aggregation if available, otherwise estimate from limit
      const countSnap = await db
        .collection(CHUNKS_COLLECTION)
        .where('tenantId', '==', tenantId)
        .count()
        .get();
      return countSnap.data().count;
    } catch {
      // Count aggregation not available, return -1 to indicate unknown
      return -1;
    }
  }

  async search(
    queryEmbedding: number[],
    tenantId: string,
    topK: number
  ): Promise<VectorSearchResult[]> {
    const db = getDb();
    const startTime = Date.now();

    // Scale guard: Check corpus size and warn if large
    if (!this.warnedForTenant.has(tenantId)) {
      const corpusSize = await this.getTenantChunkCount(tenantId);
      if (corpusSize > FIRESTORE_FALLBACK_WARN_THRESHOLD) {
        logWarn('Firestore vector search fallback used with large corpus', {
          tenantId,
          corpusSize,
          threshold: FIRESTORE_FALLBACK_WARN_THRESHOLD,
          recommendation: 'Enable Vertex Vector Search (VERTEX_VECTOR_SEARCH_ENABLED=true) for production scale',
        });
        this.warnedForTenant.add(tenantId);
      }
    }

    // Fetch chunks that have embeddings - scan up to maxCandidates
    // This ensures we don't silently miss older relevant notes
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
      maxCandidatesConfig: this.maxCandidates,
      topK,
      elapsedMs: Date.now() - startTime,
    });

    return results.slice(0, topK);
  }
}

// Static flag to track if misconfiguration warning has been logged
let vertexMisconfigWarningLogged = false;

// ============================================
// Auth Client Connection Pool
// ============================================
// Caches GoogleAuth client and access tokens to avoid re-authentication overhead
// Access tokens are cached with automatic refresh before expiration

interface CachedAuthToken {
  token: string;
  expiresAt: number;  // Unix timestamp in ms
}

let cachedAuthClient: InstanceType<typeof import('google-auth-library').GoogleAuth> | null = null;
let cachedAccessToken: CachedAuthToken | null = null;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;  // Refresh 60 seconds before expiration
const TOKEN_DEFAULT_TTL_MS = 50 * 60 * 1000;  // Default 50 min if no expiry provided (tokens typically last 1 hour)

/**
 * Get or create the GoogleAuth client (singleton)
 * This avoids re-creating the auth client on every request
 */
async function getAuthClient(): Promise<InstanceType<typeof import('google-auth-library').GoogleAuth>> {
  if (cachedAuthClient) {
    return cachedAuthClient;
  }

  const { GoogleAuth } = await import('google-auth-library');
  cachedAuthClient = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  return cachedAuthClient;
}

/**
 * Get a valid access token, using cache when possible
 * Automatically refreshes token before expiration
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with buffer for safety)
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
    return cachedAccessToken.token;
  }

  // Get fresh token
  const auth = await getAuthClient();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (!tokenResponse.token) {
    throw new Error('Failed to get access token');
  }

  // Cache the token with expiration
  // Use provided expiry or default TTL
  const expiresAt = tokenResponse.res?.data?.expiry_date || (now + TOKEN_DEFAULT_TTL_MS);
  cachedAccessToken = {
    token: tokenResponse.token,
    expiresAt: typeof expiresAt === 'number' ? expiresAt : now + TOKEN_DEFAULT_TTL_MS,
  };

  return cachedAccessToken.token;
}

/**
 * Clear cached auth (for testing or credential rotation)
 */
export function clearVertexAuthCache(): void {
  cachedAuthClient = null;
  cachedAccessToken = null;
}

/**
 * Parsed Vertex configuration with validated fields
 */
interface VertexConfig {
  projectId: string;
  region: string;
  indexEndpointResource: string;  // Full resource name: projects/X/locations/Y/indexEndpoints/Z
  deployedIndexId: string;
  indexId: string;                // For upsert/remove operations
  distanceMetric: 'COSINE' | 'DOT_PRODUCT' | 'SQUARED_L2';
  findNeighborsUrl: string;       // Precomputed URL for search
  upsertUrl: string;              // Precomputed URL for upsert
  removeUrl: string;              // Precomputed URL for remove
  isValid: boolean;
  validationErrors: string[];
}

/**
 * Parse and validate Vertex Vector Search configuration from environment.
 * Produces the correct findNeighbors URL using the standard Vertex AI API format.
 *
 * ENV CONTRACT:
 * - GOOGLE_CLOUD_PROJECT or GCLOUD_PROJECT: GCP project ID (required)
 * - VERTEX_VECTOR_SEARCH_REGION: Region (default: us-central1)
 * - VERTEX_INDEX_ENDPOINT_RESOURCE: Full resource name (preferred)
 *   OR VERTEX_INDEX_ENDPOINT_ID: Just the endpoint ID (will be combined with project/region)
 * - VERTEX_DEPLOYED_INDEX_ID: ID of the deployed index (required)
 * - VERTEX_VECTOR_SEARCH_INDEX_ID: Index ID for upsert/remove (optional for search)
 * - VERTEX_DISTANCE_METRIC: COSINE | DOT_PRODUCT | SQUARED_L2 (default: COSINE)
 */
function parseVertexConfig(): VertexConfig {
  const errors: string[] = [];

  // Project ID: use config's PROJECT_ID which already handles GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT
  const projectId = PROJECT_ID;
  if (!projectId || projectId === 'local') {
    errors.push('GOOGLE_CLOUD_PROJECT or GCLOUD_PROJECT must be set');
  }

  const region = VERTEX_VECTOR_SEARCH_REGION;
  const deployedIndexId = VERTEX_DEPLOYED_INDEX_ID;
  if (!deployedIndexId) {
    errors.push('VERTEX_DEPLOYED_INDEX_ID is required');
  }

  // Parse index endpoint - prefer full resource name
  let indexEndpointResource = '';

  if (VERTEX_INDEX_ENDPOINT_RESOURCE) {
    // Preferred: full resource name provided directly
    // Expected format: projects/{project}/locations/{region}/indexEndpoints/{endpoint_id}
    indexEndpointResource = VERTEX_INDEX_ENDPOINT_RESOURCE;

    // Validate format
    const resourcePattern = /^projects\/[^/]+\/locations\/[^/]+\/indexEndpoints\/[^/]+$/;
    if (!resourcePattern.test(indexEndpointResource)) {
      errors.push(`VERTEX_INDEX_ENDPOINT_RESOURCE has invalid format. Expected: projects/{project}/locations/{region}/indexEndpoints/{endpoint_id}. Got: ${indexEndpointResource}`);
    }
  } else if (VERTEX_INDEX_ENDPOINT_ID) {
    // Fallback: construct from endpoint ID + project + region
    if (projectId && projectId !== 'local') {
      indexEndpointResource = `projects/${projectId}/locations/${region}/indexEndpoints/${VERTEX_INDEX_ENDPOINT_ID}`;
    } else {
      errors.push('Cannot construct endpoint resource: project ID not available');
    }
  } else if (VERTEX_VECTOR_SEARCH_ENDPOINT) {
    // Legacy support: try to parse the old VERTEX_VECTOR_SEARCH_ENDPOINT
    // This could be either a public domain or a resource name
    const legacyEndpoint = VERTEX_VECTOR_SEARCH_ENDPOINT;

    if (legacyEndpoint.includes('projects/')) {
      // It looks like a resource name
      indexEndpointResource = legacyEndpoint;
    } else if (legacyEndpoint.includes('.')) {
      // It looks like a domain - extract endpoint ID and construct resource
      // Format: {endpoint_id}.{region}-aiplatform.googleapis.com
      const match = legacyEndpoint.match(/^(\d+)\./);
      if (match && projectId && projectId !== 'local') {
        indexEndpointResource = `projects/${projectId}/locations/${region}/indexEndpoints/${match[1]}`;
      } else {
        errors.push(`Cannot parse legacy VERTEX_VECTOR_SEARCH_ENDPOINT: ${legacyEndpoint}. Use VERTEX_INDEX_ENDPOINT_RESOURCE instead.`);
      }
    } else {
      // Assume it's just an endpoint ID
      if (projectId && projectId !== 'local') {
        indexEndpointResource = `projects/${projectId}/locations/${region}/indexEndpoints/${legacyEndpoint}`;
      } else {
        errors.push('Cannot construct endpoint resource from legacy endpoint: project ID not available');
      }
    }
  } else {
    errors.push('One of VERTEX_INDEX_ENDPOINT_RESOURCE, VERTEX_INDEX_ENDPOINT_ID, or VERTEX_VECTOR_SEARCH_ENDPOINT is required');
  }

  // Index ID for upsert/remove (optional for search-only)
  const indexId = VERTEX_VECTOR_SEARCH_INDEX_ID;

  // Distance metric
  const distanceMetric = VERTEX_DISTANCE_METRIC;

  // Construct URLs
  // findNeighbors URL: https://{region}-aiplatform.googleapis.com/v1/{indexEndpointResource}:findNeighbors
  const findNeighborsUrl = indexEndpointResource
    ? `https://${region}-aiplatform.googleapis.com/v1/${indexEndpointResource}:findNeighbors`
    : '';

  // upsert/remove URLs use the index resource (different from endpoint)
  const indexResource = indexId && projectId && projectId !== 'local'
    ? `projects/${projectId}/locations/${region}/indexes/${indexId}`
    : '';
  const upsertUrl = indexResource
    ? `https://${region}-aiplatform.googleapis.com/v1/${indexResource}:upsertDatapoints`
    : '';
  const removeUrl = indexResource
    ? `https://${region}-aiplatform.googleapis.com/v1/${indexResource}:removeDatapoints`
    : '';

  return {
    projectId,
    region,
    indexEndpointResource,
    deployedIndexId,
    indexId,
    distanceMetric,
    findNeighborsUrl,
    upsertUrl,
    removeUrl,
    isValid: errors.length === 0,
    validationErrors: errors,
  };
}

/**
 * Vertex AI Vector Search implementation (optional)
 *
 * Uses Google Cloud Vertex AI Vector Search for scalable nearest neighbor search.
 *
 * ENV CONTRACT:
 * - GOOGLE_CLOUD_PROJECT: GCP project (consistent with rest of codebase)
 * - VERTEX_VECTOR_SEARCH_REGION: Region (default: us-central1)
 * - VERTEX_INDEX_ENDPOINT_RESOURCE: Full resource name (preferred)
 *   OR VERTEX_INDEX_ENDPOINT_ID: Just endpoint ID
 * - VERTEX_DEPLOYED_INDEX_ID: Deployed index ID (required)
 * - VERTEX_VECTOR_SEARCH_INDEX_ID: Index ID for upsert/remove
 *
 * Distance metric handling:
 * - COSINE_DISTANCE: score = 1 - distance
 * - DOT_PRODUCT_DISTANCE: score = 1 - distance
 * - SQUARED_L2_DISTANCE: score = 1 / (1 + distance)
 */
export class VertexVectorSearchIndex implements VectorIndex {
  private config: VertexConfig;
  private configChecked: boolean = false;

  constructor() {
    this.config = parseVertexConfig();
  }

  /**
   * Convert Vertex distance to similarity score [0, 1]
   */
  private distanceToSimilarity(distance: number): number {
    switch (this.config.distanceMetric) {
      case 'COSINE':
      case 'DOT_PRODUCT':
        return Math.max(0, Math.min(1, 1 - distance));
      case 'SQUARED_L2':
        return 1 / (1 + distance);
      default:
        return Math.max(0, Math.min(1, 1 - distance));
    }
  }

  getName(): string {
    return 'vertex_vector_search';
  }

  isConfigured(): boolean {
    return this.config.isValid && !!this.config.deployedIndexId;
  }

  /**
   * Get detailed configuration status for debugging
   */
  getConfigStatus(): { configured: boolean; errors: string[]; urls: { findNeighbors: string; upsert: string } } {
    return {
      configured: this.isConfigured(),
      errors: this.config.validationErrors,
      urls: {
        findNeighbors: this.config.findNeighborsUrl,
        upsert: this.config.upsertUrl,
      },
    };
  }

  /**
   * Log misconfiguration error once per process
   */
  private logMisconfigurationOnce(): void {
    if (!this.configChecked) {
      this.configChecked = true;

      if (!this.config.isValid && !vertexMisconfigWarningLogged) {
        vertexMisconfigWarningLogged = true;
        logError('Vertex Vector Search misconfigured - falling back to Firestore. Fix configuration for production scale.', {
          errors: this.config.validationErrors,
          recommendation: 'Set VERTEX_INDEX_ENDPOINT_RESOURCE (full resource name) and VERTEX_DEPLOYED_INDEX_ID',
          example: 'VERTEX_INDEX_ENDPOINT_RESOURCE=projects/my-project/locations/us-central1/indexEndpoints/123456789',
        });
      }
    }
  }

  /**
   * Search for similar vectors using Vertex AI Vector Search REST API
   *
   * Uses the findNeighbors endpoint:
   * POST https://{region}-aiplatform.googleapis.com/v1/{indexEndpointResource}:findNeighbors
   */
  async search(
    queryEmbedding: number[],
    tenantId: string,
    topK: number
  ): Promise<VectorSearchResult[]> {
    this.logMisconfigurationOnce();

    if (!this.isConfigured()) {
      return [];
    }

    const startTime = Date.now();

    try {
      // Get access token using cached auth client (avoids re-authentication overhead)
      const accessToken = await getAccessToken();

      // Build the findNeighbors request
      const requestBody = {
        deployedIndexId: this.config.deployedIndexId,
        queries: [
          {
            datapoint: {
              datapointId: 'query',
              featureVector: queryEmbedding,
              restricts: [
                {
                  namespace: 'tenantId',
                  allowList: [tenantId],
                },
              ],
            },
            neighborCount: topK,
          },
        ],
      };

      // Use precomputed URL
      const response = await fetch(this.config.findNeighborsUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as VertexFindNeighborsResponse;

      // Parse the response
      const results: VectorSearchResult[] = [];
      if (data.nearestNeighbors && data.nearestNeighbors.length > 0) {
        const neighbors = data.nearestNeighbors[0].neighbors || [];
        for (const neighbor of neighbors) {
          const [chunkId, noteId] = neighbor.datapoint.datapointId.split(':');
          const similarity = neighbor.distance !== undefined
            ? this.distanceToSimilarity(neighbor.distance)
            : 0;
          results.push({
            chunkId,
            noteId: noteId || '',
            score: similarity,
          });
        }
      }

      logInfo('Vertex Vector Search complete', {
        tenantId,
        topK,
        resultsReturned: results.length,
        elapsedMs: Date.now() - startTime,
      });

      return results;
    } catch (err) {
      logError('Vertex Vector Search failed', err);
      return [];
    }
  }

  /**
   * Upsert vectors to the Vertex AI index
   *
   * Uses the upsertDatapoints endpoint for streaming updates.
   * For batch updates, use the backfill script with batch import.
   */
  async upsert(
    datapoints: VertexDatapoint[]
  ): Promise<boolean> {
    if (!this.config.upsertUrl) {
      logError('Vertex Vector Search index ID not configured for upsert', {
        recommendation: 'Set VERTEX_VECTOR_SEARCH_INDEX_ID',
      });
      return false;
    }

    const startTime = Date.now();

    try {
      // Get access token using cached auth client (avoids re-authentication overhead)
      const accessToken = await getAccessToken();

      const requestBody = {
        datapoints: datapoints.map(dp => ({
          datapointId: dp.datapointId,
          featureVector: dp.featureVector,
          restricts: dp.restricts,
        })),
      };

      const response = await fetch(this.config.upsertUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex upsert error: ${response.status} ${errorText}`);
      }

      logInfo('Vertex Vector Search upsert complete', {
        datapointsUpserted: datapoints.length,
        elapsedMs: Date.now() - startTime,
      });

      return true;
    } catch (err) {
      logError('Vertex Vector Search upsert failed', err);
      return false;
    }
  }

  /**
   * Remove vectors from the Vertex AI index
   */
  async remove(datapointIds: string[]): Promise<boolean> {
    if (!this.config.removeUrl) {
      logError('Vertex Vector Search index ID not configured for remove', {
        recommendation: 'Set VERTEX_VECTOR_SEARCH_INDEX_ID',
      });
      return false;
    }

    try {
      // Get access token using cached auth client (avoids re-authentication overhead)
      const accessToken = await getAccessToken();

      const requestBody = {
        datapointIds,
      };

      const response = await fetch(this.config.removeUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex remove error: ${response.status} ${errorText}`);
      }

      logInfo('Vertex Vector Search remove complete', {
        datapointsRemoved: datapointIds.length,
      });

      return true;
    } catch (err) {
      logError('Vertex Vector Search remove failed', err);
      return false;
    }
  }
}

/**
 * Vertex AI Vector Search response types
 */
interface VertexFindNeighborsResponse {
  nearestNeighbors?: Array<{
    id?: string;
    neighbors?: Array<{
      datapoint: {
        datapointId: string;
      };
      distance?: number;
    }>;
  }>;
}

/**
 * Datapoint for Vertex AI Vector Search upsert
 */
export interface VertexDatapoint {
  datapointId: string;  // Format: {chunkId}:{noteId}
  featureVector: number[];
  restricts?: Array<{
    namespace: string;
    allowList?: string[];
    denyList?: string[];
  }>;
}

// Cached vector index instance (avoid re-parsing config on every call)
let cachedVectorIndex: VectorIndex | null = null;
let cachedVertexIndex: VertexVectorSearchIndex | null = null;

/**
 * Get the active vector index based on configuration.
 * Returns Vertex if enabled and configured, otherwise Firestore fallback.
 */
export function getVectorIndex(): VectorIndex {
  if (cachedVectorIndex) {
    return cachedVectorIndex;
  }

  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');

  if (VERTEX_VECTOR_SEARCH_ENABLED) {
    const vertexIndex = new VertexVectorSearchIndex();
    if (vertexIndex.isConfigured()) {
      cachedVectorIndex = vertexIndex;
      logInfo('Vector search using Vertex AI', { index: vertexIndex.getName() });
      return vertexIndex;
    }
    // Misconfiguration is logged inside VertexVectorSearchIndex.logMisconfigurationOnce()
  }

  const firestoreIndex = new FirestoreApproxVectorIndex();
  cachedVectorIndex = firestoreIndex;
  logInfo('Vector search using Firestore fallback', { index: firestoreIndex.getName() });
  return firestoreIndex;
}

/**
 * Get the Vertex index for upsert/remove operations.
 * Returns null if Vertex is not configured.
 */
export function getVertexIndex(): VertexVectorSearchIndex | null {
  if (cachedVertexIndex !== null) {
    return cachedVertexIndex;
  }

  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');

  if (VERTEX_VECTOR_SEARCH_ENABLED) {
    const vertexIndex = new VertexVectorSearchIndex();
    if (vertexIndex.isConfigured()) {
      cachedVertexIndex = vertexIndex;
      return vertexIndex;
    }
  }

  return null;
}

/**
 * Check if Vertex Vector Search is properly configured.
 * Useful for health checks and diagnostics.
 */
export function isVertexConfigured(): boolean {
  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');

  if (!VERTEX_VECTOR_SEARCH_ENABLED) {
    return false;
  }

  const vertexIndex = new VertexVectorSearchIndex();
  return vertexIndex.isConfigured();
}

/**
 * Get Vertex configuration status for diagnostics.
 * Returns configuration details without sensitive data.
 */
export function getVertexConfigStatus(): { enabled: boolean; configured: boolean; errors: string[] } {
  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');

  if (!VERTEX_VECTOR_SEARCH_ENABLED) {
    return { enabled: false, configured: false, errors: [] };
  }

  const vertexIndex = new VertexVectorSearchIndex();
  const status = vertexIndex.getConfigStatus();
  return {
    enabled: true,
    configured: status.configured,
    errors: status.errors,
  };
}

