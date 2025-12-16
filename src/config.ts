/**
 * AuroraNotes API - Configuration
 * 
 * Centralized configuration loaded from environment variables
 * with sensible defaults and validation.
 */

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key]?.toLowerCase();
  if (!val) return defaultValue;
  return val === 'true' || val === '1';
}

// ============================================
// Server Config
// ============================================
export const PORT = envInt('PORT', 8080);
export const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'local';

// ============================================
// Firestore Collections
// ============================================
export const NOTES_COLLECTION = process.env.NOTES_COLLECTION || 'notes';
export const CHUNKS_COLLECTION = process.env.CHUNKS_COLLECTION || 'noteChunks';

// ============================================
// Notes Config
// ============================================
export const MAX_NOTE_LENGTH = envInt('MAX_NOTE_LENGTH', 5000);
export const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'public';
export const NOTES_PAGE_LIMIT = envInt('NOTES_PAGE_LIMIT', 50);
export const MAX_NOTES_PAGE_LIMIT = 100;

// ============================================
// Chunking Config (tuned for citation accuracy)
// ============================================
export const CHUNK_TARGET_SIZE = envInt('CHUNK_TARGET_SIZE', 450);      // Slightly smaller for precision (was 500)
export const CHUNK_MIN_SIZE = envInt('CHUNK_MIN_SIZE', 80);             // Allow smaller chunks (was 100)
export const CHUNK_MAX_SIZE = envInt('CHUNK_MAX_SIZE', 700);            // Smaller max for focused content (was 800)
export const CHUNK_OVERLAP = envInt('CHUNK_OVERLAP', 75);               // More overlap for context (was 50)

// ============================================
// Embeddings Config
// ============================================
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-004';
export const EMBEDDING_DIMENSIONS = envInt('EMBEDDING_DIMENSIONS', 768);
export const EMBEDDINGS_ENABLED = envBool('EMBEDDINGS_ENABLED', true);
export const EMBEDDING_TIMEOUT_MS = envInt('EMBEDDING_TIMEOUT_MS', 15000); // 15 seconds per embedding call

// ============================================
// Retrieval Config
// ============================================
export const RETRIEVAL_TOP_K = envInt('RETRIEVAL_TOP_K', 30);           // Initial candidates
export const RETRIEVAL_RERANK_TO = envInt('RETRIEVAL_RERANK_TO', 8);    // After reranking
export const RETRIEVAL_DEFAULT_DAYS = envInt('RETRIEVAL_DEFAULT_DAYS', 90);
export const RETRIEVAL_MAX_CONTEXT_CHARS = envInt('RETRIEVAL_MAX_CONTEXT_CHARS', 12000);

// ============================================
// Chat / LLM Config
// ============================================
export const CHAT_MODEL = process.env.CHAT_MODEL || 'gemini-2.0-flash';
export const CHAT_TIMEOUT_MS = envInt('CHAT_TIMEOUT_MS', 30000);
export const CHAT_MAX_QUERY_LENGTH = envInt('CHAT_MAX_QUERY_LENGTH', 2000);
export const CHAT_TEMPERATURE = parseFloat(process.env.CHAT_TEMPERATURE || '0.2');

// ============================================
// Cost Controls
// ============================================
export const MAX_CHUNKS_IN_CONTEXT = envInt('MAX_CHUNKS_IN_CONTEXT', 12);
export const MAX_EMBEDDING_BATCH_SIZE = envInt('MAX_EMBEDDING_BATCH_SIZE', 10);
export const CLOUD_RUN_MAX_INSTANCES = envInt('CLOUD_RUN_MAX_INSTANCES', 10);
export const CLOUD_RUN_CONCURRENCY = envInt('CLOUD_RUN_CONCURRENCY', 80);

// ============================================
// Feature Flags
// ============================================
export const VECTOR_SEARCH_ENABLED = envBool('VECTOR_SEARCH_ENABLED', true);
export const RERANKING_ENABLED = envBool('RERANKING_ENABLED', true);
export const LLM_RERANK_ENABLED = envBool('LLM_RERANK_ENABLED', false);  // Optional LLM-based reranking
export const CITATION_RETRY_ENABLED = envBool('CITATION_RETRY_ENABLED', true);  // Retry on invalid citations

// ============================================
// Vertex AI Vector Search (for 100k+ scale)
// ============================================
export const VERTEX_VECTOR_SEARCH_ENABLED = envBool('VERTEX_VECTOR_SEARCH_ENABLED', false);
export const VERTEX_VECTOR_SEARCH_REGION = process.env.VERTEX_VECTOR_SEARCH_REGION || 'us-central1';
// Endpoint config: prefer VERTEX_INDEX_ENDPOINT_RESOURCE (full resource name)
// Fallback to VERTEX_INDEX_ENDPOINT_ID + project/region construction
export const VERTEX_INDEX_ENDPOINT_RESOURCE = process.env.VERTEX_INDEX_ENDPOINT_RESOURCE || '';
export const VERTEX_INDEX_ENDPOINT_ID = process.env.VERTEX_INDEX_ENDPOINT_ID || '';
// Legacy: VERTEX_VECTOR_SEARCH_ENDPOINT (public endpoint domain) - deprecated
export const VERTEX_VECTOR_SEARCH_ENDPOINT = process.env.VERTEX_VECTOR_SEARCH_ENDPOINT || '';
// Index ID for upsert/remove operations
export const VERTEX_VECTOR_SEARCH_INDEX_ID = process.env.VERTEX_VECTOR_SEARCH_INDEX_ID || '';
// Deployed index ID within the endpoint
export const VERTEX_DEPLOYED_INDEX_ID = process.env.VERTEX_DEPLOYED_INDEX_ID || '';
// Distance metric for score conversion
export const VERTEX_DISTANCE_METRIC = (process.env.VERTEX_DISTANCE_METRIC as 'COSINE' | 'DOT_PRODUCT' | 'SQUARED_L2') || 'COSINE';

// ============================================
// Multi-Stage Retrieval Config
// ============================================
// Vector candidate generation
export const RETRIEVAL_VECTOR_TOP_K = envInt('RETRIEVAL_VECTOR_TOP_K', 300);  // Primary vector candidates
// Lexical candidate generation
export const RETRIEVAL_LEXICAL_TOP_K = envInt('RETRIEVAL_LEXICAL_TOP_K', 100);  // Lexical (exact match) candidates
export const RETRIEVAL_LEXICAL_MAX_TERMS = envInt('RETRIEVAL_LEXICAL_MAX_TERMS', 10);  // Max query terms for array-contains-any
// Recency candidates (soft support)
export const RETRIEVAL_RECENCY_TOP_K = envInt('RETRIEVAL_RECENCY_TOP_K', 50);  // Recent chunk candidates
// Reranking options
export const RETRIEVAL_MMR_ENABLED = envBool('RETRIEVAL_MMR_ENABLED', true);  // Maximal Marginal Relevance diversity
export const RETRIEVAL_MMR_LAMBDA = parseFloat(process.env.RETRIEVAL_MMR_LAMBDA || '0.7');  // Relevance vs diversity tradeoff
// Scale guards
export const FIRESTORE_FALLBACK_WARN_THRESHOLD = envInt('FIRESTORE_FALLBACK_WARN_THRESHOLD', 5000);  // Warn if using Firestore fallback above this chunk count
export const FIRESTORE_FALLBACK_MAX_SCAN = envInt('FIRESTORE_FALLBACK_MAX_SCAN', 2000);  // Max chunks for Firestore fallback scan

// ============================================
// Query Expansion (optional)
// ============================================
export const QUERY_EXPANSION_ENABLED = envBool('QUERY_EXPANSION_ENABLED', false);  // Multi-query expansion
export const QUERY_EXPANSION_REWRITES = envInt('QUERY_EXPANSION_REWRITES', 2);  // Number of query rewrites
export const QUERY_EXPANSION_TTL_MS = envInt('QUERY_EXPANSION_TTL_MS', 300000);  // Cache TTL (5 minutes)

// ============================================
// Citation Verification
// ============================================
export const CITATION_VERIFICATION_ENABLED = envBool('CITATION_VERIFICATION_ENABLED', true);  // Post-generation verification
export const CITATION_MIN_OVERLAP_SCORE = parseFloat(process.env.CITATION_MIN_OVERLAP_SCORE || '0.15');  // Min lexical overlap for validity

// ============================================
// Retrieval Scoring Weights (tunable)
// ============================================
export const SCORE_WEIGHT_VECTOR = parseFloat(process.env.SCORE_WEIGHT_VECTOR || '0.45');
export const SCORE_WEIGHT_LEXICAL = parseFloat(process.env.SCORE_WEIGHT_LEXICAL || '0.35');
export const SCORE_WEIGHT_RECENCY = parseFloat(process.env.SCORE_WEIGHT_RECENCY || '0.12');

// ============================================
// Rate Limiting
// ============================================
export const RATE_LIMIT_ENABLED = envBool('RATE_LIMIT_ENABLED', false);
export const RATE_LIMIT_REQUESTS_PER_MIN = envInt('RATE_LIMIT_REQUESTS_PER_MIN', 60);
export const RATE_LIMIT_WINDOW_MS = envInt('RATE_LIMIT_WINDOW_MS', 60000);

// ============================================
// Background Queue / Cloud Tasks
// ============================================
export const QUEUE_MODE = process.env.QUEUE_MODE || 'in-process'; // 'in-process' | 'cloud-tasks'
export const BACKGROUND_QUEUE_MAX_SIZE = envInt('BACKGROUND_QUEUE_MAX_SIZE', 100);
export const BACKGROUND_QUEUE_MAX_CONCURRENT = envInt('BACKGROUND_QUEUE_MAX_CONCURRENT', 3);
export const CLOUD_TASKS_QUEUE_NAME = process.env.CLOUD_TASKS_QUEUE_NAME || 'note-processing';
export const CLOUD_TASKS_LOCATION = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
export const CLOUD_TASKS_SERVICE_URL = process.env.CLOUD_TASKS_SERVICE_URL || '';

// ============================================
// Internal Endpoint Auth (OIDC)
// ============================================
// When enabled, /internal/* endpoints require valid OIDC JWT from Cloud Tasks
export const INTERNAL_AUTH_ENABLED = envBool('INTERNAL_AUTH_ENABLED', false);
// Expected audience for OIDC tokens (typically the service URL)
export const INTERNAL_AUTH_AUDIENCE = process.env.INTERNAL_AUTH_AUDIENCE || CLOUD_TASKS_SERVICE_URL;
// Expected issuer (Google OIDC)
export const INTERNAL_AUTH_ISSUER = process.env.INTERNAL_AUTH_ISSUER || 'https://accounts.google.com';
// Expected service account email (optional, for stricter validation)
export const INTERNAL_AUTH_SERVICE_ACCOUNT = process.env.INTERNAL_AUTH_SERVICE_ACCOUNT || '';

// ============================================
// Logging
// ============================================
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
export const LOG_FULL_TEXT = envBool('LOG_FULL_TEXT', false); // Never log full note text in prod

