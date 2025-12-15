/**
 * AuroraNotes API - Shared Types
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";

// ============================================
// Note Types
// ============================================

/** Note document in Firestore */
export interface NoteDoc {
  id: string;
  text: string;
  tenantId: string;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Note as returned from API (ISO strings) */
export interface NoteResponse {
  id: string;
  text: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

/** Paginated notes response */
export interface NotesListResponse {
  notes: NoteResponse[];
  cursor: string | null;
  hasMore: boolean;
}

// ============================================
// Chunk Types
// ============================================

/** Chunk document in Firestore */
export interface ChunkDoc {
  chunkId: string;
  noteId: string;
  tenantId: string;
  text: string;
  textHash: string;
  position: number;
  tokenEstimate: number;
  createdAt: Timestamp | FieldValue;
  embedding?: number[];
  embeddingModel?: string;
}

/** Chunk with score for retrieval */
export interface ScoredChunk {
  chunkId: string;
  noteId: string;
  tenantId: string;
  text: string;
  position: number;
  createdAt: Date;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  recencyScore?: number;
}

// ============================================
// Query Intent Types (defined early for use in Chat types)
// ============================================

/** Query intent types */
export type QueryIntent =
  | 'summarize'      // User wants a summary of their notes
  | 'list'           // User wants a list of items
  | 'decision'       // User is asking about decisions made
  | 'action_item'    // User is looking for action items/todos
  | 'search'         // General search/lookup
  | 'question';      // Direct question

// ============================================
// Chat Types
// ============================================

/** Citation in chat response */
export interface Citation {
  cid: string;          // e.g., "N12"
  noteId: string;
  chunkId: string;
  createdAt: string;    // ISO string
  snippet: string;
  score: number;
}

/** Chat request body */
export interface ChatRequest {
  message: string;
  tenantId?: string;
}

/** Chat response */
export interface ChatResponse {
  answer: string;
  citations: Citation[];
  meta: {
    model: string;
    retrieval: {
      k: number;
      strategy: string;
      candidateCount?: number;
      rerankCount?: number;
      intent?: QueryIntent;
      timeMs?: number;
    };
  };
}

// ============================================
// Retrieval Types
// ============================================

/** Query analysis result */
export interface QueryAnalysis {
  originalQuery: string;
  normalizedQuery: string;
  keywords: string[];
  intent: QueryIntent;
  timeHint?: {
    days?: number;
    after?: Date;
    before?: Date;
  };
  entities?: string[];        // Extracted named entities (names, projects, etc.)
  boostTerms?: string[];      // Terms to boost in scoring
}

/** Retrieval options */
export interface RetrievalOptions {
  tenantId: string;
  topK: number;
  rerankTo: number;
  maxAgeDays?: number;
  keywords?: string[];
  useVectorSearch?: boolean;
}

// ============================================
// Health Types
// ============================================

export interface HealthResponse {
  ok: boolean;
  service: string;
  project: string;
  version?: string;
}

