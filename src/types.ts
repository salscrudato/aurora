/** AuroraNotes API - Shared Types */

import { FieldValue, Timestamp } from "firebase-admin/firestore";

// Note Types
export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type NoteType = 'meeting' | 'idea' | 'task' | 'reference' | 'journal' | 'other';
export interface ActionItem { text: string; completed: boolean; dueDate?: string; }
export interface Entity { text: string; type: 'person' | 'organization' | 'location' | 'date' | 'product' | 'other'; }

export interface NoteDoc {
  id: string; title?: string; text: string; tenantId: string;
  processingStatus?: ProcessingStatus; processingError?: string;
  tags?: string[]; metadata?: Record<string, unknown>;
  summary?: string; noteType?: NoteType; actionItems?: ActionItem[]; entities?: Entity[];
  enrichmentStatus?: ProcessingStatus;
  createdAt: Timestamp | FieldValue; updatedAt: Timestamp | FieldValue;
}

export interface NoteResponse {
  id: string; title?: string; text: string; tenantId: string;
  processingStatus?: ProcessingStatus; tags?: string[]; metadata?: Record<string, unknown>;
  summary?: string; noteType?: NoteType; actionItems?: ActionItem[]; entities?: Entity[];
  enrichmentStatus?: ProcessingStatus; createdAt: string; updatedAt: string;
}

export interface NotesListResponse { notes: NoteResponse[]; cursor: string | null; hasMore: boolean; }
export interface DeleteNoteResponse { success: boolean; id: string; deletedAt: string; chunksDeleted: number; }

// Chunk Types
export interface ChunkDoc {
  chunkId: string; noteId: string; tenantId: string; text: string; textHash: string;
  position: number; tokenEstimate: number; createdAt: Timestamp | FieldValue;
  embedding?: number[]; embeddingModel?: string;
  terms?: string[]; termsVersion?: number; // Lexical indexing
  prevContext?: string; nextContext?: string; totalChunks?: number; // Context windows
  startOffset?: number; endOffset?: number; anchor?: string; // Citation anchoring
}

export interface ScoredChunk {
  chunkId: string; noteId: string; tenantId: string; text: string;
  position: number; createdAt: Date; score: number;
  vectorScore?: number; keywordScore?: number; recencyScore?: number; crossEncoderScore?: number;
  prevContext?: string; nextContext?: string; sourceCount?: number; embedding?: number[];
  startOffset?: number; endOffset?: number; anchor?: string;
}

// Query & Chat Types
export type QueryIntent = 'summarize' | 'list' | 'decision' | 'action_item' | 'search' | 'question';
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export interface Source {
  id: string; noteId: string; preview: string; date: string; relevance: number;
  startOffset?: number; endOffset?: number; anchor?: string;
}

export interface Citation {
  cid: string; noteId: string; chunkId: string; createdAt: string; snippet: string; score: number;
  startOffset?: number; endOffset?: number; anchor?: string;
}

export interface ChatRequest { message: string; tenantId?: string; }

export interface ResponseMeta {
  model: string; requestId?: string; responseTimeMs: number; intent: QueryIntent;
  confidence: ConfidenceLevel; sourceCount: number; threadId?: string;
  action?: { type: string; success: boolean; data?: unknown };
  retrieval?: { strategy: string; candidateCount?: number; k: number };
  debug?: {
    strategy: string; candidateCount?: number; rerankCount?: number;
    enhancedConfidence?: { overall: number; level: string; isReliable: boolean; breakdown?: { citationDensity: number; sourceRelevance: number; answerCoherence: number; claimSupport: number } };
    citationQuality?: { averageConfidence: number; highConfidenceCount: number; insufficientCount: number };
    postProcessing?: { modifications: number; coherenceScore: number; structureType: string };
    validation?: { contractCompliant: boolean; citationAccuracy: number; overallConfidence: number; invalidRemoved: number; pipelineMs: number };
  };
}

export interface ChatResponse {
  answer: string; sources: Source[]; contextSources?: Source[]; meta: ResponseMeta;
  /** @deprecated Use sources instead */ citations?: Citation[];
}

export interface LegacyChatResponse {
  answer: string; citations: Citation[];
  meta: { model: string; retrieval: { k: number; strategy: string; candidateCount?: number; rerankCount?: number; intent?: QueryIntent; timeMs?: number } };
}

// Retrieval Types
export interface QueryAnalysis {
  originalQuery: string; normalizedQuery: string; keywords: string[]; intent: QueryIntent;
  timeHint?: { days?: number; after?: Date; before?: Date };
  entities?: string[]; boostTerms?: string[];
}

export interface NoteFilterOptions {
  noteIds?: string[]; excludeNoteIds?: string[]; tags?: string[]; dateFrom?: Date; dateTo?: Date;
}

export interface RetrievalOptions {
  tenantId: string; topK: number; rerankTo: number; maxAgeDays?: number; keywords?: string[];
  useVectorSearch?: boolean; useQueryExpansion?: boolean; requestId?: string;
  contextBudget?: number; noteFilters?: NoteFilterOptions; minRelevance?: number;
}

export interface CandidateCounts { vectorK: number; lexicalK: number; recencyK: number; mergedK: number; rerankedK: number; finalK: number; }
export interface RetrievalTimingsStage { queryParseMs: number; embeddingMs: number; vectorSearchMs: number; lexicalSearchMs: number; firestoreFetchMs: number; scoringMs: number; rerankMs: number; totalMs: number; }

/** Single source of truth for sources and citations in pipeline */
export interface SourcesPack {
  sources: ScoredChunk[]; citationsMap: Map<string, Citation>; sourceCount: number;
}

// Thread Types
export type MessageRole = 'user' | 'assistant';

export interface ThreadMessage {
  id: string; role: MessageRole; content: string; sources?: Source[]; createdAt: Timestamp | FieldValue;
}

export interface ThreadDoc {
  id: string; tenantId: string; title?: string; summary?: string;
  messages: ThreadMessage[]; metadata?: Record<string, unknown>;
  lastActivityAt: Timestamp | FieldValue; createdAt: Timestamp | FieldValue; updatedAt: Timestamp | FieldValue;
}

export interface ThreadResponse {
  id: string; tenantId: string; title?: string; summary?: string;
  messageCount: number; lastActivityAt: string; createdAt: string; updatedAt: string;
}

export interface ThreadDetailResponse extends ThreadResponse {
  messages: Array<{ id: string; role: MessageRole; content: string; sources?: Source[]; createdAt: string }>;
}

export interface ThreadsListResponse { threads: ThreadResponse[]; cursor: string | null; hasMore: boolean; }

export interface ThreadMessagesResponse {
  messages: Array<{ id: string; role: MessageRole; content: string; sources?: Source[]; createdAt: string }>;
  cursor: string | null; hasMore: boolean; totalCount: number;
}
