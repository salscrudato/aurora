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
 * List notes query parameters
 */
export const ListNotesQuerySchema = PaginationQuerySchema.extend({
  tag: z.string().optional(),
  search: z.string().max(200).optional(),
});

export type ListNotesQuery = z.infer<typeof ListNotesQuerySchema>;

// ============================================================================
// Chat Schemas
// ============================================================================

/**
 * Chat request body
 *
 * Supports both 'message' (legacy) and 'query' (new) field names.
 */
export const ChatRequestSchema = z.object({
  query: z.string().min(1).max(2000).optional(),
  message: z.string().min(1).max(2000).optional(),
  threadId: z.string().optional(),
  stream: z.boolean().default(false),
  options: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(4000).optional(),
    topK: z.number().min(1).max(50).optional(),
  }).optional(),
}).refine(
  (data) => data.query || data.message,
  { message: 'Either query or message is required' }
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

