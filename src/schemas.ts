/**
 * AuroraNotes API - Zod Validation Schemas
 *
 * Centralized request/response validation schemas.
 * Used with validation middleware for type-safe request handling.
 */

import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * Pagination query parameters
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

// ============================================================================
// Notes Schemas
// ============================================================================

/**
 * Create note request body
 *
 * Supports both 'text' (legacy) and 'content' (new) field names for content.
 * Title is optional for backwards compatibility.
 */
export const CreateNoteSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  // Support both 'content' and 'text' for backwards compatibility
  content: z.string().min(1, 'Content is required').max(100000, 'Content too long').optional(),
  text: z.string().min(1).max(100000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (data) => data.content || data.text,
  { message: 'Either content or text is required' }
).transform((data) => ({
  ...data,
  // Normalize to 'content' for internal use
  content: data.content || data.text,
}));

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

/**
 * Update note request body
 */
export const UpdateNoteSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(100000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;

/**
 * Note ID parameter
 */
export const NoteIdParamSchema = z.object({
  noteId: z.string().min(1, 'Note ID is required'),
});

export type NoteIdParam = z.infer<typeof NoteIdParamSchema>;

/**
 * Processing status enum
 */
export const ProcessingStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;

/**
 * Sort field enum for notes
 */
export const NotesSortBySchema = z.enum(['createdAt', 'updatedAt', 'title']);
export type NotesSortBy = z.infer<typeof NotesSortBySchema>;

/**
 * Sort order enum
 */
export const SortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderSchema>;

/**
 * List notes query parameters
 *
 * Supports filtering, sorting, and pagination:
 * - tag: Filter by a single tag
 * - tags: Filter by multiple tags (comma-separated, OR logic)
 * - dateFrom: Filter notes created on or after this date (ISO 8601)
 * - dateTo: Filter notes created on or before this date (ISO 8601)
 * - status: Filter by processing status
 * - sortBy: Sort field (createdAt, updatedAt, title)
 * - order: Sort order (asc, desc)
 * - search: Simple text search in title (prefix match)
 */
export const ListNotesQuerySchema = PaginationQuerySchema.extend({
  tag: z.string().max(50).optional(),
  tags: z.string().max(500).optional(), // Comma-separated list
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  status: ProcessingStatusSchema.optional(),
  sortBy: NotesSortBySchema.default('createdAt'),
  order: SortOrderSchema.default('desc'),
  search: z.string().max(200).optional(),
});

export type ListNotesQuery = z.infer<typeof ListNotesQuerySchema>;

/**
 * Search mode for notes search
 * - semantic: Vector similarity search (best for natural language queries)
 * - keyword: BM25 lexical search (best for exact term matching)
 * - hybrid: Combines semantic + keyword with RRF fusion (default, best overall)
 */
export const SearchModeSchema = z.enum(['semantic', 'keyword', 'hybrid']);
export type SearchMode = z.infer<typeof SearchModeSchema>;

/**
 * Sort options for search results
 */
export const SearchSortSchema = z.enum(['relevance', 'date', 'title']);
export type SearchSort = z.infer<typeof SearchSortSchema>;

/**
 * Search notes request body (semantic search)
 *
 * Uses the RAG retrieval pipeline for semantic search across notes.
 */
export const SearchNotesSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
  limit: z.number().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).optional(),
  includeChunks: z.boolean().default(false),
  /** Search mode: semantic, keyword, or hybrid (default) */
  mode: SearchModeSchema.default('hybrid'),
  /** Sort results by: relevance (default), date, or title */
  sortBy: SearchSortSchema.default('relevance'),
  /** Sort order: desc (default) or asc */
  order: z.enum(['asc', 'desc']).default('desc'),
  /** Include highlights in matched text */
  includeHighlights: z.boolean().default(false),
  filters: z.object({
    tags: z.array(z.string().max(50)).max(10).optional(),
    dateFrom: z.string().datetime({ offset: true }).optional(),
    dateTo: z.string().datetime({ offset: true }).optional(),
    status: ProcessingStatusSchema.optional(),
    /** Filter by note type */
    noteType: z.string().max(50).optional(),
    /** Filter to specific note IDs */
    noteIds: z.array(z.string()).max(100).optional(),
  }).optional(),
});

export type SearchNotesInput = z.infer<typeof SearchNotesSchema>;

/**
 * Autocomplete query schema
 */
export const AutocompleteQuerySchema = z.object({
  prefix: z.string().min(1, 'Prefix is required').max(100, 'Prefix too long'),
  limit: z.number().min(1).max(20).default(5),
  /** Types of suggestions to include */
  types: z.array(z.enum(['notes', 'tags', 'titles'])).default(['notes', 'tags', 'titles']),
});

export type AutocompleteQuery = z.infer<typeof AutocompleteQuerySchema>;

// ============================================================================
// Chat Schemas
// ============================================================================

/**
 * Response format for chat
 */
export const ResponseFormatSchema = z.enum([
  'default',      // Natural conversational response
  'concise',      // Brief, to-the-point answers
  'detailed',     // Comprehensive with full context
  'bullet',       // Bulleted list format
  'structured',   // Markdown with headers
]);
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

/**
 * Conversation history message for multi-turn context
 */
export const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(10000),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

/**
 * Note filters for scoping the search context
 */
export const ChatNoteFiltersSchema = z.object({
  /** Filter to specific note IDs */
  noteIds: z.array(z.string()).max(50).optional(),
  /** Filter by tags (OR logic) */
  tags: z.array(z.string().max(50)).max(10).optional(),
  /** Only include notes created after this date */
  dateFrom: z.string().datetime({ offset: true }).optional(),
  /** Only include notes created before this date */
  dateTo: z.string().datetime({ offset: true }).optional(),
  /** Exclude specific note IDs */
  excludeNoteIds: z.array(z.string()).max(50).optional(),
});
export type ChatNoteFilters = z.infer<typeof ChatNoteFiltersSchema>;

/**
 * Advanced chat options for fine-tuning behavior
 */
export const ChatOptionsSchema = z.object({
  /** Temperature for response generation (0-2, default 0.7) */
  temperature: z.number().min(0).max(2).optional(),
  /** Maximum tokens in response (default 2000) */
  maxTokens: z.number().min(1).max(8000).optional(),
  /** Number of source chunks to retrieve (default from config) */
  topK: z.number().min(1).max(100).optional(),
  /** Minimum relevance score threshold (0-1) */
  minRelevance: z.number().min(0).max(1).optional(),
  /** Include source snippets in response */
  includeSources: z.boolean().default(true),
  /** Include all context sources (not just cited ones) */
  includeContextSources: z.boolean().default(false),
  /** Enable citation verification pipeline */
  verifyCitations: z.boolean().default(true),
  /** Response format style */
  responseFormat: ResponseFormatSchema.default('default'),
  /** Custom system prompt override (for advanced use) */
  systemPrompt: z.string().max(2000).optional(),
  /** Language for response (default: auto-detect from query) */
  language: z.string().max(10).optional(),
});
export type ChatOptions = z.infer<typeof ChatOptionsSchema>;

/**
 * Chat request body
 *
 * Supports both 'message' (legacy) and 'query' (new) field names.
 * Enhanced with conversation history, filters, and advanced options.
 */
export const ChatRequestSchema = z.object({
  /** The user's question or message (preferred field) */
  query: z.string().min(1).max(2000).optional(),
  /** Legacy field name for query */
  message: z.string().min(1).max(2000).optional(),
  /** Thread ID for conversation continuity (auto-loads history) */
  threadId: z.string().optional(),
  /** Enable streaming response (SSE) */
  stream: z.boolean().default(false),
  /** Inline conversation history (alternative to threadId) */
  conversationHistory: z.array(ConversationMessageSchema).max(20).optional(),
  /** Filters to scope which notes to search */
  filters: ChatNoteFiltersSchema.optional(),
  /** Advanced options for fine-tuning */
  options: ChatOptionsSchema.optional(),
  /** Save this exchange to the thread (requires threadId) */
  saveToThread: z.boolean().default(true),
}).refine(
  (data) => data.query || data.message,
  { message: 'Either query or message is required' }
).refine(
  (data) => !(data.conversationHistory && data.threadId),
  { message: 'Provide either conversationHistory or threadId, not both' }
).transform((data) => ({
  ...data,
  // Normalize to 'query' for internal use
  query: data.query || data.message,
}));

export type ChatRequestInput = z.infer<typeof ChatRequestSchema>;

// ============================================================================
// Thread Schemas
// ============================================================================

/**
 * Create thread request body
 */
export const CreateThreadSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateThreadInput = z.infer<typeof CreateThreadSchema>;

/**
 * Thread ID parameter
 */
export const ThreadIdParamSchema = z.object({
  threadId: z.string().min(1, 'Thread ID is required'),
});

export type ThreadIdParam = z.infer<typeof ThreadIdParamSchema>;

/**
 * List threads query parameters
 */
export const ListThreadsQuerySchema = PaginationQuerySchema;

export type ListThreadsQuery = z.infer<typeof ListThreadsQuerySchema>;

/**
 * Update thread request body
 */
export const UpdateThreadSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(2000).optional(),
}).refine(
  (data) => data.title !== undefined || data.summary !== undefined,
  { message: 'At least one of title or summary must be provided' }
);

export type UpdateThreadInput = z.infer<typeof UpdateThreadSchema>;

/**
 * Get thread messages query parameters
 */
export const GetThreadMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type GetThreadMessagesQuery = z.infer<typeof GetThreadMessagesQuerySchema>;

// ============================================================================
// Search Schemas
// ============================================================================

/**
 * Search request body
 */
export const SearchRequestSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
  limit: z.number().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).optional(),
});

export type SearchRequestInput = z.infer<typeof SearchRequestSchema>;

// ============================================================================
// File Upload Schemas
// ============================================================================

/**
 * File upload metadata
 */
export const FileUploadMetadataSchema = z.object({
  title: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export type FileUploadMetadata = z.infer<typeof FileUploadMetadataSchema>;

// ============================================================================
// Internal Schemas (for Cloud Tasks callbacks)
// ============================================================================

/**
 * Process note callback body
 */
export const ProcessNoteCallbackSchema = z.object({
  noteId: z.string().min(1),
  tenantId: z.string().min(1),
});

export type ProcessNoteCallbackInput = z.infer<typeof ProcessNoteCallbackSchema>;

// ============================================================================
// Transcription Schemas
// ============================================================================

/**
 * Output format for transcription results
 */
export const TranscriptionOutputFormatSchema = z.enum([
  'text',        // Plain text (default)
  'segments',    // Array of segments with timestamps
  'srt',         // SubRip subtitle format
  'vtt',         // WebVTT subtitle format
]);
export type TranscriptionOutputFormat = z.infer<typeof TranscriptionOutputFormatSchema>;

/**
 * Transcription request options (from query params or JSON body)
 */
export const TranscriptionOptionsSchema = z.object({
  /** Language hint for better accuracy (e.g., 'en', 'es', 'fr') */
  languageHint: z.string().max(10).optional(),
  /** Include timestamps in transcription */
  includeTimestamps: z.coerce.boolean().default(false),
  /** Include speaker diarization (identify different speakers) */
  includeSpeakerDiarization: z.coerce.boolean().default(false),
  /** Add punctuation to transcript */
  addPunctuation: z.coerce.boolean().default(true),
  /** Custom vocabulary hints for domain-specific terms */
  vocabularyHints: z.string().max(500).optional(),
  /** Output format */
  outputFormat: TranscriptionOutputFormatSchema.default('text'),
  /** Generate a summary of the transcription */
  generateSummary: z.coerce.boolean().default(false),
  /** Extract action items from the transcription */
  extractActionItems: z.coerce.boolean().default(false),
  /** Auto-save as a note (returns noteId) */
  saveAsNote: z.coerce.boolean().default(false),
  /** Title for the saved note (required if saveAsNote=true) */
  noteTitle: z.string().max(200).optional(),
  /** Tags for the saved note */
  noteTags: z.string().optional(), // Comma-separated for query param compat
  /** Detect and segment by topic */
  detectTopics: z.coerce.boolean().default(false),
});

export type TranscriptionOptionsInput = z.infer<typeof TranscriptionOptionsSchema>;

/**
 * Transcription segment with timing
 */
export const TranscriptionSegmentSchema = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  speaker: z.string().optional(),
  confidence: z.number().optional(),
});
export type TranscriptionSegment = z.infer<typeof TranscriptionSegmentSchema>;

/**
 * Action item extracted from transcription
 */
export const ActionItemSchema = z.object({
  text: z.string(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;

