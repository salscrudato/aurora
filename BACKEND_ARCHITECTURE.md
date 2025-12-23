# AuroraNotes Backend - Architecture Overview

**Last Updated:** December 2025  
**Version:** 2.0

## Executive Summary

AuroraNotes is a production-grade RAG (Retrieval-Augmented Generation) API that powers an AI-native note-taking application. It implements state-of-the-art retrieval techniques including:

- **Hybrid retrieval** (vector + lexical + recency)
- **Cross-encoder reranking** with MMR diversity
- **Unified citation verification pipeline**
- **Agentic capabilities** (create notes, set reminders, execute actions)
- **Voice-to-text transcription** with action item extraction
- **Real-time streaming** via Server-Sent Events

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Client Applications                                  │
│                    (Web App, Mobile, API Consumers)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Express API Server (src/index.ts)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Middleware: Auth │ Rate Limit │ Validation │ Compression │ CORS    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │                    │
         ▼                    ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐        ┌──────────┐
   │  Notes   │        │   Chat   │        │  Voice   │        │ Actions  │
   │   CRUD   │        │   RAG    │        │ Transcr. │        │ Executor │
   └──────────┘        └──────────┘        └──────────┘        └──────────┘
         │                    │                    │                    │
         └────────────────────┴────────────────────┴────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RAG Pipeline (src/chat.ts)                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. QUERY ANALYSIS (src/query.ts)                                   │   │
│  │     ├─ Intent classification (factual/exploratory/comparison/etc)  │   │
│  │     ├─ Keyword extraction with TF-IDF weighting                    │   │
│  │     ├─ Entity recognition (dates, names, IDs)                      │   │
│  │     ├─ Temporal scope detection ("last week", "all time")          │   │
│  │     └─ Query expansion for better recall                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  2. MULTI-STAGE RETRIEVAL (src/retrieval.ts)                       │   │
│  │     ├─ Stage 1: Vector Search (Vertex AI / Firestore fallback)     │   │
│  │     │           Top-K semantic similarity (configurable K)         │   │
│  │     ├─ Stage 2: Lexical Search (BM25-like term matching)           │   │
│  │     │           Exact keyword matching for precision               │   │
│  │     ├─ Stage 3: Recency Scoring                                    │   │
│  │     │           Time-decay weighting for fresh content             │   │
│  │     ├─ Stage 4: Rank Fusion (RRF)                                  │   │
│  │     │           Reciprocal Rank Fusion with configurable weights   │   │
│  │     └─ Candidate Pool: 100-500 chunks for reranking                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  3. RERANKING (src/reranker.ts, src/crossEncoder.ts)               │   │
│  │     ├─ Cross-Encoder Reranking (Gemini-based semantic scoring)     │   │
│  │     ├─ MMR Diversity (Maximal Marginal Relevance)                  │   │
│  │     │   λ-weighted relevance vs. diversity tradeoff                │   │
│  │     ├─ Position Bonuses (intro/summary section boost)              │   │
│  │     ├─ Coverage-Aware Scoring (ensure keyword representation)      │   │
│  │     └─ Precision Boost (aggressive filtering for strong signals)   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  4. CONTEXT BUILDING                                                │   │
│  │     ├─ Adaptive K selection (query complexity → context size)      │   │
│  │     ├─ Token budget management (LLM_CONTEXT_BUDGET_CHARS)          │   │
│  │     ├─ Source deduplication and ordering                           │   │
│  │     └─ Conversation history integration                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  5. LLM GENERATION (src/genaiClient.ts)                            │   │
│  │     ├─ Agentic Prompts (src/agenticPrompts.ts)                     │   │
│  │     │   Action detection, structured responses                     │   │
│  │     ├─ Enhanced Prompts (src/enhancedPrompts.ts)                   │   │
│  │     │   Optimized for citation accuracy                            │   │
│  │     ├─ Streaming Generation (src/streaming.ts)                     │   │
│  │     │   Token-by-token SSE streaming                               │   │
│  │     └─ Retry Logic with exponential backoff                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  6. CITATION VERIFICATION (src/unifiedCitationPipeline.ts)         │   │
│  │     ├─ Format Validation (src/citationValidator.ts)                │   │
│  │     │   Bracket format, ID validity, duplicate detection           │   │
│  │     ├─ Semantic Confidence (src/citationConfidence.ts)             │   │
│  │     │   Embedding similarity, claim-source alignment               │   │
│  │     ├─ Claim Anchoring (src/claimAnchoring.ts)                     │   │
│  │     │   Fine-grained claim → source mapping                        │   │
│  │     ├─ Contradiction Detection (src/citationGrounding.ts)          │   │
│  │     │   Semantic conflict identification                           │   │
│  │     ├─ Self-Consistency (src/selfConsistency.ts)                   │   │
│  │     │   Multi-sample verification for high-stakes claims           │   │
│  │     └─ Source Attribution (src/sourceAttribution.ts)               │   │
│  │         Attribution analysis and repair                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  7. RESPONSE ENHANCEMENT                                            │   │
│  │     ├─ Post-Processing (src/responsePostProcessor.ts)              │   │
│  │     │   Format cleanup, citation normalization                     │   │
│  │     ├─ Validation & Repair (src/responseValidation.ts)             │   │
│  │     │   Citation repair, hallucination mitigation                  │   │
│  │     └─ Confidence Scoring (src/responseConfidence.ts)              │   │
│  │         Overall response quality assessment                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Data Layer                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Firestore (src/firestore.ts)                                       │   │
│  │   ├─ notes/{tenantId}/items          User notes                    │   │
│  │   ├─ chunks/{tenantId}/items         Semantic chunks + embeddings  │   │
│  │   ├─ threads/{tenantId}/items        Conversation threads          │   │
│  │   └─ feedback/{tenantId}/items       User feedback for training    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Vector Search (src/vectorIndex.ts)                                 │   │
│  │   ├─ Primary: Vertex AI Vector Search (100k+ scale)                │   │
│  │   └─ Fallback: Firestore brute-force (cost-effective)              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Embeddings (src/embeddings.ts)                                     │   │
│  │   ├─ Model: text-embedding-004 (768 dimensions)                    │   │
│  │   ├─ Batch Generation (up to 100 texts)                            │   │
│  │   └─ Caching Layer (src/embeddingCache.ts)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Module Organization

### Core Foundation
| Module | Purpose |
|--------|---------|
| `config.ts` | Centralized configuration with environment variables |
| `types.ts` | Shared TypeScript interfaces and types |
| `schemas.ts` | Zod validation schemas for API requests |
| `errors.ts` | Custom error classes with HTTP status codes |
| `utils.ts` | Utility functions, logging, text processing |
| `firestore.ts` | Database client initialization |

### API Layer
| Module | Purpose |
|--------|---------|
| `index.ts` | Express server, routes, middleware orchestration |
| `middleware/` | Auth, validation, rate limiting, file upload |
| `streaming.ts` | SSE streaming for real-time responses |

### Notes & Data
| Module | Purpose |
|--------|---------|
| `notes.ts` | Note CRUD, search, autocomplete |
| `chunking.ts` | Semantic text chunking with overlap |
| `embeddings.ts` | Embedding generation and batch processing |
| `embeddingCache.ts` | TTL-based embedding cache |
| `threads.ts` | Conversation thread management |

### RAG Pipeline
| Module | Purpose |
|--------|---------|
| `query.ts` | Query analysis, intent detection, entity extraction |
| `queryExpansion.ts` | Query expansion for improved recall |
| `retrieval.ts` | Multi-stage hybrid retrieval orchestration |
| `vectorIndex.ts` | Vector search abstraction (Vertex AI + fallback) |
| `rankFusion.ts` | Reciprocal Rank Fusion (RRF) |
| `reranker.ts` | Reranking orchestration |
| `crossEncoder.ts` | Cross-encoder semantic reranking |
| `chat.ts` | Main RAG pipeline orchestration |

### LLM Integration
| Module | Purpose |
|--------|---------|
| `genaiClient.ts` | Google Generative AI client with rate limiting |
| `enhancedPrompts.ts` | Optimized prompts for citation accuracy |
| `agenticPrompts.ts` | Action-oriented prompt framework |

### Citation Quality
| Module | Purpose |
|--------|---------|
| `citationValidator.ts` | Format validation and duplicate detection |
| `citationConfidence.ts` | Semantic confidence scoring |
| `citationGrounding.ts` | Grounding verification |
| `sourceAttribution.ts` | Source attribution analysis |
| `claimExtraction.ts` | Claim extraction from responses |
| `claimAnchoring.ts` | Fine-grained claim-source mapping |
| `unifiedCitationPipeline.ts` | Unified verification pipeline |
| `selfConsistency.ts` | Multi-sample consistency verification |

### Response Quality
| Module | Purpose |
|--------|---------|
| `responsePostProcessor.ts` | Response formatting and cleanup |
| `responseValidation.ts` | Validation and repair |
| `responseConfidence.ts` | Overall confidence calculation |

### Extended Features
| Module | Purpose |
|--------|---------|
| `actionExecutor.ts` | Agentic action execution (create, remind, search) |
| `transcription.ts` | Voice-to-text with Gemini |
| `enrichment.ts` | AI-powered note metadata extraction |

### Infrastructure
| Module | Purpose |
|--------|---------|
| `cache.ts` | TTL-based in-memory caching |
| `rateLimit.ts` | Per-IP and per-user rate limiting |
| `internalAuth.ts` | OIDC authentication for internal endpoints |
| `queue.ts` | Background task queue |
| `retrievalLogger.ts` | Structured retrieval observability |
| `contractTests.ts` | Response contract validation |

---

## API Endpoints

### Notes API
```
POST   /notes              Create note (with auto-enrichment)
GET    /notes              List notes (paginated, filtered)
GET    /notes/:id          Get single note
PUT    /notes/:id          Update note
DELETE /notes/:id          Delete note
GET    /notes/search       Full-text search
GET    /notes/autocomplete Autocomplete suggestions
```

### Chat API
```
POST   /chat               RAG-powered chat (streaming SSE)
POST   /chat/enhanced      Enhanced chat with agentic capabilities
```

### Threads API
```
POST   /threads            Create conversation thread
GET    /threads            List threads
GET    /threads/:id        Get thread with messages
PUT    /threads/:id        Update thread
DELETE /threads/:id        Delete thread
POST   /threads/:id/messages  Add message to thread
```

### Voice API
```
POST   /transcribe         Audio transcription with action extraction
```

### System API
```
GET    /health             Liveness check
GET    /ready              Readiness check (with dependency health)
GET    /config             Runtime configuration (non-sensitive)
```

---

## Data Flow Diagrams

### Note Creation Flow
```
POST /notes
    │
    ▼
┌─────────────────────────────────────────┐
│ 1. Validation (Zod schema)              │
│ 2. Authentication (Firebase JWT)        │
│ 3. Create note document in Firestore    │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 4. Enrichment (async or sync)           │
│    ├─ Title derivation (if missing)     │
│    ├─ Summary generation                │
│    ├─ Note type classification          │
│    ├─ Action item extraction            │
│    └─ Named entity extraction           │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 5. Chunking (src/chunking.ts)           │
│    ├─ Semantic boundary detection       │
│    ├─ Overlapping chunks (configurable) │
│    └─ Metadata inheritance              │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 6. Embedding Generation                  │
│    ├─ Batch embedding (up to 100)       │
│    └─ Cache population                  │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 7. Vector Index Update                   │
│    ├─ Vertex AI upsert (if enabled)     │
│    └─ Firestore chunk storage           │
└─────────────────────────────────────────┘
```

### Chat/RAG Flow
```
POST /chat { query, threadId?, filters? }
    │
    ▼
┌─────────────────────────────────────────┐
│ 1. Query Analysis                        │
│    ├─ Intent: factual/exploratory/...   │
│    ├─ Keywords: TF-IDF weighted         │
│    ├─ Entities: dates, names, IDs       │
│    └─ Temporal: "last week", "all time" │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 2. Action Detection (optional)           │
│    ├─ create_note, set_reminder         │
│    ├─ search_notes, summarize_period    │
│    └─ If action → execute & return      │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 3. Multi-Stage Retrieval                 │
│    ├─ Vector: Top-100 semantic matches  │
│    ├─ Lexical: Top-50 keyword matches   │
│    ├─ Recency: Top-30 recent chunks     │
│    └─ RRF Fusion → 200 candidates       │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 4. Reranking                             │
│    ├─ Cross-encoder scoring             │
│    ├─ MMR diversity (λ=0.7)             │
│    ├─ Coverage-aware filtering          │
│    └─ Final: 8-12 top chunks            │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 5. Context Building                      │
│    ├─ Adaptive K (query complexity)     │
│    ├─ Token budget management           │
│    ├─ Conversation history (if thread)  │
│    └─ Source pack construction          │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 6. LLM Generation (Streaming)            │
│    ├─ SSE: sources event                │
│    ├─ SSE: token stream                 │
│    └─ SSE: done event                   │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 7. Citation Verification                 │
│    ├─ Format validation                 │
│    ├─ Semantic confidence scoring       │
│    ├─ Claim anchoring verification      │
│    ├─ Contradiction detection           │
│    └─ Self-consistency (if enabled)     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 8. Response Enhancement                  │
│    ├─ Citation repair (if needed)       │
│    ├─ Format normalization              │
│    └─ Confidence score calculation      │
└─────────────────────────────────────────┘
    │
    ▼
Return ChatResponse {
  text, sources[], citations[], 
  confidence, meta
}
```

---

## Key Features Deep Dive

### 1. Hybrid Retrieval Architecture

The retrieval system combines multiple signals for optimal recall and precision:

```
┌─────────────────────────────────────────────────────────────┐
│                    Query                                     │
└─────────────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │ Vector  │    │ Lexical │    │ Recency │
    │ Search  │    │ Search  │    │ Scoring │
    │ (k=100) │    │ (k=50)  │    │ (k=30)  │
    └─────────┘    └─────────┘    └─────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Rank Fusion (RRF) │
              │   w_vec=0.5         │
              │   w_lex=0.3         │
              │   w_rec=0.2         │
              └─────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Cross-Encoder      │
              │  Reranking          │
              └─────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  MMR Diversity      │
              │  (λ=0.7)            │
              └─────────────────────┘
                         │
                         ▼
                   Top 8-12 Chunks
```

**Configuration:**
- `RETRIEVAL_VECTOR_TOP_K`: Initial vector candidates (default: 100)
- `RETRIEVAL_LEXICAL_TOP_K`: Lexical candidates (default: 50)
- `RETRIEVAL_RECENCY_TOP_K`: Recent candidates (default: 30)
- `SCORE_WEIGHT_VECTOR`: Vector weight in fusion (default: 0.5)
- `SCORE_WEIGHT_LEXICAL`: Lexical weight (default: 0.3)
- `SCORE_WEIGHT_RECENCY`: Recency weight (default: 0.2)

### 2. Citation Verification Pipeline

Multi-layer verification ensures citation accuracy:

```
Response with Citations [1][2][3]
         │
         ▼
┌─────────────────────────────────────┐
│ Layer 1: Format Validation          │
│  ├─ Valid bracket format [N]        │
│  ├─ ID exists in source list        │
│  └─ No duplicate citations          │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Layer 2: Semantic Confidence        │
│  ├─ Claim-source embedding distance │
│  ├─ Keyword overlap scoring         │
│  └─ Threshold: MIN_CITATION_SCORE   │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Layer 3: Claim Anchoring            │
│  ├─ Extract claims from response    │
│  ├─ Map claims → source chunks      │
│  └─ Verify claim support            │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Layer 4: Contradiction Detection    │
│  ├─ Check for semantic conflicts    │
│  └─ Flag contradictory sources      │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Layer 5: Self-Consistency (optional)│
│  ├─ Generate N response samples     │
│  ├─ Compare citation patterns       │
│  └─ Select most consistent          │
└─────────────────────────────────────┘
         │
         ▼
Verified Response with Confidence Scores
```

### 3. Agentic Capabilities

The action executor enables AI-driven operations:

| Action | Description | Trigger Examples |
|--------|-------------|------------------|
| `create_note` | Create new note from conversation | "Save this as a note" |
| `set_reminder` | Schedule reminder | "Remind me about X tomorrow" |
| `search_notes` | Filtered search | "Find all notes about Y" |
| `summarize_period` | Time-based summary | "What happened last week?" |
| `list_action_items` | Extract todos | "What are my action items?" |
| `append_to_note` | Add to existing note | "Add this to my project note" |
| `tag_note` | Add tags | "Tag this with #important" |
| `summarize_note` | Summarize specific note | "Summarize my meeting notes" |

### 4. Voice Transcription

Audio-to-text with structured extraction:

```
Audio File (MP3/WAV/etc.)
         │
         ▼
┌─────────────────────────────────────┐
│ Gemini Transcription                │
│  ├─ Speech-to-text                  │
│  ├─ Speaker diarization (optional)  │
│  └─ Timestamp alignment             │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Post-Processing                      │
│  ├─ Action item extraction          │
│  ├─ Key points summary              │
│  └─ Named entity recognition        │
└─────────────────────────────────────┘
         │
         ▼
TranscriptionResult {
  text, segments[], actionItems[], 
  keyPoints[], entities[]
}
```

---

## Configuration Reference

### Core Settings
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server port |
| `PROJECT_ID` | - | GCP project ID |
| `GOOGLE_API_KEY` | - | Gemini API key |

### Chat & LLM
| Variable | Default | Description |
|----------|---------|-------------|
| `CHAT_MODEL` | gemini-2.0-flash | LLM model |
| `CHAT_TEMPERATURE` | 0.3 | Response creativity |
| `CHAT_TIMEOUT_MS` | 30000 | Generation timeout |
| `LLM_MAX_OUTPUT_TOKENS` | 2048 | Max response length |
| `LLM_CONTEXT_BUDGET_CHARS` | 32000 | Context window budget |

### Retrieval
| Variable | Default | Description |
|----------|---------|-------------|
| `RETRIEVAL_TOP_K` | 30 | Initial candidates |
| `RETRIEVAL_RERANK_TO` | 8 | Final results after reranking |
| `RETRIEVAL_VECTOR_TOP_K` | 100 | Vector search candidates |
| `RETRIEVAL_LEXICAL_TOP_K` | 50 | Lexical search candidates |
| `VECTOR_SEARCH_ENABLED` | true | Enable vector search |
| `RERANKING_ENABLED` | true | Enable cross-encoder reranking |
| `CROSS_ENCODER_ENABLED` | true | Use cross-encoder vs LLM reranker |

### Citation Quality
| Variable | Default | Description |
|----------|---------|-------------|
| `CITATION_VERIFICATION_ENABLED` | true | Enable citation pipeline |
| `CITATION_RETRY_ENABLED` | true | Retry on citation failures |
| `CITATION_MIN_OVERLAP_SCORE` | 0.3 | Minimum citation confidence |

### Features
| Variable | Default | Description |
|----------|---------|-------------|
| `STREAMING_ENABLED` | true | Enable SSE streaming |
| `RATE_LIMIT_ENABLED` | false | Enable rate limiting |
| `USER_AUTH_ENABLED` | true | Require Firebase auth |

---

## Performance Characteristics

### Latency Targets
| Operation | P50 | P99 |
|-----------|-----|-----|
| Note creation | 200ms | 500ms |
| Chat (streaming first token) | 800ms | 2s |
| Chat (full response) | 2s | 5s |
| Search | 100ms | 300ms |
| Transcription | 3s | 10s |

### Scale Targets
- **Notes**: 100k+ per tenant
- **Chunks**: Millions total
- **Concurrent users**: 1000+
- **Requests/second**: 100+

### Caching Strategy
```
┌─────────────────────────────────────┐
│ Layer 1: In-Memory (src/cache.ts)   │
│  ├─ Embedding cache (TTL: 1h)       │
│  ├─ Query expansion cache (TTL: 5m) │
│  └─ Retrieval cache (TTL: 1m)       │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ Layer 2: Firestore                   │
│  ├─ Chunk embeddings (persistent)   │
│  └─ Note metadata (persistent)      │
└─────────────────────────────────────┘
```

---

## Security Model

### Authentication
- **User Auth**: Firebase JWT validation
- **Internal Auth**: OIDC tokens for service-to-service
- **API Keys**: Optional for programmatic access

### Authorization
- **Tenant Isolation**: All data scoped by `tenantId = user.uid`
- **Rate Limiting**: Per-IP and per-user limits
- **Input Validation**: Zod schemas on all endpoints

### Data Protection
- **No PII in Logs**: Sensitive data redacted
- **Encryption**: TLS in transit, at-rest via Firestore
- **Secrets**: Environment variables, not in code

---

## Testing

### Test Files
| File | Coverage |
|------|----------|
| `cache.test.ts` | Cache TTL, eviction |
| `citationValidator.test.ts` | Citation format validation |
| `unifiedCitationPipeline.test.ts` | E2E citation verification |
| `transcription.test.ts` | Audio transcription |
| `utils.test.ts` | Utility functions |

### Running Tests
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run validate      # Typecheck + tests
```

---

## Deployment

### Docker
```bash
docker build -t auroranotes-api .
docker run -p 8080:8080 \
  -e GOOGLE_API_KEY=xxx \
  -e PROJECT_ID=xxx \
  auroranotes-api
```

### Cloud Run
```bash
gcloud run deploy auroranotes-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### Health Checks
- `GET /health` - Basic liveness (always 200)
- `GET /ready` - Readiness with dependency checks

---

## Observability

### Structured Logging
All modules use structured JSON logging:
```json
{
  "timestamp": "2025-12-23T10:00:00Z",
  "level": "info",
  "requestId": "abc-123",
  "module": "retrieval",
  "message": "Retrieved 8 chunks",
  "latencyMs": 245,
  "candidateCounts": { "vector": 100, "lexical": 45, "recency": 30 }
}
```

### Metrics (via retrievalLogger)
- Query analysis latency
- Retrieval stage timings
- Reranking performance
- Citation verification stats
- Token usage

---

## Future Enhancements

1. **Hybrid Search v2**: ColBERT-style late interaction
2. **Adaptive Chunking**: LLM-based semantic boundaries
3. **Feedback Loop**: User feedback → retrieval tuning
4. **Multi-Modal**: Image/PDF content extraction
5. **Collaborative**: Shared notes and threads
