# AuroraNotes Backend - Architecture Overview

**Last Updated:** December 2025

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Express API Server                          │
│                      (src/index.ts)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   ┌─────────┐          ┌──────────┐          ┌──────────┐
   │  Notes  │          │  Chat    │          │ Feedback │
   │  CRUD   │          │  Service │          │ Endpoint │
   └─────────┘          └──────────┘          └──────────┘
        │                     │
        ▼                     ▼
   ┌─────────────────────────────────────────────────────────┐
   │         RAG Pipeline (src/chat.ts)                      │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ 1. Query Analysis (src/query.ts)                │   │
   │  │    - Intent detection                           │   │
   │  │    - Keyword extraction                         │   │
   │  │    - Entity recognition                         │   │
   │  └──────────────────────────────────────────────────┘   │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ 2. Multi-Stage Retrieval (src/retrieval.ts)     │   │
   │  │    ├─ Vector Search (src/vectorIndex.ts)        │   │
   │  │    ├─ Lexical Search (Firestore)                │   │
   │  │    ├─ Recency Scoring                           │   │
   │  │    └─ Rank Fusion (src/rankFusion.ts)           │   │
   │  └──────────────────────────────────────────────────┘   │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ 3. Reranking (src/reranker.ts)                  │   │
   │  │    ├─ Cross-Encoder (src/crossEncoder.ts)       │   │
   │  │    └─ MMR Diversity                             │   │
   │  └──────────────────────────────────────────────────┘   │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ 4. LLM Generation (src/genaiClient.ts)          │   │
   │  │    ├─ Enhanced Prompts (src/enhancedPrompts.ts) │   │
   │  │    └─ Streaming (src/streaming.ts)              │   │
   │  └──────────────────────────────────────────────────┘   │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ 5. Citation Verification Pipeline               │   │
   │  │    ├─ Validation (src/citationValidator.ts)     │   │
   │  │    ├─ Confidence (src/citationConfidence.ts)    │   │
   │  │    ├─ Grounding (src/citationGrounding.ts)      │   │
   │  │    ├─ Claim Anchoring (src/claimAnchoring.ts)   │   │
   │  │    └─ Unified Pipeline                          │   │
   │  │        (src/unifiedCitationPipeline.ts)         │   │
   │  └──────────────────────────────────────────────────┘   │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ 6. Response Enhancement                         │   │
   │  │    ├─ Post-Processing                           │   │
   │  │    │  (src/responsePostProcessor.ts)            │   │
   │  │    ├─ Validation & Repair                       │   │
   │  │    │  (src/responseValidation.ts)               │   │
   │  │    ├─ Confidence Calculation                    │   │
   │  │    │  (src/responseConfidence.ts)               │   │
   │  │    └─ Self-Consistency                          │   │
   │  │       (src/selfConsistency.ts)                  │   │
   │  └──────────────────────────────────────────────────┘   │
   └─────────────────────────────────────────────────────────┘
        │
        ▼
   ┌─────────────────────────────────────────────────────────┐
   │              Data Layer                                 │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ Firestore (src/firestore.ts)                    │   │
   │  │  - Notes Collection                             │   │
   │  │  - Chunks Collection                            │   │
   │  │  - Feedback Collection                          │   │
   │  └──────────────────────────────────────────────────┘   │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ Vector Search                                   │   │
   │  │  - Vertex AI (Primary)                          │   │
   │  │  - Firestore Fallback                           │   │
   │  └──────────────────────────────────────────────────┘   │
   │  ┌──────────────────────────────────────────────────┐   │
   │  │ Embeddings (src/embeddings.ts)                  │   │
   │  │  - Generation (Google Generative AI)            │   │
   │  │  - Caching (src/embeddingCache.ts)              │   │
   │  └──────────────────────────────────────────────────┘   │
   └─────────────────────────────────────────────────────────┘
```

## Module Organization

### Core Modules (Foundation)
- **config.ts** - Centralized configuration management
- **types.ts** - Shared TypeScript interfaces
- **schemas.ts** - Zod validation schemas
- **errors.ts** - Custom error classes
- **utils.ts** - Utility functions and logging
- **firestore.ts** - Database client

### Data Processing
- **notes.ts** - Note CRUD operations
- **chunking.ts** - Text chunking for semantic search
- **embeddings.ts** - Embedding generation
- **embeddingCache.ts** - Embedding caching layer

### Search & Retrieval
- **query.ts** - Query analysis and intent detection
- **retrieval.ts** - Multi-stage retrieval orchestration
- **vectorIndex.ts** - Vector search abstraction (Vertex + Firestore)
- **queryExpansion.ts** - Query expansion for better recall
- **rankFusion.ts** - Reciprocal rank fusion (RRF)
- **reranker.ts** - Reranking orchestration
- **crossEncoder.ts** - Cross-encoder reranking

### Response Generation
- **genaiClient.ts** - Google Generative AI client
- **chat.ts** - Main RAG pipeline orchestration
- **streaming.ts** - Server-Sent Events (SSE) streaming
- **enhancedPrompts.ts** - Enhanced prompt engineering

### Citation & Quality Assurance
- **citationValidator.ts** - Citation validation and formatting
- **citationConfidence.ts** - Citation confidence scoring
- **citationGrounding.ts** - Citation grounding verification
- **sourceAttribution.ts** - Source attribution analysis
- **unifiedCitationPipeline.ts** - Unified citation verification
- **claimExtraction.ts** - Claim extraction and analysis
- **claimAnchoring.ts** - Claim-level citation anchoring
- **selfConsistency.ts** - Self-consistency verification

### Response Enhancement
- **responsePostProcessor.ts** - Response formatting and cleanup
- **responseConfidence.ts** - Response confidence calculation
- **responseValidation.ts** - Response validation and repair

### Infrastructure
- **index.ts** - Express server and route handlers
- **cache.ts** - TTL-based in-memory cache
- **rateLimit.ts** - Rate limiting middleware
- **internalAuth.ts** - Internal endpoint OIDC authentication
- **queue.ts** - Background task queue
- **threads.ts** - Conversation thread management
- **retrievalLogger.ts** - Structured retrieval logging
- **contractTests.ts** - Response contract validation

## Data Flow

### Note Creation Flow
```
POST /notes
    ↓
notes.ts: createNote()
    ↓
Firestore: Save note document
    ↓
queue.ts: Enqueue processing task
    ↓
chunking.ts: Split into chunks
    ↓
embeddings.ts: Generate embeddings
    ↓
vectorIndex.ts: Index in vector search
    ↓
Firestore: Save chunks with embeddings
```

### Chat/Search Flow
```
POST /chat
    ↓
query.ts: analyzeQuery()
    ├─ Intent detection
    ├─ Keyword extraction
    └─ Entity recognition
    ↓
retrieval.ts: retrieveRelevantChunks()
    ├─ vectorIndex.ts: Vector search
    ├─ Firestore: Lexical search
    ├─ rankFusion.ts: Merge results
    └─ reranker.ts: Rerank candidates
    ↓
enhancedPrompts.ts: buildPrompt()
    ↓
genaiClient.ts: generateContentStream()
    ↓
streaming.ts: streamChatResponse()
    ├─ Send sources event
    ├─ Stream tokens
    └─ Send done event
    ↓
unifiedCitationPipeline.ts: Verify citations
    ├─ citationValidator.ts: Format validation
    ├─ citationConfidence.ts: Confidence scoring
    ├─ claimAnchoring.ts: Claim verification
    └─ selfConsistency.ts: Consistency check
    ↓
responseValidation.ts: Validate & repair
    ↓
Return ChatResponse
```

## Key Features

### 1. Multi-Stage Retrieval
- Vector search (semantic similarity)
- Lexical search (exact match)
- Recency scoring (temporal relevance)
- Rank fusion (combining multiple signals)
- Cross-encoder reranking (final ranking)

### 2. Citation Accuracy
- Citation validation (format and overlap)
- Confidence scoring (semantic match quality)
- Claim anchoring (fine-grained verification)
- Contradiction detection (semantic conflicts)
- Self-consistency (multi-sample verification)

### 3. Response Quality
- Enhanced prompt engineering
- Response post-processing
- Validation and repair
- Confidence calculation
- Streaming for better UX

### 4. Scalability
- Vertex AI vector search (100k+ scale)
- Firestore fallback (cost-effective)
- In-memory caching (performance)
- Rate limiting (protection)
- Background queue (async processing)

## Configuration

All configuration is centralized in `config.ts` and loaded from environment variables:

### Key Settings
- `CHAT_MODEL` - LLM model (default: gemini-2.0-flash)
- `RETRIEVAL_TOP_K` - Initial candidates (default: 30)
- `RETRIEVAL_RERANK_TO` - Final results (default: 8)
- `MAX_CHUNKS_IN_CONTEXT` - Context limit (default: 12)
- `VECTOR_SEARCH_ENABLED` - Enable vector search (default: true)
- `STREAMING_ENABLED` - Enable SSE streaming (default: true)
- `RATE_LIMIT_ENABLED` - Enable rate limiting (default: false)

## Error Handling

All modules implement comprehensive error handling:
- Validation errors (400)
- Not found errors (404)
- Rate limit errors (429)
- Service unavailable (503)
- Internal errors (500)

## Logging

Structured logging throughout:
- Request correlation IDs
- Performance metrics
- Error tracking
- Quality metrics
- Debug information

## Testing

Test files:
- `cache.test.ts` - Cache functionality
- `citationValidator.test.ts` - Citation validation
- `unifiedCitationPipeline.test.ts` - Citation pipeline tests
- `utils.test.ts` - Utility functions

## Performance Optimizations

1. **Caching**
   - Embedding cache (TTL-based)
   - Query expansion cache
   - In-memory chunk cache

2. **Batching**
   - Batch embedding generation
   - Batch citation scoring

3. **Streaming**
   - SSE for real-time responses
   - Token-by-token generation

4. **Indexing**
   - Vector search (semantic)
   - Lexical indexing (exact match)
   - Recency scoring

5. **Reranking**
   - Cross-encoder reranking
   - Maximal Marginal Relevance (MMR)
   - Rank fusion

## Security

- OIDC authentication for internal endpoints
- Rate limiting per IP
- Input validation and sanitization
- Tenant isolation (multi-tenancy)
- No sensitive data in logs

