/** Zod Validation Schemas - Centralized request/response validation */

import { z } from 'zod';

// === Common ===
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

// === Notes ===
export const CreateNoteSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1, 'Content is required').max(100000).optional(),
  text: z.string().min(1).max(100000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(d => d.content || d.text, { message: 'Either content or text is required' })
  .transform(d => ({ ...d, content: d.content || d.text }));
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

export const UpdateNoteSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(100000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;

export const NoteIdParamSchema = z.object({ noteId: z.string().min(1, 'Note ID is required') });
export type NoteIdParam = z.infer<typeof NoteIdParamSchema>;

export const ProcessingStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;

export const NotesSortBySchema = z.enum(['createdAt', 'updatedAt', 'title']);
export type NotesSortBy = z.infer<typeof NotesSortBySchema>;

export const SortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof SortOrderSchema>;

export const ListNotesQuerySchema = PaginationQuerySchema.extend({
  tag: z.string().max(50).optional(),
  tags: z.string().max(500).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  status: ProcessingStatusSchema.optional(),
  sortBy: NotesSortBySchema.default('createdAt'),
  order: SortOrderSchema.default('desc'),
  search: z.string().max(200).optional(),
});
export type ListNotesQuery = z.infer<typeof ListNotesQuerySchema>;

export const SearchModeSchema = z.enum(['semantic', 'keyword', 'hybrid']);
export type SearchMode = z.infer<typeof SearchModeSchema>;

export const SearchSortSchema = z.enum(['relevance', 'date', 'title']);
export type SearchSort = z.infer<typeof SearchSortSchema>;

export const SearchNotesSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500),
  limit: z.number().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).optional(),
  includeChunks: z.boolean().default(false),
  mode: SearchModeSchema.default('hybrid'),
  sortBy: SearchSortSchema.default('relevance'),
  order: z.enum(['asc', 'desc']).default('desc'),
  includeHighlights: z.boolean().default(false),
  filters: z.object({
    tags: z.array(z.string().max(50)).max(10).optional(),
    dateFrom: z.string().datetime({ offset: true }).optional(),
    dateTo: z.string().datetime({ offset: true }).optional(),
    status: ProcessingStatusSchema.optional(),
    noteType: z.string().max(50).optional(),
    noteIds: z.array(z.string()).max(100).optional(),
  }).optional(),
});
export type SearchNotesInput = z.infer<typeof SearchNotesSchema>;

export const AutocompleteQuerySchema = z.object({
  prefix: z.string().min(1).max(100),
  limit: z.number().min(1).max(20).default(5),
  types: z.array(z.enum(['notes', 'tags', 'titles'])).default(['notes', 'tags', 'titles']),
});
export type AutocompleteQuery = z.infer<typeof AutocompleteQuerySchema>;

// === Chat ===
export const ResponseFormatSchema = z.enum(['default', 'concise', 'detailed', 'bullet', 'structured']);
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

export const ConversationMessageSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(10000) });
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ChatNoteFiltersSchema = z.object({
  noteIds: z.array(z.string()).max(50).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  excludeNoteIds: z.array(z.string()).max(50).optional(),
});
export type ChatNoteFilters = z.infer<typeof ChatNoteFiltersSchema>;

export const ChatOptionsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8000).optional(),
  topK: z.number().min(1).max(100).optional(),
  minRelevance: z.number().min(0).max(1).optional(),
  includeSources: z.boolean().default(true),
  includeContextSources: z.boolean().default(false),
  verifyCitations: z.boolean().default(true),
  responseFormat: ResponseFormatSchema.default('default'),
  systemPrompt: z.string().max(2000).optional(),
  language: z.string().max(10).optional(),
});
export type ChatOptions = z.infer<typeof ChatOptionsSchema>;

export const ChatRequestSchema = z.object({
  query: z.string().min(1).max(2000).optional(),
  message: z.string().min(1).max(2000).optional(),
  threadId: z.string().optional(),
  stream: z.boolean().default(false),
  conversationHistory: z.array(ConversationMessageSchema).max(20).optional(),
  filters: ChatNoteFiltersSchema.optional(),
  options: ChatOptionsSchema.optional(),
  saveToThread: z.boolean().default(true),
}).refine(d => d.query || d.message, { message: 'Either query or message is required' })
  .refine(d => !(d.conversationHistory && d.threadId), { message: 'Provide conversationHistory or threadId, not both' })
  .transform(d => ({ ...d, query: d.query || d.message }));
export type ChatRequestInput = z.infer<typeof ChatRequestSchema>;

// === Threads ===
export const CreateThreadSchema = z.object({ title: z.string().min(1).max(200).optional(), metadata: z.record(z.string(), z.unknown()).optional() });
export type CreateThreadInput = z.infer<typeof CreateThreadSchema>;

/** Schema for creating a thread with an initial message in one call */
export const CreateThreadWithMessageSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(10000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateThreadWithMessageInput = z.infer<typeof CreateThreadWithMessageSchema>;

export const ThreadIdParamSchema = z.object({ threadId: z.string().min(1, 'Thread ID is required') });
export type ThreadIdParam = z.infer<typeof ThreadIdParamSchema>;

export const ListThreadsQuerySchema = PaginationQuerySchema;
export type ListThreadsQuery = z.infer<typeof ListThreadsQuerySchema>;

export const UpdateThreadSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(2000).optional(),
}).refine(d => d.title !== undefined || d.summary !== undefined, { message: 'Title or summary required' });
export type UpdateThreadInput = z.infer<typeof UpdateThreadSchema>;

export const GetThreadMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type GetThreadMessagesQuery = z.infer<typeof GetThreadMessagesQuerySchema>;

// === Search ===
export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).optional(),
});
export type SearchRequestInput = z.infer<typeof SearchRequestSchema>;

// === File Upload ===
export const FileUploadMetadataSchema = z.object({
  title: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});
export type FileUploadMetadata = z.infer<typeof FileUploadMetadataSchema>;

// === Internal (Cloud Tasks) ===
export const ProcessNoteCallbackSchema = z.object({ noteId: z.string().min(1), tenantId: z.string().min(1) });
export type ProcessNoteCallbackInput = z.infer<typeof ProcessNoteCallbackSchema>;

// === Transcription ===
export const TranscriptionOutputFormatSchema = z.enum(['text', 'segments', 'srt', 'vtt']);
export type TranscriptionOutputFormat = z.infer<typeof TranscriptionOutputFormatSchema>;

export const TranscriptionOptionsSchema = z.object({
  languageHint: z.string().max(10).optional(),
  includeTimestamps: z.coerce.boolean().default(false),
  includeSpeakerDiarization: z.coerce.boolean().default(false),
  addPunctuation: z.coerce.boolean().default(true),
  vocabularyHints: z.string().max(500).optional(),
  outputFormat: TranscriptionOutputFormatSchema.default('text'),
  generateSummary: z.coerce.boolean().default(false),
  extractActionItems: z.coerce.boolean().default(false),
  saveAsNote: z.coerce.boolean().default(false),
  noteTitle: z.string().max(200).optional(),
  noteTags: z.string().optional(),
  detectTopics: z.coerce.boolean().default(false),
});
export type TranscriptionOptionsInput = z.infer<typeof TranscriptionOptionsSchema>;

export const TranscriptionSegmentSchema = z.object({
  text: z.string(), startTime: z.number(), endTime: z.number(),
  speaker: z.string().optional(), confidence: z.number().optional(),
});
export type TranscriptionSegment = z.infer<typeof TranscriptionSegmentSchema>;

export const ActionItemSchema = z.object({
  text: z.string(), assignee: z.string().optional(),
  dueDate: z.string().optional(), priority: z.enum(['high', 'medium', 'low']).optional(),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;
