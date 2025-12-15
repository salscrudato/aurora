# AuroraNotes Backend Quality Plan

**Date:** 2025-12-15  
**Status:** Implementation in Progress

---

## 1. Executive Summary

This document outlines the comprehensive hardening and upgrade plan for AuroraNotes API to ensure:
- Chat answers reliably pull the most relevant notes from the entire corpus
- Responses integrate notes naturally with accurate citations
- System scales to 100k+ notes without performance degradation
- All changes preserve existing API contracts

---

## 2. API Contracts (WILL NOT CHANGE)

### GET /health
```json
{
  "status": "healthy",
  "timestamp": "ISO-8601",
  "service": "auroranotes-api",
  "project": "string",
  "version": "string"
}
```

### POST /notes
**Request:** `{ text: string, tenantId?: string }`  
**Response:** `{ id, text, tenantId, createdAt, updatedAt }`

### GET /notes
**Query:** `?limit=N&cursor=X&tenantId=Y`  
**Response:** `{ notes: NoteResponse[], cursor: string|null, hasMore: boolean }`

### POST /chat
**Request:** `{ message: string, tenantId?: string }`  
**Response:**
```json
{
  "answer": "Natural language with [N1] citations...",
  "citations": [
    { "cid": "N1", "noteId": "...", "chunkId": "...", "createdAt": "ISO", "snippet": "...", "score": 0.85 }
  ],
  "meta": {
    "model": "gemini-2.0-flash",
    "retrieval": { "k": 8, "strategy": "hybrid_reranked", "candidateCount": 100, "rerankCount": 8, "timeMs": 1200 }
  }
}
```

**Citation Format:** Inline `[N1]`, `[N2]` markers in answer text, corresponding to citations array.

---

## 3. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| API contract breakage | Critical | Golden JSON tests, schema validation |
| Citation hallucination | High | Validation + retry + safe fallback |
| Retrieval quality regression | High | Evaluation harness with test queries |
| Scaling bottleneck at 100k notes | High | Vector search mode + bounded candidate fetch |
| Embedding API rate limits | Medium | Caching, backoff, batching |
| Cost runaway | Medium | Hard caps on context size, token limits |
| Background job failures | Medium | Retry queue with bounded backlog |

---

## 4. Planned Changes (Internal Only)

### 4.1 Retrieval Pipeline
- [x] Hybrid scoring (vector + keyword + recency) - EXISTS
- [ ] Enhanced query understanding with intent detection
- [ ] Configurable vector search mode (VECTOR_SEARCH_ENABLED)
- [ ] LLM reranker option (LLM_RERANK_ENABLED) with cost caps
- [ ] Diversity reranking to avoid note clustering

### 4.2 Chunk/Embedding Pipeline
- [x] Sentence-aware chunking - EXISTS
- [x] Embedding generation with text-embedding-004 - EXISTS
- [ ] Background async queue with backpressure
- [ ] Hash-based embedding cache (textHash → embedding)
- [ ] Backfill script for existing notes

### 4.3 Response Generation
- [x] Citation-enforced prompting - EXISTS
- [x] Citation validation and cleanup - EXISTS
- [ ] Enhanced prompting for natural synthesis
- [ ] Retry on citation validation failure
- [ ] Evidence-aware fallback responses

### 4.4 Performance & Reliability
- [ ] Request ID tracking through pipeline
- [ ] Structured JSON logging with latency breakdown
- [ ] LRU caches for query embeddings, retrieval results
- [ ] Timeouts and abort signals
- [ ] Rate limiting behind env flag

### 4.5 Observability
- [ ] Latency breakdown (retrieval, rerank, generation)
- [ ] Citation validity metrics
- [ ] Retrieval mode tracking
- [ ] Background job queue depth

---

## 5. Configuration (New Env Vars)

| Variable | Default | Description |
|----------|---------|-------------|
| `VECTOR_SEARCH_ENABLED` | true | Enable vector similarity search |
| `LLM_RERANK_ENABLED` | false | Enable LLM-based reranking |
| `RATE_LIMIT_ENABLED` | false | Enable IP-based rate limiting |
| `RATE_LIMIT_REQUESTS_PER_MIN` | 60 | Requests per minute per IP |
| `BACKGROUND_QUEUE_MAX_SIZE` | 100 | Max pending background jobs |
| `CITATION_RETRY_ENABLED` | true | Retry generation on invalid citations |

---

## 6. Acceptance Criteria

- [ ] All endpoints return identical response shapes
- [ ] Chat answers are natural prose with inline citations
- [ ] No hallucinated citation IDs in responses
- [ ] Retrieval considers entire corpus via indexed search
- [ ] Works at 100k notes without full collection scan
- [ ] Evaluation harness passes with >80% citation validity
- [ ] Latency remains <5s for typical queries

---

## 7. Files Modified

| File | Changes |
|------|---------|
| `src/config.ts` | New feature flags, rate limit config |
| `src/retrieval.ts` | Enhanced scoring, vector search mode |
| `src/chat.ts` | Citation retry, enhanced prompting |
| `src/embeddings.ts` | Hash-based caching |
| `src/chunking.ts` | Background queue integration |
| `src/utils.ts` | Request ID generation, enhanced logging |
| `scripts/backfill-chunks.ts` | NEW: Backfill existing notes |
| `scripts/eval-retrieval.ts` | NEW: Evaluation harness |

---

## 8. Deployment Plan

1. Build and test locally
2. Deploy to Cloud Run (existing configuration)
3. Run evaluation harness against live endpoint
4. Monitor logs for errors/latency
5. Iterate based on evaluation results

