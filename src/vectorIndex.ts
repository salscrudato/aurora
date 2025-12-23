/** Vector Index Abstraction - Unified interface for vector search (Firestore fallback + Vertex AI) */

import { getDb } from "./firestore";
import { ChunkDoc } from "./types";
import { cosineSimilarity, logInfo, logError, logWarn } from "./utils";
import { CHUNKS_COLLECTION, FIRESTORE_FALLBACK_WARN_THRESHOLD, FIRESTORE_FALLBACK_MAX_SCAN, PROJECT_ID, VERTEX_VECTOR_SEARCH_REGION, VERTEX_INDEX_ENDPOINT_RESOURCE, VERTEX_INDEX_ENDPOINT_ID, VERTEX_VECTOR_SEARCH_ENDPOINT, VERTEX_VECTOR_SEARCH_INDEX_ID, VERTEX_DEPLOYED_INDEX_ID, VERTEX_DISTANCE_METRIC } from "./config";

export interface VectorSearchResult { chunkId: string; noteId: string; score: number; }

export interface VectorIndex {
  search(queryEmbedding: number[], tenantId: string, topK: number): Promise<VectorSearchResult[]>;
  getName(): string;
}

/** Firestore-based approximate vector search - fallback for dev/small datasets */
export class FirestoreApproxVectorIndex implements VectorIndex {
  private maxCandidates: number;
  private warnedForTenant: Set<string> = new Set();

  constructor(maxCandidates: number = 500) { this.maxCandidates = Math.max(maxCandidates, FIRESTORE_FALLBACK_MAX_SCAN); }
  getName(): string { return 'firestore_approx'; }

  private async getTenantChunkCount(tenantId: string): Promise<number> {
    try { return (await getDb().collection(CHUNKS_COLLECTION).where('tenantId', '==', tenantId).count().get()).data().count; }
    catch { return -1; }
  }

  async search(queryEmbedding: number[], tenantId: string, topK: number): Promise<VectorSearchResult[]> {
    const startTime = Date.now();
    if (!this.warnedForTenant.has(tenantId)) {
      const corpusSize = await this.getTenantChunkCount(tenantId);
      if (corpusSize > FIRESTORE_FALLBACK_WARN_THRESHOLD) {
        logWarn('Firestore vector search fallback used with large corpus', { tenantId, corpusSize, threshold: FIRESTORE_FALLBACK_WARN_THRESHOLD, recommendation: 'Enable Vertex Vector Search for production scale' });
        this.warnedForTenant.add(tenantId);
      }
    }
    const snap = await getDb().collection(CHUNKS_COLLECTION).where('tenantId', '==', tenantId).orderBy('createdAt', 'desc').limit(this.maxCandidates).get();
    const results: VectorSearchResult[] = [];
    for (const doc of snap.docs) {
      const chunk = doc.data() as ChunkDoc;
      if (chunk.embedding?.length) results.push({ chunkId: chunk.chunkId, noteId: chunk.noteId, score: cosineSimilarity(queryEmbedding, chunk.embedding) });
    }
    results.sort((a, b) => b.score - a.score);
    logInfo('Firestore vector search complete', { tenantId, candidatesScanned: snap.docs.length, chunksWithEmbeddings: results.length, topK, elapsedMs: Date.now() - startTime });
    return results.slice(0, topK);
  }
}

let vertexMisconfigWarningLogged = false;

// Auth caching
interface CachedAuthToken { token: string; expiresAt: number; }
let cachedAuthClient: InstanceType<typeof import('google-auth-library').GoogleAuth> | null = null;
let cachedAccessToken: CachedAuthToken | null = null;
const TOKEN_REFRESH_BUFFER_MS = 60_000, TOKEN_DEFAULT_TTL_MS = 50 * 60_000;

async function getAuthClient(): Promise<InstanceType<typeof import('google-auth-library').GoogleAuth>> {
  if (cachedAuthClient) return cachedAuthClient;
  const { GoogleAuth } = await import('google-auth-library');
  cachedAuthClient = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  return cachedAuthClient;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) return cachedAccessToken.token;
  const client = await (await getAuthClient()).getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) throw new Error('Failed to get access token');
  const expiresAt = tokenResponse.res?.data?.expiry_date || (now + TOKEN_DEFAULT_TTL_MS);
  cachedAccessToken = { token: tokenResponse.token, expiresAt: typeof expiresAt === 'number' ? expiresAt : now + TOKEN_DEFAULT_TTL_MS };
  return cachedAccessToken.token;
}

export function clearVertexAuthCache(): void { cachedAuthClient = null; cachedAccessToken = null; }

interface VertexConfig {
  projectId: string; region: string; indexEndpointResource: string; deployedIndexId: string; indexId: string;
  distanceMetric: 'COSINE' | 'DOT_PRODUCT' | 'SQUARED_L2'; findNeighborsUrl: string; upsertUrl: string; removeUrl: string;
  isValid: boolean; validationErrors: string[];
}

function parseVertexConfig(): VertexConfig {
  const errors: string[] = [], projectId = PROJECT_ID, region = VERTEX_VECTOR_SEARCH_REGION, deployedIndexId = VERTEX_DEPLOYED_INDEX_ID;
  if (!projectId || projectId === 'local') errors.push('GOOGLE_CLOUD_PROJECT or GCLOUD_PROJECT must be set');
  if (!deployedIndexId) errors.push('VERTEX_DEPLOYED_INDEX_ID is required');

  let indexEndpointResource = '';
  if (VERTEX_INDEX_ENDPOINT_RESOURCE) {
    indexEndpointResource = VERTEX_INDEX_ENDPOINT_RESOURCE;
    if (!/^projects\/[^/]+\/locations\/[^/]+\/indexEndpoints\/[^/]+$/.test(indexEndpointResource)) errors.push(`VERTEX_INDEX_ENDPOINT_RESOURCE has invalid format: ${indexEndpointResource}`);
  } else if (VERTEX_INDEX_ENDPOINT_ID) {
    if (projectId && projectId !== 'local') indexEndpointResource = `projects/${projectId}/locations/${region}/indexEndpoints/${VERTEX_INDEX_ENDPOINT_ID}`;
    else errors.push('Cannot construct endpoint resource: project ID not available');
  } else if (VERTEX_VECTOR_SEARCH_ENDPOINT) {
    const ep = VERTEX_VECTOR_SEARCH_ENDPOINT;
    if (ep.includes('projects/')) indexEndpointResource = ep;
    else if (ep.includes('.')) { const m = ep.match(/^(\d+)\./); if (m && projectId && projectId !== 'local') indexEndpointResource = `projects/${projectId}/locations/${region}/indexEndpoints/${m[1]}`; else errors.push(`Cannot parse legacy endpoint: ${ep}`); }
    else if (projectId && projectId !== 'local') indexEndpointResource = `projects/${projectId}/locations/${region}/indexEndpoints/${ep}`;
    else errors.push('Cannot construct endpoint resource from legacy endpoint');
  } else errors.push('One of VERTEX_INDEX_ENDPOINT_RESOURCE, VERTEX_INDEX_ENDPOINT_ID, or VERTEX_VECTOR_SEARCH_ENDPOINT is required');

  const indexId = VERTEX_VECTOR_SEARCH_INDEX_ID, distanceMetric = VERTEX_DISTANCE_METRIC;
  const findNeighborsUrl = indexEndpointResource ? `https://${region}-aiplatform.googleapis.com/v1/${indexEndpointResource}:findNeighbors` : '';
  const indexResource = indexId && projectId && projectId !== 'local' ? `projects/${projectId}/locations/${region}/indexes/${indexId}` : '';
  const upsertUrl = indexResource ? `https://${region}-aiplatform.googleapis.com/v1/${indexResource}:upsertDatapoints` : '';
  const removeUrl = indexResource ? `https://${region}-aiplatform.googleapis.com/v1/${indexResource}:removeDatapoints` : '';
  return { projectId, region, indexEndpointResource, deployedIndexId, indexId, distanceMetric, findNeighborsUrl, upsertUrl, removeUrl, isValid: errors.length === 0, validationErrors: errors };
}

/** Vertex AI Vector Search implementation */
export class VertexVectorSearchIndex implements VectorIndex {
  private config: VertexConfig;
  private configChecked = false;

  constructor() { this.config = parseVertexConfig(); }

  private distanceToSimilarity(distance: number): number {
    if (this.config.distanceMetric === 'SQUARED_L2') return 1 / (1 + distance);
    return Math.max(0, Math.min(1, 1 - distance));
  }

  getName(): string { return 'vertex_vector_search'; }
  isConfigured(): boolean { return this.config.isValid && !!this.config.deployedIndexId; }

  getConfigStatus(): { configured: boolean; errors: string[]; urls: { findNeighbors: string; upsert: string } } {
    return { configured: this.isConfigured(), errors: this.config.validationErrors, urls: { findNeighbors: this.config.findNeighborsUrl, upsert: this.config.upsertUrl } };
  }

  private logMisconfigurationOnce(): void {
    if (!this.configChecked) {
      this.configChecked = true;
      if (!this.config.isValid && !vertexMisconfigWarningLogged) {
        vertexMisconfigWarningLogged = true;
        logError('Vertex Vector Search misconfigured - falling back to Firestore', { errors: this.config.validationErrors, recommendation: 'Set VERTEX_INDEX_ENDPOINT_RESOURCE and VERTEX_DEPLOYED_INDEX_ID' });
      }
    }
  }

  async search(queryEmbedding: number[], tenantId: string, topK: number): Promise<VectorSearchResult[]> {
    this.logMisconfigurationOnce();

    if (!this.isConfigured()) return [];
    const startTime = Date.now();
    try {
      const accessToken = await getAccessToken();
      const requestBody = { deployedIndexId: this.config.deployedIndexId, queries: [{ datapoint: { datapointId: 'query', featureVector: queryEmbedding, restricts: [{ namespace: 'tenantId', allowList: [tenantId] }] }, neighborCount: topK }] };
      const response = await fetch(this.config.findNeighborsUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
      if (!response.ok) throw new Error(`Vertex API error: ${response.status} ${await response.text()}`);
      const data = await response.json() as VertexFindNeighborsResponse;
      const results: VectorSearchResult[] = (data.nearestNeighbors?.[0]?.neighbors || []).map(n => {
        const [chunkId, noteId] = n.datapoint.datapointId.split(':');
        return { chunkId, noteId: noteId || '', score: n.distance !== undefined ? this.distanceToSimilarity(n.distance) : 0 };
      });
      logInfo('Vertex Vector Search complete', { tenantId, topK, resultsReturned: results.length, elapsedMs: Date.now() - startTime });
      return results;
    } catch (err) { logError('Vertex Vector Search failed', err); return []; }
  }

  async upsert(datapoints: VertexDatapoint[]): Promise<boolean> {
    if (!this.config.upsertUrl) { logError('Vertex index ID not configured for upsert'); return false; }
    const startTime = Date.now();
    try {
      const response = await fetch(this.config.upsertUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ datapoints: datapoints.map(dp => ({ datapointId: dp.datapointId, featureVector: dp.featureVector, restricts: dp.restricts })) }) });
      if (!response.ok) throw new Error(`Vertex upsert error: ${response.status} ${await response.text()}`);
      logInfo('Vertex Vector Search upsert complete', { datapointsUpserted: datapoints.length, elapsedMs: Date.now() - startTime });
      return true;
    } catch (err) { logError('Vertex Vector Search upsert failed', err); return false; }
  }

  async remove(datapointIds: string[]): Promise<boolean> {
    if (!this.config.removeUrl) { logError('Vertex index ID not configured for remove'); return false; }
    try {
      const response = await fetch(this.config.removeUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ datapointIds }) });
      if (!response.ok) throw new Error(`Vertex remove error: ${response.status} ${await response.text()}`);
      logInfo('Vertex Vector Search remove complete', { datapointsRemoved: datapointIds.length });
      return true;
    } catch (err) { logError('Vertex Vector Search remove failed', err); return false; }
  }
}

interface VertexFindNeighborsResponse { nearestNeighbors?: Array<{ id?: string; neighbors?: Array<{ datapoint: { datapointId: string }; distance?: number }>; }>; }

export interface VertexDatapoint { datapointId: string; featureVector: number[]; restricts?: Array<{ namespace: string; allowList?: string[]; denyList?: string[]; }>; }

let cachedVectorIndex: VectorIndex | null = null;
let cachedVertexIndex: VertexVectorSearchIndex | null = null;

export function getVectorIndex(): VectorIndex {
  if (cachedVectorIndex) return cachedVectorIndex;
  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');
  if (VERTEX_VECTOR_SEARCH_ENABLED) {
    const vi = new VertexVectorSearchIndex();
    if (vi.isConfigured()) { cachedVectorIndex = vi; logInfo('Vector search using Vertex AI', { index: vi.getName() }); return vi; }
  }
  const fi = new FirestoreApproxVectorIndex();
  cachedVectorIndex = fi; logInfo('Vector search using Firestore fallback', { index: fi.getName() }); return fi;
}

export function getVertexIndex(): VertexVectorSearchIndex | null {
  if (cachedVertexIndex !== null) return cachedVertexIndex;
  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');
  if (VERTEX_VECTOR_SEARCH_ENABLED) { const vi = new VertexVectorSearchIndex(); if (vi.isConfigured()) { cachedVertexIndex = vi; return vi; } }
  return null;
}

export function isVertexConfigured(): boolean {
  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');
  return VERTEX_VECTOR_SEARCH_ENABLED ? new VertexVectorSearchIndex().isConfigured() : false;
}

export function getVertexConfigStatus(): { enabled: boolean; configured: boolean; errors: string[] } {
  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');
  if (!VERTEX_VECTOR_SEARCH_ENABLED) return { enabled: false, configured: false, errors: [] };
  const status = new VertexVectorSearchIndex().getConfigStatus();
  return { enabled: true, configured: status.configured, errors: status.errors };
}
