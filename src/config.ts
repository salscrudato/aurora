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
// Chunking Config
// ============================================
export const CHUNK_TARGET_SIZE = envInt('CHUNK_TARGET_SIZE', 500);      // Target chars per chunk
export const CHUNK_MIN_SIZE = envInt('CHUNK_MIN_SIZE', 100);            // Min chars before merging
export const CHUNK_MAX_SIZE = envInt('CHUNK_MAX_SIZE', 800);            // Max chars per chunk
export const CHUNK_OVERLAP = envInt('CHUNK_OVERLAP', 50);               // Overlap chars between chunks

// ============================================
// Embeddings Config
// ============================================
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-004';
export const EMBEDDING_DIMENSIONS = envInt('EMBEDDING_DIMENSIONS', 768);
export const EMBEDDINGS_ENABLED = envBool('EMBEDDINGS_ENABLED', true);

// ============================================
// Retrieval Config
// ============================================
export const RETRIEVAL_TOP_K = envInt('RETRIEVAL_TOP_K', 30);           // Initial candidates
export const RETRIEVAL_RERANK_TO = envInt('RETRIEVAL_RERANK_TO', 8);    // After reranking
export const RETRIEVAL_DEFAULT_DAYS = envInt('RETRIEVAL_DEFAULT_DAYS', 90);
export const RETRIEVAL_MAX_CONTEXT_CHARS = envInt('RETRIEVAL_MAX_CONTEXT_CHARS', 12000);
export const RETRIEVAL_MAX_CONTEXT_TOKENS = envInt('RETRIEVAL_MAX_CONTEXT_TOKENS', 3000);

// ============================================
// Chat / LLM Config
// ============================================
export const CHAT_MODEL = process.env.CHAT_MODEL || 'gemini-2.0-flash';
export const CHAT_TIMEOUT_MS = envInt('CHAT_TIMEOUT_MS', 30000);
export const CHAT_MAX_QUERY_LENGTH = envInt('CHAT_MAX_QUERY_LENGTH', 2000);
export const CHAT_TEMPERATURE = parseFloat(process.env.CHAT_TEMPERATURE || '0.3');

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
export const ASYNC_EMBEDDINGS = envBool('ASYNC_EMBEDDINGS', false); // Future: queue for large notes

// ============================================
// Rate Limiting
// ============================================
export const RATE_LIMIT_ENABLED = envBool('RATE_LIMIT_ENABLED', false);
export const RATE_LIMIT_REQUESTS_PER_MIN = envInt('RATE_LIMIT_REQUESTS_PER_MIN', 60);
export const RATE_LIMIT_WINDOW_MS = envInt('RATE_LIMIT_WINDOW_MS', 60000);

// ============================================
// Background Queue
// ============================================
export const BACKGROUND_QUEUE_MAX_SIZE = envInt('BACKGROUND_QUEUE_MAX_SIZE', 100);
export const BACKGROUND_QUEUE_MAX_CONCURRENT = envInt('BACKGROUND_QUEUE_MAX_CONCURRENT', 3);

// ============================================
// Logging
// ============================================
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
export const LOG_FULL_TEXT = envBool('LOG_FULL_TEXT', false); // Never log full note text in prod

