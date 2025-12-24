/**
 * AuroraNotes API - Configuration
 *
 * Centralized configuration loaded from environment variables.
 * All config values have sensible defaults for local development.
 */

// =============================================================================
// Environment Helpers
// =============================================================================

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envFloat(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key]?.toLowerCase();
  if (!val) return defaultValue;
  return val === 'true' || val === '1';
}

function envString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

// =============================================================================
// Server & Infrastructure
// =============================================================================

export const PORT = envInt('PORT', 8080);
export const PROJECT_ID = envString('GOOGLE_CLOUD_PROJECT', '') || envString('GCLOUD_PROJECT', 'local');

// Firestore Collections
export const NOTES_COLLECTION = envString('NOTES_COLLECTION', 'notes');
export const CHUNKS_COLLECTION = envString('CHUNKS_COLLECTION', 'noteChunks');

// =============================================================================
// Notes
// =============================================================================

export const MAX_NOTE_LENGTH = envInt('MAX_NOTE_LENGTH', 5000);
/**
 * @deprecated NEVER use in production paths. Only for migrations/backfill.
 * All user-facing code must derive tenantId from authenticated user's UID.
 */
export const LEGACY_DEFAULT_TENANT_ID = 'public';
export const NOTES_PAGE_LIMIT = envInt('NOTES_PAGE_LIMIT', 50);
export const MAX_NOTES_PAGE_LIMIT = 100;

// =============================================================================
// Chunking (tuned for citation accuracy)
// =============================================================================

export const CHUNK_TARGET_SIZE = envInt('CHUNK_TARGET_SIZE', 450);
export const CHUNK_MIN_SIZE = envInt('CHUNK_MIN_SIZE', 80);
export const CHUNK_MAX_SIZE = envInt('CHUNK_MAX_SIZE', 700);
export const CHUNK_OVERLAP = envInt('CHUNK_OVERLAP', 75);

// =============================================================================
// Embeddings
// =============================================================================

export const EMBEDDING_MODEL = envString('EMBEDDING_MODEL', 'text-embedding-004');
export const EMBEDDING_DIMENSIONS = envInt('EMBEDDING_DIMENSIONS', 768);
export const EMBEDDINGS_ENABLED = envBool('EMBEDDINGS_ENABLED', true);
export const EMBEDDING_TIMEOUT_MS = envInt('EMBEDDING_TIMEOUT_MS', 15000);

// =============================================================================
// Retrieval
// =============================================================================

export const RETRIEVAL_TOP_K = envInt('RETRIEVAL_TOP_K', 30);
export const RETRIEVAL_DEFAULT_DAYS = envInt('RETRIEVAL_DEFAULT_DAYS', 90);
export const RETRIEVAL_MAX_CONTEXT_CHARS = envInt('RETRIEVAL_MAX_CONTEXT_CHARS', 12000);
export const RETRIEVAL_MIN_RELEVANCE = envFloat('RETRIEVAL_MIN_RELEVANCE', 0.25);

// =============================================================================
// Chat / LLM
// =============================================================================

export const CHAT_MODEL = envString('CHAT_MODEL', 'gemini-2.0-flash');
export const CHAT_TIMEOUT_MS = envInt('CHAT_TIMEOUT_MS', 30000);
export const CHAT_MAX_QUERY_LENGTH = envInt('CHAT_MAX_QUERY_LENGTH', 2000);
export const CHAT_TEMPERATURE = envFloat('CHAT_TEMPERATURE', 0.1);
export const CHAT_TOP_P = envFloat('CHAT_TOP_P', 0.9);
export const CHAT_TOP_K = envInt('CHAT_TOP_K', 40);

// =============================================================================
// LLM Context Budget
// =============================================================================

// Gemini 2.0 Flash supports 1M tokens, but we use conservative budget
export const LLM_CONTEXT_BUDGET_CHARS = envInt('LLM_CONTEXT_BUDGET_CHARS', 100000);
export const LLM_CONTEXT_RESERVE_CHARS = envInt('LLM_CONTEXT_RESERVE_CHARS', 4000);
export const LLM_MAX_OUTPUT_TOKENS = envInt('LLM_MAX_OUTPUT_TOKENS', 2048);

// =============================================================================
// Cost Controls
// =============================================================================

export const MAX_CHUNKS_IN_CONTEXT = envInt('MAX_CHUNKS_IN_CONTEXT', 100);
export const MAX_EMBEDDING_BATCH_SIZE = envInt('MAX_EMBEDDING_BATCH_SIZE', 10);

// =============================================================================
// Feature Flags
// =============================================================================

export const VECTOR_SEARCH_ENABLED = envBool('VECTOR_SEARCH_ENABLED', true);
export const RERANKING_ENABLED = envBool('RERANKING_ENABLED', true);
export const LLM_RERANK_ENABLED = envBool('LLM_RERANK_ENABLED', false);
export const CITATION_RETRY_ENABLED = envBool('CITATION_RETRY_ENABLED', true);

// =============================================================================
// Vertex AI Vector Search (for 100k+ scale)
// =============================================================================

export const VERTEX_VECTOR_SEARCH_ENABLED = envBool('VERTEX_VECTOR_SEARCH_ENABLED', false);
export const VERTEX_VECTOR_SEARCH_REGION = envString('VERTEX_VECTOR_SEARCH_REGION', 'us-central1');
export const VERTEX_INDEX_ENDPOINT_RESOURCE = envString('VERTEX_INDEX_ENDPOINT_RESOURCE', '');
export const VERTEX_INDEX_ENDPOINT_ID = envString('VERTEX_INDEX_ENDPOINT_ID', '');
export const VERTEX_VECTOR_SEARCH_ENDPOINT = envString('VERTEX_VECTOR_SEARCH_ENDPOINT', '');
export const VERTEX_VECTOR_SEARCH_INDEX_ID = envString('VERTEX_VECTOR_SEARCH_INDEX_ID', '');
export const VERTEX_DEPLOYED_INDEX_ID = envString('VERTEX_DEPLOYED_INDEX_ID', '');
export const VERTEX_DISTANCE_METRIC = envString('VERTEX_DISTANCE_METRIC', 'COSINE') as 'COSINE' | 'DOT_PRODUCT' | 'SQUARED_L2';

// =============================================================================
// Multi-Stage Retrieval
// =============================================================================

export const RETRIEVAL_VECTOR_TOP_K = envInt('RETRIEVAL_VECTOR_TOP_K', 500);
export const RETRIEVAL_LEXICAL_TOP_K = envInt('RETRIEVAL_LEXICAL_TOP_K', 200);
export const RETRIEVAL_LEXICAL_MAX_TERMS = envInt('RETRIEVAL_LEXICAL_MAX_TERMS', 15);
export const RETRIEVAL_RECENCY_TOP_K = envInt('RETRIEVAL_RECENCY_TOP_K', 75);
export const RETRIEVAL_MMR_ENABLED = envBool('RETRIEVAL_MMR_ENABLED', true);
export const RETRIEVAL_MMR_LAMBDA = envFloat('RETRIEVAL_MMR_LAMBDA', 0.65);
export const FIRESTORE_FALLBACK_WARN_THRESHOLD = envInt('FIRESTORE_FALLBACK_WARN_THRESHOLD', 5000);
export const FIRESTORE_FALLBACK_MAX_SCAN = envInt('FIRESTORE_FALLBACK_MAX_SCAN', 2000);

// =============================================================================
// Query Expansion
// =============================================================================

export const QUERY_EXPANSION_ENABLED = envBool('QUERY_EXPANSION_ENABLED', false);
export const QUERY_EXPANSION_REWRITES = envInt('QUERY_EXPANSION_REWRITES', 2);
export const QUERY_EXPANSION_TTL_MS = envInt('QUERY_EXPANSION_TTL_MS', 300000);
export const QUERY_EXPANSION_MODEL = envString('QUERY_EXPANSION_MODEL', 'gemini-2.0-flash');

// =============================================================================
// Citation Verification
// =============================================================================

export const CITATION_VERIFICATION_ENABLED = envBool('CITATION_VERIFICATION_ENABLED', true);
export const CITATION_MIN_OVERLAP_SCORE = envFloat('CITATION_MIN_OVERLAP_SCORE', 0.15);

// =============================================================================
// Retrieval Scoring Weights (sum should be <= 1.0)
// =============================================================================

export const SCORE_WEIGHT_VECTOR = envFloat('SCORE_WEIGHT_VECTOR', 0.40);
export const SCORE_WEIGHT_LEXICAL = envFloat('SCORE_WEIGHT_LEXICAL', 0.40);
export const SCORE_WEIGHT_RECENCY = envFloat('SCORE_WEIGHT_RECENCY', 0.10);

// =============================================================================
// Rate Limiting
// =============================================================================

export const RATE_LIMIT_ENABLED = envBool('RATE_LIMIT_ENABLED', false);
export const RATE_LIMIT_REQUESTS_PER_MIN = envInt('RATE_LIMIT_REQUESTS_PER_MIN', 60);
export const RATE_LIMIT_WINDOW_MS = envInt('RATE_LIMIT_WINDOW_MS', 60000);

// =============================================================================
// Internal Endpoint Auth (OIDC)
// =============================================================================

export const INTERNAL_AUTH_ENABLED = envBool('INTERNAL_AUTH_ENABLED', false);
export const INTERNAL_AUTH_AUDIENCE = envString('INTERNAL_AUTH_AUDIENCE', '');
export const INTERNAL_AUTH_ISSUER = envString('INTERNAL_AUTH_ISSUER', 'https://accounts.google.com');
export const INTERNAL_AUTH_SERVICE_ACCOUNT = envString('INTERNAL_AUTH_SERVICE_ACCOUNT', '');

// =============================================================================
// Cross-Encoder Reranking
// =============================================================================

export const CROSS_ENCODER_ENABLED = envBool('CROSS_ENCODER_ENABLED', true);
export const CROSS_ENCODER_BACKEND = envString('CROSS_ENCODER_BACKEND', 'gemini');
export const CROSS_ENCODER_MAX_CHUNKS = envInt('CROSS_ENCODER_MAX_CHUNKS', 25);
export const CROSS_ENCODER_TIMEOUT_MS = envInt('CROSS_ENCODER_TIMEOUT_MS', 5000);

// =============================================================================
// Reciprocal Rank Fusion (RRF)
// =============================================================================

export const RRF_ENABLED = envBool('RRF_ENABLED', true);
export const RRF_USE_WEIGHTED = envBool('RRF_USE_WEIGHTED', true);

// =============================================================================
// Streaming
// =============================================================================

export const STREAMING_ENABLED = envBool('STREAMING_ENABLED', true);

// =============================================================================
// Integration Testing (for CI/CD pipelines)
// =============================================================================

/**
 * Secret key for internal integration testing.
 * When set, allows POST /_internal/test endpoints to bypass user auth.
 * Generate with: openssl rand -hex 32
 *
 * SECURITY: Keep this secret! Only use for automated testing.
 */
export const INTEGRATION_TEST_SECRET = envString('INTEGRATION_TEST_SECRET', '');
