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
import { createNote, listNotes, deleteNote } from "./notes";
import { generateChatResponse, ConfigurationError, RateLimitError, buildSourcesPack, buildPrompt } from "./chat";
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
import { rateLimitMiddleware } from "./rateLimit";
import { processNoteChunks } from "./chunking";
import { getDb } from "./firestore";
import { internalAuthMiddleware, isInternalAuthConfigured } from "./internalAuth";
import { getVertexConfigStatus, isVertexConfigured } from "./vectorIndex";
import { userAuthMiddleware, isUserAuthEnabled, perUserRateLimiter } from "./middleware";
import { validateBody, validateQuery, validateParams } from "./middleware";
import { errorHandler, asyncHandler, Errors, ApiError } from "./errors";
import {
  CreateNoteSchema,
  UpdateNoteSchema,
  NoteIdParamSchema,
  ListNotesQuerySchema,
  ChatRequestSchema,
  CreateThreadSchema,
  ThreadIdParamSchema,
  ListThreadsQuerySchema,
} from "./schemas";
import {
  createThread,
  getThread,
  listThreads,
  addMessage,
  deleteThread,
} from "./threads";

// Create Express application
const app = express();

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
// Health Endpoint (no auth required)
// ============================================
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
 * GET /notes - List notes with pagination
 *
 * Requires: Firebase ID token in Authorization header
 * Query params:
 *   - limit: number (default 20, max 100)
 *   - cursor: string (pagination cursor)
 *   - tag: string (filter by tag)
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
    const { limit, cursor } = (req.validatedQuery || req.query) as any;

    const result = await listNotes(tenantId, limit, cursor);
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
 * Request: { query: string, threadId?: string, stream?: boolean }
 * Response: ChatResponse with answer, sources[], and meta
 *
 * tenantId is derived from authenticated user's UID
 */
app.post(
  "/chat",
  userAuthMiddleware,
  perUserRateLimiter,
  validateBody(ChatRequestSchema),
  asyncHandler(async (req, res) => {
    // tenantId is ALWAYS the authenticated user's UID
    const tenantId = req.user!.uid;
    const { query, threadId, stream: requestStream, options } = req.body;
    const stream = requestStream || clientAcceptsSSE(req.headers.accept);

    // Streaming mode
    if (stream && STREAMING_CONFIG.enabled) {
      // Retrieve relevant chunks
      const queryAnalysis = analyzeQuery(query);
      const adaptiveK = calculateAdaptiveK(query, queryAnalysis.intent, queryAnalysis.keywords);
      const { chunks } = await retrieveRelevantChunks(query, {
        tenantId,
        topK: options?.topK || RETRIEVAL_TOP_K,
        rerankTo: Math.min(adaptiveK, MAX_CHUNKS_IN_CONTEXT),
      });

      if (chunks.length === 0) {
        res.status(200).json({
          answer: "I don't have any notes to search through. Try creating some notes first!",
          sources: [],
          meta: { model: CHAT_MODEL, responseTimeMs: 0, confidence: 'none', sourceCount: 0, intent: 'search' },
        });
        return;
      }

      // Build sources and prompt
      const queryTerms = queryAnalysis.keywords || [];
      const sourcesPack = buildSourcesPack(chunks, queryTerms);
      const prompt = buildPrompt(query, sourcesPack, queryAnalysis.intent);

      // Initialize SSE and stream response
      initSSEResponse(res);

      try {
        await streamChatResponse(res, prompt, sourcesPack, {
          requestId: res.get('X-Request-Id'),
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });
      } catch (streamErr) {
        // Error already sent via SSE
        logError("POST /chat stream error", streamErr);
      }
      return;
    }

    // Non-streaming mode
    const request: ChatRequest = { message: query, tenantId };
    const response = await generateChatResponse(request);
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
app.listen(PORT, () => {
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
