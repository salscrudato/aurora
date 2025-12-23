/**
 * AuroraNotes API - Shared Types
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";

// ============================================
// Note Types
// ============================================

/** Note processing status */
export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

/** Note type classification */
export type NoteType = 'meeting' | 'idea' | 'task' | 'reference' | 'journal' | 'other';

/** Action item extracted from note */
export interface ActionItem {
  text: string;
  completed: boolean;
  dueDate?: string;
}

/** Named entity extracted from note */
export interface Entity {
  text: string;
  type: 'person' | 'organization' | 'location' | 'date' | 'product' | 'other';
}

/** Note document in Firestore */
export interface NoteDoc {
  id: string;
  /** Note title (optional, extracted from content or provided) */
  title?: string;
  /** Note content (renamed from 'text' for clarity) */
  text: string;
  tenantId: string;
  /** Processing status for async chunking/embedding */
  processingStatus?: ProcessingStatus;
  /** Error message if processing failed */
  processingError?: string;
  /** Tags for organization */
  tags?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** AI-generated summary of the note */
  summary?: string;
  /** Classified note type */
  noteType?: NoteType;
  /** Extracted action items */
  actionItems?: ActionItem[];
  /** Extracted named entities */
  entities?: Entity[];
  /** Enrichment status (separate from chunk processing) */
  enrichmentStatus?: ProcessingStatus;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Note as returned from API (ISO strings) */
export interface NoteResponse {
  id: string;
  title?: string;
  text: string;
  tenantId: string;
  processingStatus?: ProcessingStatus;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /** AI-generated summary of the note */
  summary?: string;
  /** Classified note type */
  noteType?: NoteType;
  /** Extracted action items */
  actionItems?: ActionItem[];
  /** Extracted named entities */
  entities?: Entity[];
  /** Enrichment status */
  enrichmentStatus?: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
}

/** Paginated notes response */
export interface NotesListResponse {
  notes: NoteResponse[];
  cursor: string | null;
  hasMore: boolean;
}

/** Response from deleting a note */
export interface DeleteNoteResponse {
  success: boolean;
  id: string;
  deletedAt: string;
  chunksDeleted: number;
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
  // Lexical indexing fields (for exact-match recall)
  terms?: string[];          // Normalized tokens for array-contains-any queries
  termsVersion?: number;     // Version of term extraction algorithm (for backfill)
  // Context windows for sentence-level retrieval (improves citation accuracy)
  prevContext?: string;      // Last ~100 chars from previous chunk
  nextContext?: string;      // First ~100 chars from next chunk
  totalChunks?: number;      // Total chunks in this note (for context)
  // Character offsets for precise citation anchoring
  startOffset?: number;      // Start character offset in original note text
  endOffset?: number;        // End character offset in original note text
  anchor?: string;           // First ~50 chars for deep-linking/highlighting
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
  crossEncoderScore?: number;  // Score from cross-encoder reranking
  prevContext?: string;        // Context from previous chunk
  nextContext?: string;        // Context from next chunk
  sourceCount?: number;        // Number of retrieval sources that found this chunk (for RRF)
  embedding?: number[];        // Embedding vector (for semantic deduplication)
  // Character offsets for precise citation anchoring
  startOffset?: number;        // Start character offset in original note text
  endOffset?: number;          // End character offset in original note text
  anchor?: string;             // First ~50 chars for deep-linking/highlighting
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

/** Source reference in chat response - human-readable citation info */
export interface Source {
  /** Citation ID for linking (e.g., "1", "2") */
  id: string;
  /** Note ID for deep linking */
  noteId: string;
  /** Preview text from the source */
  preview: string;
  /** Human-readable date (e.g., "Dec 15, 2024") */
  date: string;
  /** Relevance score (0-1) for display confidence */
  relevance: number;
  /** Start character offset in original note (for highlighting) */
  startOffset?: number;
  /** End character offset in original note (for highlighting) */
  endOffset?: number;
  /** Anchor text for deep-linking (first ~50 chars of chunk) */
  anchor?: string;
}

/** Citation in chat response - kept for backwards compatibility */
export interface Citation {
  cid: string;          // e.g., "N12"
  noteId: string;
  chunkId: string;
  createdAt: string;    // ISO string
  snippet: string;
  score: number;
  /** Start character offset in original note */
  startOffset?: number;
  /** End character offset in original note */
  endOffset?: number;
  /** Anchor text for deep-linking */
  anchor?: string;
}

/** Chat request body */
export interface ChatRequest {
  message: string;
  tenantId?: string;
}

/** Response confidence level */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

/** Response metadata for production observability */
export interface ResponseMeta {
  /** Model used for generation */
  model: string;
  /** Request ID for support/debugging */
  requestId?: string;
  /** Total response time in ms */
  responseTimeMs: number;
  /** Detected query intent */
  intent: QueryIntent;
  /** Response confidence indicator */
  confidence: ConfidenceLevel;
  /** Number of sources used */
  sourceCount: number;
  /** Thread ID if part of a conversation */
  threadId?: string;
  /** Action result for agentic queries */
  action?: {
    type: string;
    success: boolean;
    data?: unknown;
  };
  /** Retrieval details (optional) */
  retrieval?: {
    strategy: string;
    candidateCount?: number;
    k: number;
  };
  /** Retrieval details (optional, for debugging) */
  debug?: {
    strategy: string;
    candidateCount?: number;
    rerankCount?: number;
    /** Enhanced confidence metrics */
    enhancedConfidence?: {
      overall: number;
      level: string;
      isReliable: boolean;
      breakdown?: {
        citationDensity: number;
        sourceRelevance: number;
        answerCoherence: number;
        claimSupport: number;
      };
    };
    /** Citation quality metrics */
    citationQuality?: {
      averageConfidence: number;
      highConfidenceCount: number;
      insufficientCount: number;
    };
    /** Post-processing details */
    postProcessing?: {
      modifications: number;
      coherenceScore: number;
      structureType: string;
    };
    /** Validation pipeline metrics (Phase 5) */
    validation?: {
      contractCompliant: boolean;
      citationAccuracy: number;
      overallConfidence: number;
      invalidRemoved: number;
      pipelineMs: number;
    };
  };
}

/** Chat response - production-grade format */
export interface ChatResponse {
  /** Main answer text with inline citation markers [1], [2], etc. */
  answer: string;
  /** Human-readable sources for display - sources that are CITED in the answer (matches [1], [2] markers) */
  sources: Source[];
  /** All sources used as context for the LLM (top N after reranking), excluding cited sources */
  contextSources?: Source[];
  /** Response metadata */
  meta: ResponseMeta;
  /** @deprecated Use sources instead - kept for backwards compatibility */
  citations?: Citation[];
}

/** Legacy ChatResponse for internal compatibility */
export interface LegacyChatResponse {
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

/** Note filter options for scoped retrieval */
export interface NoteFilterOptions {
  /** Only include chunks from these specific note IDs */
  noteIds?: string[];
  /** Exclude chunks from these note IDs */
  excludeNoteIds?: string[];
  /** Only include notes with any of these tags (OR logic) */
  tags?: string[];
  /** Only include notes created on or after this date */
  dateFrom?: Date;
  /** Only include notes created on or before this date */
  dateTo?: Date;
}

/** Retrieval options */
export interface RetrievalOptions {
  tenantId: string;
  topK: number;
  rerankTo: number;
  maxAgeDays?: number;
  keywords?: string[];
  useVectorSearch?: boolean;
  // Multi-stage retrieval options
  useQueryExpansion?: boolean;  // Enable multi-query expansion
  requestId?: string;           // For logging correlation
  // Dynamic context budget (overrides LLM_CONTEXT_BUDGET_CHARS)
  contextBudget?: number;       // Max characters for source context
  // Note filtering options
  noteFilters?: NoteFilterOptions;
  // Minimum relevance score threshold
  minRelevance?: number;
}

// ============================================
// Multi-Stage Retrieval Types
// ============================================

/** Candidate counts by retrieval stage for observability */
export interface CandidateCounts {
  vectorK: number;
  lexicalK: number;
  recencyK: number;
  mergedK: number;
  rerankedK: number;
  finalK: number;
}

/** Timings by retrieval stage for observability */
export interface RetrievalTimingsStage {
  queryParseMs: number;
  embeddingMs: number;
  vectorSearchMs: number;
  lexicalSearchMs: number;
  firestoreFetchMs: number;
  scoringMs: number;
  rerankMs: number;
  totalMs: number;
}

// ============================================
// Sources Pack - Single source of truth for sources and citations
// ============================================

/**
 * SourcesPack represents the exact set of sources used in a chat response.
 * This object flows through the entire pipeline ensuring:
 * - sources: The exact chunks used as sources in the LLM prompt
 * - citationsMap: 1:1 mapping of cid (N1, N2, ...) to Citation
 * - The prompt source count matches citationsMap.size EXACTLY
 */
export interface SourcesPack {
  /** The exact chunks used as sources - post-filtering, post-reranking */
  sources: ScoredChunk[];
  /** 1:1 mapping from cid (e.g., "N1") to Citation object */
  citationsMap: Map<string, Citation>;
  /** Number of sources = citationsMap.size = prompt source count */
  sourceCount: number;
}

// ============================================
// Conversation Thread Types
// ============================================

/** Message role in a conversation */
export type MessageRole = 'user' | 'assistant';

/** Message in a conversation thread */
export interface ThreadMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** Sources used for assistant messages */
  sources?: Source[];
  /** Timestamp */
  createdAt: Timestamp | FieldValue;
}

/** Thread document in Firestore */
export interface ThreadDoc {
  id: string;
  tenantId: string;
  /** Optional title (auto-generated from first message if not provided) */
  title?: string;
  /** Rolling summary of the conversation (updated periodically) */
  summary?: string;
  /** Messages in the thread (stored inline for simplicity) */
  messages: ThreadMessage[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Last activity timestamp */
  lastActivityAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Thread as returned from API */
export interface ThreadResponse {
  id: string;
  tenantId: string;
  title?: string;
  /** Rolling summary of the conversation */
  summary?: string;
  messageCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Thread with messages as returned from API */
export interface ThreadDetailResponse extends ThreadResponse {
  messages: Array<{
    id: string;
    role: MessageRole;
    content: string;
    sources?: Source[];
    createdAt: string;
  }>;
}

/** Paginated threads response */
export interface ThreadsListResponse {
  threads: ThreadResponse[];
  cursor: string | null;
  hasMore: boolean;
}

/** Paginated messages response for a thread */
export interface ThreadMessagesResponse {
  messages: Array<{
    id: string;
    role: MessageRole;
    content: string;
    sources?: Source[];
    createdAt: string;
  }>;
  cursor: string | null;
  hasMore: boolean;
  totalCount: number;
}
