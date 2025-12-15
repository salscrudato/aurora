/**
 * AuroraNotes API - Main Entry Point
 *
 * Express server with notes CRUD, pagination, and RAG-powered chat.
 */

import express from "express";
import cors from "cors";

import { PORT, PROJECT_ID, DEFAULT_TENANT_ID } from "./config";
import { createNote, listNotes } from "./notes";
import { generateChatResponse, ConfigurationError, RateLimitError } from "./chat";
import { logInfo, logError, generateRequestId, withRequestContext } from "./utils";
import { ChatRequest } from "./types";
import { rateLimitMiddleware } from "./rateLimit";

// Create Express application
const app = express();

// Middleware
app.use(cors());
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

app.use(rateLimitMiddleware);

// ============================================
// Health Endpoint
// ============================================
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "auroranotes-api",
    project: PROJECT_ID,
    version: "2.0.0",
  });
});

// ============================================
// Notes Endpoints
// ============================================

/**
 * POST /notes - Create a new note
 *
 * Request: { text: string, tenantId?: string }
 * Response: NoteResponse
 */
app.post("/notes", async (req, res) => {
  try {
    const text = (req.body?.text || "").toString();
    const tenantId = req.body?.tenantId || DEFAULT_TENANT_ID;

    const note = await createNote(text, tenantId);
    return res.status(201).json(note);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "internal error";

    if (message.includes("required") || message.includes("too long")) {
      return res.status(400).json({ error: message });
    }

    logError("POST /notes error", err);
    return res.status(500).json({ error: "internal error" });
  }
});

/**
 * GET /notes - List notes with pagination
 *
 * Query params:
 *   - limit: number (default 50, max 100)
 *   - cursor: string (pagination cursor)
 *   - tenantId: string (default 'public')
 *
 * Response: NotesListResponse
 */
app.get("/notes", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;
    const tenantId = (req.query.tenantId as string) || DEFAULT_TENANT_ID;

    const result = await listNotes(tenantId, limit, cursor);
    return res.status(200).json(result);
  } catch (err: unknown) {
    logError("GET /notes error", err);
    return res.status(500).json({ error: "internal error" });
  }
});

// ============================================
// Chat Endpoint
// ============================================

/**
 * POST /chat - RAG-powered chat with inline citations
 *
 * Request: { message: string, tenantId?: string }
 * Response: ChatResponse with answer, citations[], and meta
 */
app.post("/chat", async (req, res) => {
  try {
    const request: ChatRequest = {
      message: (req.body?.message || "").toString(),
      tenantId: req.body?.tenantId || DEFAULT_TENANT_ID,
    };

    const response = await generateChatResponse(request);
    return res.status(200).json(response);
  } catch (err: unknown) {
    // Handle server configuration errors (503)
    if (err instanceof ConfigurationError) {
      logError("POST /chat configuration error", err);
      return res.status(503).json({
        error: "Chat service is not configured. Please contact support.",
        code: "SERVICE_UNAVAILABLE",
      });
    }

    // Handle rate limiting (429)
    if (err instanceof RateLimitError) {
      logError("POST /chat rate limit", err);
      return res.status(429).json({
        error: "Too many requests. Please try again later.",
        code: "RATE_LIMITED",
        retryAfterMs: 5000,
      });
    }

    const message = err instanceof Error ? err.message : "internal error";

    // Handle client validation errors (400)
    if (message === "message is required" || message.includes("too long")) {
      return res.status(400).json({ error: message });
    }

    logError("POST /chat error", err);
    return res.status(500).json({ error: "internal error" });
  }
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
  logInfo("auroranotes-api started", { port: PORT, project: PROJECT_ID });
  console.log(`auroranotes-api listening on http://localhost:${PORT}`);
});
