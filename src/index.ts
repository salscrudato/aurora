/**
 * AuroraNotes API - Main Entry Point
 *
 * Express server with notes CRUD, pagination, and RAG-powered chat.
 * Features:
 * - Firebase Authentication for user identity
 * - Per-user data isolation (tenantId = user.uid)
 * - Zod request validation
 * - Standardized error responses
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";

import { PORT, PROJECT_ID, DEFAULT_TENANT_ID, NOTES_COLLECTION } from "./config";
import { createNote, listNotes, updateNote, deleteNote, getNote, searchNotes, getAutocompleteSuggestions } from "./notes";
import type { ListNotesOptions } from "./notes";
import {
  generateChatResponse,
  generateEnhancedChatResponse,
  ConfigurationError,
  RateLimitError,
  buildSourcesPack,
  buildPrompt,
  buildConversationContext,
  type EnhancedChatRequest,
  type ConversationMessage,
} from "./chat";
import { retrieveRelevantChunks, analyzeQuery, calculateAdaptiveK } from "./retrieval";
import {
  initSSEResponse,
  streamChatResponse,
  clientAcceptsSSE,
  STREAMING_CONFIG,
} from "./streaming";
import { RETRIEVAL_TOP_K, MAX_CHUNKS_IN_CONTEXT, CHAT_MODEL } from "./config";
import { logInfo, logError, logWarn, generateRequestId, withRequestContext, isValidTenantId } from "./utils";
import { ChatRequest, NoteDoc } from "./types";
import { rateLimitMiddleware, getRateLimitStats } from "./rateLimit";
import { processNoteChunks } from "./chunking";
import { getDb } from "./firestore";
import { internalAuthMiddleware, isInternalAuthConfigured } from "./internalAuth";
import { getVertexConfigStatus, isVertexConfigured } from "./vectorIndex";
import { isGenAIAvailable } from "./genaiClient";
import { userAuthMiddleware, isUserAuthEnabled, perUserRateLimiter, audioUpload, getNormalizedMimeType, handleMulterError } from "./middleware";
import { validateBody, validateQuery, validateParams } from "./middleware";
import { transcribeAudio, TranscriptionError } from "./transcription";
import { errorHandler, asyncHandler, Errors, ApiError } from "./errors";
import {
  CreateNoteSchema,
  UpdateNoteSchema,
  NoteIdParamSchema,
  ListNotesQuerySchema,
  SearchNotesSchema,
  AutocompleteQuerySchema,
  ChatRequestSchema,
  CreateThreadSchema,
  ThreadIdParamSchema,
  ListThreadsQuerySchema,
  UpdateThreadSchema,
  GetThreadMessagesQuerySchema,
  TranscriptionOptionsSchema,
} from "./schemas";
import {
  createThread,
  getThread,
  listThreads,
  addMessage,
  deleteThread,
  getRecentMessages,
  updateThread,
  getThreadMessages,
} from "./threads";
import {
  detectAction,
  executeAction,
  formatActionResponse,
} from "./actionExecutor";

// Create Express application
const app = express();

// Trust proxy for Cloud Run (required for correct IP detection in rate limiting)
app.set('trust proxy', true);

// ============================================
// Global Middleware
// ============================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
  credentials: true,
  maxAge: 86400, // 24 hours
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: "1mb" }));

// Request context middleware (for request ID correlation)
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  res.set('X-Request-Id', requestId);

  withRequestContext(
    { requestId, startTime: Date.now(), path: req.path },
    () => next()
  );
});

// Global rate limiting (IP-based)
app.use(rateLimitMiddleware);

// ============================================
// Health & Readiness Endpoints (no auth required)
// ============================================

/**
 * GET /health - Basic liveness check
 * Returns 200 if the service is running
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "auroranotes-api",
    project: PROJECT_ID,
    version: "2.0.0",
    auth: {
      userAuthEnabled: isUserAuthEnabled(),
    },
  });
});

/**
 * GET /ready - Readiness check with dependency status
 * Returns 200 if all dependencies are healthy, 503 otherwise
 */
app.get("/ready", asyncHandler(async (_req, res) => {
  const startTime = Date.now();
  const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string }> = {};

  // Check Firestore connectivity
  try {
    const firestoreStart = Date.now();
    const db = getDb();
    await db.collection('_health').doc('ping').get();
    checks.firestore = { status: 'ok', latencyMs: Date.now() - firestoreStart };
  } catch (err) {
    checks.firestore = { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // Check Vertex AI configuration
  try {
    const vertexStatus = getVertexConfigStatus();
    checks.vertexAI = {
      status: vertexStatus.configured ? 'ok' : 'error',
      error: vertexStatus.configured ? undefined : 'Not configured',
    };
  } catch (err) {
    checks.vertexAI = { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // Check GenAI (Gemini) availability
  try {
    const genaiAvailable = isGenAIAvailable();
    checks.genAI = {
      status: genaiAvailable ? 'ok' : 'error',
      error: genaiAvailable ? undefined : 'API key not configured',
    };
  } catch (err) {
    checks.genAI = { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // Determine overall status
  const allHealthy = Object.values(checks).every(c => c.status === 'ok');
  const totalLatencyMs = Date.now() - startTime;

  const response = {
    status: allHealthy ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'auroranotes-api',
    version: '2.0.0',
    checks,
    totalLatencyMs,
    rateLimitStats: getRateLimitStats(),
  };

  res.status(allHealthy ? 200 : 503).json(response);
}));

/**
 * GET /metrics - Basic metrics endpoint for monitoring
 * Returns operational metrics in JSON format
 */
app.get("/metrics", (_req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();

  res.status(200).json({
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    },
    memory: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
      rssMB: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
      externalMB: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
    },
    rateLimiting: getRateLimitStats(),
    nodeVersion: process.version,
    platform: process.platform,
  });
});

// ============================================
// Notes Endpoints (authenticated)
// ============================================

/**
 * POST /notes - Create a new note
 *
 * Requires: Firebase ID token in Authorization header
 * Request: { title?: string, content: string, tags?: string[] }
 * Response: NoteResponse
 *
 * tenantId is derived from authenticated user's UID
 */
app.post(
  "/notes",
  userAuthMiddleware,
  perUserRateLimiter,
  validateBody(CreateNoteSchema),
  asyncHandler(async (req, res) => {
    // tenantId is ALWAYS the authenticated user's UID - no client override
    const tenantId = req.user!.uid;
    const { title, content, tags, metadata } = req.body;

    const note = await createNote(content, tenantId, { title, tags, metadata });
    res.status(201).json(note);
  })
);

/**
 * GET /notes - List notes with pagination, filtering, and sorting
 *
 * Requires: Firebase ID token in Authorization header
 * Query params:
 *   - limit: number (default 20, max 100)
 *   - cursor: string (pagination cursor)
 *   - tag: string (filter by a single tag)
 *   - tags: string (comma-separated tags, OR logic)
 *   - dateFrom: string (ISO 8601 date, filter notes created on or after)
 *   - dateTo: string (ISO 8601 date, filter notes created on or before)
 *   - status: 'pending' | 'ready' | 'failed' (filter by processing status)
 *   - sortBy: 'createdAt' | 'updatedAt' | 'title' (default: createdAt)
 *   - order: 'asc' | 'desc' (default: desc)
 *   - search: string (simple text search in title/content)
 *
 * Response: NotesListResponse
 *
 * tenantId is derived from authenticated user's UID
 */
app.get(
  "/notes",
  userAuthMiddleware,
  perUserRateLimiter,
  validateQuery(ListNotesQuerySchema),
  asyncHandler(async (req, res) => {
    // tenantId is ALWAYS the authenticated user's UID
    const tenantId = req.user!.uid;
    const query = (req.validatedQuery || req.query) as any;

    // Build options from query parameters
    const options: ListNotesOptions = {
      tag: query.tag,
      tags: query.tags ? query.tags.split(',').map((t: string) => t.trim()) : undefined,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      status: query.status,
      sortBy: query.sortBy,
      order: query.order,
      search: query.search,
    };

    const result = await listNotes(tenantId, query.limit, query.cursor, options);
    res.status(200).json(result);
  })
);

/**
 * POST /notes/search - Semantic search across notes
 *
 * Requires: Firebase ID token in Authorization header
 * Request body:
 *   - query: string (natural language search query, required)
 *   - limit: number (max results, default 10, max 50)
 *   - threshold: number (minimum relevance score 0-1, optional)
 *   - includeChunks: boolean (include matched text snippets, default false)
 *   - filters: {
 *       tags?: string[] (filter by tags, OR logic)
 *       dateFrom?: string (ISO 8601 date)
 *       dateTo?: string (ISO 8601 date)
 *       status?: 'pending' | 'ready' | 'failed'
 *     }
 *
 * Response: SearchNotesResponse
 *
 * Uses the RAG retrieval pipeline (vector search + BM25 + reranking)
 * for semantic similarity search.
 */
app.post(
  "/notes/search",
  userAuthMiddleware,
  perUserRateLimiter,
  validateBody(SearchNotesSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const {
      query,
      limit,
      threshold,
      includeChunks,
      mode,
      sortBy,
      order,
      includeHighlights,
      filters,
    } = req.body;

    const result = await searchNotes(query, tenantId, {
      limit,
      threshold,
      includeChunks,
      mode,
      sortBy,
      order,
      includeHighlights,
      filters: filters ? {
        tags: filters.tags,
        dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
        status: filters.status,
        noteType: filters.noteType,
        noteIds: filters.noteIds,
      } : undefined,
    });

    res.status(200).json(result);
  })
);

/**
 * POST /notes/autocomplete - Get autocomplete suggestions for search
 *
 * Requires: Firebase ID token in Authorization header
 * Request body:
 *   - prefix: string (required) - Search prefix to autocomplete
 *   - limit: number (max suggestions, default 5, max 20)
 *   - types: string[] (types to include: 'notes', 'tags', 'titles')
 *
 * Response: AutocompleteResponse
 *   - suggestions: Array of { type, text, noteId?, score }
 *   - queryTimeMs: number
 *
 * Returns suggestions from note titles, tags, and note snippets
 * that match the given prefix, sorted by relevance.
 */
app.post(
  "/notes/autocomplete",
  userAuthMiddleware,
  perUserRateLimiter,
  validateBody(AutocompleteQuerySchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { prefix, limit, types } = req.body;

    const result = await getAutocompleteSuggestions(prefix, tenantId, {
      limit,
      types,
    });

    res.status(200).json(result);
  })
);

/**
 * GET /notes/:noteId - Get a single note by ID
 *
 * Requires: Firebase ID token in Authorization header
 * Path params:
 *   - noteId: string (required) - The note ID to fetch
 *
 * Response:
 *   - 200: NoteResponse
 *   - 404: Note not found
 *
 * tenantId is derived from authenticated user's UID
 */
app.get(
  "/notes/:noteId",
  userAuthMiddleware,
  perUserRateLimiter,
  validateParams(NoteIdParamSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { noteId } = (req.validatedParams || req.params) as any;

    const note = await getNote(noteId, tenantId);

    if (!note) {
      throw Errors.noteNotFound(noteId);
    }

    res.status(200).json(note);
  })
);

/**
 * PUT /notes/:noteId - Update an existing note
 *
 * Requires: Firebase ID token in Authorization header
 * Path params:
 *   - noteId: string (required) - The note ID to update
 * Request body:
 *   - text: string (optional) - New note content (max 5000 chars)
 *   - title: string (optional) - New title
 *   - tags: string[] (optional) - New tags
 *
 * Response:
 *   - 200: NoteResponse with updated note
 *   - 400: Validation error
 *   - 404: Note not found
 *
 * tenantId is derived from authenticated user's UID
 */
app.put(
  "/notes/:noteId",
  userAuthMiddleware,
  perUserRateLimiter,
  validateParams(NoteIdParamSchema),
  validateBody(UpdateNoteSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { noteId } = (req.validatedParams || req.params) as any;
    const { text, title, tags, metadata } = req.body;

    const result = await updateNote(noteId, tenantId, { text, title, tags, metadata });

    if (!result) {
      throw Errors.noteNotFound(noteId);
    }

    res.status(200).json(result);
  })
);

/**
 * DELETE /notes/:noteId - Delete a note and all associated data
 *
 * Requires: Firebase ID token in Authorization header
 * Path params:
 *   - noteId: string (required) - The note ID to delete
 *
 * Response:
 *   - 200: { success: true, id, deletedAt, chunksDeleted }
 *   - 404: { error: "note not found" }
 *
 * tenantId is derived from authenticated user's UID
 */
app.delete(
  "/notes/:noteId",
  userAuthMiddleware,
  perUserRateLimiter,
  validateParams(NoteIdParamSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { noteId } = (req.validatedParams || req.params) as any;

    const result = await deleteNote(noteId, tenantId);

    if (!result) {
      throw Errors.noteNotFound(noteId);
    }

    res.status(200).json(result);
  })
);

// ============================================
// Chat Endpoint (authenticated)
// ============================================

/**
 * POST /chat - RAG-powered chat with inline citations
 *
 * Requires: Firebase ID token in Authorization header
 *
 * Request body:
 * {
 *   query: string;                    // The user's question (required)
 *   threadId?: string;                // Thread ID for conversation continuity
 *   stream?: boolean;                 // Enable SSE streaming
 *   conversationHistory?: Array<{     // Inline conversation context
 *     role: 'user' | 'assistant';
 *     content: string;
 *   }>;
 *   filters?: {                       // Scope which notes to search
 *     noteIds?: string[];             // Only search these notes
 *     excludeNoteIds?: string[];      // Exclude these notes
 *     tags?: string[];                // Filter by tags (OR logic)
 *     dateFrom?: ISO8601;             // Notes created after
 *     dateTo?: ISO8601;               // Notes created before
 *   };
 *   options?: {
 *     temperature?: number;           // 0-2 (default 0.7)
 *     maxTokens?: number;             // Max response length
 *     topK?: number;                  // Source chunks to retrieve
 *     minRelevance?: number;          // Min relevance threshold (0-1)
 *     includeSources?: boolean;       // Include sources in response
 *     includeContextSources?: boolean; // Include uncited context
 *     verifyCitations?: boolean;      // Verify citation accuracy
 *     responseFormat?: 'default' | 'concise' | 'detailed' | 'bullet' | 'structured';
 *     systemPrompt?: string;          // Custom system prompt
 *     language?: string;              // Response language
 *   };
 *   saveToThread?: boolean;           // Save to thread (requires threadId)
 * }
 *
 * Response: ChatResponse with answer, sources[], contextSources?, and meta
 */
app.post(
  "/chat",
  userAuthMiddleware,
  perUserRateLimiter,
  validateBody(ChatRequestSchema),
  asyncHandler(async (req, res) => {
    // tenantId is ALWAYS the authenticated user's UID
    const tenantId = req.user!.uid;
    const {
      query,
      threadId,
      stream: requestStream,
      conversationHistory,
      filters,
      options = {},
      saveToThread = true,
    } = req.body;
    const stream = requestStream || clientAcceptsSSE(req.headers.accept);

    // Check for agentic actions first
    const detectedAction = detectAction(query);
    if (detectedAction && detectedAction.confidence >= 0.8) {
      const actionResult = await executeAction(detectedAction, tenantId);
      const formattedResponse = formatActionResponse(actionResult);

      // Save action to thread if requested
      if (threadId && saveToThread) {
        await addMessage(threadId, tenantId, 'user', query);
        await addMessage(threadId, tenantId, 'assistant', formattedResponse);
      }

      res.status(200).json({
        answer: formattedResponse,
        sources: [],
        meta: {
          model: CHAT_MODEL,
          responseTimeMs: 0,
          confidence: actionResult.success ? 'high' : 'low',
          sourceCount: 0,
          intent: 'action_item',
          threadId,
          action: {
            type: detectedAction.type,
            success: actionResult.success,
            data: actionResult.data,
          },
        },
      });
      return;
    }

    // Build conversation history from thread or inline
    let effectiveHistory: ConversationMessage[] | undefined = conversationHistory;

    if (threadId && !conversationHistory) {
      // Load history from thread
      const threadMessages = await getRecentMessages(threadId, tenantId, 10);
      if (threadMessages.length > 0) {
        effectiveHistory = threadMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
      }
    }

    // Build note filters from request
    const noteFilters = filters ? {
      noteIds: filters.noteIds,
      excludeNoteIds: filters.excludeNoteIds,
      tags: filters.tags,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    } : undefined;

    // Streaming mode
    if (stream && STREAMING_CONFIG.enabled) {
      const queryAnalysis = analyzeQuery(query);
      const adaptiveK = calculateAdaptiveK(query, queryAnalysis.intent, queryAnalysis.keywords);

      const { chunks } = await retrieveRelevantChunks(query, {
        tenantId,
        topK: options?.topK || RETRIEVAL_TOP_K,
        rerankTo: Math.min(adaptiveK, MAX_CHUNKS_IN_CONTEXT),
        noteFilters: noteFilters ? {
          noteIds: noteFilters.noteIds,
          excludeNoteIds: noteFilters.excludeNoteIds,
          tags: noteFilters.tags,
          dateFrom: noteFilters.dateFrom ? new Date(noteFilters.dateFrom) : undefined,
          dateTo: noteFilters.dateTo ? new Date(noteFilters.dateTo) : undefined,
        } : undefined,
        minRelevance: options?.minRelevance,
      });

      if (chunks.length === 0) {
        const noResultsMessage = noteFilters
          ? "I couldn't find any relevant notes matching your filters."
          : "I don't have any notes to search through. Try creating some notes first!";
        res.status(200).json({
          answer: noResultsMessage,
          sources: [],
          meta: { model: CHAT_MODEL, responseTimeMs: 0, confidence: 'none', sourceCount: 0, intent: 'search' },
        });
        return;
      }

      // Build sources and prompt with conversation context
      const queryTerms = queryAnalysis.keywords || [];
      const sourcesPack = buildSourcesPack(chunks, queryTerms);
      const conversationContext = effectiveHistory ? buildConversationContext(effectiveHistory) : '';
      const prompt = conversationContext + buildPrompt(query, sourcesPack, queryAnalysis.intent);

      // Initialize SSE and stream response
      initSSEResponse(res);

      try {
        const result = await streamChatResponse(res, prompt, sourcesPack, {
          requestId: res.get('X-Request-Id'),
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          includeContextSources: options?.includeContextSources !== false,
          allChunks: chunks.map(c => ({
            noteId: c.noteId,
            text: c.text,
            score: c.score,
            createdAt: c.createdAt,
          })),
        });

        // Save to thread after streaming completes
        if (threadId && saveToThread) {
          await addMessage(threadId, tenantId, 'user', query);
          await addMessage(threadId, tenantId, 'assistant', result.fullText);
        }
      } catch (streamErr) {
        logError("POST /chat stream error", streamErr);
      }
      return;
    }

    // Non-streaming mode - use enhanced chat function
    const enhancedRequest: EnhancedChatRequest = {
      query,
      tenantId,
      threadId,
      conversationHistory: effectiveHistory,
      filters: noteFilters,
      options: {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        topK: options?.topK,
        minRelevance: options?.minRelevance,
        includeSources: options?.includeSources,
        includeContextSources: options?.includeContextSources,
        verifyCitations: options?.verifyCitations,
        responseFormat: options?.responseFormat,
        systemPrompt: options?.systemPrompt,
        language: options?.language,
      },
      saveToThread,
    };

    const response = await generateEnhancedChatResponse(enhancedRequest);

    // Save to thread if requested
    if (threadId && saveToThread) {
      await addMessage(threadId, tenantId, 'user', query);
      await addMessage(threadId, tenantId, 'assistant', response.answer, response.sources);
    }

    // Add threadId to meta
    if (threadId) {
      response.meta.threadId = threadId;
    }

    res.status(200).json(response);
  })
);

// ============================================
// Feedback Endpoint (authenticated)
// ============================================

/**
 * POST /feedback - Collect user feedback on chat responses
 *
 * Requires: Firebase ID token in Authorization header
 * Request: { requestId: string, rating: 'up' | 'down', comment?: string }
 * Response: { status: 'recorded', requestId: string }
 */
app.post(
  "/feedback",
  userAuthMiddleware,
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { requestId, rating, comment } = req.body;

    // Validate required fields
    if (!requestId) {
      throw Errors.badRequest('requestId is required');
    }

    if (!rating || !['up', 'down'].includes(rating)) {
      throw Errors.badRequest("rating must be 'up' or 'down'");
    }

    // Store feedback in Firestore
    const db = getDb();
    const feedbackDoc = {
      requestId,
      tenantId,
      rating,
      comment: comment?.slice(0, 1000) || null,
      createdAt: new Date(),
    };

    await db.collection('feedback').add(feedbackDoc);

    logInfo('User feedback received', {
      requestId,
      tenantId,
      rating,
      hasComment: !!comment,
    });

    res.status(200).json({ status: 'recorded', requestId });
  })
);

// ============================================
// Transcription Endpoint (authenticated)
// ============================================

/**
 * POST /transcribe - Transcribe audio to text (speech-to-text)
 *
 * Requires: Firebase ID token in Authorization header
 * Request: multipart/form-data with 'audio' file field
 *
 * Query parameters:
 *   - languageHint: string (e.g., 'en', 'es', 'fr')
 *   - includeTimestamps: boolean - Include [MM:SS] timestamps
 *   - includeSpeakerDiarization: boolean - Identify speakers
 *   - addPunctuation: boolean (default: true) - Add punctuation
 *   - vocabularyHints: string - Domain-specific terms
 *   - outputFormat: 'text' | 'segments' | 'srt' | 'vtt'
 *   - generateSummary: boolean - Generate 2-3 sentence summary
 *   - extractActionItems: boolean - Extract TODO items
 *   - detectTopics: boolean - Detect main topics
 *   - saveAsNote: boolean - Auto-save as a note
 *   - noteTitle: string - Title for saved note
 *   - noteTags: string - Comma-separated tags
 *
 * Response: {
 *   text: string,
 *   processingTimeMs: number,
 *   model: string,
 *   estimatedDurationSeconds?: number,
 *   segments?: Array<{ text, startTime, endTime, speaker? }>,
 *   summary?: string,
 *   actionItems?: Array<{ text, assignee?, dueDate?, priority? }>,
 *   topics?: string[],
 *   subtitles?: string,
 *   speakerCount?: number,
 *   noteId?: string (if saveAsNote=true)
 * }
 *
 * Supported formats: MP3, WAV, WEBM, OGG, AAC, FLAC, AIFF
 * Max file size: 20MB
 */
app.post(
  "/transcribe",
  userAuthMiddleware,
  perUserRateLimiter,
  (req, res, next) => {
    // Handle multer upload with error handling
    audioUpload.single('audio')(req, res, (err) => {
      if (err) {
        const uploadError = handleMulterError(err);
        return res.status(400).json({
          error: {
            code: uploadError.code,
            message: uploadError.message,
          },
        });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;

    // Validate file was uploaded
    if (!req.file) {
      throw Errors.badRequest('No audio file provided. Use "audio" field in multipart/form-data.');
    }

    // Parse and validate options from query params with proper typing
    const optionsResult = TranscriptionOptionsSchema.safeParse(req.query);
    const options = optionsResult.success ? optionsResult.data : TranscriptionOptionsSchema.parse({});

    // Get normalized MIME type
    const mimeType = getNormalizedMimeType(req.file);

    logInfo('Transcription request received', {
      tenantId,
      originalName: req.file.originalname,
      mimeType,
      sizeBytes: req.file.size,
      hasTimestamps: options.includeTimestamps,
      hasSpeakerDiarization: options.includeSpeakerDiarization,
      outputFormat: options.outputFormat,
    });

    try {
      // Perform transcription with enhanced options
      const result = await transcribeAudio(req.file.buffer, mimeType, {
        languageHint: options.languageHint,
        includeTimestamps: options.includeTimestamps,
        includeSpeakerDiarization: options.includeSpeakerDiarization,
        addPunctuation: options.addPunctuation,
        vocabularyHints: options.vocabularyHints,
        outputFormat: options.outputFormat as 'text' | 'segments' | 'srt' | 'vtt' | undefined,
        generateSummary: options.generateSummary,
        extractActionItems: options.extractActionItems,
        detectTopics: options.detectTopics,
      });

      // Build response
      const response: Record<string, unknown> = {
        text: result.text,
        processingTimeMs: result.processingTimeMs,
        model: result.model,
        estimatedDurationSeconds: result.estimatedDurationSeconds,
      };

      // Add optional fields if present
      if (result.segments) response.segments = result.segments;
      if (result.summary) response.summary = result.summary;
      if (result.actionItems && result.actionItems.length > 0) response.actionItems = result.actionItems;
      if (result.topics && result.topics.length > 0) response.topics = result.topics;
      if (result.subtitles) response.subtitles = result.subtitles;
      if (result.speakerCount !== undefined) response.speakerCount = result.speakerCount;

      // Auto-save as note if requested
      if (options.saveAsNote) {
        // Build note content
        let noteContent = result.text;

        // Add summary at the top if available
        if (result.summary) {
          noteContent = `## Summary\n${result.summary}\n\n## Transcript\n${noteContent}`;
        }

        // Add action items if available
        if (result.actionItems && result.actionItems.length > 0) {
          const actionItemsText = result.actionItems
            .map(item => `- [ ] ${item.text}${item.assignee ? ` (@${item.assignee})` : ''}${item.dueDate ? ` (Due: ${item.dueDate})` : ''}`)
            .join('\n');
          noteContent = `## Action Items\n${actionItemsText}\n\n${noteContent}`;
        }

        // Add topics as tags header if available
        if (result.topics && result.topics.length > 0) {
          noteContent = `Topics: ${result.topics.join(', ')}\n\n${noteContent}`;
        }

        // Parse tags from comma-separated string
        const noteTags: string[] = options.noteTags
          ? options.noteTags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [];

        // Add audio source tag
        noteTags.push('transcription');

        // Create the note
        const noteTitle = options.noteTitle ||
          `Transcription - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

        const note = await createNote(noteContent, tenantId, { title: noteTitle, tags: noteTags });

        response.noteId = note.id;
        response.noteTitle = noteTitle;

        logInfo('Transcription saved as note', {
          tenantId,
          noteId: note.id,
          noteTitle,
          textLength: noteContent.length,
        });
      }

      res.status(200).json(response);
    } catch (error) {
      if (error instanceof TranscriptionError) {
        throw Errors.badRequest(error.message);
      }
      throw error;
    }
  })
);

// ============================================
// Thread Endpoints (authenticated)
// ============================================

/**
 * POST /threads - Create a new conversation thread
 *
 * Requires: Firebase ID token in Authorization header
 * Request: { title?: string, metadata?: object }
 * Response: ThreadResponse
 */
app.post(
  "/threads",
  userAuthMiddleware,
  perUserRateLimiter,
  validateBody(CreateThreadSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { title, metadata } = req.body;

    const thread = await createThread(tenantId, { title, metadata });
    res.status(201).json(thread);
  })
);

/**
 * GET /threads - List conversation threads
 *
 * Requires: Firebase ID token in Authorization header
 * Query params: limit, cursor
 * Response: ThreadsListResponse
 */
app.get(
  "/threads",
  userAuthMiddleware,
  perUserRateLimiter,
  validateQuery(ListThreadsQuerySchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { limit, cursor } = (req.validatedQuery || req.query) as any;

    const result = await listThreads(tenantId, limit, cursor);
    res.status(200).json(result);
  })
);

/**
 * GET /threads/:threadId - Get a thread with all messages
 *
 * Requires: Firebase ID token in Authorization header
 * Response: ThreadDetailResponse
 */
app.get(
  "/threads/:threadId",
  userAuthMiddleware,
  perUserRateLimiter,
  validateParams(ThreadIdParamSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { threadId } = (req.validatedParams || req.params) as any;

    const thread = await getThread(threadId, tenantId);
    if (!thread) {
      throw Errors.threadNotFound(threadId);
    }

    res.status(200).json(thread);
  })
);

/**
 * DELETE /threads/:threadId - Delete a thread
 *
 * Requires: Firebase ID token in Authorization header
 * Response: { success: true }
 */
app.delete(
  "/threads/:threadId",
  userAuthMiddleware,
  perUserRateLimiter,
  validateParams(ThreadIdParamSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { threadId } = (req.validatedParams || req.params) as any;

    const deleted = await deleteThread(threadId, tenantId);
    if (!deleted) {
      throw Errors.threadNotFound(threadId);
    }

    res.status(200).json({ success: true });
  })
);

/**
 * PATCH /threads/:threadId - Update a thread's metadata
 *
 * Requires: Firebase ID token in Authorization header
 * Request: { title?: string, summary?: string }
 * Response: ThreadResponse
 */
app.patch(
  "/threads/:threadId",
  userAuthMiddleware,
  perUserRateLimiter,
  validateParams(ThreadIdParamSchema),
  validateBody(UpdateThreadSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { threadId } = (req.validatedParams || req.params) as any;
    const { title, summary } = req.body;

    const thread = await updateThread(threadId, tenantId, { title, summary });
    if (!thread) {
      throw Errors.threadNotFound(threadId);
    }

    res.status(200).json(thread);
  })
);

/**
 * GET /threads/:threadId/messages - Get paginated messages from a thread
 *
 * Requires: Firebase ID token in Authorization header
 * Query params: limit, cursor, order
 * Response: ThreadMessagesResponse
 */
app.get(
  "/threads/:threadId/messages",
  userAuthMiddleware,
  perUserRateLimiter,
  validateParams(ThreadIdParamSchema),
  validateQuery(GetThreadMessagesQuerySchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.uid;
    const { threadId } = (req.validatedParams || req.params) as any;
    const { limit, cursor, order } = (req.validatedQuery || req.query) as any;

    const result = await getThreadMessages(threadId, tenantId, { limit, cursor, order });
    if (!result) {
      throw Errors.threadNotFound(threadId);
    }

    res.status(200).json(result);
  })
);

// ============================================
// Internal Endpoints (Cloud Tasks callbacks)
// ============================================

// Validate internal auth configuration at startup
if (!isInternalAuthConfigured()) {
  logError('Internal auth misconfigured - see logs above', null);
}

/**
 * POST /internal/process-note - Cloud Tasks callback for processing notes
 *
 * This endpoint is called by Cloud Tasks to process note chunks/embeddings.
 * When INTERNAL_AUTH_ENABLED=true, validates OIDC token from Cloud Tasks.
 */
app.post("/internal/process-note", internalAuthMiddleware, async (req, res) => {
  try {
    const { noteId, tenantId } = req.body;

    if (!noteId) {
      return res.status(400).json({ error: "noteId is required" });
    }

    // Fetch the note from Firestore
    const db = getDb();
    const noteDoc = await db.collection(NOTES_COLLECTION).doc(noteId).get();

    if (!noteDoc.exists) {
      logWarn("Note not found for processing", { noteId });
      // Return 200 to prevent Cloud Tasks from retrying
      return res.status(200).json({ status: "not_found", noteId });
    }

    const note = noteDoc.data() as NoteDoc;

    // Verify tenant if provided
    if (tenantId && note.tenantId !== tenantId) {
      logWarn("Tenant mismatch for note processing", { noteId, expected: tenantId, actual: note.tenantId });
      return res.status(200).json({ status: "tenant_mismatch", noteId });
    }

    // Process the note chunks
    await processNoteChunks(note);

    logInfo("Note processed via Cloud Tasks", { noteId });
    return res.status(200).json({ status: "processed", noteId });
  } catch (err) {
    logError("POST /internal/process-note error", err);
    // Return 500 to trigger Cloud Tasks retry
    return res.status(500).json({ error: "processing failed" });
  }
});

// ============================================
// Global Error Handler (must be last)
// ============================================
app.use(errorHandler);

// ============================================
// Start Server
// ============================================
const server = app.listen(PORT, () => {
  logInfo("auroranotes-api started", {
    port: PORT,
    project: PROJECT_ID,
    userAuthEnabled: isUserAuthEnabled(),
  });
  console.log(`auroranotes-api listening on http://localhost:${PORT}`);

  // Log vector search configuration status at startup
  const vertexStatus = getVertexConfigStatus();
  if (vertexStatus.enabled && vertexStatus.configured) {
    logInfo("Vector search: Vertex AI enabled and configured", {});
  } else if (vertexStatus.enabled && !vertexStatus.configured) {
    logWarn("Vector search: Vertex AI enabled but MISCONFIGURED - using Firestore fallback", {
      errors: vertexStatus.errors,
      hint: "Set VERTEX_INDEX_ENDPOINT_RESOURCE and VERTEX_DEPLOYED_INDEX_ID",
    });
  } else {
    logInfo("Vector search: Using Firestore fallback (Vertex not enabled)", {
      hint: "Set VERTEX_VECTOR_SEARCH_ENABLED=true for better recall",
    });
  }
});

// ============================================
// Graceful Shutdown
// ============================================
const SHUTDOWN_TIMEOUT_MS = 30000;

function gracefulShutdown(signal: string): void {
  logInfo(`${signal} received, starting graceful shutdown`, {});

  server.close((err) => {
    if (err) {
      logError('Error during server close', err);
      process.exit(1);
    }
    logInfo('Server closed gracefully', {});
    process.exit(0);
  });

  // Force shutdown if graceful close takes too long
  setTimeout(() => {
    logError('Graceful shutdown timeout, forcing exit', null);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
