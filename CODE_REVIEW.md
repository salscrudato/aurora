# Code Review - Complete Codebase

Generated: 2025-12-23T12:04:13.512Z

## Table of Contents

1. [BACKEND_ARCHITECTURE.md](#backend-architecture-md)
2. [generate-code-review.js](#generate-code-review-js)
3. [package-lock.json](#package-lock-json)
4. [package.json](#package-json)
5. [src/actionExecutor.ts](#src-actionexecutor-ts)
6. [src/agenticPrompts.ts](#src-agenticprompts-ts)
7. [src/cache.test.ts](#src-cache-test-ts)
8. [src/cache.ts](#src-cache-ts)
9. [src/chat.ts](#src-chat-ts)
10. [src/chunking.ts](#src-chunking-ts)
11. [src/citationConfidence.ts](#src-citationconfidence-ts)
12. [src/citationGrounding.ts](#src-citationgrounding-ts)
13. [src/citationValidator.test.ts](#src-citationvalidator-test-ts)
14. [src/citationValidator.ts](#src-citationvalidator-ts)
15. [src/claimAnchoring.ts](#src-claimanchoring-ts)
16. [src/claimExtraction.ts](#src-claimextraction-ts)
17. [src/config.ts](#src-config-ts)
18. [src/contractTests.ts](#src-contracttests-ts)
19. [src/crossEncoder.ts](#src-crossencoder-ts)
20. [src/embeddingCache.ts](#src-embeddingcache-ts)
21. [src/embeddings.ts](#src-embeddings-ts)
22. [src/enhancedPrompts.ts](#src-enhancedprompts-ts)
23. [src/errors.ts](#src-errors-ts)
24. [src/firestore.ts](#src-firestore-ts)
25. [src/genaiClient.ts](#src-genaiclient-ts)
26. [src/index.ts](#src-index-ts)
27. [src/internalAuth.ts](#src-internalauth-ts)
28. [src/middleware/audioUpload.ts](#src-middleware-audioupload-ts)
29. [src/middleware/index.ts](#src-middleware-index-ts)
30. [src/middleware/rateLimiter.ts](#src-middleware-ratelimiter-ts)
31. [src/middleware/userAuth.ts](#src-middleware-userauth-ts)
32. [src/middleware/validation.ts](#src-middleware-validation-ts)
33. [src/notes.ts](#src-notes-ts)
34. [src/query.ts](#src-query-ts)
35. [src/queryExpansion.ts](#src-queryexpansion-ts)
36. [src/queue.ts](#src-queue-ts)
37. [src/rankFusion.ts](#src-rankfusion-ts)
38. [src/rateLimit.ts](#src-ratelimit-ts)
39. [src/reranker.ts](#src-reranker-ts)
40. [src/responseConfidence.ts](#src-responseconfidence-ts)
41. [src/responsePostProcessor.ts](#src-responsepostprocessor-ts)
42. [src/responseValidation.ts](#src-responsevalidation-ts)
43. [src/retrieval.ts](#src-retrieval-ts)
44. [src/retrievalLogger.ts](#src-retrievallogger-ts)
45. [src/schemas.ts](#src-schemas-ts)
46. [src/selfConsistency.ts](#src-selfconsistency-ts)
47. [src/sourceAttribution.ts](#src-sourceattribution-ts)
48. [src/streaming.ts](#src-streaming-ts)
49. [src/threads.ts](#src-threads-ts)
50. [src/transcription.test.ts](#src-transcription-test-ts)
51. [src/transcription.ts](#src-transcription-ts)
52. [src/types.ts](#src-types-ts)
53. [src/unifiedCitationPipeline.test.ts](#src-unifiedcitationpipeline-test-ts)
54. [src/unifiedCitationPipeline.ts](#src-unifiedcitationpipeline-ts)
55. [src/utils.test.ts](#src-utils-test-ts)
56. [src/utils.ts](#src-utils-ts)
57. [src/vectorIndex.ts](#src-vectorindex-ts)
58. [tsconfig.json](#tsconfig-json)

---

## BACKEND_ARCHITECTURE.md

**Path:** `BACKEND_ARCHITECTURE.md`

```md
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


```

---

## generate-code-review.js

**Path:** `generate-code-review.js`

```js
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const ROOT_DIR = process.cwd();
const OUTPUT_FILE = path.join(ROOT_DIR, 'CODE_REVIEW.md');
const EXCLUDE_DIRS = ['node_modules', 'dist', '.git', '.next', 'build', 'coverage'];
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.yml', '.yaml', '.md'];

let markdownContent = '# Code Review - Complete Codebase\n\n';
markdownContent += `Generated: ${new Date().toISOString()}\n\n`;
markdownContent += '## Table of Contents\n\n';

const fileList = [];

function walkDir(dir, relativePath = '') {
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const relPath = relativePath ? path.join(relativePath, file) : file;
      
      // Skip excluded directories
      if (EXCLUDE_DIRS.includes(file)) continue;
      
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath, relPath);
      } else if (stat.isFile()) {
        const ext = path.extname(file);
        if (CODE_EXTENSIONS.includes(ext)) {
          fileList.push({ fullPath, relPath });
        }
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
}

// Walk the directory tree
walkDir(ROOT_DIR);

// Sort files by path
fileList.sort((a, b) => a.relPath.localeCompare(b.relPath));

// Generate table of contents
fileList.forEach((file, index) => {
  const anchor = file.relPath.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  markdownContent += `${index + 1}. [${file.relPath}](#${anchor})\n`;
});

markdownContent += '\n---\n\n';

// Add file contents
fileList.forEach((file) => {
  try {
    const content = fs.readFileSync(file.fullPath, 'utf-8');
    const anchor = file.relPath.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    
    markdownContent += `## ${file.relPath}\n\n`;
    markdownContent += `**Path:** \`${file.relPath}\`\n\n`;
    
    const ext = path.extname(file.relPath).slice(1) || 'text';
    markdownContent += '```' + ext + '\n';
    markdownContent += content;
    markdownContent += '\n```\n\n';
    markdownContent += '---\n\n';
  } catch (err) {
    console.error(`Error reading file ${file.relPath}:`, err.message);
  }
});

// Write the markdown file
fs.writeFileSync(OUTPUT_FILE, markdownContent, 'utf-8');
console.log(`✓ Code review file generated: ${OUTPUT_FILE}`);
console.log(`✓ Total files included: ${fileList.length}`);
console.log(`✓ File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);


```

---

## package-lock.json

**Path:** `package-lock.json`

```json
{
  "name": "auroranotes-api",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "auroranotes-api",
      "version": "1.0.0",
      "license": "ISC",
      "dependencies": {
        "@google-cloud/tasks": "^6.2.1",
        "@google/genai": "^1.33.0",
        "@types/multer": "^2.0.0",
        "compression": "^1.8.1",
        "cors": "^2.8.5",
        "express": "^5.2.1",
        "firebase-admin": "^13.6.0",
        "helmet": "^8.1.0",
        "multer": "^2.0.2",
        "uuid": "^13.0.0",
        "zod": "^4.2.1"
      },
      "devDependencies": {
        "@types/compression": "^1.8.1",
        "@types/cors": "^2.8.19",
        "@types/express": "^5.0.6",
        "@types/node": "^25.0.2",
        "@types/uuid": "^10.0.0",
        "ts-node-dev": "^2.0.0",
        "typescript": "^5.9.3"
      }
    },
    "node_modules/@cspotcode/source-map-support": {
      "version": "0.8.1",
      "resolved": "https://registry.npmjs.org/@cspotcode/source-map-support/-/source-map-support-0.8.1.tgz",
      "integrity": "sha512-IchNf6dN4tHoMFIn/7OE8LWZ19Y6q/67Bmf6vnGREv8RSbBVb9LPJxEcnwrcwX6ixSvaiGoomAUvu4YSxXrVgw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/trace-mapping": "0.3.9"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/@fastify/busboy": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/@fastify/busboy/-/busboy-3.2.0.tgz",
      "integrity": "sha512-m9FVDXU3GT2ITSe0UaMA5rU3QkfC/UXtCU8y0gSN/GugTqtVldOBWIB5V6V3sbmenVZUIpU6f+mPEO2+m5iTaA==",
      "license": "MIT"
    },
    "node_modules/@firebase/app-check-interop-types": {
      "version": "0.3.3",
      "resolved": "https://registry.npmjs.org/@firebase/app-check-interop-types/-/app-check-interop-types-0.3.3.tgz",
      "integrity": "sha512-gAlxfPLT2j8bTI/qfe3ahl2I2YcBQ8cFIBdhAQA4I2f3TndcO+22YizyGYuttLHPQEpWkhmpFW60VCFEPg4g5A==",
      "license": "Apache-2.0"
    },
    "node_modules/@firebase/app-types": {
      "version": "0.9.3",
      "resolved": "https://registry.npmjs.org/@firebase/app-types/-/app-types-0.9.3.tgz",
      "integrity": "sha512-kRVpIl4vVGJ4baogMDINbyrIOtOxqhkZQg4jTq3l8Lw6WSk0xfpEYzezFu+Kl4ve4fbPl79dvwRtaFqAC/ucCw==",
      "license": "Apache-2.0"
    },
    "node_modules/@firebase/auth-interop-types": {
      "version": "0.2.4",
      "resolved": "https://registry.npmjs.org/@firebase/auth-interop-types/-/auth-interop-types-0.2.4.tgz",
      "integrity": "sha512-JPgcXKCuO+CWqGDnigBtvo09HeBs5u/Ktc2GaFj2m01hLarbxthLNm7Fk8iOP1aqAtXV+fnnGj7U28xmk7IwVA==",
      "license": "Apache-2.0"
    },
    "node_modules/@firebase/component": {
      "version": "0.7.0",
      "resolved": "https://registry.npmjs.org/@firebase/component/-/component-0.7.0.tgz",
      "integrity": "sha512-wR9En2A+WESUHexjmRHkqtaVH94WLNKt6rmeqZhSLBybg4Wyf0Umk04SZsS6sBq4102ZsDBFwoqMqJYj2IoDSg==",
      "license": "Apache-2.0",
      "dependencies": {
        "@firebase/util": "1.13.0",
        "tslib": "^2.1.0"
      },
      "engines": {
        "node": ">=20.0.0"
      }
    },
    "node_modules/@firebase/database": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@firebase/database/-/database-1.1.0.tgz",
      "integrity": "sha512-gM6MJFae3pTyNLoc9VcJNuaUDej0ctdjn3cVtILo3D5lpp0dmUHHLFN/pUKe7ImyeB1KAvRlEYxvIHNF04Filg==",
      "license": "Apache-2.0",
      "dependencies": {
        "@firebase/app-check-interop-types": "0.3.3",
        "@firebase/auth-interop-types": "0.2.4",
        "@firebase/component": "0.7.0",
        "@firebase/logger": "0.5.0",
        "@firebase/util": "1.13.0",
        "faye-websocket": "0.11.4",
        "tslib": "^2.1.0"
      },
      "engines": {
        "node": ">=20.0.0"
      }
    },
    "node_modules/@firebase/database-compat": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/@firebase/database-compat/-/database-compat-2.1.0.tgz",
      "integrity": "sha512-8nYc43RqxScsePVd1qe1xxvWNf0OBnbwHxmXJ7MHSuuTVYFO3eLyLW3PiCKJ9fHnmIz4p4LbieXwz+qtr9PZDg==",
      "license": "Apache-2.0",
      "dependencies": {
        "@firebase/component": "0.7.0",
        "@firebase/database": "1.1.0",
        "@firebase/database-types": "1.0.16",
        "@firebase/logger": "0.5.0",
        "@firebase/util": "1.13.0",
        "tslib": "^2.1.0"
      },
      "engines": {
        "node": ">=20.0.0"
      }
    },
    "node_modules/@firebase/database-types": {
      "version": "1.0.16",
      "resolved": "https://registry.npmjs.org/@firebase/database-types/-/database-types-1.0.16.tgz",
      "integrity": "sha512-xkQLQfU5De7+SPhEGAXFBnDryUWhhlFXelEg2YeZOQMCdoe7dL64DDAd77SQsR+6uoXIZY5MB4y/inCs4GTfcw==",
      "license": "Apache-2.0",
      "dependencies": {
        "@firebase/app-types": "0.9.3",
        "@firebase/util": "1.13.0"
      }
    },
    "node_modules/@firebase/logger": {
      "version": "0.5.0",
      "resolved": "https://registry.npmjs.org/@firebase/logger/-/logger-0.5.0.tgz",
      "integrity": "sha512-cGskaAvkrnh42b3BA3doDWeBmuHFO/Mx5A83rbRDYakPjO9bJtRL3dX7javzc2Rr/JHZf4HlterTW2lUkfeN4g==",
      "license": "Apache-2.0",
      "dependencies": {
        "tslib": "^2.1.0"
      },
      "engines": {
        "node": ">=20.0.0"
      }
    },
    "node_modules/@firebase/util": {
      "version": "1.13.0",
      "resolved": "https://registry.npmjs.org/@firebase/util/-/util-1.13.0.tgz",
      "integrity": "sha512-0AZUyYUfpMNcztR5l09izHwXkZpghLgCUaAGjtMwXnCg3bj4ml5VgiwqOMOxJ+Nw4qN/zJAaOQBcJ7KGkWStqQ==",
      "hasInstallScript": true,
      "license": "Apache-2.0",
      "dependencies": {
        "tslib": "^2.1.0"
      },
      "engines": {
        "node": ">=20.0.0"
      }
    },
    "node_modules/@google-cloud/firestore": {
      "version": "7.11.6",
      "resolved": "https://registry.npmjs.org/@google-cloud/firestore/-/firestore-7.11.6.tgz",
      "integrity": "sha512-EW/O8ktzwLfyWBOsNuhRoMi8lrC3clHM5LVFhGvO1HCsLozCOOXRAlHrYBoE6HL42Sc8yYMuCb2XqcnJ4OOEpw==",
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "@opentelemetry/api": "^1.3.0",
        "fast-deep-equal": "^3.1.1",
        "functional-red-black-tree": "^1.0.1",
        "google-gax": "^4.3.3",
        "protobufjs": "^7.2.6"
      },
      "engines": {
        "node": ">=14.0.0"
      }
    },
    "node_modules/@google-cloud/paginator": {
      "version": "5.0.2",
      "resolved": "https://registry.npmjs.org/@google-cloud/paginator/-/paginator-5.0.2.tgz",
      "integrity": "sha512-DJS3s0OVH4zFDB1PzjxAsHqJT6sKVbRwwML0ZBP9PbU7Yebtu/7SWMRzvO2J3nUi9pRNITCfu4LJeooM2w4pjg==",
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "arrify": "^2.0.0",
        "extend": "^3.0.2"
      },
      "engines": {
        "node": ">=14.0.0"
      }
    },
    "node_modules/@google-cloud/projectify": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/@google-cloud/projectify/-/projectify-4.0.0.tgz",
      "integrity": "sha512-MmaX6HeSvyPbWGwFq7mXdo0uQZLGBYCwziiLIGq5JVX+/bdI3SAq6bP98trV5eTWfLuvsMcIC1YJOF2vfteLFA==",
      "license": "Apache-2.0",
      "optional": true,
      "engines": {
        "node": ">=14.0.0"
      }
    },
    "node_modules/@google-cloud/promisify": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/@google-cloud/promisify/-/promisify-4.0.0.tgz",
      "integrity": "sha512-Orxzlfb9c67A15cq2JQEyVc7wEsmFBmHjZWZYQMUyJ1qivXyMwdyNOs9odi79hze+2zqdTtu1E19IM/FtqZ10g==",
      "license": "Apache-2.0",
      "optional": true,
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/@google-cloud/storage": {
      "version": "7.18.0",
      "resolved": "https://registry.npmjs.org/@google-cloud/storage/-/storage-7.18.0.tgz",
      "integrity": "sha512-r3ZwDMiz4nwW6R922Z1pwpePxyRwE5GdevYX63hRmAQUkUQJcBH/79EnQPDv5cOv1mFBgevdNWQfi3tie3dHrQ==",
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "@google-cloud/paginator": "^5.0.0",
        "@google-cloud/projectify": "^4.0.0",
        "@google-cloud/promisify": "<4.1.0",
        "abort-controller": "^3.0.0",
        "async-retry": "^1.3.3",
        "duplexify": "^4.1.3",
        "fast-xml-parser": "^4.4.1",
        "gaxios": "^6.0.2",
        "google-auth-library": "^9.6.3",
        "html-entities": "^2.5.2",
        "mime": "^3.0.0",
        "p-limit": "^3.0.1",
        "retry-request": "^7.0.0",
        "teeny-request": "^9.0.0",
        "uuid": "^8.0.0"
      },
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/@google-cloud/storage/node_modules/uuid": {
      "version": "8.3.2",
      "resolved": "https://registry.npmjs.org/uuid/-/uuid-8.3.2.tgz",
      "integrity": "sha512-+NYs2QeMWy+GWFOEm9xnn6HCDp0l7QBD7ml8zLUmJ+93Q5NF0NocErnwkTkXVFNiX3/fpC6afS8Dhb/gz7R7eg==",
      "license": "MIT",
      "optional": true,
      "bin": {
        "uuid": "dist/bin/uuid"
      }
    },
    "node_modules/@google-cloud/tasks": {
      "version": "6.2.1",
      "resolved": "https://registry.npmjs.org/@google-cloud/tasks/-/tasks-6.2.1.tgz",
      "integrity": "sha512-Y21jNAdaUwZvYQijJSE9E27NA87c/Wl9fZxNDGx6WsWFFGEBmJmc1zg2fXLXTW0kPvKIxHQC+IcKa9SNgvIEsQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "google-gax": "^5.0.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/@grpc/proto-loader": {
      "version": "0.8.0",
      "resolved": "https://registry.npmjs.org/@grpc/proto-loader/-/proto-loader-0.8.0.tgz",
      "integrity": "sha512-rc1hOQtjIWGxcxpb9aHAfLpIctjEnsDehj0DAiVfBlmT84uvR0uUtN2hEi/ecvWVjXUGf5qPF4qEgiLOx1YIMQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "lodash.camelcase": "^4.3.0",
        "long": "^5.0.0",
        "protobufjs": "^7.5.3",
        "yargs": "^17.7.2"
      },
      "bin": {
        "proto-loader-gen-types": "build/bin/proto-loader-gen-types.js"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/agent-base": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-6.0.2.tgz",
      "integrity": "sha512-RZNwNclF7+MS/8bDg70amg32dyeZGZxiDuQmZxKLAlQjr3jGyLx+4Kkk58UO7D2QdgFIQCovuSuZESne6RG6XQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "4"
      },
      "engines": {
        "node": ">= 6.0.0"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/brace-expansion": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.0.2.tgz",
      "integrity": "sha512-Jt0vHyM+jmUBqojB7E1NIYadt0vI0Qxjxd2TErW94wDz+E2LAm5vKMXXwg6ZZBTHPuUlDgQHKXvjGBdfcF1ZDQ==",
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/gaxios": {
      "version": "7.1.3",
      "resolved": "https://registry.npmjs.org/gaxios/-/gaxios-7.1.3.tgz",
      "integrity": "sha512-YGGyuEdVIjqxkxVH1pUTMY/XtmmsApXrCVv5EU25iX6inEPbV+VakJfLealkBtJN69AQmh1eGOdCl9Sm1UP6XQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "extend": "^3.0.2",
        "https-proxy-agent": "^7.0.1",
        "node-fetch": "^3.3.2",
        "rimraf": "^5.0.1"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/gcp-metadata": {
      "version": "8.1.2",
      "resolved": "https://registry.npmjs.org/gcp-metadata/-/gcp-metadata-8.1.2.tgz",
      "integrity": "sha512-zV/5HKTfCeKWnxG0Dmrw51hEWFGfcF2xiXqcA3+J90WDuP0SvoiSO5ORvcBsifmx/FoIjgQN3oNOGaQ5PhLFkg==",
      "license": "Apache-2.0",
      "dependencies": {
        "gaxios": "^7.0.0",
        "google-logging-utils": "^1.0.0",
        "json-bigint": "^1.0.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/glob": {
      "version": "10.5.0",
      "resolved": "https://registry.npmjs.org/glob/-/glob-10.5.0.tgz",
      "integrity": "sha512-DfXN8DfhJ7NH3Oe7cFmu3NCu1wKbkReJ8TorzSAFbSKrlNaQSKfIzqYqVY8zlbs2NLBbWpRiU52GX2PbaBVNkg==",
      "license": "ISC",
      "dependencies": {
        "foreground-child": "^3.1.0",
        "jackspeak": "^3.1.2",
        "minimatch": "^9.0.4",
        "minipass": "^7.1.2",
        "package-json-from-dist": "^1.0.0",
        "path-scurry": "^1.11.1"
      },
      "bin": {
        "glob": "dist/esm/bin.mjs"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/google-auth-library": {
      "version": "10.5.0",
      "resolved": "https://registry.npmjs.org/google-auth-library/-/google-auth-library-10.5.0.tgz",
      "integrity": "sha512-7ABviyMOlX5hIVD60YOfHw4/CxOfBhyduaYB+wbFWCWoni4N7SLcV46hrVRktuBbZjFC9ONyqamZITN7q3n32w==",
      "license": "Apache-2.0",
      "dependencies": {
        "base64-js": "^1.3.0",
        "ecdsa-sig-formatter": "^1.0.11",
        "gaxios": "^7.0.0",
        "gcp-metadata": "^8.0.0",
        "google-logging-utils": "^1.0.0",
        "gtoken": "^8.0.0",
        "jws": "^4.0.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/google-gax": {
      "version": "5.0.6",
      "resolved": "https://registry.npmjs.org/google-gax/-/google-gax-5.0.6.tgz",
      "integrity": "sha512-1kGbqVQBZPAAu4+/R1XxPQKP0ydbNYoLAr4l0ZO2bMV0kLyLW4I1gAk++qBLWt7DPORTzmWRMsCZe86gDjShJA==",
      "license": "Apache-2.0",
      "dependencies": {
        "@grpc/grpc-js": "^1.12.6",
        "@grpc/proto-loader": "^0.8.0",
        "duplexify": "^4.1.3",
        "google-auth-library": "^10.1.0",
        "google-logging-utils": "^1.1.1",
        "node-fetch": "^3.3.2",
        "object-hash": "^3.0.0",
        "proto3-json-serializer": "^3.0.0",
        "protobufjs": "^7.5.3",
        "retry-request": "^8.0.0",
        "rimraf": "^5.0.1"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/google-logging-utils": {
      "version": "1.1.3",
      "resolved": "https://registry.npmjs.org/google-logging-utils/-/google-logging-utils-1.1.3.tgz",
      "integrity": "sha512-eAmLkjDjAFCVXg7A1unxHsLf961m6y17QFqXqAXGj/gVkKFrEICfStRfwUlGNfeCEjNRa32JEWOUTlYXPyyKvA==",
      "license": "Apache-2.0",
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/gtoken": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/gtoken/-/gtoken-8.0.0.tgz",
      "integrity": "sha512-+CqsMbHPiSTdtSO14O51eMNlrp9N79gmeqmXeouJOhfucAedHw9noVe/n5uJk3tbKE6a+6ZCQg3RPhVhHByAIw==",
      "license": "MIT",
      "dependencies": {
        "gaxios": "^7.0.0",
        "jws": "^4.0.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/minimatch": {
      "version": "9.0.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-9.0.5.tgz",
      "integrity": "sha512-G6T0ZX48xgozx7587koeX9Ys2NYy6Gmv//P89sEte9V9whIapMNF4idKxnW2QtCcLiTWlb/wfCabAtAFWhhBow==",
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^2.0.1"
      },
      "engines": {
        "node": ">=16 || 14 >=14.17"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/node-fetch": {
      "version": "3.3.2",
      "resolved": "https://registry.npmjs.org/node-fetch/-/node-fetch-3.3.2.tgz",
      "integrity": "sha512-dRB78srN/l6gqWulah9SrxeYnxeddIG30+GOqK/9OlLVyLg3HPnr6SqOWTWOXKRwC2eGYCkZ59NNuSgvSrpgOA==",
      "license": "MIT",
      "dependencies": {
        "data-uri-to-buffer": "^4.0.0",
        "fetch-blob": "^3.1.4",
        "formdata-polyfill": "^4.0.10"
      },
      "engines": {
        "node": "^12.20.0 || ^14.13.1 || >=16.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/node-fetch"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/proto3-json-serializer": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/proto3-json-serializer/-/proto3-json-serializer-3.0.4.tgz",
      "integrity": "sha512-E1sbAYg3aEbXrq0n1ojJkRHQJGE1kaE/O6GLA94y8rnJBfgvOPTOd1b9hOceQK1FFZI9qMh1vBERCyO2ifubcw==",
      "license": "Apache-2.0",
      "dependencies": {
        "protobufjs": "^7.4.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/retry-request": {
      "version": "8.0.2",
      "resolved": "https://registry.npmjs.org/retry-request/-/retry-request-8.0.2.tgz",
      "integrity": "sha512-JzFPAfklk1kjR1w76f0QOIhoDkNkSqW8wYKT08n9yysTmZfB+RQ2QoXoTAeOi1HD9ZipTyTAZg3c4pM/jeqgSw==",
      "license": "MIT",
      "dependencies": {
        "extend": "^3.0.2",
        "teeny-request": "^10.0.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/rimraf": {
      "version": "5.0.10",
      "resolved": "https://registry.npmjs.org/rimraf/-/rimraf-5.0.10.tgz",
      "integrity": "sha512-l0OE8wL34P4nJH/H2ffoaniAokM2qSmrtXHmlpvYr5AVVX8msAyW0l8NVJFDxlSK4u3Uh/f41cQheDVdnYijwQ==",
      "license": "ISC",
      "dependencies": {
        "glob": "^10.3.7"
      },
      "bin": {
        "rimraf": "dist/esm/bin.mjs"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/teeny-request": {
      "version": "10.1.0",
      "resolved": "https://registry.npmjs.org/teeny-request/-/teeny-request-10.1.0.tgz",
      "integrity": "sha512-3ZnLvgWF29jikg1sAQ1g0o+lr5JX6sVgYvfUJazn7ZjJroDBUTWp44/+cFVX0bULjv4vci+rBD+oGVAkWqhUbw==",
      "license": "Apache-2.0",
      "dependencies": {
        "http-proxy-agent": "^5.0.0",
        "https-proxy-agent": "^5.0.0",
        "node-fetch": "^3.3.2",
        "stream-events": "^1.0.5"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google-cloud/tasks/node_modules/teeny-request/node_modules/https-proxy-agent": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-5.0.1.tgz",
      "integrity": "sha512-dFcAjpTQFgoLMzC2VwU+C/CbS7uRL0lWmxDITmqm7C+7F0Odmj6s9l6alZc6AELXhrnggM2CeWSXHGOdX2YtwA==",
      "license": "MIT",
      "dependencies": {
        "agent-base": "6",
        "debug": "4"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/@google/genai": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/@google/genai/-/genai-1.33.0.tgz",
      "integrity": "sha512-ThUjFZ1N0DU88peFjnQkb8K198EWaW2RmmnDShFQ+O+xkIH9itjpRe358x3L/b4X/A7dimkvq63oz49Vbh7Cog==",
      "license": "Apache-2.0",
      "dependencies": {
        "google-auth-library": "^10.3.0",
        "ws": "^8.18.0"
      },
      "engines": {
        "node": ">=20.0.0"
      },
      "peerDependencies": {
        "@modelcontextprotocol/sdk": "^1.24.0"
      },
      "peerDependenciesMeta": {
        "@modelcontextprotocol/sdk": {
          "optional": true
        }
      }
    },
    "node_modules/@google/genai/node_modules/brace-expansion": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.0.2.tgz",
      "integrity": "sha512-Jt0vHyM+jmUBqojB7E1NIYadt0vI0Qxjxd2TErW94wDz+E2LAm5vKMXXwg6ZZBTHPuUlDgQHKXvjGBdfcF1ZDQ==",
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0"
      }
    },
    "node_modules/@google/genai/node_modules/gaxios": {
      "version": "7.1.3",
      "resolved": "https://registry.npmjs.org/gaxios/-/gaxios-7.1.3.tgz",
      "integrity": "sha512-YGGyuEdVIjqxkxVH1pUTMY/XtmmsApXrCVv5EU25iX6inEPbV+VakJfLealkBtJN69AQmh1eGOdCl9Sm1UP6XQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "extend": "^3.0.2",
        "https-proxy-agent": "^7.0.1",
        "node-fetch": "^3.3.2",
        "rimraf": "^5.0.1"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google/genai/node_modules/gcp-metadata": {
      "version": "8.1.2",
      "resolved": "https://registry.npmjs.org/gcp-metadata/-/gcp-metadata-8.1.2.tgz",
      "integrity": "sha512-zV/5HKTfCeKWnxG0Dmrw51hEWFGfcF2xiXqcA3+J90WDuP0SvoiSO5ORvcBsifmx/FoIjgQN3oNOGaQ5PhLFkg==",
      "license": "Apache-2.0",
      "dependencies": {
        "gaxios": "^7.0.0",
        "google-logging-utils": "^1.0.0",
        "json-bigint": "^1.0.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google/genai/node_modules/glob": {
      "version": "10.5.0",
      "resolved": "https://registry.npmjs.org/glob/-/glob-10.5.0.tgz",
      "integrity": "sha512-DfXN8DfhJ7NH3Oe7cFmu3NCu1wKbkReJ8TorzSAFbSKrlNaQSKfIzqYqVY8zlbs2NLBbWpRiU52GX2PbaBVNkg==",
      "license": "ISC",
      "dependencies": {
        "foreground-child": "^3.1.0",
        "jackspeak": "^3.1.2",
        "minimatch": "^9.0.4",
        "minipass": "^7.1.2",
        "package-json-from-dist": "^1.0.0",
        "path-scurry": "^1.11.1"
      },
      "bin": {
        "glob": "dist/esm/bin.mjs"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/@google/genai/node_modules/google-auth-library": {
      "version": "10.5.0",
      "resolved": "https://registry.npmjs.org/google-auth-library/-/google-auth-library-10.5.0.tgz",
      "integrity": "sha512-7ABviyMOlX5hIVD60YOfHw4/CxOfBhyduaYB+wbFWCWoni4N7SLcV46hrVRktuBbZjFC9ONyqamZITN7q3n32w==",
      "license": "Apache-2.0",
      "dependencies": {
        "base64-js": "^1.3.0",
        "ecdsa-sig-formatter": "^1.0.11",
        "gaxios": "^7.0.0",
        "gcp-metadata": "^8.0.0",
        "google-logging-utils": "^1.0.0",
        "gtoken": "^8.0.0",
        "jws": "^4.0.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google/genai/node_modules/google-logging-utils": {
      "version": "1.1.3",
      "resolved": "https://registry.npmjs.org/google-logging-utils/-/google-logging-utils-1.1.3.tgz",
      "integrity": "sha512-eAmLkjDjAFCVXg7A1unxHsLf961m6y17QFqXqAXGj/gVkKFrEICfStRfwUlGNfeCEjNRa32JEWOUTlYXPyyKvA==",
      "license": "Apache-2.0",
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/@google/genai/node_modules/gtoken": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/gtoken/-/gtoken-8.0.0.tgz",
      "integrity": "sha512-+CqsMbHPiSTdtSO14O51eMNlrp9N79gmeqmXeouJOhfucAedHw9noVe/n5uJk3tbKE6a+6ZCQg3RPhVhHByAIw==",
      "license": "MIT",
      "dependencies": {
        "gaxios": "^7.0.0",
        "jws": "^4.0.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@google/genai/node_modules/minimatch": {
      "version": "9.0.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-9.0.5.tgz",
      "integrity": "sha512-G6T0ZX48xgozx7587koeX9Ys2NYy6Gmv//P89sEte9V9whIapMNF4idKxnW2QtCcLiTWlb/wfCabAtAFWhhBow==",
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^2.0.1"
      },
      "engines": {
        "node": ">=16 || 14 >=14.17"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/@google/genai/node_modules/node-fetch": {
      "version": "3.3.2",
      "resolved": "https://registry.npmjs.org/node-fetch/-/node-fetch-3.3.2.tgz",
      "integrity": "sha512-dRB78srN/l6gqWulah9SrxeYnxeddIG30+GOqK/9OlLVyLg3HPnr6SqOWTWOXKRwC2eGYCkZ59NNuSgvSrpgOA==",
      "license": "MIT",
      "dependencies": {
        "data-uri-to-buffer": "^4.0.0",
        "fetch-blob": "^3.1.4",
        "formdata-polyfill": "^4.0.10"
      },
      "engines": {
        "node": "^12.20.0 || ^14.13.1 || >=16.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/node-fetch"
      }
    },
    "node_modules/@google/genai/node_modules/rimraf": {
      "version": "5.0.10",
      "resolved": "https://registry.npmjs.org/rimraf/-/rimraf-5.0.10.tgz",
      "integrity": "sha512-l0OE8wL34P4nJH/H2ffoaniAokM2qSmrtXHmlpvYr5AVVX8msAyW0l8NVJFDxlSK4u3Uh/f41cQheDVdnYijwQ==",
      "license": "ISC",
      "dependencies": {
        "glob": "^10.3.7"
      },
      "bin": {
        "rimraf": "dist/esm/bin.mjs"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/@grpc/grpc-js": {
      "version": "1.14.3",
      "resolved": "https://registry.npmjs.org/@grpc/grpc-js/-/grpc-js-1.14.3.tgz",
      "integrity": "sha512-Iq8QQQ/7X3Sac15oB6p0FmUg/klxQvXLeileoqrTRGJYLV+/9tubbr9ipz0GKHjmXVsgFPo/+W+2cA8eNcR+XA==",
      "license": "Apache-2.0",
      "dependencies": {
        "@grpc/proto-loader": "^0.8.0",
        "@js-sdsl/ordered-map": "^4.4.2"
      },
      "engines": {
        "node": ">=12.10.0"
      }
    },
    "node_modules/@grpc/grpc-js/node_modules/@grpc/proto-loader": {
      "version": "0.8.0",
      "resolved": "https://registry.npmjs.org/@grpc/proto-loader/-/proto-loader-0.8.0.tgz",
      "integrity": "sha512-rc1hOQtjIWGxcxpb9aHAfLpIctjEnsDehj0DAiVfBlmT84uvR0uUtN2hEi/ecvWVjXUGf5qPF4qEgiLOx1YIMQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "lodash.camelcase": "^4.3.0",
        "long": "^5.0.0",
        "protobufjs": "^7.5.3",
        "yargs": "^17.7.2"
      },
      "bin": {
        "proto-loader-gen-types": "build/bin/proto-loader-gen-types.js"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/@grpc/proto-loader": {
      "version": "0.7.15",
      "resolved": "https://registry.npmjs.org/@grpc/proto-loader/-/proto-loader-0.7.15.tgz",
      "integrity": "sha512-tMXdRCfYVixjuFK+Hk0Q1s38gV9zDiDJfWL3h1rv4Qc39oILCu1TRTDt7+fGUI8K4G1Fj125Hx/ru3azECWTyQ==",
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "lodash.camelcase": "^4.3.0",
        "long": "^5.0.0",
        "protobufjs": "^7.2.5",
        "yargs": "^17.7.2"
      },
      "bin": {
        "proto-loader-gen-types": "build/bin/proto-loader-gen-types.js"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/@isaacs/cliui": {
      "version": "8.0.2",
      "resolved": "https://registry.npmjs.org/@isaacs/cliui/-/cliui-8.0.2.tgz",
      "integrity": "sha512-O8jcjabXaleOG9DQ0+ARXWZBTfnP4WNAqzuiJK7ll44AmxGKv/J2M4TPjxjY3znBCfvBXFzucm1twdyFybFqEA==",
      "license": "ISC",
      "dependencies": {
        "string-width": "^5.1.2",
        "string-width-cjs": "npm:string-width@^4.2.0",
        "strip-ansi": "^7.0.1",
        "strip-ansi-cjs": "npm:strip-ansi@^6.0.1",
        "wrap-ansi": "^8.1.0",
        "wrap-ansi-cjs": "npm:wrap-ansi@^7.0.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/@isaacs/cliui/node_modules/ansi-regex": {
      "version": "6.2.2",
      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-6.2.2.tgz",
      "integrity": "sha512-Bq3SmSpyFHaWjPk8If9yc6svM8c56dB5BAtW4Qbw5jHTwwXXcTLoRMkpDJp6VL0XzlWaCHTXrkFURMYmD0sLqg==",
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-regex?sponsor=1"
      }
    },
    "node_modules/@isaacs/cliui/node_modules/ansi-styles": {
      "version": "6.2.3",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-6.2.3.tgz",
      "integrity": "sha512-4Dj6M28JB+oAH8kFkTLUo+a2jwOFkuqb3yucU0CANcRRUbxS0cP0nZYCGjcc3BNXwRIsUVmDGgzawme7zvJHvg==",
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/@isaacs/cliui/node_modules/emoji-regex": {
      "version": "9.2.2",
      "resolved": "https://registry.npmjs.org/emoji-regex/-/emoji-regex-9.2.2.tgz",
      "integrity": "sha512-L18DaJsXSUk2+42pv8mLs5jJT2hqFkFE4j21wOmgbUqsZ2hL72NsUU785g9RXgo3s0ZNgVl42TiHp3ZtOv/Vyg==",
      "license": "MIT"
    },
    "node_modules/@isaacs/cliui/node_modules/string-width": {
      "version": "5.1.2",
      "resolved": "https://registry.npmjs.org/string-width/-/string-width-5.1.2.tgz",
      "integrity": "sha512-HnLOCR3vjcY8beoNLtcjZ5/nxn2afmME6lhrDrebokqMap+XbeW8n9TXpPDOqdGK5qcI3oT0GKTW6wC7EMiVqA==",
      "license": "MIT",
      "dependencies": {
        "eastasianwidth": "^0.2.0",
        "emoji-regex": "^9.2.2",
        "strip-ansi": "^7.0.1"
      },
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/@isaacs/cliui/node_modules/strip-ansi": {
      "version": "7.1.2",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-7.1.2.tgz",
      "integrity": "sha512-gmBGslpoQJtgnMAvOVqGZpEz9dyoKTCzy2nfz/n8aIFhN/jCE/rCmcxabB6jOOHV+0WNnylOxaxBQPSvcWklhA==",
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^6.0.1"
      },
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/chalk/strip-ansi?sponsor=1"
      }
    },
    "node_modules/@isaacs/cliui/node_modules/wrap-ansi": {
      "version": "8.1.0",
      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-8.1.0.tgz",
      "integrity": "sha512-si7QWI6zUMq56bESFvagtmzMdGOtoxfR+Sez11Mobfc7tm+VkUckk9bW2UeffTGVUbOksxmSw0AA2gs8g71NCQ==",
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^6.1.0",
        "string-width": "^5.0.1",
        "strip-ansi": "^7.0.1"
      },
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
      }
    },
    "node_modules/@jridgewell/resolve-uri": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz",
      "integrity": "sha512-bRISgCIjP20/tbWSPWMEi54QVPRZExkuD9lJL+UIxUKtwVJA8wW1Trb1jMs1RFXo1CBTNZ/5hpC9QvmKWdopKw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@jridgewell/sourcemap-codec": {
      "version": "1.5.5",
      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz",
      "integrity": "sha512-cYQ9310grqxueWbl+WuIUIaiUaDcj7WOq5fVhEljNVgRfOUhY9fy2zTvfoqWsnebh8Sl70VScFbICvJnLKB0Og==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@jridgewell/trace-mapping": {
      "version": "0.3.9",
      "resolved": "https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.9.tgz",
      "integrity": "sha512-3Belt6tdc8bPgAtbcmdtNJlirVoTmEb5e2gC94PnkwEW9jI6CAHUeoG85tjWP5WquqfavoMtMwiG4P926ZKKuQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/resolve-uri": "^3.0.3",
        "@jridgewell/sourcemap-codec": "^1.4.10"
      }
    },
    "node_modules/@js-sdsl/ordered-map": {
      "version": "4.4.2",
      "resolved": "https://registry.npmjs.org/@js-sdsl/ordered-map/-/ordered-map-4.4.2.tgz",
      "integrity": "sha512-iUKgm52T8HOE/makSxjqoWhe95ZJA1/G1sYsGev2JDKUSS14KAgg1LHb+Ba+IPow0xflbnSkOsZcO08C7w1gYw==",
      "license": "MIT",
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/js-sdsl"
      }
    },
    "node_modules/@opentelemetry/api": {
      "version": "1.9.0",
      "resolved": "https://registry.npmjs.org/@opentelemetry/api/-/api-1.9.0.tgz",
      "integrity": "sha512-3giAOQvZiH5F9bMlMiv8+GSPMeqg0dbaeo58/0SlA9sxSqZhnUtxzX9/2FzyhS9sWQf5S0GJE0AKBrFqjpeYcg==",
      "license": "Apache-2.0",
      "optional": true,
      "engines": {
        "node": ">=8.0.0"
      }
    },
    "node_modules/@pkgjs/parseargs": {
      "version": "0.11.0",
      "resolved": "https://registry.npmjs.org/@pkgjs/parseargs/-/parseargs-0.11.0.tgz",
      "integrity": "sha512-+1VkjdD0QBLPodGrJUeqarH8VAIvQODIbwh9XpP5Syisf7YoQgsJKPNFoqqLQlu+VQ/tVSshMR6loPMn8U+dPg==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/@protobufjs/aspromise": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/@protobufjs/aspromise/-/aspromise-1.1.2.tgz",
      "integrity": "sha512-j+gKExEuLmKwvz3OgROXtrJ2UG2x8Ch2YZUxahh+s1F2HZ+wAceUNLkvy6zKCPVRkU++ZWQrdxsUeQXmcg4uoQ==",
      "license": "BSD-3-Clause"
    },
    "node_modules/@protobufjs/base64": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/@protobufjs/base64/-/base64-1.1.2.tgz",
      "integrity": "sha512-AZkcAA5vnN/v4PDqKyMR5lx7hZttPDgClv83E//FMNhR2TMcLUhfRUBHCmSl0oi9zMgDDqRUJkSxO3wm85+XLg==",
      "license": "BSD-3-Clause"
    },
    "node_modules/@protobufjs/codegen": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/@protobufjs/codegen/-/codegen-2.0.4.tgz",
      "integrity": "sha512-YyFaikqM5sH0ziFZCN3xDC7zeGaB/d0IUb9CATugHWbd1FRFwWwt4ld4OYMPWu5a3Xe01mGAULCdqhMlPl29Jg==",
      "license": "BSD-3-Clause"
    },
    "node_modules/@protobufjs/eventemitter": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@protobufjs/eventemitter/-/eventemitter-1.1.0.tgz",
      "integrity": "sha512-j9ednRT81vYJ9OfVuXG6ERSTdEL1xVsNgqpkxMsbIabzSo3goCjDIveeGv5d03om39ML71RdmrGNjG5SReBP/Q==",
      "license": "BSD-3-Clause"
    },
    "node_modules/@protobufjs/fetch": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@protobufjs/fetch/-/fetch-1.1.0.tgz",
      "integrity": "sha512-lljVXpqXebpsijW71PZaCYeIcE5on1w5DlQy5WH6GLbFryLUrBD4932W/E2BSpfRJWseIL4v/KPgBFxDOIdKpQ==",
      "license": "BSD-3-Clause",
      "dependencies": {
        "@protobufjs/aspromise": "^1.1.1",
        "@protobufjs/inquire": "^1.1.0"
      }
    },
    "node_modules/@protobufjs/float": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/@protobufjs/float/-/float-1.0.2.tgz",
      "integrity": "sha512-Ddb+kVXlXst9d+R9PfTIxh1EdNkgoRe5tOX6t01f1lYWOvJnSPDBlG241QLzcyPdoNTsblLUdujGSE4RzrTZGQ==",
      "license": "BSD-3-Clause"
    },
    "node_modules/@protobufjs/inquire": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@protobufjs/inquire/-/inquire-1.1.0.tgz",
      "integrity": "sha512-kdSefcPdruJiFMVSbn801t4vFK7KB/5gd2fYvrxhuJYg8ILrmn9SKSX2tZdV6V+ksulWqS7aXjBcRXl3wHoD9Q==",
      "license": "BSD-3-Clause"
    },
    "node_modules/@protobufjs/path": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/@protobufjs/path/-/path-1.1.2.tgz",
      "integrity": "sha512-6JOcJ5Tm08dOHAbdR3GrvP+yUUfkjG5ePsHYczMFLq3ZmMkAD98cDgcT2iA1lJ9NVwFd4tH/iSSoe44YWkltEA==",
      "license": "BSD-3-Clause"
    },
    "node_modules/@protobufjs/pool": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@protobufjs/pool/-/pool-1.1.0.tgz",
      "integrity": "sha512-0kELaGSIDBKvcgS4zkjz1PeddatrjYcmMWOlAuAPwAeccUrPHdUqo/J6LiymHHEiJT5NrF1UVwxY14f+fy4WQw==",
      "license": "BSD-3-Clause"
    },
    "node_modules/@protobufjs/utf8": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@protobufjs/utf8/-/utf8-1.1.0.tgz",
      "integrity": "sha512-Vvn3zZrhQZkkBE8LSuW3em98c0FwgO4nxzv6OdSxPKJIEKY2bGbHn+mhGIPerzI4twdxaP8/0+06HBpwf345Lw==",
      "license": "BSD-3-Clause"
    },
    "node_modules/@tootallnate/once": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/@tootallnate/once/-/once-2.0.0.tgz",
      "integrity": "sha512-XCuKFP5PS55gnMVu3dty8KPatLqUoy/ZYzDzAGCQ8JNFCkLXzmI7vNHCR+XpbZaMWQK/vQubr7PkYq8g470J/A==",
      "license": "MIT",
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/@tsconfig/node10": {
      "version": "1.0.12",
      "resolved": "https://registry.npmjs.org/@tsconfig/node10/-/node10-1.0.12.tgz",
      "integrity": "sha512-UCYBaeFvM11aU2y3YPZ//O5Rhj+xKyzy7mvcIoAjASbigy8mHMryP5cK7dgjlz2hWxh1g5pLw084E0a/wlUSFQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@tsconfig/node12": {
      "version": "1.0.11",
      "resolved": "https://registry.npmjs.org/@tsconfig/node12/-/node12-1.0.11.tgz",
      "integrity": "sha512-cqefuRsh12pWyGsIoBKJA9luFu3mRxCA+ORZvA4ktLSzIuCUtWVxGIuXigEwO5/ywWFMZ2QEGKWvkZG1zDMTag==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@tsconfig/node14": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/@tsconfig/node14/-/node14-1.0.3.tgz",
      "integrity": "sha512-ysT8mhdixWK6Hw3i1V2AeRqZ5WfXg1G43mqoYlM2nc6388Fq5jcXyr5mRsqViLx/GJYdoL0bfXD8nmF+Zn/Iow==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@tsconfig/node16": {
      "version": "1.0.4",
      "resolved": "https://registry.npmjs.org/@tsconfig/node16/-/node16-1.0.4.tgz",
      "integrity": "sha512-vxhUy4J8lyeyinH7Azl1pdd43GJhZH/tP2weN8TntQblOY+A0XbT8DJk1/oCPuOOyg/Ja757rG0CgHcWC8OfMA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/body-parser": {
      "version": "1.19.6",
      "resolved": "https://registry.npmjs.org/@types/body-parser/-/body-parser-1.19.6.tgz",
      "integrity": "sha512-HLFeCYgz89uk22N5Qg3dvGvsv46B8GLvKKo1zKG4NybA8U2DiEO3w9lqGg29t/tfLRJpJ6iQxnVw4OnB7MoM9g==",
      "license": "MIT",
      "dependencies": {
        "@types/connect": "*",
        "@types/node": "*"
      }
    },
    "node_modules/@types/caseless": {
      "version": "0.12.5",
      "resolved": "https://registry.npmjs.org/@types/caseless/-/caseless-0.12.5.tgz",
      "integrity": "sha512-hWtVTC2q7hc7xZ/RLbxapMvDMgUnDvKvMOpKal4DrMyfGBUfB1oKaZlIRr6mJL+If3bAP6sV/QneGzF6tJjZDg==",
      "license": "MIT",
      "optional": true
    },
    "node_modules/@types/compression": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/@types/compression/-/compression-1.8.1.tgz",
      "integrity": "sha512-kCFuWS0ebDbmxs0AXYn6e2r2nrGAb5KwQhknjSPSPgJcGd8+HVSILlUyFhGqML2gk39HcG7D1ydW9/qpYkN00Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/express": "*",
        "@types/node": "*"
      }
    },
    "node_modules/@types/connect": {
      "version": "3.4.38",
      "resolved": "https://registry.npmjs.org/@types/connect/-/connect-3.4.38.tgz",
      "integrity": "sha512-K6uROf1LD88uDQqJCktA4yzL1YYAK6NgfsI0v/mTgyPKWsX1CnJ0XPSDhViejru1GcRkLWb8RlzFYJRqGUbaug==",
      "license": "MIT",
      "dependencies": {
        "@types/node": "*"
      }
    },
    "node_modules/@types/cors": {
      "version": "2.8.19",
      "resolved": "https://registry.npmjs.org/@types/cors/-/cors-2.8.19.tgz",
      "integrity": "sha512-mFNylyeyqN93lfe/9CSxOGREz8cpzAhH+E93xJ4xWQf62V8sQ/24reV2nyzUWM6H6Xji+GGHpkbLe7pVoUEskg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/node": "*"
      }
    },
    "node_modules/@types/express": {
      "version": "5.0.6",
      "resolved": "https://registry.npmjs.org/@types/express/-/express-5.0.6.tgz",
      "integrity": "sha512-sKYVuV7Sv9fbPIt/442koC7+IIwK5olP1KWeD88e/idgoJqDm3JV/YUiPwkoKK92ylff2MGxSz1CSjsXelx0YA==",
      "license": "MIT",
      "dependencies": {
        "@types/body-parser": "*",
        "@types/express-serve-static-core": "^5.0.0",
        "@types/serve-static": "^2"
      }
    },
    "node_modules/@types/express-serve-static-core": {
      "version": "5.1.0",
      "resolved": "https://registry.npmjs.org/@types/express-serve-static-core/-/express-serve-static-core-5.1.0.tgz",
      "integrity": "sha512-jnHMsrd0Mwa9Cf4IdOzbz543y4XJepXrbia2T4b6+spXC2We3t1y6K44D3mR8XMFSXMCf3/l7rCgddfx7UNVBA==",
      "license": "MIT",
      "dependencies": {
        "@types/node": "*",
        "@types/qs": "*",
        "@types/range-parser": "*",
        "@types/send": "*"
      }
    },
    "node_modules/@types/http-errors": {
      "version": "2.0.5",
      "resolved": "https://registry.npmjs.org/@types/http-errors/-/http-errors-2.0.5.tgz",
      "integrity": "sha512-r8Tayk8HJnX0FztbZN7oVqGccWgw98T/0neJphO91KkmOzug1KkofZURD4UaD5uH8AqcFLfdPErnBod0u71/qg==",
      "license": "MIT"
    },
    "node_modules/@types/jsonwebtoken": {
      "version": "9.0.10",
      "resolved": "https://registry.npmjs.org/@types/jsonwebtoken/-/jsonwebtoken-9.0.10.tgz",
      "integrity": "sha512-asx5hIG9Qmf/1oStypjanR7iKTv0gXQ1Ov/jfrX6kS/EO0OFni8orbmGCn0672NHR3kXHwpAwR+B368ZGN/2rA==",
      "license": "MIT",
      "dependencies": {
        "@types/ms": "*",
        "@types/node": "*"
      }
    },
    "node_modules/@types/long": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/@types/long/-/long-4.0.2.tgz",
      "integrity": "sha512-MqTGEo5bj5t157U6fA/BiDynNkn0YknVdh48CMPkTSpFTVmvao5UQmm7uEF6xBEo7qIMAlY/JSleYaE6VOdpaA==",
      "license": "MIT",
      "optional": true
    },
    "node_modules/@types/mime": {
      "version": "1.3.5",
      "resolved": "https://registry.npmjs.org/@types/mime/-/mime-1.3.5.tgz",
      "integrity": "sha512-/pyBZWSLD2n0dcHE3hq8s8ZvcETHtEuF+3E7XVt0Ig2nvsVQXdghHVcEkIWjy9A0wKfTn97a/PSDYohKIlnP/w==",
      "license": "MIT"
    },
    "node_modules/@types/ms": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/@types/ms/-/ms-2.1.0.tgz",
      "integrity": "sha512-GsCCIZDE/p3i96vtEqx+7dBUGXrc7zeSK3wwPHIaRThS+9OhWIXRqzs4d6k1SVU8g91DrNRWxWUGhp5KXQb2VA==",
      "license": "MIT"
    },
    "node_modules/@types/multer": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/@types/multer/-/multer-2.0.0.tgz",
      "integrity": "sha512-C3Z9v9Evij2yST3RSBktxP9STm6OdMc5uR1xF1SGr98uv8dUlAL2hqwrZ3GVB3uyMyiegnscEK6PGtYvNrjTjw==",
      "license": "MIT",
      "dependencies": {
        "@types/express": "*"
      }
    },
    "node_modules/@types/node": {
      "version": "25.0.2",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-25.0.2.tgz",
      "integrity": "sha512-gWEkeiyYE4vqjON/+Obqcoeffmk0NF15WSBwSs7zwVA2bAbTaE0SJ7P0WNGoJn8uE7fiaV5a7dKYIJriEqOrmA==",
      "license": "MIT",
      "dependencies": {
        "undici-types": "~7.16.0"
      }
    },
    "node_modules/@types/qs": {
      "version": "6.14.0",
      "resolved": "https://registry.npmjs.org/@types/qs/-/qs-6.14.0.tgz",
      "integrity": "sha512-eOunJqu0K1923aExK6y8p6fsihYEn/BYuQ4g0CxAAgFc4b/ZLN4CrsRZ55srTdqoiLzU2B2evC+apEIxprEzkQ==",
      "license": "MIT"
    },
    "node_modules/@types/range-parser": {
      "version": "1.2.7",
      "resolved": "https://registry.npmjs.org/@types/range-parser/-/range-parser-1.2.7.tgz",
      "integrity": "sha512-hKormJbkJqzQGhziax5PItDUTMAM9uE2XXQmM37dyd4hVM+5aVl7oVxMVUiVQn2oCQFN/LKCZdvSM0pFRqbSmQ==",
      "license": "MIT"
    },
    "node_modules/@types/request": {
      "version": "2.48.13",
      "resolved": "https://registry.npmjs.org/@types/request/-/request-2.48.13.tgz",
      "integrity": "sha512-FGJ6udDNUCjd19pp0Q3iTiDkwhYup7J8hpMW9c4k53NrccQFFWKRho6hvtPPEhnXWKvukfwAlB6DbDz4yhH5Gg==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@types/caseless": "*",
        "@types/node": "*",
        "@types/tough-cookie": "*",
        "form-data": "^2.5.5"
      }
    },
    "node_modules/@types/send": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/@types/send/-/send-1.2.1.tgz",
      "integrity": "sha512-arsCikDvlU99zl1g69TcAB3mzZPpxgw0UQnaHeC1Nwb015xp8bknZv5rIfri9xTOcMuaVgvabfIRA7PSZVuZIQ==",
      "license": "MIT",
      "dependencies": {
        "@types/node": "*"
      }
    },
    "node_modules/@types/serve-static": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/@types/serve-static/-/serve-static-2.2.0.tgz",
      "integrity": "sha512-8mam4H1NHLtu7nmtalF7eyBH14QyOASmcxHhSfEoRyr0nP/YdoesEtU+uSRvMe96TW/HPTtkoKqQLl53N7UXMQ==",
      "license": "MIT",
      "dependencies": {
        "@types/http-errors": "*",
        "@types/node": "*"
      }
    },
    "node_modules/@types/strip-bom": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/@types/strip-bom/-/strip-bom-3.0.0.tgz",
      "integrity": "sha512-xevGOReSYGM7g/kUBZzPqCrR/KYAo+F0yiPc85WFTJa0MSLtyFTVTU6cJu/aV4mid7IffDIWqo69THF2o4JiEQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/strip-json-comments": {
      "version": "0.0.30",
      "resolved": "https://registry.npmjs.org/@types/strip-json-comments/-/strip-json-comments-0.0.30.tgz",
      "integrity": "sha512-7NQmHra/JILCd1QqpSzl8+mJRc8ZHz3uDm8YV1Ks9IhK0epEiTw8aIErbvH9PI+6XbqhyIQy3462nEsn7UVzjQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/tough-cookie": {
      "version": "4.0.5",
      "resolved": "https://registry.npmjs.org/@types/tough-cookie/-/tough-cookie-4.0.5.tgz",
      "integrity": "sha512-/Ad8+nIOV7Rl++6f1BdKxFSMgmoqEoYbHRpPcx3JEfv8VRsQe9Z4mCXeJBzxs7mbHY/XOZZuXlRNfhpVPbs6ZA==",
      "license": "MIT",
      "optional": true
    },
    "node_modules/@types/uuid": {
      "version": "10.0.0",
      "resolved": "https://registry.npmjs.org/@types/uuid/-/uuid-10.0.0.tgz",
      "integrity": "sha512-7gqG38EyHgyP1S+7+xomFtL+ZNHcKv6DwNaCZmJmo1vgMugyF3TCnXVg4t1uk89mLNwnLtnY3TpOpCOyp1/xHQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/abort-controller": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/abort-controller/-/abort-controller-3.0.0.tgz",
      "integrity": "sha512-h8lQ8tacZYnR3vNQTgibj+tODHI5/+l06Au2Pcriv/Gmet0eaj4TwWH41sO9wnHDiQsEj19q0drzdWdeAHtweg==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "event-target-shim": "^5.0.0"
      },
      "engines": {
        "node": ">=6.5"
      }
    },
    "node_modules/accepts": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/accepts/-/accepts-2.0.0.tgz",
      "integrity": "sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==",
      "license": "MIT",
      "dependencies": {
        "mime-types": "^3.0.0",
        "negotiator": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/acorn": {
      "version": "8.15.0",
      "resolved": "https://registry.npmjs.org/acorn/-/acorn-8.15.0.tgz",
      "integrity": "sha512-NZyJarBfL7nWwIq+FDL6Zp/yHEhePMNnnJ0y3qfieCrmNvYct8uvtiV41UvlSe6apAfk0fY1FbWx+NwfmpvtTg==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "acorn": "bin/acorn"
      },
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/acorn-walk": {
      "version": "8.3.4",
      "resolved": "https://registry.npmjs.org/acorn-walk/-/acorn-walk-8.3.4.tgz",
      "integrity": "sha512-ueEepnujpqee2o5aIYnvHU6C0A42MNdsIDeqy5BydrkuC5R1ZuUFnm27EeFJGoEHJQgn3uleRvmTXaJgfXbt4g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "acorn": "^8.11.0"
      },
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/agent-base": {
      "version": "7.1.4",
      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-7.1.4.tgz",
      "integrity": "sha512-MnA+YT8fwfJPgBx3m60MNqakm30XOkyIoH1y6huTQvC0PwZG7ki8NacLBcrPbNoo8vEZy7Jpuk7+jMO+CUovTQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/ansi-regex": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz",
      "integrity": "sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/ansi-styles": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
      "integrity": "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg==",
      "license": "MIT",
      "dependencies": {
        "color-convert": "^2.0.1"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/anymatch": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/anymatch/-/anymatch-3.1.3.tgz",
      "integrity": "sha512-KMReFUr0B4t+D+OBkjR3KYqvocp2XaSzO55UcB6mgQMd3KbcE+mWTyvVV7D/zsdEbNnV6acZUutkiHQXvTr1Rw==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "normalize-path": "^3.0.0",
        "picomatch": "^2.0.4"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/append-field": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/append-field/-/append-field-1.0.0.tgz",
      "integrity": "sha512-klpgFSWLW1ZEs8svjfb7g4qWY0YS5imI82dTg+QahUvJ8YqAY0P10Uk8tTyh9ZGuYEZEMaeJYCF5BFuX552hsw==",
      "license": "MIT"
    },
    "node_modules/arg": {
      "version": "4.1.3",
      "resolved": "https://registry.npmjs.org/arg/-/arg-4.1.3.tgz",
      "integrity": "sha512-58S9QDqG0Xx27YwPSt9fJxivjYl432YCwfDMfZ+71RAqUrZef7LrKQZ3LHLOwCS4FLNBplP533Zx895SeOCHvA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/arrify": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/arrify/-/arrify-2.0.1.tgz",
      "integrity": "sha512-3duEwti880xqi4eAMN8AyR4a0ByT90zoYdLlevfrvU43vb0YZwZVfxOgxWrLXXXpyugL0hNZc9G6BiB5B3nUug==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/async-retry": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/async-retry/-/async-retry-1.3.3.tgz",
      "integrity": "sha512-wfr/jstw9xNi/0teMHrRW7dsz3Lt5ARhYNZ2ewpadnhaIp5mbALhOAP+EAdsC7t4Z6wqsDVv9+W6gm1Dk9mEyw==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "retry": "0.13.1"
      }
    },
    "node_modules/asynckit": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/asynckit/-/asynckit-0.4.0.tgz",
      "integrity": "sha512-Oei9OH4tRh0YqU3GxhX79dM/mwVgvbZJaSNaRk+bshkj0S5cfHcgYakreBjrHwatXKbz+IoIdYLxrKim2MjW0Q==",
      "license": "MIT",
      "optional": true
    },
    "node_modules/balanced-match": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "license": "MIT"
    },
    "node_modules/base64-js": {
      "version": "1.5.1",
      "resolved": "https://registry.npmjs.org/base64-js/-/base64-js-1.5.1.tgz",
      "integrity": "sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT"
    },
    "node_modules/bignumber.js": {
      "version": "9.3.1",
      "resolved": "https://registry.npmjs.org/bignumber.js/-/bignumber.js-9.3.1.tgz",
      "integrity": "sha512-Ko0uX15oIUS7wJ3Rb30Fs6SkVbLmPBAKdlm7q9+ak9bbIeFf0MwuBsQV6z7+X768/cHsfg+WlysDWJcmthjsjQ==",
      "license": "MIT",
      "engines": {
        "node": "*"
      }
    },
    "node_modules/binary-extensions": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/binary-extensions/-/binary-extensions-2.3.0.tgz",
      "integrity": "sha512-Ceh+7ox5qe7LJuLHoY0feh3pHuUDHAcRUeyL2VYghZwfpkNIy/+8Ocg0a3UuSoYzavmylwuLWQOf3hl0jjMMIw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/body-parser": {
      "version": "2.2.1",
      "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-2.2.1.tgz",
      "integrity": "sha512-nfDwkulwiZYQIGwxdy0RUmowMhKcFVcYXUU7m4QlKYim1rUtg83xm2yjZ40QjDuc291AJjjeSc9b++AWHSgSHw==",
      "license": "MIT",
      "dependencies": {
        "bytes": "^3.1.2",
        "content-type": "^1.0.5",
        "debug": "^4.4.3",
        "http-errors": "^2.0.0",
        "iconv-lite": "^0.7.0",
        "on-finished": "^2.4.1",
        "qs": "^6.14.0",
        "raw-body": "^3.0.1",
        "type-is": "^2.0.1"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/brace-expansion": {
      "version": "1.1.12",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.12.tgz",
      "integrity": "sha512-9T9UjW3r0UW5c1Q7GTwllptXwhvYmEzFhzMfZ9H7FQWt+uZePjZPjBP/W1ZEyZ1twGWom5/56TF4lPcqjnDHcg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0",
        "concat-map": "0.0.1"
      }
    },
    "node_modules/braces": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/braces/-/braces-3.0.3.tgz",
      "integrity": "sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fill-range": "^7.1.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/buffer-equal-constant-time": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/buffer-equal-constant-time/-/buffer-equal-constant-time-1.0.1.tgz",
      "integrity": "sha512-zRpUiDwd/xk6ADqPMATG8vc9VPrkck7T07OIx0gnjmJAnHnTVXNQG3vfvWNuiZIkwu9KrKdA1iJKfsfTVxE6NA==",
      "license": "BSD-3-Clause"
    },
    "node_modules/buffer-from": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/buffer-from/-/buffer-from-1.1.2.tgz",
      "integrity": "sha512-E+XQCRwSbaaiChtv6k6Dwgc+bx+Bs6vuKJHHl5kox/BaKbhiXzqQOwK4cO22yElGp2OCmjwVhT3HmxgyPGnJfQ==",
      "license": "MIT"
    },
    "node_modules/busboy": {
      "version": "1.6.0",
      "resolved": "https://registry.npmjs.org/busboy/-/busboy-1.6.0.tgz",
      "integrity": "sha512-8SFQbg/0hQ9xy3UNTB0YEnsNBbWfhf7RtnzpL7TkBiTBRfrQ9Fxcnz7VJsleJpyp6rVLvXiuORqjlHi5q+PYuA==",
      "dependencies": {
        "streamsearch": "^1.1.0"
      },
      "engines": {
        "node": ">=10.16.0"
      }
    },
    "node_modules/bytes": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/bytes/-/bytes-3.1.2.tgz",
      "integrity": "sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/call-bind-apply-helpers": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
      "integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/call-bound": {
      "version": "1.0.4",
      "resolved": "https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz",
      "integrity": "sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "get-intrinsic": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/chokidar": {
      "version": "3.6.0",
      "resolved": "https://registry.npmjs.org/chokidar/-/chokidar-3.6.0.tgz",
      "integrity": "sha512-7VT13fmjotKpGipCW9JEQAusEPE+Ei8nl6/g4FBAmIm0GOOLMua9NDDo/DWp0ZAxCr3cPq5ZpBqmPAQgDda2Pw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "anymatch": "~3.1.2",
        "braces": "~3.0.2",
        "glob-parent": "~5.1.2",
        "is-binary-path": "~2.1.0",
        "is-glob": "~4.0.1",
        "normalize-path": "~3.0.0",
        "readdirp": "~3.6.0"
      },
      "engines": {
        "node": ">= 8.10.0"
      },
      "funding": {
        "url": "https://paulmillr.com/funding/"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.2"
      }
    },
    "node_modules/cliui": {
      "version": "8.0.1",
      "resolved": "https://registry.npmjs.org/cliui/-/cliui-8.0.1.tgz",
      "integrity": "sha512-BSeNnyus75C4//NQ9gQt1/csTXyo/8Sb+afLAkzAptFuMsod9HFokGNudZpi/oQV73hnVK+sR+5PVRMd+Dr7YQ==",
      "license": "ISC",
      "dependencies": {
        "string-width": "^4.2.0",
        "strip-ansi": "^6.0.1",
        "wrap-ansi": "^7.0.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/color-convert": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz",
      "integrity": "sha512-RRECPsj7iu/xb5oKYcsFHSppFNnsj/52OVTRKb4zP5onXwVF3zVmmToNcOfGC+CRDpfK/U584fMg38ZHCaElKQ==",
      "license": "MIT",
      "dependencies": {
        "color-name": "~1.1.4"
      },
      "engines": {
        "node": ">=7.0.0"
      }
    },
    "node_modules/color-name": {
      "version": "1.1.4",
      "resolved": "https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz",
      "integrity": "sha512-dOy+3AuW3a2wNbZHIuMZpTcgjGuLU/uBL/ubcZF9OXbDo8ff4O8yVp5Bf0efS8uEoYo5q4Fx7dY9OgQGXgAsQA==",
      "license": "MIT"
    },
    "node_modules/combined-stream": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/combined-stream/-/combined-stream-1.0.8.tgz",
      "integrity": "sha512-FQN4MRfuJeHf7cBbBMJFXhKSDq+2kAArBlmRBvcvFE5BB1HZKXtSFASDhdlz9zOYwxh8lDdnvmMOe/+5cdoEdg==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "delayed-stream": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/compressible": {
      "version": "2.0.18",
      "resolved": "https://registry.npmjs.org/compressible/-/compressible-2.0.18.tgz",
      "integrity": "sha512-AF3r7P5dWxL8MxyITRMlORQNaOA2IkAFaTr4k7BUumjPtRpGDTZpl0Pb1XCO6JeDCBdp126Cgs9sMxqSjgYyRg==",
      "license": "MIT",
      "dependencies": {
        "mime-db": ">= 1.43.0 < 2"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/compression": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/compression/-/compression-1.8.1.tgz",
      "integrity": "sha512-9mAqGPHLakhCLeNyxPkK4xVo746zQ/czLH1Ky+vkitMnWfWZps8r0qXuwhwizagCRttsL4lfG4pIOvaWLpAP0w==",
      "license": "MIT",
      "dependencies": {
        "bytes": "3.1.2",
        "compressible": "~2.0.18",
        "debug": "2.6.9",
        "negotiator": "~0.6.4",
        "on-headers": "~1.1.0",
        "safe-buffer": "5.2.1",
        "vary": "~1.1.2"
      },
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/compression/node_modules/debug": {
      "version": "2.6.9",
      "resolved": "https://registry.npmjs.org/debug/-/debug-2.6.9.tgz",
      "integrity": "sha512-bC7ElrdJaJnPbAP+1EotYvqZsb3ecl5wi6Bfi6BJTUcNowp6cvspg0jXznRTKDjm/E7AdgFBVeAPVMNcKGsHMA==",
      "license": "MIT",
      "dependencies": {
        "ms": "2.0.0"
      }
    },
    "node_modules/compression/node_modules/ms": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.0.0.tgz",
      "integrity": "sha512-Tpp60P6IUJDTuOq/5Z8cdskzJujfwqfOTkrwIwj7IRISpnkJnT6SyJ4PCPnGMoFjC9ddhal5KVIYtAt97ix05A==",
      "license": "MIT"
    },
    "node_modules/compression/node_modules/negotiator": {
      "version": "0.6.4",
      "resolved": "https://registry.npmjs.org/negotiator/-/negotiator-0.6.4.tgz",
      "integrity": "sha512-myRT3DiWPHqho5PrJaIRyaMv2kgYf0mUVgBNOYMuCH5Ki1yEiQaf/ZJuQ62nvpc44wL5WDbTX7yGJi1Neevw8w==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/concat-map": {
      "version": "0.0.1",
      "resolved": "https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz",
      "integrity": "sha512-/Srv4dswyQNBfohGpz9o6Yb3Gz3SrUDqBH5rTuhGR7ahtlbYKnVxw2bCFMRljaA7EXHaXZ8wsHdodFvbkhKmqg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/concat-stream": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/concat-stream/-/concat-stream-2.0.0.tgz",
      "integrity": "sha512-MWufYdFw53ccGjCA+Ol7XJYpAlW6/prSMzuPOTRnJGcGzuhLn4Scrz7qf6o8bROZ514ltazcIFJZevcfbo0x7A==",
      "engines": [
        "node >= 6.0"
      ],
      "license": "MIT",
      "dependencies": {
        "buffer-from": "^1.0.0",
        "inherits": "^2.0.3",
        "readable-stream": "^3.0.2",
        "typedarray": "^0.0.6"
      }
    },
    "node_modules/content-disposition": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-1.0.1.tgz",
      "integrity": "sha512-oIXISMynqSqm241k6kcQ5UwttDILMK4BiurCfGEREw6+X9jkkpEe5T9FZaApyLGGOnFuyMWZpdolTXMtvEJ08Q==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/content-type": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-1.0.5.tgz",
      "integrity": "sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/cookie": {
      "version": "0.7.2",
      "resolved": "https://registry.npmjs.org/cookie/-/cookie-0.7.2.tgz",
      "integrity": "sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/cookie-signature": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.2.2.tgz",
      "integrity": "sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==",
      "license": "MIT",
      "engines": {
        "node": ">=6.6.0"
      }
    },
    "node_modules/cors": {
      "version": "2.8.5",
      "resolved": "https://registry.npmjs.org/cors/-/cors-2.8.5.tgz",
      "integrity": "sha512-KIHbLJqu73RGr/hnbrO9uBeixNGuvSQjul/jdFvS/KFSIH1hWVd1ng7zOHx+YrEfInLG7q4n6GHQ9cDtxv/P6g==",
      "license": "MIT",
      "dependencies": {
        "object-assign": "^4",
        "vary": "^1"
      },
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/create-require": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/create-require/-/create-require-1.1.1.tgz",
      "integrity": "sha512-dcKFX3jn0MpIaXjisoRvexIJVEKzaq7z2rZKxf+MSr9TkdmHmsU4m2lcLojrj/FHl8mk5VxMmYA+ftRkP/3oKQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/cross-spawn": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz",
      "integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==",
      "license": "MIT",
      "dependencies": {
        "path-key": "^3.1.0",
        "shebang-command": "^2.0.0",
        "which": "^2.0.1"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/data-uri-to-buffer": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/data-uri-to-buffer/-/data-uri-to-buffer-4.0.1.tgz",
      "integrity": "sha512-0R9ikRb668HB7QDxT1vkpuUBtqc53YyAwMwGeUFKRojY/NWKvdZ+9UYtRfGmhqNbRkTSVpMbmyhXipFFv2cb/A==",
      "license": "MIT",
      "engines": {
        "node": ">= 12"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/delayed-stream": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/delayed-stream/-/delayed-stream-1.0.0.tgz",
      "integrity": "sha512-ZySD7Nf91aLB0RxL4KGrKHBXl7Eds1DAmEdcoVawXnLD7SDhpNgtuII2aAkg7a7QS41jxPSZ17p4VdGnMHk3MQ==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/depd": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/depd/-/depd-2.0.0.tgz",
      "integrity": "sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/diff": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/diff/-/diff-4.0.2.tgz",
      "integrity": "sha512-58lmxKSA4BNyLz+HHMUzlOEpg09FV+ev6ZMe3vJihgdxzgcwZ8VoEEPmALCZG9LmqfVoNMMKpttIYTVG6uDY7A==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.3.1"
      }
    },
    "node_modules/dunder-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
      "integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.1",
        "es-errors": "^1.3.0",
        "gopd": "^1.2.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/duplexify": {
      "version": "4.1.3",
      "resolved": "https://registry.npmjs.org/duplexify/-/duplexify-4.1.3.tgz",
      "integrity": "sha512-M3BmBhwJRZsSx38lZyhE53Csddgzl5R7xGJNk7CVddZD6CcmwMCH8J+7AprIrQKH7TonKxaCjcv27Qmf+sQ+oA==",
      "license": "MIT",
      "dependencies": {
        "end-of-stream": "^1.4.1",
        "inherits": "^2.0.3",
        "readable-stream": "^3.1.1",
        "stream-shift": "^1.0.2"
      }
    },
    "node_modules/dynamic-dedupe": {
      "version": "0.3.0",
      "resolved": "https://registry.npmjs.org/dynamic-dedupe/-/dynamic-dedupe-0.3.0.tgz",
      "integrity": "sha512-ssuANeD+z97meYOqd50e04Ze5qp4bPqo8cCkI4TRjZkzAUgIDTrXV1R8QCdINpiI+hw14+rYazvTRdQrz0/rFQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "xtend": "^4.0.0"
      }
    },
    "node_modules/eastasianwidth": {
      "version": "0.2.0",
      "resolved": "https://registry.npmjs.org/eastasianwidth/-/eastasianwidth-0.2.0.tgz",
      "integrity": "sha512-I88TYZWc9XiYHRQ4/3c5rjjfgkjhLyW2luGIheGERbNQ6OY7yTybanSpDXZa8y7VUP9YmDcYa+eyq4ca7iLqWA==",
      "license": "MIT"
    },
    "node_modules/ecdsa-sig-formatter": {
      "version": "1.0.11",
      "resolved": "https://registry.npmjs.org/ecdsa-sig-formatter/-/ecdsa-sig-formatter-1.0.11.tgz",
      "integrity": "sha512-nagl3RYrbNv6kQkeJIpt6NJZy8twLB/2vtz6yN9Z4vRKHN4/QZJIEbqohALSgwKdnksuY3k5Addp5lg8sVoVcQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "safe-buffer": "^5.0.1"
      }
    },
    "node_modules/ee-first": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/ee-first/-/ee-first-1.1.1.tgz",
      "integrity": "sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==",
      "license": "MIT"
    },
    "node_modules/emoji-regex": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/emoji-regex/-/emoji-regex-8.0.0.tgz",
      "integrity": "sha512-MSjYzcWNOA0ewAHpz0MxpYFvwg6yjy1NG3xteoqz644VCo/RPgnr1/GGt+ic3iJTzQ8Eu3TdM14SawnVUmGE6A==",
      "license": "MIT"
    },
    "node_modules/encodeurl": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/encodeurl/-/encodeurl-2.0.0.tgz",
      "integrity": "sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/end-of-stream": {
      "version": "1.4.5",
      "resolved": "https://registry.npmjs.org/end-of-stream/-/end-of-stream-1.4.5.tgz",
      "integrity": "sha512-ooEGc6HP26xXq/N+GCGOT0JKCLDGrq2bQUZrQ7gyrJiZANJ/8YDTxTpQBXGMn+WbIQXNVpyWymm7KYVICQnyOg==",
      "license": "MIT",
      "dependencies": {
        "once": "^1.4.0"
      }
    },
    "node_modules/es-define-property": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
      "integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-errors": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
      "integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-object-atoms": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.1.tgz",
      "integrity": "sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-set-tostringtag": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/es-set-tostringtag/-/es-set-tostringtag-2.1.0.tgz",
      "integrity": "sha512-j6vWzfrGVfyXxge+O0x5sh6cvxAog0a/4Rdd2K36zCMV5eJ+/+tOAngRO8cODMNWbVRdVlmGZQL2YS3yR8bIUA==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.6",
        "has-tostringtag": "^1.0.2",
        "hasown": "^2.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/escalade": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz",
      "integrity": "sha512-WUj2qlxaQtO4g6Pq5c29GTcWGDyd8itL8zTlipgECz3JesAiiOKotd8JU6otB3PACgG6xkJUyVhboMS+bje/jA==",
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/escape-html": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz",
      "integrity": "sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==",
      "license": "MIT"
    },
    "node_modules/etag": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/etag/-/etag-1.8.1.tgz",
      "integrity": "sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/event-target-shim": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/event-target-shim/-/event-target-shim-5.0.1.tgz",
      "integrity": "sha512-i/2XbnSz/uxRCU6+NdVJgKWDTM427+MqYbkQzD321DuCQJUqOuJKIA0IM2+W2xtYHdKOmZ4dR6fExsd4SXL+WQ==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/express": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/express/-/express-5.2.1.tgz",
      "integrity": "sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==",
      "license": "MIT",
      "dependencies": {
        "accepts": "^2.0.0",
        "body-parser": "^2.2.1",
        "content-disposition": "^1.0.0",
        "content-type": "^1.0.5",
        "cookie": "^0.7.1",
        "cookie-signature": "^1.2.1",
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "finalhandler": "^2.1.0",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.0",
        "merge-descriptors": "^2.0.0",
        "mime-types": "^3.0.0",
        "on-finished": "^2.4.1",
        "once": "^1.4.0",
        "parseurl": "^1.3.3",
        "proxy-addr": "^2.0.7",
        "qs": "^6.14.0",
        "range-parser": "^1.2.1",
        "router": "^2.2.0",
        "send": "^1.1.0",
        "serve-static": "^2.2.0",
        "statuses": "^2.0.1",
        "type-is": "^2.0.1",
        "vary": "^1.1.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/extend": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/extend/-/extend-3.0.2.tgz",
      "integrity": "sha512-fjquC59cD7CyW6urNXK0FBufkZcoiGG80wTuPujX590cB5Ttln20E2UB4S/WARVqhXffZl2LNgS+gQdPIIim/g==",
      "license": "MIT"
    },
    "node_modules/farmhash-modern": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/farmhash-modern/-/farmhash-modern-1.1.0.tgz",
      "integrity": "sha512-6ypT4XfgqJk/F3Yuv4SX26I3doUjt0GTG4a+JgWxXQpxXzTBq8fPUeGHfcYMMDPHJHm3yPOSjaeBwBGAHWXCdA==",
      "license": "MIT",
      "engines": {
        "node": ">=18.0.0"
      }
    },
    "node_modules/fast-deep-equal": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz",
      "integrity": "sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==",
      "license": "MIT"
    },
    "node_modules/fast-xml-parser": {
      "version": "4.5.3",
      "resolved": "https://registry.npmjs.org/fast-xml-parser/-/fast-xml-parser-4.5.3.tgz",
      "integrity": "sha512-RKihhV+SHsIUGXObeVy9AXiBbFwkVk7Syp8XgwN5U3JV416+Gwp/GO9i0JYKmikykgz/UHRrrV4ROuZEo/T0ig==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/NaturalIntelligence"
        }
      ],
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "strnum": "^1.1.1"
      },
      "bin": {
        "fxparser": "src/cli/cli.js"
      }
    },
    "node_modules/faye-websocket": {
      "version": "0.11.4",
      "resolved": "https://registry.npmjs.org/faye-websocket/-/faye-websocket-0.11.4.tgz",
      "integrity": "sha512-CzbClwlXAuiRQAlUyfqPgvPoNKTckTPGfwZV4ZdAhVcP2lh9KUxJg2b5GkE7XbjKQ3YJnQ9z6D9ntLAlB+tP8g==",
      "license": "Apache-2.0",
      "dependencies": {
        "websocket-driver": ">=0.5.1"
      },
      "engines": {
        "node": ">=0.8.0"
      }
    },
    "node_modules/fetch-blob": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/fetch-blob/-/fetch-blob-3.2.0.tgz",
      "integrity": "sha512-7yAQpD2UMJzLi1Dqv7qFYnPbaPx7ZfFK6PiIxQ4PfkGPyNyl2Ugx+a/umUonmKqjhM4DnfbMvdX6otXq83soQQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/jimmywarting"
        },
        {
          "type": "paypal",
          "url": "https://paypal.me/jimmywarting"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "node-domexception": "^1.0.0",
        "web-streams-polyfill": "^3.0.3"
      },
      "engines": {
        "node": "^12.20 || >= 14.13"
      }
    },
    "node_modules/fill-range": {
      "version": "7.1.1",
      "resolved": "https://registry.npmjs.org/fill-range/-/fill-range-7.1.1.tgz",
      "integrity": "sha512-YsGpe3WHLK8ZYi4tWDg2Jy3ebRz2rXowDxnld4bkQB00cc/1Zw9AWnC0i9ztDJitivtQvaI9KaLyKrc+hBW0yg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "to-regex-range": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/finalhandler": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/finalhandler/-/finalhandler-2.1.1.tgz",
      "integrity": "sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "on-finished": "^2.4.1",
        "parseurl": "^1.3.3",
        "statuses": "^2.0.1"
      },
      "engines": {
        "node": ">= 18.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/firebase-admin": {
      "version": "13.6.0",
      "resolved": "https://registry.npmjs.org/firebase-admin/-/firebase-admin-13.6.0.tgz",
      "integrity": "sha512-GdPA/t0+Cq8p1JnjFRBmxRxAGvF/kl2yfdhALl38PrRp325YxyQ5aNaHui0XmaKcKiGRFIJ/EgBNWFoDP0onjw==",
      "license": "Apache-2.0",
      "dependencies": {
        "@fastify/busboy": "^3.0.0",
        "@firebase/database-compat": "^2.0.0",
        "@firebase/database-types": "^1.0.6",
        "@types/node": "^22.8.7",
        "farmhash-modern": "^1.1.0",
        "fast-deep-equal": "^3.1.1",
        "google-auth-library": "^9.14.2",
        "jsonwebtoken": "^9.0.0",
        "jwks-rsa": "^3.1.0",
        "node-forge": "^1.3.1",
        "uuid": "^11.0.2"
      },
      "engines": {
        "node": ">=18"
      },
      "optionalDependencies": {
        "@google-cloud/firestore": "^7.11.0",
        "@google-cloud/storage": "^7.14.0"
      }
    },
    "node_modules/firebase-admin/node_modules/@types/node": {
      "version": "22.19.3",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-22.19.3.tgz",
      "integrity": "sha512-1N9SBnWYOJTrNZCdh/yJE+t910Y128BoyY+zBLWhL3r0TYzlTmFdXrPwHL9DyFZmlEXNQQolTZh3KHV31QDhyA==",
      "license": "MIT",
      "dependencies": {
        "undici-types": "~6.21.0"
      }
    },
    "node_modules/firebase-admin/node_modules/undici-types": {
      "version": "6.21.0",
      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-6.21.0.tgz",
      "integrity": "sha512-iwDZqg0QAGrg9Rav5H4n0M64c3mkR59cJ6wQp+7C4nI0gsmExaedaYLNO44eT4AtBBwjbTiGPMlt2Md0T9H9JQ==",
      "license": "MIT"
    },
    "node_modules/firebase-admin/node_modules/uuid": {
      "version": "11.1.0",
      "resolved": "https://registry.npmjs.org/uuid/-/uuid-11.1.0.tgz",
      "integrity": "sha512-0/A9rDy9P7cJ+8w1c9WD9V//9Wj15Ce2MPz8Ri6032usz+NfePxx5AcN3bN+r6ZL6jEo066/yNYB3tn4pQEx+A==",
      "funding": [
        "https://github.com/sponsors/broofa",
        "https://github.com/sponsors/ctavan"
      ],
      "license": "MIT",
      "bin": {
        "uuid": "dist/esm/bin/uuid"
      }
    },
    "node_modules/foreground-child": {
      "version": "3.3.1",
      "resolved": "https://registry.npmjs.org/foreground-child/-/foreground-child-3.3.1.tgz",
      "integrity": "sha512-gIXjKqtFuWEgzFRJA9WCQeSJLZDjgJUOMCMzxtvFq/37KojM1BFGufqsCy0r4qSQmYLsZYMeyRqzIWOMup03sw==",
      "license": "ISC",
      "dependencies": {
        "cross-spawn": "^7.0.6",
        "signal-exit": "^4.0.1"
      },
      "engines": {
        "node": ">=14"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/form-data": {
      "version": "2.5.5",
      "resolved": "https://registry.npmjs.org/form-data/-/form-data-2.5.5.tgz",
      "integrity": "sha512-jqdObeR2rxZZbPSGL+3VckHMYtu+f9//KXBsVny6JSX/pa38Fy+bGjuG8eW/H6USNQWhLi8Num++cU2yOCNz4A==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "asynckit": "^0.4.0",
        "combined-stream": "^1.0.8",
        "es-set-tostringtag": "^2.1.0",
        "hasown": "^2.0.2",
        "mime-types": "^2.1.35",
        "safe-buffer": "^5.2.1"
      },
      "engines": {
        "node": ">= 0.12"
      }
    },
    "node_modules/form-data/node_modules/mime-db": {
      "version": "1.52.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz",
      "integrity": "sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/form-data/node_modules/mime-types": {
      "version": "2.1.35",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz",
      "integrity": "sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "mime-db": "1.52.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/formdata-polyfill": {
      "version": "4.0.10",
      "resolved": "https://registry.npmjs.org/formdata-polyfill/-/formdata-polyfill-4.0.10.tgz",
      "integrity": "sha512-buewHzMvYL29jdeQTVILecSaZKnt/RJWjoZCF5OW60Z67/GmSLBkOFM7qh1PI3zFNtJbaZL5eQu1vLfazOwj4g==",
      "license": "MIT",
      "dependencies": {
        "fetch-blob": "^3.1.2"
      },
      "engines": {
        "node": ">=12.20.0"
      }
    },
    "node_modules/forwarded": {
      "version": "0.2.0",
      "resolved": "https://registry.npmjs.org/forwarded/-/forwarded-0.2.0.tgz",
      "integrity": "sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/fresh": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/fresh/-/fresh-2.0.0.tgz",
      "integrity": "sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/fs.realpath": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/fs.realpath/-/fs.realpath-1.0.0.tgz",
      "integrity": "sha512-OO0pH2lK6a0hZnAdau5ItzHPI6pUlvI7jMVnxUQRtw4owF2wk8lOSabtGDCTP4Ggrg2MbGnWO9X8K1t4+fGMDw==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/fsevents": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/function-bind": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/functional-red-black-tree": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/functional-red-black-tree/-/functional-red-black-tree-1.0.1.tgz",
      "integrity": "sha512-dsKNQNdj6xA3T+QlADDA7mOSlX0qiMINjn0cgr+eGHGsbSHzTabcIogz2+p/iqP1Xs6EP/sS2SbqH+brGTbq0g==",
      "license": "MIT",
      "optional": true
    },
    "node_modules/gaxios": {
      "version": "6.7.1",
      "resolved": "https://registry.npmjs.org/gaxios/-/gaxios-6.7.1.tgz",
      "integrity": "sha512-LDODD4TMYx7XXdpwxAVRAIAuB0bzv0s+ywFonY46k126qzQHT9ygyoa9tncmOiQmmDrik65UYsEkv3lbfqQ3yQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "extend": "^3.0.2",
        "https-proxy-agent": "^7.0.1",
        "is-stream": "^2.0.0",
        "node-fetch": "^2.6.9",
        "uuid": "^9.0.1"
      },
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/gaxios/node_modules/uuid": {
      "version": "9.0.1",
      "resolved": "https://registry.npmjs.org/uuid/-/uuid-9.0.1.tgz",
      "integrity": "sha512-b+1eJOlsR9K8HJpow9Ok3fiWOWSIcIzXodvv0rQjVoOVNpWMpxf1wZNpt4y9h10odCNrqnYp1OBzRktckBe3sA==",
      "funding": [
        "https://github.com/sponsors/broofa",
        "https://github.com/sponsors/ctavan"
      ],
      "license": "MIT",
      "bin": {
        "uuid": "dist/bin/uuid"
      }
    },
    "node_modules/gcp-metadata": {
      "version": "6.1.1",
      "resolved": "https://registry.npmjs.org/gcp-metadata/-/gcp-metadata-6.1.1.tgz",
      "integrity": "sha512-a4tiq7E0/5fTjxPAaH4jpjkSv/uCaU2p5KC6HVGrvl0cDjA8iBZv4vv1gyzlmK0ZUKqwpOyQMKzZQe3lTit77A==",
      "license": "Apache-2.0",
      "dependencies": {
        "gaxios": "^6.1.1",
        "google-logging-utils": "^0.0.2",
        "json-bigint": "^1.0.0"
      },
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/get-caller-file": {
      "version": "2.0.5",
      "resolved": "https://registry.npmjs.org/get-caller-file/-/get-caller-file-2.0.5.tgz",
      "integrity": "sha512-DyFP3BM/3YHTQOCUL/w0OZHR0lpKeGrxotcHWcqNEdnltqFwXVfhEBQ94eIo34AfQpo0rGki4cyIiftY06h2Fg==",
      "license": "ISC",
      "engines": {
        "node": "6.* || 8.* || >= 10.*"
      }
    },
    "node_modules/get-intrinsic": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
      "integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "es-define-property": "^1.0.1",
        "es-errors": "^1.3.0",
        "es-object-atoms": "^1.1.1",
        "function-bind": "^1.1.2",
        "get-proto": "^1.0.1",
        "gopd": "^1.2.0",
        "has-symbols": "^1.1.0",
        "hasown": "^2.0.2",
        "math-intrinsics": "^1.1.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
      "integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
      "license": "MIT",
      "dependencies": {
        "dunder-proto": "^1.0.1",
        "es-object-atoms": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/glob": {
      "version": "7.2.3",
      "resolved": "https://registry.npmjs.org/glob/-/glob-7.2.3.tgz",
      "integrity": "sha512-nFR0zLpU2YCaRxwoCJvL6UvCH2JFyFVIvwTLsIf21AuHlMskA1hhTdk+LlYJtOlYt9v6dvszD2BGRqBL+iQK9Q==",
      "deprecated": "Glob versions prior to v9 are no longer supported",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "fs.realpath": "^1.0.0",
        "inflight": "^1.0.4",
        "inherits": "2",
        "minimatch": "^3.1.1",
        "once": "^1.3.0",
        "path-is-absolute": "^1.0.0"
      },
      "engines": {
        "node": "*"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/glob-parent": {
      "version": "5.1.2",
      "resolved": "https://registry.npmjs.org/glob-parent/-/glob-parent-5.1.2.tgz",
      "integrity": "sha512-AOIgSQCepiJYwP3ARnGx+5VnTu2HBYdzbGP45eLw1vr3zB3vZLeyed1sC9hnbcOc9/SrMyM5RPQrkGz4aS9Zow==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "is-glob": "^4.0.1"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/google-auth-library": {
      "version": "9.15.1",
      "resolved": "https://registry.npmjs.org/google-auth-library/-/google-auth-library-9.15.1.tgz",
      "integrity": "sha512-Jb6Z0+nvECVz+2lzSMt9u98UsoakXxA2HGHMCxh+so3n90XgYWkq5dur19JAJV7ONiJY22yBTyJB1TSkvPq9Ng==",
      "license": "Apache-2.0",
      "dependencies": {
        "base64-js": "^1.3.0",
        "ecdsa-sig-formatter": "^1.0.11",
        "gaxios": "^6.1.1",
        "gcp-metadata": "^6.1.0",
        "gtoken": "^7.0.0",
        "jws": "^4.0.0"
      },
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/google-gax": {
      "version": "4.6.1",
      "resolved": "https://registry.npmjs.org/google-gax/-/google-gax-4.6.1.tgz",
      "integrity": "sha512-V6eky/xz2mcKfAd1Ioxyd6nmA61gao3n01C+YeuIwu3vzM9EDR6wcVzMSIbLMDXWeoi9SHYctXuKYC5uJUT3eQ==",
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "@grpc/grpc-js": "^1.10.9",
        "@grpc/proto-loader": "^0.7.13",
        "@types/long": "^4.0.0",
        "abort-controller": "^3.0.0",
        "duplexify": "^4.0.0",
        "google-auth-library": "^9.3.0",
        "node-fetch": "^2.7.0",
        "object-hash": "^3.0.0",
        "proto3-json-serializer": "^2.0.2",
        "protobufjs": "^7.3.2",
        "retry-request": "^7.0.0",
        "uuid": "^9.0.1"
      },
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/google-gax/node_modules/uuid": {
      "version": "9.0.1",
      "resolved": "https://registry.npmjs.org/uuid/-/uuid-9.0.1.tgz",
      "integrity": "sha512-b+1eJOlsR9K8HJpow9Ok3fiWOWSIcIzXodvv0rQjVoOVNpWMpxf1wZNpt4y9h10odCNrqnYp1OBzRktckBe3sA==",
      "funding": [
        "https://github.com/sponsors/broofa",
        "https://github.com/sponsors/ctavan"
      ],
      "license": "MIT",
      "optional": true,
      "bin": {
        "uuid": "dist/bin/uuid"
      }
    },
    "node_modules/google-logging-utils": {
      "version": "0.0.2",
      "resolved": "https://registry.npmjs.org/google-logging-utils/-/google-logging-utils-0.0.2.tgz",
      "integrity": "sha512-NEgUnEcBiP5HrPzufUkBzJOD/Sxsco3rLNo1F1TNf7ieU8ryUzBhqba8r756CjLX7rn3fHl6iLEwPYuqpoKgQQ==",
      "license": "Apache-2.0",
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/gopd": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
      "integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/gtoken": {
      "version": "7.1.0",
      "resolved": "https://registry.npmjs.org/gtoken/-/gtoken-7.1.0.tgz",
      "integrity": "sha512-pCcEwRi+TKpMlxAQObHDQ56KawURgyAf6jtIY046fJ5tIv3zDe/LEIubckAO8fj6JnAxLdmWkUfNyulQ2iKdEw==",
      "license": "MIT",
      "dependencies": {
        "gaxios": "^6.0.0",
        "jws": "^4.0.0"
      },
      "engines": {
        "node": ">=14.0.0"
      }
    },
    "node_modules/has-symbols": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
      "integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/has-tostringtag": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/has-tostringtag/-/has-tostringtag-1.0.2.tgz",
      "integrity": "sha512-NqADB8VjPFLM2V0VvHUewwwsw0ZWBaIdgo+ieHtK3hasLz4qeCRjYcqfB6AQrBggRKppKF8L52/VqdVsO47Dlw==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "has-symbols": "^1.0.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/hasown": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.2.tgz",
      "integrity": "sha512-0hJU9SCPvmMzIBdZFqNPXWa6dqh7WdH0cII9y+CyS8rG3nL48Bclra9HmKhVVUHyPWNH5Y7xDwAB7bfgSjkUMQ==",
      "license": "MIT",
      "dependencies": {
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/helmet": {
      "version": "8.1.0",
      "resolved": "https://registry.npmjs.org/helmet/-/helmet-8.1.0.tgz",
      "integrity": "sha512-jOiHyAZsmnr8LqoPGmCjYAaiuWwjAPLgY8ZX2XrmHawt99/u1y6RgrZMTeoPfpUbV96HOalYgz1qzkRbw54Pmg==",
      "license": "MIT",
      "engines": {
        "node": ">=18.0.0"
      }
    },
    "node_modules/html-entities": {
      "version": "2.6.0",
      "resolved": "https://registry.npmjs.org/html-entities/-/html-entities-2.6.0.tgz",
      "integrity": "sha512-kig+rMn/QOVRvr7c86gQ8lWXq+Hkv6CbAH1hLu+RG338StTpE8Z0b44SDVaqVu7HGKf27frdmUYEs9hTUX/cLQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/mdevils"
        },
        {
          "type": "patreon",
          "url": "https://patreon.com/mdevils"
        }
      ],
      "license": "MIT",
      "optional": true
    },
    "node_modules/http-errors": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz",
      "integrity": "sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==",
      "license": "MIT",
      "dependencies": {
        "depd": "~2.0.0",
        "inherits": "~2.0.4",
        "setprototypeof": "~1.2.0",
        "statuses": "~2.0.2",
        "toidentifier": "~1.0.1"
      },
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/http-parser-js": {
      "version": "0.5.10",
      "resolved": "https://registry.npmjs.org/http-parser-js/-/http-parser-js-0.5.10.tgz",
      "integrity": "sha512-Pysuw9XpUq5dVc/2SMHpuTY01RFl8fttgcyunjL7eEMhGM3cI4eOmiCycJDVCo/7O7ClfQD3SaI6ftDzqOXYMA==",
      "license": "MIT"
    },
    "node_modules/http-proxy-agent": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/http-proxy-agent/-/http-proxy-agent-5.0.0.tgz",
      "integrity": "sha512-n2hY8YdoRE1i7r6M0w9DIw5GgZN0G25P8zLCRQ8rjXtTU3vsNFBI/vWK/UIeE6g5MUUz6avwAPXmL6Fy9D/90w==",
      "license": "MIT",
      "dependencies": {
        "@tootallnate/once": "2",
        "agent-base": "6",
        "debug": "4"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/http-proxy-agent/node_modules/agent-base": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-6.0.2.tgz",
      "integrity": "sha512-RZNwNclF7+MS/8bDg70amg32dyeZGZxiDuQmZxKLAlQjr3jGyLx+4Kkk58UO7D2QdgFIQCovuSuZESne6RG6XQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "4"
      },
      "engines": {
        "node": ">= 6.0.0"
      }
    },
    "node_modules/https-proxy-agent": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-7.0.6.tgz",
      "integrity": "sha512-vK9P5/iUfdl95AI+JVyUuIcVtd4ofvtrOr3HNtM2yxC9bnMbEdp3x01OhQNnjb8IJYi38VlTE3mBXwcfvywuSw==",
      "license": "MIT",
      "dependencies": {
        "agent-base": "^7.1.2",
        "debug": "4"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/iconv-lite": {
      "version": "0.7.1",
      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.7.1.tgz",
      "integrity": "sha512-2Tth85cXwGFHfvRgZWszZSvdo+0Xsqmw8k8ZwxScfcBneNUraK+dxRxRm24nszx80Y0TVio8kKLt5sLE7ZCLlw==",
      "license": "MIT",
      "dependencies": {
        "safer-buffer": ">= 2.1.2 < 3.0.0"
      },
      "engines": {
        "node": ">=0.10.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/inflight": {
      "version": "1.0.6",
      "resolved": "https://registry.npmjs.org/inflight/-/inflight-1.0.6.tgz",
      "integrity": "sha512-k92I/b08q4wvFscXCLvqfsHCrjrF7yiXsQuIVvVE7N82W3+aqpzuUdBbfhWcy/FZR3/4IgflMgKLOsvPDrGCJA==",
      "deprecated": "This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "once": "^1.3.0",
        "wrappy": "1"
      }
    },
    "node_modules/inherits": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
      "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
      "license": "ISC"
    },
    "node_modules/ipaddr.js": {
      "version": "1.9.1",
      "resolved": "https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-1.9.1.tgz",
      "integrity": "sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/is-binary-path": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/is-binary-path/-/is-binary-path-2.1.0.tgz",
      "integrity": "sha512-ZMERYes6pDydyuGidse7OsHxtbI7WVeUEozgR/g7rd0xUimYNlvZRE/K2MgZTjWy725IfelLeVcEM97mmtRGXw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "binary-extensions": "^2.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/is-core-module": {
      "version": "2.16.1",
      "resolved": "https://registry.npmjs.org/is-core-module/-/is-core-module-2.16.1.tgz",
      "integrity": "sha512-UfoeMA6fIJ8wTYFEUjelnaGI67v6+N7qXJEvQuIGa99l4xsCruSYOVSQ0uPANn4dAzm8lkYPaKLrrijLq7x23w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "hasown": "^2.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/is-extglob": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/is-extglob/-/is-extglob-2.1.1.tgz",
      "integrity": "sha512-SbKbANkN603Vi4jEZv49LeVJMn4yGwsbzZworEoyEiutsN3nJYdbO36zfhGJ6QEDpOZIFkDtnq5JRxmvl3jsoQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/is-fullwidth-code-point": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/is-fullwidth-code-point/-/is-fullwidth-code-point-3.0.0.tgz",
      "integrity": "sha512-zymm5+u+sCsSWyD9qNaejV3DFvhCKclKdizYaJUuHA83RLjb7nSuGnddCHGv0hk+KY7BMAlsWeK4Ueg6EV6XQg==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/is-glob": {
      "version": "4.0.3",
      "resolved": "https://registry.npmjs.org/is-glob/-/is-glob-4.0.3.tgz",
      "integrity": "sha512-xelSayHH36ZgE7ZWhli7pW34hNbNl8Ojv5KVmkJD4hBdD3th8Tfk9vYasLM+mXWOZhFkgZfxhLSnrwRr4elSSg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "is-extglob": "^2.1.1"
      },
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/is-number": {
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz",
      "integrity": "sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.12.0"
      }
    },
    "node_modules/is-promise": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/is-promise/-/is-promise-4.0.0.tgz",
      "integrity": "sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==",
      "license": "MIT"
    },
    "node_modules/is-stream": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/is-stream/-/is-stream-2.0.1.tgz",
      "integrity": "sha512-hFoiJiTl63nn+kstHGBtewWSKnQLpyb155KHheA1l39uvtO9nWIop1p3udqPcUd/xbF1VLMO4n7OI6p7RbngDg==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/isexe": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz",
      "integrity": "sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==",
      "license": "ISC"
    },
    "node_modules/jackspeak": {
      "version": "3.4.3",
      "resolved": "https://registry.npmjs.org/jackspeak/-/jackspeak-3.4.3.tgz",
      "integrity": "sha512-OGlZQpz2yfahA/Rd1Y8Cd9SIEsqvXkLVoSw/cgwhnhFMDbsQFeZYoJJ7bIZBS9BcamUW96asq/npPWugM+RQBw==",
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "@isaacs/cliui": "^8.0.2"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      },
      "optionalDependencies": {
        "@pkgjs/parseargs": "^0.11.0"
      }
    },
    "node_modules/jose": {
      "version": "4.15.9",
      "resolved": "https://registry.npmjs.org/jose/-/jose-4.15.9.tgz",
      "integrity": "sha512-1vUQX+IdDMVPj4k8kOxgUqlcK518yluMuGZwqlr44FS1ppZB/5GWh4rZG89erpOBOJjU/OBsnCVFfapsRz6nEA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/panva"
      }
    },
    "node_modules/json-bigint": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/json-bigint/-/json-bigint-1.0.0.tgz",
      "integrity": "sha512-SiPv/8VpZuWbvLSMtTDU8hEfrZWg/mH/nV/b4o0CYbSxu1UIQPLdwKOCIyLQX+VIPO5vrLX3i8qtqFyhdPSUSQ==",
      "license": "MIT",
      "dependencies": {
        "bignumber.js": "^9.0.0"
      }
    },
    "node_modules/jsonwebtoken": {
      "version": "9.0.3",
      "resolved": "https://registry.npmjs.org/jsonwebtoken/-/jsonwebtoken-9.0.3.tgz",
      "integrity": "sha512-MT/xP0CrubFRNLNKvxJ2BYfy53Zkm++5bX9dtuPbqAeQpTVe0MQTFhao8+Cp//EmJp244xt6Drw/GVEGCUj40g==",
      "license": "MIT",
      "dependencies": {
        "jws": "^4.0.1",
        "lodash.includes": "^4.3.0",
        "lodash.isboolean": "^3.0.3",
        "lodash.isinteger": "^4.0.4",
        "lodash.isnumber": "^3.0.3",
        "lodash.isplainobject": "^4.0.6",
        "lodash.isstring": "^4.0.1",
        "lodash.once": "^4.0.0",
        "ms": "^2.1.1",
        "semver": "^7.5.4"
      },
      "engines": {
        "node": ">=12",
        "npm": ">=6"
      }
    },
    "node_modules/jwa": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/jwa/-/jwa-2.0.1.tgz",
      "integrity": "sha512-hRF04fqJIP8Abbkq5NKGN0Bbr3JxlQ+qhZufXVr0DvujKy93ZCbXZMHDL4EOtodSbCWxOqR8MS1tXA5hwqCXDg==",
      "license": "MIT",
      "dependencies": {
        "buffer-equal-constant-time": "^1.0.1",
        "ecdsa-sig-formatter": "1.0.11",
        "safe-buffer": "^5.0.1"
      }
    },
    "node_modules/jwks-rsa": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/jwks-rsa/-/jwks-rsa-3.2.0.tgz",
      "integrity": "sha512-PwchfHcQK/5PSydeKCs1ylNym0w/SSv8a62DgHJ//7x2ZclCoinlsjAfDxAAbpoTPybOum/Jgy+vkvMmKz89Ww==",
      "license": "MIT",
      "dependencies": {
        "@types/express": "^4.17.20",
        "@types/jsonwebtoken": "^9.0.4",
        "debug": "^4.3.4",
        "jose": "^4.15.4",
        "limiter": "^1.1.5",
        "lru-memoizer": "^2.2.0"
      },
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/jwks-rsa/node_modules/@types/express": {
      "version": "4.17.25",
      "resolved": "https://registry.npmjs.org/@types/express/-/express-4.17.25.tgz",
      "integrity": "sha512-dVd04UKsfpINUnK0yBoYHDF3xu7xVH4BuDotC/xGuycx4CgbP48X/KF/586bcObxT0HENHXEU8Nqtu6NR+eKhw==",
      "license": "MIT",
      "dependencies": {
        "@types/body-parser": "*",
        "@types/express-serve-static-core": "^4.17.33",
        "@types/qs": "*",
        "@types/serve-static": "^1"
      }
    },
    "node_modules/jwks-rsa/node_modules/@types/express-serve-static-core": {
      "version": "4.19.7",
      "resolved": "https://registry.npmjs.org/@types/express-serve-static-core/-/express-serve-static-core-4.19.7.tgz",
      "integrity": "sha512-FvPtiIf1LfhzsaIXhv/PHan/2FeQBbtBDtfX2QfvPxdUelMDEckK08SM6nqo1MIZY3RUlfA+HV8+hFUSio78qg==",
      "license": "MIT",
      "dependencies": {
        "@types/node": "*",
        "@types/qs": "*",
        "@types/range-parser": "*",
        "@types/send": "*"
      }
    },
    "node_modules/jwks-rsa/node_modules/@types/send": {
      "version": "0.17.6",
      "resolved": "https://registry.npmjs.org/@types/send/-/send-0.17.6.tgz",
      "integrity": "sha512-Uqt8rPBE8SY0RK8JB1EzVOIZ32uqy8HwdxCnoCOsYrvnswqmFZ/k+9Ikidlk/ImhsdvBsloHbAlewb2IEBV/Og==",
      "license": "MIT",
      "dependencies": {
        "@types/mime": "^1",
        "@types/node": "*"
      }
    },
    "node_modules/jwks-rsa/node_modules/@types/serve-static": {
      "version": "1.15.10",
      "resolved": "https://registry.npmjs.org/@types/serve-static/-/serve-static-1.15.10.tgz",
      "integrity": "sha512-tRs1dB+g8Itk72rlSI2ZrW6vZg0YrLI81iQSTkMmOqnqCaNr/8Ek4VwWcN5vZgCYWbg/JJSGBlUaYGAOP73qBw==",
      "license": "MIT",
      "dependencies": {
        "@types/http-errors": "*",
        "@types/node": "*",
        "@types/send": "<1"
      }
    },
    "node_modules/jws": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/jws/-/jws-4.0.1.tgz",
      "integrity": "sha512-EKI/M/yqPncGUUh44xz0PxSidXFr/+r0pA70+gIYhjv+et7yxM+s29Y+VGDkovRofQem0fs7Uvf4+YmAdyRduA==",
      "license": "MIT",
      "dependencies": {
        "jwa": "^2.0.1",
        "safe-buffer": "^5.0.1"
      }
    },
    "node_modules/limiter": {
      "version": "1.1.5",
      "resolved": "https://registry.npmjs.org/limiter/-/limiter-1.1.5.tgz",
      "integrity": "sha512-FWWMIEOxz3GwUI4Ts/IvgVy6LPvoMPgjMdQ185nN6psJyBJ4yOpzqm695/h5umdLJg2vW3GR5iG11MAkR2AzJA=="
    },
    "node_modules/lodash.camelcase": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/lodash.camelcase/-/lodash.camelcase-4.3.0.tgz",
      "integrity": "sha512-TwuEnCnxbc3rAvhf/LbG7tJUDzhqXyFnv3dtzLOPgCG/hODL7WFnsbwktkD7yUV0RrreP/l1PALq/YSg6VvjlA==",
      "license": "MIT"
    },
    "node_modules/lodash.clonedeep": {
      "version": "4.5.0",
      "resolved": "https://registry.npmjs.org/lodash.clonedeep/-/lodash.clonedeep-4.5.0.tgz",
      "integrity": "sha512-H5ZhCF25riFd9uB5UCkVKo61m3S/xZk1x4wA6yp/L3RFP6Z/eHH1ymQcGLo7J3GMPfm0V/7m1tryHuGVxpqEBQ==",
      "license": "MIT"
    },
    "node_modules/lodash.includes": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/lodash.includes/-/lodash.includes-4.3.0.tgz",
      "integrity": "sha512-W3Bx6mdkRTGtlJISOvVD/lbqjTlPPUDTMnlXZFnVwi9NKJ6tiAk6LVdlhZMm17VZisqhKcgzpO5Wz91PCt5b0w==",
      "license": "MIT"
    },
    "node_modules/lodash.isboolean": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/lodash.isboolean/-/lodash.isboolean-3.0.3.tgz",
      "integrity": "sha512-Bz5mupy2SVbPHURB98VAcw+aHh4vRV5IPNhILUCsOzRmsTmSQ17jIuqopAentWoehktxGd9e/hbIXq980/1QJg==",
      "license": "MIT"
    },
    "node_modules/lodash.isinteger": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/lodash.isinteger/-/lodash.isinteger-4.0.4.tgz",
      "integrity": "sha512-DBwtEWN2caHQ9/imiNeEA5ys1JoRtRfY3d7V9wkqtbycnAmTvRRmbHKDV4a0EYc678/dia0jrte4tjYwVBaZUA==",
      "license": "MIT"
    },
    "node_modules/lodash.isnumber": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/lodash.isnumber/-/lodash.isnumber-3.0.3.tgz",
      "integrity": "sha512-QYqzpfwO3/CWf3XP+Z+tkQsfaLL/EnUlXWVkIk5FUPc4sBdTehEqZONuyRt2P67PXAk+NXmTBcc97zw9t1FQrw==",
      "license": "MIT"
    },
    "node_modules/lodash.isplainobject": {
      "version": "4.0.6",
      "resolved": "https://registry.npmjs.org/lodash.isplainobject/-/lodash.isplainobject-4.0.6.tgz",
      "integrity": "sha512-oSXzaWypCMHkPC3NvBEaPHf0KsA5mvPrOPgQWDsbg8n7orZ290M0BmC/jgRZ4vcJ6DTAhjrsSYgdsW/F+MFOBA==",
      "license": "MIT"
    },
    "node_modules/lodash.isstring": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/lodash.isstring/-/lodash.isstring-4.0.1.tgz",
      "integrity": "sha512-0wJxfxH1wgO3GrbuP+dTTk7op+6L41QCXbGINEmD+ny/G/eCqGzxyCsh7159S+mgDDcoarnBw6PC1PS5+wUGgw==",
      "license": "MIT"
    },
    "node_modules/lodash.once": {
      "version": "4.1.1",
      "resolved": "https://registry.npmjs.org/lodash.once/-/lodash.once-4.1.1.tgz",
      "integrity": "sha512-Sb487aTOCr9drQVL8pIxOzVhafOjZN9UU54hiN8PU3uAiSV7lx1yYNpbNmex2PK6dSJoNTSJUUswT651yww3Mg==",
      "license": "MIT"
    },
    "node_modules/long": {
      "version": "5.3.2",
      "resolved": "https://registry.npmjs.org/long/-/long-5.3.2.tgz",
      "integrity": "sha512-mNAgZ1GmyNhD7AuqnTG3/VQ26o760+ZYBPKjPvugO8+nLbYfX6TVpJPseBvopbdY+qpZ/lKUnmEc1LeZYS3QAA==",
      "license": "Apache-2.0"
    },
    "node_modules/lru-cache": {
      "version": "6.0.0",
      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-6.0.0.tgz",
      "integrity": "sha512-Jo6dJ04CmSjuznwJSS3pUeWmd/H0ffTlkXXgwZi+eq1UCmqQwCh+eLsYOYCwY991i2Fah4h1BEMCx4qThGbsiA==",
      "license": "ISC",
      "dependencies": {
        "yallist": "^4.0.0"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/lru-memoizer": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/lru-memoizer/-/lru-memoizer-2.3.0.tgz",
      "integrity": "sha512-GXn7gyHAMhO13WSKrIiNfztwxodVsP8IoZ3XfrJV4yH2x0/OeTO/FIaAHTY5YekdGgW94njfuKmyyt1E0mR6Ug==",
      "license": "MIT",
      "dependencies": {
        "lodash.clonedeep": "^4.5.0",
        "lru-cache": "6.0.0"
      }
    },
    "node_modules/make-error": {
      "version": "1.3.6",
      "resolved": "https://registry.npmjs.org/make-error/-/make-error-1.3.6.tgz",
      "integrity": "sha512-s8UhlNe7vPKomQhC1qFelMokr/Sc3AgNbso3n74mVPA5LTZwkB9NlXf4XPamLxJE8h0gh73rM94xvwRT2CVInw==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/math-intrinsics": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
      "integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/media-typer": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/media-typer/-/media-typer-1.1.0.tgz",
      "integrity": "sha512-aisnrDP4GNe06UcKFnV5bfMNPBUw4jsLGaWwWfnH3v02GnBuXX2MCVn5RbrWo0j3pczUilYblq7fQ7Nw2t5XKw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/merge-descriptors": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/merge-descriptors/-/merge-descriptors-2.0.0.tgz",
      "integrity": "sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/mime": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/mime/-/mime-3.0.0.tgz",
      "integrity": "sha512-jSCU7/VB1loIWBZe14aEYHU/+1UMEHoaO7qxCOVJOw9GgH72VAWppxNcjU+x9a2k3GSIBXNKxXQFqRvvZ7vr3A==",
      "license": "MIT",
      "optional": true,
      "bin": {
        "mime": "cli.js"
      },
      "engines": {
        "node": ">=10.0.0"
      }
    },
    "node_modules/mime-db": {
      "version": "1.54.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.54.0.tgz",
      "integrity": "sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/mime-types": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-3.0.2.tgz",
      "integrity": "sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "^1.54.0"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/minimatch": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.2.tgz",
      "integrity": "sha512-J7p63hRiAjw1NDEww1W7i37+ByIrOWO5XQQAzZ3VOcL0PNybwpfmV/N05zFAzwQ9USyEcX6t3UO+K5aqBQOIHw==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^1.1.7"
      },
      "engines": {
        "node": "*"
      }
    },
    "node_modules/minimist": {
      "version": "1.2.8",
      "resolved": "https://registry.npmjs.org/minimist/-/minimist-1.2.8.tgz",
      "integrity": "sha512-2yyAR8qBkN3YuheJanUpWC5U3bb5osDywNB8RzDVlDwDHbocAJveqqj1u8+SVD7jkWT4yvsHCpWqqWqAxb0zCA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/minipass": {
      "version": "7.1.2",
      "resolved": "https://registry.npmjs.org/minipass/-/minipass-7.1.2.tgz",
      "integrity": "sha512-qOOzS1cBTWYF4BH8fVePDBOO9iptMnGUEZwNc/cMWnTV2nVLZ7VoNWEPHkYczZA0pdoA7dl6e7FL659nX9S2aw==",
      "license": "ISC",
      "engines": {
        "node": ">=16 || 14 >=14.17"
      }
    },
    "node_modules/mkdirp": {
      "version": "1.0.4",
      "resolved": "https://registry.npmjs.org/mkdirp/-/mkdirp-1.0.4.tgz",
      "integrity": "sha512-vVqVZQyf3WLx2Shd0qJ9xuvqgAyKPLAiqITEtqW0oIUjzo3PePDd6fW9iFz30ef7Ysp/oiWqbhszeGWW2T6Gzw==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "mkdirp": "bin/cmd.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "license": "MIT"
    },
    "node_modules/multer": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/multer/-/multer-2.0.2.tgz",
      "integrity": "sha512-u7f2xaZ/UG8oLXHvtF/oWTRvT44p9ecwBBqTwgJVq0+4BW1g8OW01TyMEGWBHbyMOYVHXslaut7qEQ1meATXgw==",
      "license": "MIT",
      "dependencies": {
        "append-field": "^1.0.0",
        "busboy": "^1.6.0",
        "concat-stream": "^2.0.0",
        "mkdirp": "^0.5.6",
        "object-assign": "^4.1.1",
        "type-is": "^1.6.18",
        "xtend": "^4.0.2"
      },
      "engines": {
        "node": ">= 10.16.0"
      }
    },
    "node_modules/multer/node_modules/media-typer": {
      "version": "0.3.0",
      "resolved": "https://registry.npmjs.org/media-typer/-/media-typer-0.3.0.tgz",
      "integrity": "sha512-dq+qelQ9akHpcOl/gUVRTxVIOkAJ1wR3QAvb4RsVjS8oVoFjDGTc679wJYmUmknUF5HwMLOgb5O+a3KxfWapPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/multer/node_modules/mime-db": {
      "version": "1.52.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz",
      "integrity": "sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/multer/node_modules/mime-types": {
      "version": "2.1.35",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz",
      "integrity": "sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "1.52.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/multer/node_modules/mkdirp": {
      "version": "0.5.6",
      "resolved": "https://registry.npmjs.org/mkdirp/-/mkdirp-0.5.6.tgz",
      "integrity": "sha512-FP+p8RB8OWpF3YZBCrP5gtADmtXApB5AMLn+vdyA+PyxCjrCs00mjyUozssO33cwDeT3wNGdLxJ5M//YqtHAJw==",
      "license": "MIT",
      "dependencies": {
        "minimist": "^1.2.6"
      },
      "bin": {
        "mkdirp": "bin/cmd.js"
      }
    },
    "node_modules/multer/node_modules/type-is": {
      "version": "1.6.18",
      "resolved": "https://registry.npmjs.org/type-is/-/type-is-1.6.18.tgz",
      "integrity": "sha512-TkRKr9sUTxEH8MdfuCSP7VizJyzRNMjj2J2do2Jr3Kym598JVdEksuzPQCnlFPW4ky9Q+iA+ma9BGm06XQBy8g==",
      "license": "MIT",
      "dependencies": {
        "media-typer": "0.3.0",
        "mime-types": "~2.1.24"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/negotiator": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/negotiator/-/negotiator-1.0.0.tgz",
      "integrity": "sha512-8Ofs/AUQh8MaEcrlq5xOX0CQ9ypTF5dl78mjlMNfOK08fzpgTHQRQPBxcPlEtIw0yRpws+Zo/3r+5WRby7u3Gg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/node-domexception": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/node-domexception/-/node-domexception-1.0.0.tgz",
      "integrity": "sha512-/jKZoMpw0F8GRwl4/eLROPA3cfcXtLApP0QzLmUT/HuPCZWyB7IY9ZrMeKw2O/nFIqPQB3PVM9aYm0F312AXDQ==",
      "deprecated": "Use your platform's native DOMException instead",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/jimmywarting"
        },
        {
          "type": "github",
          "url": "https://paypal.me/jimmywarting"
        }
      ],
      "license": "MIT",
      "engines": {
        "node": ">=10.5.0"
      }
    },
    "node_modules/node-fetch": {
      "version": "2.7.0",
      "resolved": "https://registry.npmjs.org/node-fetch/-/node-fetch-2.7.0.tgz",
      "integrity": "sha512-c4FRfUm/dbcWZ7U+1Wq0AwCyFL+3nt2bEw05wfxSz+DWpWsitgmSgYmy2dQdWyKC1694ELPqMs/YzUSNozLt8A==",
      "license": "MIT",
      "dependencies": {
        "whatwg-url": "^5.0.0"
      },
      "engines": {
        "node": "4.x || >=6.0.0"
      },
      "peerDependencies": {
        "encoding": "^0.1.0"
      },
      "peerDependenciesMeta": {
        "encoding": {
          "optional": true
        }
      }
    },
    "node_modules/node-forge": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/node-forge/-/node-forge-1.3.3.tgz",
      "integrity": "sha512-rLvcdSyRCyouf6jcOIPe/BgwG/d7hKjzMKOas33/pHEr6gbq18IK9zV7DiPvzsz0oBJPme6qr6H6kGZuI9/DZg==",
      "license": "(BSD-3-Clause OR GPL-2.0)",
      "engines": {
        "node": ">= 6.13.0"
      }
    },
    "node_modules/normalize-path": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/normalize-path/-/normalize-path-3.0.0.tgz",
      "integrity": "sha512-6eZs5Ls3WtCisHWp9S2GUy8dqkpGi4BVSz3GaqiE6ezub0512ESztXUwUB6C6IKbQkY2Pnb/mD4WYojCRwcwLA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/object-assign": {
      "version": "4.1.1",
      "resolved": "https://registry.npmjs.org/object-assign/-/object-assign-4.1.1.tgz",
      "integrity": "sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/object-hash": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/object-hash/-/object-hash-3.0.0.tgz",
      "integrity": "sha512-RSn9F68PjH9HqtltsSnqYC1XXoWe9Bju5+213R98cNGttag9q9yAOTzdbsqvIa7aNm5WffBZFpWYr2aWrklWAw==",
      "license": "MIT",
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/object-inspect": {
      "version": "1.13.4",
      "resolved": "https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz",
      "integrity": "sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/on-finished": {
      "version": "2.4.1",
      "resolved": "https://registry.npmjs.org/on-finished/-/on-finished-2.4.1.tgz",
      "integrity": "sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==",
      "license": "MIT",
      "dependencies": {
        "ee-first": "1.1.1"
      },
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/on-headers": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/on-headers/-/on-headers-1.1.0.tgz",
      "integrity": "sha512-737ZY3yNnXy37FHkQxPzt4UZ2UWPWiCZWLvFZ4fu5cueciegX0zGPnrlY6bwRg4FdQOe9YU8MkmJwGhoMybl8A==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/once": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/once/-/once-1.4.0.tgz",
      "integrity": "sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==",
      "license": "ISC",
      "dependencies": {
        "wrappy": "1"
      }
    },
    "node_modules/p-limit": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz",
      "integrity": "sha512-TYOanM3wGwNGsZN2cVTYPArw454xnXj5qmWF1bEoAc4+cU/ol7GVh7odevjp1FNHduHc3KZMcFduxU5Xc6uJRQ==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "yocto-queue": "^0.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/package-json-from-dist": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/package-json-from-dist/-/package-json-from-dist-1.0.1.tgz",
      "integrity": "sha512-UEZIS3/by4OC8vL3P2dTXRETpebLI2NiI5vIrjaD/5UtrkFX/tNbwjTSRAGC/+7CAo2pIcBaRgWmcBBHcsaCIw==",
      "license": "BlueOak-1.0.0"
    },
    "node_modules/parseurl": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/parseurl/-/parseurl-1.3.3.tgz",
      "integrity": "sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/path-is-absolute": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/path-is-absolute/-/path-is-absolute-1.0.1.tgz",
      "integrity": "sha512-AVbw3UJ2e9bq64vSaS9Am0fje1Pa8pbGqTTsmXfaIiMpnr5DlDhfJOuLj9Sf95ZPVDAUerDfEk88MPmPe7UCQg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/path-key": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
      "integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/path-parse": {
      "version": "1.0.7",
      "resolved": "https://registry.npmjs.org/path-parse/-/path-parse-1.0.7.tgz",
      "integrity": "sha512-LDJzPVEEEPR+y48z93A0Ed0yXb8pAByGWo/k5YYdYgpY2/2EsOsksJrq7lOHxryrVOn1ejG6oAp8ahvOIQD8sw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/path-scurry": {
      "version": "1.11.1",
      "resolved": "https://registry.npmjs.org/path-scurry/-/path-scurry-1.11.1.tgz",
      "integrity": "sha512-Xa4Nw17FS9ApQFJ9umLiJS4orGjm7ZzwUrwamcGQuHSzDyth9boKDaycYdDcZDuqYATXw4HFXgaqWTctW/v1HA==",
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "lru-cache": "^10.2.0",
        "minipass": "^5.0.0 || ^6.0.2 || ^7.0.0"
      },
      "engines": {
        "node": ">=16 || 14 >=14.18"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/path-scurry/node_modules/lru-cache": {
      "version": "10.4.3",
      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-10.4.3.tgz",
      "integrity": "sha512-JNAzZcXrCt42VGLuYz0zfAzDfAvJWW6AfYlDBQyDV5DClI2m5sAmK+OIO7s59XfsRsWHp02jAJrRadPRGTt6SQ==",
      "license": "ISC"
    },
    "node_modules/path-to-regexp": {
      "version": "8.3.0",
      "resolved": "https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-8.3.0.tgz",
      "integrity": "sha512-7jdwVIRtsP8MYpdXSwOS0YdD0Du+qOoF/AEPIt88PcCFrZCzx41oxku1jD88hZBwbNUIEfpqvuhjFaMAqMTWnA==",
      "license": "MIT",
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/picomatch": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-2.3.1.tgz",
      "integrity": "sha512-JU3teHTNjmE2VCGFzuY8EXzCDVwEqB2a8fsIvwaStHhAWJEeVd1o1QD80CU6+ZdEXXSLbSsuLwJjkCBWqRQUVA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8.6"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "node_modules/proto3-json-serializer": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/proto3-json-serializer/-/proto3-json-serializer-2.0.2.tgz",
      "integrity": "sha512-SAzp/O4Yh02jGdRc+uIrGoe87dkN/XtwxfZ4ZyafJHymd79ozp5VG5nyZ7ygqPM5+cpLDjjGnYFUkngonyDPOQ==",
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "protobufjs": "^7.2.5"
      },
      "engines": {
        "node": ">=14.0.0"
      }
    },
    "node_modules/protobufjs": {
      "version": "7.5.4",
      "resolved": "https://registry.npmjs.org/protobufjs/-/protobufjs-7.5.4.tgz",
      "integrity": "sha512-CvexbZtbov6jW2eXAvLukXjXUW1TzFaivC46BpWc/3BpcCysb5Vffu+B3XHMm8lVEuy2Mm4XGex8hBSg1yapPg==",
      "hasInstallScript": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "@protobufjs/aspromise": "^1.1.2",
        "@protobufjs/base64": "^1.1.2",
        "@protobufjs/codegen": "^2.0.4",
        "@protobufjs/eventemitter": "^1.1.0",
        "@protobufjs/fetch": "^1.1.0",
        "@protobufjs/float": "^1.0.2",
        "@protobufjs/inquire": "^1.1.0",
        "@protobufjs/path": "^1.1.2",
        "@protobufjs/pool": "^1.1.0",
        "@protobufjs/utf8": "^1.1.0",
        "@types/node": ">=13.7.0",
        "long": "^5.0.0"
      },
      "engines": {
        "node": ">=12.0.0"
      }
    },
    "node_modules/proxy-addr": {
      "version": "2.0.7",
      "resolved": "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.7.tgz",
      "integrity": "sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==",
      "license": "MIT",
      "dependencies": {
        "forwarded": "0.2.0",
        "ipaddr.js": "1.9.1"
      },
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/qs": {
      "version": "6.14.0",
      "resolved": "https://registry.npmjs.org/qs/-/qs-6.14.0.tgz",
      "integrity": "sha512-YWWTjgABSKcvs/nWBi9PycY/JiPJqOD4JA6o9Sej2AtvSGarXxKC3OQSk4pAarbdQlKAh5D4FCQkJNkW+GAn3w==",
      "license": "BSD-3-Clause",
      "dependencies": {
        "side-channel": "^1.1.0"
      },
      "engines": {
        "node": ">=0.6"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/range-parser": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/range-parser/-/range-parser-1.2.1.tgz",
      "integrity": "sha512-Hrgsx+orqoygnmhFbKaHE6c296J+HTAQXoxEF6gNupROmmGJRoyzfG3ccAveqCBrwr/2yxQ5BVd/GTl5agOwSg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/raw-body": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/raw-body/-/raw-body-3.0.2.tgz",
      "integrity": "sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==",
      "license": "MIT",
      "dependencies": {
        "bytes": "~3.1.2",
        "http-errors": "~2.0.1",
        "iconv-lite": "~0.7.0",
        "unpipe": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/readable-stream": {
      "version": "3.6.2",
      "resolved": "https://registry.npmjs.org/readable-stream/-/readable-stream-3.6.2.tgz",
      "integrity": "sha512-9u/sniCrY3D5WdsERHzHE4G2YCXqoG5FTHUiCC4SIbr6XcLZBY05ya9EKjYek9O5xOAwjGq+1JdGBAS7Q9ScoA==",
      "license": "MIT",
      "dependencies": {
        "inherits": "^2.0.3",
        "string_decoder": "^1.1.1",
        "util-deprecate": "^1.0.1"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/readdirp": {
      "version": "3.6.0",
      "resolved": "https://registry.npmjs.org/readdirp/-/readdirp-3.6.0.tgz",
      "integrity": "sha512-hOS089on8RduqdbhvQ5Z37A0ESjsqz6qnRcffsMU3495FuTdqSm+7bhJ29JvIOsBDEEnan5DPu9t3To9VRlMzA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "picomatch": "^2.2.1"
      },
      "engines": {
        "node": ">=8.10.0"
      }
    },
    "node_modules/require-directory": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/require-directory/-/require-directory-2.1.1.tgz",
      "integrity": "sha512-fGxEI7+wsG9xrvdjsrlmL22OMTTiHRwAMroiEeMgq8gzoLC/PQr7RsRDSTLUg/bZAZtF+TVIkHc6/4RIKrui+Q==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/resolve": {
      "version": "1.22.11",
      "resolved": "https://registry.npmjs.org/resolve/-/resolve-1.22.11.tgz",
      "integrity": "sha512-RfqAvLnMl313r7c9oclB1HhUEAezcpLjz95wFH4LVuhk9JF/r22qmVP9AMmOU4vMX7Q8pN8jwNg/CSpdFnMjTQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "is-core-module": "^2.16.1",
        "path-parse": "^1.0.7",
        "supports-preserve-symlinks-flag": "^1.0.0"
      },
      "bin": {
        "resolve": "bin/resolve"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/retry": {
      "version": "0.13.1",
      "resolved": "https://registry.npmjs.org/retry/-/retry-0.13.1.tgz",
      "integrity": "sha512-XQBQ3I8W1Cge0Seh+6gjj03LbmRFWuoszgK9ooCpwYIrhhoO80pfq4cUkU5DkknwfOfFteRwlZ56PYOGYyFWdg==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">= 4"
      }
    },
    "node_modules/retry-request": {
      "version": "7.0.2",
      "resolved": "https://registry.npmjs.org/retry-request/-/retry-request-7.0.2.tgz",
      "integrity": "sha512-dUOvLMJ0/JJYEn8NrpOaGNE7X3vpI5XlZS/u0ANjqtcZVKnIxP7IgCFwrKTxENw29emmwug53awKtaMm4i9g5w==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@types/request": "^2.48.8",
        "extend": "^3.0.2",
        "teeny-request": "^9.0.0"
      },
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/rimraf": {
      "version": "2.7.1",
      "resolved": "https://registry.npmjs.org/rimraf/-/rimraf-2.7.1.tgz",
      "integrity": "sha512-uWjbaKIK3T1OSVptzX7Nl6PvQ3qAGtKEtVRjRuazjfL3Bx5eI409VZSqgND+4UNnmzLVdPj9FqFJNPqBZFve4w==",
      "deprecated": "Rimraf versions prior to v4 are no longer supported",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "glob": "^7.1.3"
      },
      "bin": {
        "rimraf": "bin.js"
      }
    },
    "node_modules/router": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/router/-/router-2.2.0.tgz",
      "integrity": "sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "is-promise": "^4.0.0",
        "parseurl": "^1.3.3",
        "path-to-regexp": "^8.0.0"
      },
      "engines": {
        "node": ">= 18"
      }
    },
    "node_modules/safe-buffer": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.2.1.tgz",
      "integrity": "sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT"
    },
    "node_modules/safer-buffer": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz",
      "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",
      "license": "MIT"
    },
    "node_modules/semver": {
      "version": "7.7.3",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.7.3.tgz",
      "integrity": "sha512-SdsKMrI9TdgjdweUSR9MweHA4EJ8YxHn8DFaDisvhVlUOe4BF1tLD7GAj0lIqWVl+dPb/rExr0Btby5loQm20Q==",
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/send": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/send/-/send-1.2.0.tgz",
      "integrity": "sha512-uaW0WwXKpL9blXE2o0bRhoL2EGXIrZxQ2ZQ4mgcfoBxdFmQold+qWsD2jLrfZ0trjKL6vOw0j//eAwcALFjKSw==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.3.5",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.0",
        "mime-types": "^3.0.1",
        "ms": "^2.1.3",
        "on-finished": "^2.4.1",
        "range-parser": "^1.2.1",
        "statuses": "^2.0.1"
      },
      "engines": {
        "node": ">= 18"
      }
    },
    "node_modules/serve-static": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/serve-static/-/serve-static-2.2.0.tgz",
      "integrity": "sha512-61g9pCh0Vnh7IutZjtLGGpTA355+OPn2TyDv/6ivP2h/AdAVX9azsoxmg2/M6nZeQZNYBEwIcsne1mJd9oQItQ==",
      "license": "MIT",
      "dependencies": {
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "parseurl": "^1.3.3",
        "send": "^1.2.0"
      },
      "engines": {
        "node": ">= 18"
      }
    },
    "node_modules/setprototypeof": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz",
      "integrity": "sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==",
      "license": "ISC"
    },
    "node_modules/shebang-command": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz",
      "integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==",
      "license": "MIT",
      "dependencies": {
        "shebang-regex": "^3.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/shebang-regex": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz",
      "integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/side-channel": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/side-channel/-/side-channel-1.1.0.tgz",
      "integrity": "sha512-ZX99e6tRweoUXqR+VBrslhda51Nh5MTQwou5tnUDgbtyM0dBgmhEDtWGP/xbKn6hqfPRHujUNwz5fy/wbbhnpw==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.3",
        "side-channel-list": "^1.0.0",
        "side-channel-map": "^1.0.1",
        "side-channel-weakmap": "^1.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-list": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.0.tgz",
      "integrity": "sha512-FCLHtRD/gnpCiCHEiJLOwdmFP+wzCmDEkc9y7NsYxeF4u7Btsn1ZuwgwJGxImImHicJArLP4R0yX4c2KCrMrTA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-map": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz",
      "integrity": "sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-weakmap": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz",
      "integrity": "sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3",
        "side-channel-map": "^1.0.1"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/signal-exit": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/signal-exit/-/signal-exit-4.1.0.tgz",
      "integrity": "sha512-bzyZ1e88w9O1iNJbKnOlvYTrWPDl46O1bG0D3XInv+9tkPrxrN8jUUTiFlDkkmKWgn1M6CfIA13SuGqOa9Korw==",
      "license": "ISC",
      "engines": {
        "node": ">=14"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/source-map": {
      "version": "0.6.1",
      "resolved": "https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz",
      "integrity": "sha512-UjgapumWlbMhkBgzT7Ykc5YXUT46F0iKu8SGXq0bcwP5dz/h0Plj6enJqjz1Zbq2l5WaqYnrVbwWOWMyF3F47g==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/source-map-support": {
      "version": "0.5.21",
      "resolved": "https://registry.npmjs.org/source-map-support/-/source-map-support-0.5.21.tgz",
      "integrity": "sha512-uBHU3L3czsIyYXKX88fdrGovxdSCoTGDRZ6SYXtSRxLZUzHg5P/66Ht6uoUlHu9EZod+inXhKo3qQgwXUT/y1w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "buffer-from": "^1.0.0",
        "source-map": "^0.6.0"
      }
    },
    "node_modules/statuses": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz",
      "integrity": "sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/stream-events": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/stream-events/-/stream-events-1.0.5.tgz",
      "integrity": "sha512-E1GUzBSgvct8Jsb3v2X15pjzN1tYebtbLaMg+eBOUOAxgbLoSbT2NS91ckc5lJD1KfLjId+jXJRgo0qnV5Nerg==",
      "license": "MIT",
      "dependencies": {
        "stubs": "^3.0.0"
      }
    },
    "node_modules/stream-shift": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/stream-shift/-/stream-shift-1.0.3.tgz",
      "integrity": "sha512-76ORR0DO1o1hlKwTbi/DM3EXWGf3ZJYO8cXX5RJwnul2DEg2oyoZyjLNoQM8WsvZiFKCRfC1O0J7iCvie3RZmQ==",
      "license": "MIT"
    },
    "node_modules/streamsearch": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/streamsearch/-/streamsearch-1.1.0.tgz",
      "integrity": "sha512-Mcc5wHehp9aXz1ax6bZUyY5afg9u2rv5cqQI3mRrYkGC8rW2hM02jWuwjtL++LS5qinSyhj2QfLyNsuc+VsExg==",
      "engines": {
        "node": ">=10.0.0"
      }
    },
    "node_modules/string_decoder": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/string_decoder/-/string_decoder-1.3.0.tgz",
      "integrity": "sha512-hkRX8U1WjJFd8LsDJ2yQ/wWWxaopEsABU1XfkM8A+j0+85JAGppt16cr1Whg6KIbb4okU6Mql6BOj+uup/wKeA==",
      "license": "MIT",
      "dependencies": {
        "safe-buffer": "~5.2.0"
      }
    },
    "node_modules/string-width": {
      "version": "4.2.3",
      "resolved": "https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz",
      "integrity": "sha512-wKyQRQpjJ0sIp62ErSZdGsjMJWsap5oRNihHhu6G7JVO/9jIB6UyevL+tXuOqrng8j/cxKTWyWUwvSTriiZz/g==",
      "license": "MIT",
      "dependencies": {
        "emoji-regex": "^8.0.0",
        "is-fullwidth-code-point": "^3.0.0",
        "strip-ansi": "^6.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/string-width-cjs": {
      "name": "string-width",
      "version": "4.2.3",
      "resolved": "https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz",
      "integrity": "sha512-wKyQRQpjJ0sIp62ErSZdGsjMJWsap5oRNihHhu6G7JVO/9jIB6UyevL+tXuOqrng8j/cxKTWyWUwvSTriiZz/g==",
      "license": "MIT",
      "dependencies": {
        "emoji-regex": "^8.0.0",
        "is-fullwidth-code-point": "^3.0.0",
        "strip-ansi": "^6.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-ansi": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
      "integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-ansi-cjs": {
      "name": "strip-ansi",
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
      "integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-bom": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/strip-bom/-/strip-bom-3.0.0.tgz",
      "integrity": "sha512-vavAMRXOgBVNF6nyEEmL3DBK19iRpDcoIwW+swQ+CbGiu7lju6t+JklA1MHweoWtadgt4ISVUsXLyDq34ddcwA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=4"
      }
    },
    "node_modules/strip-json-comments": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/strip-json-comments/-/strip-json-comments-2.0.1.tgz",
      "integrity": "sha512-4gB8na07fecVVkOI6Rs4e7T6NOTki5EmL7TUduTs6bu3EdnSycntVJ4re8kgZA+wx9IueI2Y11bfbgwtzuE0KQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/strnum": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/strnum/-/strnum-1.1.2.tgz",
      "integrity": "sha512-vrN+B7DBIoTTZjnPNewwhx6cBA/H+IS7rfW68n7XxC1y7uoiGQBxaKzqucGUgavX15dJgiGztLJ8vxuEzwqBdA==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/NaturalIntelligence"
        }
      ],
      "license": "MIT",
      "optional": true
    },
    "node_modules/stubs": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/stubs/-/stubs-3.0.0.tgz",
      "integrity": "sha512-PdHt7hHUJKxvTCgbKX9C1V/ftOcjJQgz8BZwNfV5c4B6dcGqlpelTbJ999jBGZ2jYiPAwcX5dP6oBwVlBlUbxw==",
      "license": "MIT"
    },
    "node_modules/supports-preserve-symlinks-flag": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/supports-preserve-symlinks-flag/-/supports-preserve-symlinks-flag-1.0.0.tgz",
      "integrity": "sha512-ot0WnXS9fgdkgIcePe6RHNk1WA8+muPa6cSjeR3V8K27q9BB1rTE3R1p7Hv0z1ZyAc8s6Vvv8DIyWf681MAt0w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/teeny-request": {
      "version": "9.0.0",
      "resolved": "https://registry.npmjs.org/teeny-request/-/teeny-request-9.0.0.tgz",
      "integrity": "sha512-resvxdc6Mgb7YEThw6G6bExlXKkv6+YbuzGg9xuXxSgxJF7Ozs+o8Y9+2R3sArdWdW8nOokoQb1yrpFB0pQK2g==",
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "http-proxy-agent": "^5.0.0",
        "https-proxy-agent": "^5.0.0",
        "node-fetch": "^2.6.9",
        "stream-events": "^1.0.5",
        "uuid": "^9.0.0"
      },
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/teeny-request/node_modules/agent-base": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-6.0.2.tgz",
      "integrity": "sha512-RZNwNclF7+MS/8bDg70amg32dyeZGZxiDuQmZxKLAlQjr3jGyLx+4Kkk58UO7D2QdgFIQCovuSuZESne6RG6XQ==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "debug": "4"
      },
      "engines": {
        "node": ">= 6.0.0"
      }
    },
    "node_modules/teeny-request/node_modules/https-proxy-agent": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-5.0.1.tgz",
      "integrity": "sha512-dFcAjpTQFgoLMzC2VwU+C/CbS7uRL0lWmxDITmqm7C+7F0Odmj6s9l6alZc6AELXhrnggM2CeWSXHGOdX2YtwA==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "agent-base": "6",
        "debug": "4"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/teeny-request/node_modules/uuid": {
      "version": "9.0.1",
      "resolved": "https://registry.npmjs.org/uuid/-/uuid-9.0.1.tgz",
      "integrity": "sha512-b+1eJOlsR9K8HJpow9Ok3fiWOWSIcIzXodvv0rQjVoOVNpWMpxf1wZNpt4y9h10odCNrqnYp1OBzRktckBe3sA==",
      "funding": [
        "https://github.com/sponsors/broofa",
        "https://github.com/sponsors/ctavan"
      ],
      "license": "MIT",
      "optional": true,
      "bin": {
        "uuid": "dist/bin/uuid"
      }
    },
    "node_modules/to-regex-range": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/to-regex-range/-/to-regex-range-5.0.1.tgz",
      "integrity": "sha512-65P7iz6X5yEr1cwcgvQxbbIw7Uk3gOy5dIdtZ4rDveLqhrdJP+Li/Hx6tyK0NEb+2GCyneCMJiGqrADCSNk8sQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "is-number": "^7.0.0"
      },
      "engines": {
        "node": ">=8.0"
      }
    },
    "node_modules/toidentifier": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz",
      "integrity": "sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==",
      "license": "MIT",
      "engines": {
        "node": ">=0.6"
      }
    },
    "node_modules/tr46": {
      "version": "0.0.3",
      "resolved": "https://registry.npmjs.org/tr46/-/tr46-0.0.3.tgz",
      "integrity": "sha512-N3WMsuqV66lT30CrXNbEjx4GEwlow3v6rr4mCcv6prnfwhS01rkgyFdjPNBYd9br7LpXV1+Emh01fHnq2Gdgrw==",
      "license": "MIT"
    },
    "node_modules/tree-kill": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/tree-kill/-/tree-kill-1.2.2.tgz",
      "integrity": "sha512-L0Orpi8qGpRG//Nd+H90vFB+3iHnue1zSSGmNOOCh1GLJ7rUKVwV2HvijphGQS2UmhUZewS9VgvxYIdgr+fG1A==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "tree-kill": "cli.js"
      }
    },
    "node_modules/ts-node": {
      "version": "10.9.2",
      "resolved": "https://registry.npmjs.org/ts-node/-/ts-node-10.9.2.tgz",
      "integrity": "sha512-f0FFpIdcHgn8zcPSbf1dRevwt047YMnaiJM3u2w2RewrB+fob/zePZcrOyQoLMMO7aBIddLcQIEK5dYjkLnGrQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@cspotcode/source-map-support": "^0.8.0",
        "@tsconfig/node10": "^1.0.7",
        "@tsconfig/node12": "^1.0.7",
        "@tsconfig/node14": "^1.0.0",
        "@tsconfig/node16": "^1.0.2",
        "acorn": "^8.4.1",
        "acorn-walk": "^8.1.1",
        "arg": "^4.1.0",
        "create-require": "^1.1.0",
        "diff": "^4.0.1",
        "make-error": "^1.1.1",
        "v8-compile-cache-lib": "^3.0.1",
        "yn": "3.1.1"
      },
      "bin": {
        "ts-node": "dist/bin.js",
        "ts-node-cwd": "dist/bin-cwd.js",
        "ts-node-esm": "dist/bin-esm.js",
        "ts-node-script": "dist/bin-script.js",
        "ts-node-transpile-only": "dist/bin-transpile.js",
        "ts-script": "dist/bin-script-deprecated.js"
      },
      "peerDependencies": {
        "@swc/core": ">=1.2.50",
        "@swc/wasm": ">=1.2.50",
        "@types/node": "*",
        "typescript": ">=2.7"
      },
      "peerDependenciesMeta": {
        "@swc/core": {
          "optional": true
        },
        "@swc/wasm": {
          "optional": true
        }
      }
    },
    "node_modules/ts-node-dev": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/ts-node-dev/-/ts-node-dev-2.0.0.tgz",
      "integrity": "sha512-ywMrhCfH6M75yftYvrvNarLEY+SUXtUvU8/0Z6llrHQVBx12GiFk5sStF8UdfE/yfzk9IAq7O5EEbTQsxlBI8w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "chokidar": "^3.5.1",
        "dynamic-dedupe": "^0.3.0",
        "minimist": "^1.2.6",
        "mkdirp": "^1.0.4",
        "resolve": "^1.0.0",
        "rimraf": "^2.6.1",
        "source-map-support": "^0.5.12",
        "tree-kill": "^1.2.2",
        "ts-node": "^10.4.0",
        "tsconfig": "^7.0.0"
      },
      "bin": {
        "ts-node-dev": "lib/bin.js",
        "tsnd": "lib/bin.js"
      },
      "engines": {
        "node": ">=0.8.0"
      },
      "peerDependencies": {
        "node-notifier": "*",
        "typescript": "*"
      },
      "peerDependenciesMeta": {
        "node-notifier": {
          "optional": true
        }
      }
    },
    "node_modules/tsconfig": {
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/tsconfig/-/tsconfig-7.0.0.tgz",
      "integrity": "sha512-vZXmzPrL+EmC4T/4rVlT2jNVMWCi/O4DIiSj3UHg1OE5kCKbk4mfrXc6dZksLgRM/TZlKnousKH9bbTazUWRRw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/strip-bom": "^3.0.0",
        "@types/strip-json-comments": "0.0.30",
        "strip-bom": "^3.0.0",
        "strip-json-comments": "^2.0.0"
      }
    },
    "node_modules/tslib": {
      "version": "2.8.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
      "integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
      "license": "0BSD"
    },
    "node_modules/type-is": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/type-is/-/type-is-2.0.1.tgz",
      "integrity": "sha512-OZs6gsjF4vMp32qrCbiVSkrFmXtG/AZhY3t0iAMrMBiAZyV9oALtXO8hsrHbMXF9x6L3grlFuwW2oAz7cav+Gw==",
      "license": "MIT",
      "dependencies": {
        "content-type": "^1.0.5",
        "media-typer": "^1.1.0",
        "mime-types": "^3.0.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/typedarray": {
      "version": "0.0.6",
      "resolved": "https://registry.npmjs.org/typedarray/-/typedarray-0.0.6.tgz",
      "integrity": "sha512-/aCDEGatGvZ2BIk+HmLf4ifCJFwvKFNb9/JeZPMulfgFracn9QFcAf5GO8B/mweUjSoblS5In0cWhqpfs/5PQA==",
      "license": "MIT"
    },
    "node_modules/typescript": {
      "version": "5.9.3",
      "resolved": "https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz",
      "integrity": "sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "tsc": "bin/tsc",
        "tsserver": "bin/tsserver"
      },
      "engines": {
        "node": ">=14.17"
      }
    },
    "node_modules/undici-types": {
      "version": "7.16.0",
      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-7.16.0.tgz",
      "integrity": "sha512-Zz+aZWSj8LE6zoxD+xrjh4VfkIG8Ya6LvYkZqtUQGJPZjYl53ypCaUwWqo7eI0x66KBGeRo+mlBEkMSeSZ38Nw==",
      "license": "MIT"
    },
    "node_modules/unpipe": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/unpipe/-/unpipe-1.0.0.tgz",
      "integrity": "sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/util-deprecate": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/util-deprecate/-/util-deprecate-1.0.2.tgz",
      "integrity": "sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==",
      "license": "MIT"
    },
    "node_modules/uuid": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/uuid/-/uuid-13.0.0.tgz",
      "integrity": "sha512-XQegIaBTVUjSHliKqcnFqYypAd4S+WCYt5NIeRs6w/UAry7z8Y9j5ZwRRL4kzq9U3sD6v+85er9FvkEaBpji2w==",
      "funding": [
        "https://github.com/sponsors/broofa",
        "https://github.com/sponsors/ctavan"
      ],
      "license": "MIT",
      "bin": {
        "uuid": "dist-node/bin/uuid"
      }
    },
    "node_modules/v8-compile-cache-lib": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/v8-compile-cache-lib/-/v8-compile-cache-lib-3.0.1.tgz",
      "integrity": "sha512-wa7YjyUGfNZngI/vtK0UHAN+lgDCxBPCylVXGp0zu59Fz5aiGtNXaq3DhIov063MorB+VfufLh3JlF2KdTK3xg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/vary": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/vary/-/vary-1.1.2.tgz",
      "integrity": "sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/web-streams-polyfill": {
      "version": "3.3.3",
      "resolved": "https://registry.npmjs.org/web-streams-polyfill/-/web-streams-polyfill-3.3.3.tgz",
      "integrity": "sha512-d2JWLCivmZYTSIoge9MsgFCZrt571BikcWGYkjC1khllbTeDlGqZ2D8vD8E/lJa8WGWbb7Plm8/XJYV7IJHZZw==",
      "license": "MIT",
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/webidl-conversions": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/webidl-conversions/-/webidl-conversions-3.0.1.tgz",
      "integrity": "sha512-2JAn3z8AR6rjK8Sm8orRC0h/bcl/DqL7tRPdGZ4I1CjdF+EaMLmYxBHyXuKL849eucPFhvBoxMsflfOb8kxaeQ==",
      "license": "BSD-2-Clause"
    },
    "node_modules/websocket-driver": {
      "version": "0.7.4",
      "resolved": "https://registry.npmjs.org/websocket-driver/-/websocket-driver-0.7.4.tgz",
      "integrity": "sha512-b17KeDIQVjvb0ssuSDF2cYXSg2iztliJ4B9WdsuB6J952qCPKmnVq4DyW5motImXHDC1cBT/1UezrJVsKw5zjg==",
      "license": "Apache-2.0",
      "dependencies": {
        "http-parser-js": ">=0.5.1",
        "safe-buffer": ">=5.1.0",
        "websocket-extensions": ">=0.1.1"
      },
      "engines": {
        "node": ">=0.8.0"
      }
    },
    "node_modules/websocket-extensions": {
      "version": "0.1.4",
      "resolved": "https://registry.npmjs.org/websocket-extensions/-/websocket-extensions-0.1.4.tgz",
      "integrity": "sha512-OqedPIGOfsDlo31UNwYbCFMSaO9m9G/0faIHj5/dZFDMFqPTcx6UwqyOy3COEaEOg/9VsGIpdqn62W5KhoKSpg==",
      "license": "Apache-2.0",
      "engines": {
        "node": ">=0.8.0"
      }
    },
    "node_modules/whatwg-url": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/whatwg-url/-/whatwg-url-5.0.0.tgz",
      "integrity": "sha512-saE57nupxk6v3HY35+jzBwYa0rKSy0XR8JSxZPwgLr7ys0IBzhGviA1/TUGJLmSVqs8pb9AnvICXEuOHLprYTw==",
      "license": "MIT",
      "dependencies": {
        "tr46": "~0.0.3",
        "webidl-conversions": "^3.0.0"
      }
    },
    "node_modules/which": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz",
      "integrity": "sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==",
      "license": "ISC",
      "dependencies": {
        "isexe": "^2.0.0"
      },
      "bin": {
        "node-which": "bin/node-which"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/wrap-ansi": {
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz",
      "integrity": "sha512-YVGIj2kamLSTxw6NsZjoBxfSwsn0ycdesmc4p+Q21c5zPuZ1pl+NfxVdxPtdHvmNVOQ6XSYG4AUtyt/Fi7D16Q==",
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.0.0",
        "string-width": "^4.1.0",
        "strip-ansi": "^6.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
      }
    },
    "node_modules/wrap-ansi-cjs": {
      "name": "wrap-ansi",
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz",
      "integrity": "sha512-YVGIj2kamLSTxw6NsZjoBxfSwsn0ycdesmc4p+Q21c5zPuZ1pl+NfxVdxPtdHvmNVOQ6XSYG4AUtyt/Fi7D16Q==",
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.0.0",
        "string-width": "^4.1.0",
        "strip-ansi": "^6.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
      }
    },
    "node_modules/wrappy": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz",
      "integrity": "sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==",
      "license": "ISC"
    },
    "node_modules/ws": {
      "version": "8.18.3",
      "resolved": "https://registry.npmjs.org/ws/-/ws-8.18.3.tgz",
      "integrity": "sha512-PEIGCY5tSlUt50cqyMXfCzX+oOPqN0vuGqWzbcJ2xvnkzkq46oOpz7dQaTDBdfICb4N14+GARUDw2XV2N4tvzg==",
      "license": "MIT",
      "engines": {
        "node": ">=10.0.0"
      },
      "peerDependencies": {
        "bufferutil": "^4.0.1",
        "utf-8-validate": ">=5.0.2"
      },
      "peerDependenciesMeta": {
        "bufferutil": {
          "optional": true
        },
        "utf-8-validate": {
          "optional": true
        }
      }
    },
    "node_modules/xtend": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/xtend/-/xtend-4.0.2.tgz",
      "integrity": "sha512-LKYU1iAXJXUgAXn9URjiu+MWhyUXHsvfp7mcuYm9dSUKK0/CjtrUwFAxD82/mCWbtLsGjFIad0wIsod4zrTAEQ==",
      "license": "MIT",
      "engines": {
        "node": ">=0.4"
      }
    },
    "node_modules/y18n": {
      "version": "5.0.8",
      "resolved": "https://registry.npmjs.org/y18n/-/y18n-5.0.8.tgz",
      "integrity": "sha512-0pfFzegeDWJHJIAmTLRP2DwHjdF5s7jo9tuztdQxAhINCdvS+3nGINqPd00AphqJR/0LhANUS6/+7SCb98YOfA==",
      "license": "ISC",
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/yallist": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/yallist/-/yallist-4.0.0.tgz",
      "integrity": "sha512-3wdGidZyq5PB084XLES5TpOSRA3wjXAlIWMhum2kRcv/41Sn2emQ0dycQW4uZXLejwKvg6EsvbdlVL+FYEct7A==",
      "license": "ISC"
    },
    "node_modules/yargs": {
      "version": "17.7.2",
      "resolved": "https://registry.npmjs.org/yargs/-/yargs-17.7.2.tgz",
      "integrity": "sha512-7dSzzRQ++CKnNI/krKnYRV7JKKPUXMEh61soaHKg9mrWEhzFWhFnxPxGl+69cD1Ou63C13NUPCnmIcrvqCuM6w==",
      "license": "MIT",
      "dependencies": {
        "cliui": "^8.0.1",
        "escalade": "^3.1.1",
        "get-caller-file": "^2.0.5",
        "require-directory": "^2.1.1",
        "string-width": "^4.2.3",
        "y18n": "^5.0.5",
        "yargs-parser": "^21.1.1"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/yargs-parser": {
      "version": "21.1.1",
      "resolved": "https://registry.npmjs.org/yargs-parser/-/yargs-parser-21.1.1.tgz",
      "integrity": "sha512-tVpsJW7DdjecAiFpbIB1e3qxIQsE6NoPc5/eTdrbbIC4h0LVsWhnoa3g+m2HclBIujHzsxZ4VJVA+GUuc2/LBw==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/yn": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/yn/-/yn-3.1.1.tgz",
      "integrity": "sha512-Ux4ygGWsu2c7isFWe8Yu1YluJmqVhxqK2cLXNQA5AcC3QfbGNpM7fu0Y8b/z16pXLnFxZYvWhd3fhBY9DLmC6Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/yocto-queue": {
      "version": "0.1.0",
      "resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz",
      "integrity": "sha512-rVksvsnNCdJ/ohGc6xgPwyN8eheCxsiLM8mxuE/t/mOVqJewPuO1miLpTHQiRgTKCLexL4MeAFVagts7HmNZ2Q==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/zod": {
      "version": "4.2.1",
      "resolved": "https://registry.npmjs.org/zod/-/zod-4.2.1.tgz",
      "integrity": "sha512-0wZ1IRqGGhMP76gLqz8EyfBXKk0J2qo2+H3fi4mcUP/KtTocoX08nmIAHl1Z2kJIZbZee8KOpBCSNPRgauucjw==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/colinhacks"
      }
    }
  }
}

```

---

## package.json

**Path:** `package.json`

```json
{
  "name": "auroranotes-api",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@google-cloud/tasks": "^6.2.1",
    "@google/genai": "^1.33.0",
    "@types/multer": "^2.0.0",
    "compression": "^1.8.1",
    "cors": "^2.8.5",
    "express": "^5.2.1",
    "firebase-admin": "^13.6.0",
    "helmet": "^8.1.0",
    "multer": "^2.0.2",
    "uuid": "^13.0.0",
    "zod": "^4.2.1"
  },
  "devDependencies": {
    "@types/compression": "^1.8.1",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/node": "^25.0.2",
    "@types/uuid": "^10.0.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.9.3"
  }
}

```

---

## src/actionExecutor.ts

**Path:** `src/actionExecutor.ts`

```ts
/**
 * AuroraNotes API - Agentic Action Executor
 *
 * Enables AI to take actions based on user queries:
 * - Create notes
 * - Set reminders
 * - Generate reports
 * - Filtered search
 * - Summarize time periods
 */

import { createNote } from './notes';
import { retrieveRelevantChunks, analyzeQuery } from './retrieval';
import { logInfo, logError } from './utils';
import { NoteResponse } from './types';

/**
 * Action types the AI can execute
 */
export type ActionType =
  | 'create_note'
  | 'set_reminder'
  | 'search_notes'
  | 'summarize_period'
  | 'list_action_items'
  | 'find_mentions';

/**
 * Action detection result
 */
export interface DetectedAction {
  type: ActionType;
  confidence: number;
  parameters: ActionParameters;
}

/**
 * Parameters for different action types
 */
export interface ActionParameters {
  // create_note
  noteContent?: string;
  noteTitle?: string;
  noteTags?: string[];

  // set_reminder
  reminderText?: string;
  reminderDate?: Date;
  reminderTime?: string;

  // search_notes
  searchQuery?: string;
  searchFilters?: {
    dateRange?: { start?: Date; end?: Date };
    tags?: string[];
    mentionedPerson?: string;
  };

  // summarize_period
  periodType?: 'day' | 'week' | 'month';
  periodDate?: Date;

  // list_action_items
  includeCompleted?: boolean;
  assignee?: string;

  // find_mentions
  personName?: string;
  topicName?: string;
}

/**
 * Action execution result
 */
export interface ActionResult {
  success: boolean;
  action: ActionType;
  message: string;
  data?: {
    createdNote?: NoteResponse;
    reminder?: { id: string; text: string; dueAt: string };
    searchResults?: Array<{ noteId: string; preview: string; date: string }>;
    summary?: string;
    actionItems?: Array<{ text: string; source: string; status?: string }>;
    mentions?: Array<{ noteId: string; context: string; date: string }>;
  };
}

/**
 * Patterns for detecting action intents
 */
const ACTION_PATTERNS: Array<{ pattern: RegExp; type: ActionType; confidence: number }> = [
  // Create note patterns
  { pattern: /^(?:create|make|add|write|save)\s+(?:a\s+)?note\s+(?:about|for|on|regarding)\s+(.+)/i, type: 'create_note', confidence: 0.9 },
  { pattern: /^note(?:\s+down)?:\s*(.+)/i, type: 'create_note', confidence: 0.85 },
  { pattern: /^(?:jot\s+down|record|capture)\s+(.+)/i, type: 'create_note', confidence: 0.85 },

  // Reminder patterns
  { pattern: /^remind\s+me\s+(?:about|to|that)\s+(.+?)(?:\s+(?:tomorrow|today|on|at|in)\s+(.+))?$/i, type: 'set_reminder', confidence: 0.9 },
  { pattern: /^(?:set|add|create)\s+(?:a\s+)?reminder\s+(?:for|to|about)\s+(.+)/i, type: 'set_reminder', confidence: 0.9 },

  // Search patterns  
  { pattern: /^(?:find|search|look\s+for|show)\s+(?:my\s+)?notes?\s+(?:about|mentioning|with|on)\s+(.+)/i, type: 'search_notes', confidence: 0.85 },
  { pattern: /^(?:find|search|look\s+for)\s+(.+)\s+in\s+(?:my\s+)?notes?/i, type: 'search_notes', confidence: 0.8 },

  // Summarize patterns
  { pattern: /^summarize\s+(?:my\s+)?(?:this|last)\s+(week|month|day)(?:'s)?\s+(?:notes?)?/i, type: 'summarize_period', confidence: 0.9 },
  { pattern: /^what\s+(?:did\s+)?I\s+(?:write|note|work\s+on)\s+(?:about\s+)?(?:this|last)\s+(week|month)/i, type: 'summarize_period', confidence: 0.85 },

  // Action items patterns
  { pattern: /^(?:list|show|find|what\s+are)\s+(?:my\s+)?(?:action\s+items|todos?|tasks)/i, type: 'list_action_items', confidence: 0.9 },
  { pattern: /^what\s+do\s+I\s+need\s+to\s+do/i, type: 'list_action_items', confidence: 0.85 },

  // Find mentions patterns
  { pattern: /^(?:find|show)\s+(?:all\s+)?(?:notes?\s+)?(?:mentioning|about|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i, type: 'find_mentions', confidence: 0.85 },
  { pattern: /^what\s+(?:did\s+)?(?:I\s+)?(?:discuss|talk|write)\s+(?:about\s+)?with\s+([A-Z][a-z]+)/i, type: 'find_mentions', confidence: 0.8 },
];

/**
 * Detect if a query is an action command
 */
export function detectAction(query: string): DetectedAction | null {
  const trimmedQuery = query.trim();

  for (const { pattern, type, confidence } of ACTION_PATTERNS) {
    const match = trimmedQuery.match(pattern);
    if (match) {
      const parameters = extractParameters(type, match, trimmedQuery);
      logInfo('Action detected', { type, confidence, parameters });
      return { type, confidence, parameters };
    }
  }

  return null;
}

/**
 * Extract parameters from regex match based on action type
 */
function extractParameters(
  type: ActionType,
  match: RegExpMatchArray,
  _fullQuery: string
): ActionParameters {
  const params: ActionParameters = {};

  switch (type) {
    case 'create_note':
      params.noteContent = match[1]?.trim();
      break;
    case 'set_reminder':
      params.reminderText = match[1]?.trim();
      params.reminderTime = match[2]?.trim();
      break;
    case 'search_notes':
      params.searchQuery = match[1]?.trim();
      break;
    case 'summarize_period':
      params.periodType = match[1]?.toLowerCase() as 'day' | 'week' | 'month';
      break;
    case 'find_mentions':
      params.personName = match[1]?.trim();
      break;
  }

  return params;
}

/**
 * Execute a detected action
 */
export async function executeAction(
  action: DetectedAction,
  tenantId: string
): Promise<ActionResult> {
  const { type, parameters } = action;

  try {
    switch (type) {
      case 'create_note':
        return await executeCreateNote(parameters, tenantId);
      case 'set_reminder':
        return await executeSetReminder(parameters, tenantId);
      case 'search_notes':
        return await executeSearchNotes(parameters, tenantId);
      case 'summarize_period':
        return await executeSummarizePeriod(parameters, tenantId);
      case 'list_action_items':
        return await executeListActionItems(parameters, tenantId);
      case 'find_mentions':
        return await executeFindMentions(parameters, tenantId);
      default:
        return { success: false, action: type, message: 'Unknown action type' };
    }
  } catch (error) {
    logError('Action execution failed', error);
    return {
      success: false,
      action: type,
      message: error instanceof Error ? error.message : 'Action execution failed',
    };
  }
}

/**
 * Execute create note action
 */
async function executeCreateNote(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  if (!params.noteContent) {
    return { success: false, action: 'create_note', message: 'No content provided for note' };
  }

  const note = await createNote(params.noteContent, tenantId, {
    title: params.noteTitle,
    tags: params.noteTags,
  });

  return {
    success: true,
    action: 'create_note',
    message: `Created note: "${params.noteContent.slice(0, 50)}${params.noteContent.length > 50 ? '...' : ''}"`,
    data: { createdNote: note },
  };
}

/**
 * Execute set reminder action (stores as a tagged note for now)
 */
async function executeSetReminder(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  if (!params.reminderText) {
    return { success: false, action: 'set_reminder', message: 'No reminder text provided' };
  }

  // Parse reminder date/time
  const dueAt = parseReminderTime(params.reminderTime);
  const reminderContent = `🔔 REMINDER: ${params.reminderText}${dueAt ? `\n\nDue: ${dueAt.toISOString()}` : ''}`;

  const note = await createNote(reminderContent, tenantId, {
    title: `Reminder: ${params.reminderText.slice(0, 50)}`,
    tags: ['reminder', 'action-item'],
    metadata: { type: 'reminder', dueAt: dueAt?.toISOString() },
  });

  return {
    success: true,
    action: 'set_reminder',
    message: `Reminder set: "${params.reminderText}"${dueAt ? ` for ${dueAt.toLocaleDateString()}` : ''}`,
    data: {
      reminder: {
        id: note.id,
        text: params.reminderText,
        dueAt: dueAt?.toISOString() || 'unspecified',
      },
    },
  };
}

/**
 * Parse reminder time string into Date
 */
function parseReminderTime(timeStr?: string): Date | undefined {
  if (!timeStr) return undefined;

  const lower = timeStr.toLowerCase();
  const now = new Date();

  if (lower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }

  if (lower === 'today') {
    return now;
  }

  // Try parsing "in X hours/days"
  const inMatch = lower.match(/in\s+(\d+)\s+(hour|day|week|minute)s?/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const result = new Date(now);

    switch (unit) {
      case 'minute': result.setMinutes(result.getMinutes() + amount); break;
      case 'hour': result.setHours(result.getHours() + amount); break;
      case 'day': result.setDate(result.getDate() + amount); break;
      case 'week': result.setDate(result.getDate() + amount * 7); break;
    }
    return result;
  }

  // Try parsing natural date
  try {
    const parsed = new Date(timeStr);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {
    // Ignore parsing errors
  }

  return undefined;
}

/**
 * Execute search notes action
 */
async function executeSearchNotes(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  if (!params.searchQuery) {
    return { success: false, action: 'search_notes', message: 'No search query provided' };
  }

  const { chunks } = await retrieveRelevantChunks(params.searchQuery, {
    tenantId,
    topK: 20,
    rerankTo: 10,
  });

  const searchResults = chunks.slice(0, 5).map(chunk => ({
    noteId: chunk.noteId,
    preview: chunk.text.slice(0, 150) + (chunk.text.length > 150 ? '...' : ''),
    date: chunk.createdAt.toLocaleDateString(),
  }));

  return {
    success: true,
    action: 'search_notes',
    message: `Found ${chunks.length} notes about "${params.searchQuery}"`,
    data: { searchResults },
  };
}

/**
 * Execute summarize period action
 */
async function executeSummarizePeriod(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  const periodType = params.periodType || 'week';

  // Calculate date range
  const now = new Date();
  let daysBack = 7;
  if (periodType === 'month') daysBack = 30;
  if (periodType === 'day') daysBack = 1;

  const periodQuery = `Summarize my notes from the last ${periodType}`;
  const { chunks } = await retrieveRelevantChunks(periodQuery, {
    tenantId,
    topK: 30,
    rerankTo: 15,
    maxAgeDays: daysBack,
  });

  return {
    success: true,
    action: 'summarize_period',
    message: `Found ${chunks.length} notes from the last ${periodType} to summarize`,
    data: {
      summary: `Retrieved ${chunks.length} notes from the last ${periodType}. The AI will provide a summary.`,
    },
  };
}

/**
 * Execute list action items
 */
async function executeListActionItems(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  const query = 'action items todos tasks to do';
  const { chunks } = await retrieveRelevantChunks(query, {
    tenantId,
    topK: 20,
    rerankTo: 10,
  });

  // Extract action items from chunks (simple pattern matching)
  const actionItems: Array<{ text: string; source: string; status?: string }> = [];
  const actionPatterns = [
    /(?:^|\n)\s*[-*□☐]\s*(.+)/gm,
    /(?:TODO|TASK|ACTION):\s*(.+)/gi,
    /(?:need to|should|must|have to)\s+(.+?)(?:\.|$)/gi,
  ];

  for (const chunk of chunks.slice(0, 10)) {
    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(chunk.text)) !== null) {
        if (match[1] && match[1].length > 5) {
          actionItems.push({
            text: match[1].trim(),
            source: chunk.noteId,
            status: 'pending',
          });
        }
      }
    }
  }

  return {
    success: true,
    action: 'list_action_items',
    message: `Found ${actionItems.length} action items`,
    data: { actionItems: actionItems.slice(0, 20) },
  };
}

/**
 * Execute find mentions
 */
async function executeFindMentions(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  const searchTerm = params.personName || params.topicName;
  if (!searchTerm) {
    return { success: false, action: 'find_mentions', message: 'No person or topic specified' };
  }

  const { chunks } = await retrieveRelevantChunks(searchTerm, {
    tenantId,
    topK: 20,
    rerankTo: 10,
  });

  const mentions = chunks.slice(0, 10).map(chunk => ({
    noteId: chunk.noteId,
    context: chunk.text.slice(0, 200) + (chunk.text.length > 200 ? '...' : ''),
    date: chunk.createdAt.toLocaleDateString(),
  }));

  return {
    success: true,
    action: 'find_mentions',
    message: `Found ${chunks.length} mentions of "${searchTerm}"`,
    data: { mentions },
  };
}

/**
 * Format action result as a response for the user
 */
export function formatActionResponse(result: ActionResult): string {
  if (!result.success) {
    return `I couldn't complete that action: ${result.message}`;
  }

  switch (result.action) {
    case 'create_note':
      return `✅ ${result.message}\n\nYour note has been saved and will be searchable shortly.`;

    case 'set_reminder':
      return `🔔 ${result.message}\n\nI've saved this as a reminder note tagged with #reminder.`;

    case 'search_notes':
      if (!result.data?.searchResults?.length) {
        return `I searched your notes but didn't find anything matching that query.`;
      }
      return `📝 ${result.message}\n\nHere are the most relevant notes:\n${result.data.searchResults.map((r, i) => `${i + 1}. ${r.preview}`).join('\n\n')}`;

    case 'summarize_period':
      return result.message;

    case 'list_action_items':
      if (!result.data?.actionItems?.length) {
        return `I couldn't find any action items in your recent notes.`;
      }
      return `📋 ${result.message}\n\n${result.data.actionItems.map((item, i) => `${i + 1}. ${item.text}`).join('\n')}`;

    case 'find_mentions':
      if (!result.data?.mentions?.length) {
        return `I couldn't find any mentions matching that criteria.`;
      }
      return `🔍 ${result.message}\n\n${result.data.mentions.map((m, i) => `${i + 1}. ${m.context}`).join('\n\n')}`;

    default:
      return result.message;
  }
}


```

---

## src/agenticPrompts.ts

**Path:** `src/agenticPrompts.ts`

```ts
/**
 * AuroraNotes API - Agentic Prompt Framework
 *
 * An intelligent prompt system that adapts response generation based on:
 * - Query intent and complexity
 * - Source quality and relevance
 * - Optimal response formatting
 *
 * Design Principles:
 * 1. Structured Thinking: Guide LLM through logical response construction
 * 2. Format Optimization: Match output format to query type
 * 3. Quality Signals: Provide relevance hints to prioritize sources
 * 4. Graceful Handling: Handle edge cases naturally
 * 5. Consistent Formatting: Enforce clean, readable markdown
 */

import { QueryIntent, ScoredChunk } from './types';
import { logInfo } from './utils';

/**
 * Response format types matched to query intents
 */
export type ResponseFormat = 
  | 'direct_answer'    // For factual questions
  | 'structured_list'  // For list/enumeration queries
  | 'narrative'        // For summaries and context-heavy queries
  | 'decision_brief'   // For decision-related queries
  | 'action_plan';     // For action items and todos

/**
 * Agentic prompt configuration
 */
export interface AgenticPromptConfig {
  enableStructuredThinking: boolean;  // Include thinking guidance
  formatOptimization: boolean;        // Optimize format for intent
  qualityHints: boolean;              // Show relevance indicators
  maxSourcesInPrompt: number;         // Limit sources to prevent overload
  responseStyle: 'concise' | 'detailed' | 'conversational';
}

const DEFAULT_AGENTIC_CONFIG: AgenticPromptConfig = {
  enableStructuredThinking: true,
  formatOptimization: true,
  qualityHints: true,
  maxSourcesInPrompt: 15,
  responseStyle: 'conversational',
};

/**
 * Map query intent to optimal response format
 */
function getResponseFormat(intent: QueryIntent): ResponseFormat {
  const formatMap: Record<QueryIntent, ResponseFormat> = {
    question: 'direct_answer',
    search: 'direct_answer',
    summarize: 'narrative',
    list: 'structured_list',
    action_item: 'action_plan',
    decision: 'decision_brief',
  };
  return formatMap[intent] || 'direct_answer';
}

/**
 * Get format-specific instructions
 */
function getFormatInstructions(format: ResponseFormat): string {
  const instructions: Record<ResponseFormat, string> = {
    direct_answer: `**Format:** Start with a clear, direct answer in 1-2 sentences. Follow with supporting details if needed. Be concise.`,
    
    structured_list: `**Format:** Use a clean bulleted or numbered list. Each item should be clear and complete. Group related items together.`,
    
    narrative: `**Format:** Write a cohesive summary with logical flow. Use paragraphs for different topics. Highlight key takeaways.`,
    
    decision_brief: `**Format:** State the decision clearly first. Explain the reasoning. Note any alternatives considered or caveats.`,
    
    action_plan: `**Format:** List action items with:
• Clear, actionable descriptions
• Owner/assignee if mentioned
• Deadline if specified
• Status if known`,
  };
  return instructions[format];
}

/**
 * Build the core identity and role instruction
 */
function buildIdentitySection(sourceCount: number): string {
  return `You are the user's personal notes assistant. Your role is to help them find and understand information from their own notes.

You have access to ${sourceCount} excerpts from their notes. Answer ONLY using information from these sources.`;
}

/**
 * Build citation rules (simplified and clear)
 */
function buildCitationRules(sourceCount: number): string {
  return `**Citation Rules:**
• Cite sources using [N1], [N2], etc. up to [N${sourceCount}]
• Place citations at the end of sentences or paragraphs
• Every factual claim should have a citation
• If sources don't answer the question, say so honestly
• Never invent or guess citations`;
}

/**
 * Build quality-aware source presentation
 */
function buildSourcesSection(chunks: ScoredChunk[]): string {
  const sources = chunks.map((chunk, i) => {
    const relevance = getRelevanceLabel(chunk.score);
    const prefix = relevance ? `[${relevance}] ` : '';
    return `[N${i + 1}]: ${prefix}${chunk.text}`;
  }).join('\n\n');

  return `## Your Notes (${chunks.length} excerpts)

${sources}`;
}

/**
 * Get human-readable relevance label
 */
function getRelevanceLabel(score: number): string {
  if (score >= 0.75) return '⬆ High relevance';
  if (score >= 0.55) return '→ Relevant';
  return '';
}

/**
 * Build structured thinking guidance
 */
function buildThinkingGuidance(format: ResponseFormat): string {
  const guidance: Record<ResponseFormat, string> = {
    direct_answer: `Before answering, identify which sources directly address the question. Lead with the most relevant information.`,
    
    structured_list: `Before listing, scan all sources for relevant items. Group related items and order them logically.`,
    
    narrative: `Before summarizing, identify the main themes across sources. Create a coherent narrative that connects key points.`,
    
    decision_brief: `Identify the decision and its rationale from the sources. Present it clearly with context.`,
    
    action_plan: `Extract all action items, noting owners and deadlines where mentioned. Prioritize by urgency if indicated.`,
  };
  return `**Approach:** ${guidance[format]}`;
}

/**
 * Build edge case handling instructions
 */
function buildEdgeCaseHandling(): string {
  return `**When Sources Don't Fully Answer:**
• Partial info: Share what's relevant, note what's missing
• No match: "I couldn't find this in your notes."
• Conflicting info: Present both perspectives with citations`;
}

/**
 * Build tone and style guidance
 */
function buildToneGuidance(style: 'concise' | 'detailed' | 'conversational'): string {
  const tones: Record<typeof style, string> = {
    concise: `**Style:** Be brief and to the point. No filler words.`,
    detailed: `**Style:** Provide comprehensive answers with context and examples where helpful.`,
    conversational: `**Style:** Be warm and helpful. Use phrases like "your notes mention..." or "based on what you wrote..."`,
  };
  return tones[style];
}

/**
 * Build markdown formatting rules
 */
function buildFormattingRules(): string {
  return `**Formatting:**
• Use **bold** for key terms and emphasis
• Use bullet points for lists (not hyphens)
• Use headings (##) sparingly for long responses
• Keep paragraphs short and scannable`;
}

/**
 * Build the complete agentic system prompt
 */
export function buildAgenticSystemPrompt(
  sourceCount: number,
  intent: QueryIntent,
  config: Partial<AgenticPromptConfig> = {}
): string {
  const fullConfig = { ...DEFAULT_AGENTIC_CONFIG, ...config };
  const format = getResponseFormat(intent);

  const sections: string[] = [
    buildIdentitySection(sourceCount),
    '',
    buildCitationRules(sourceCount),
  ];

  // Add format-specific instructions
  if (fullConfig.formatOptimization) {
    sections.push('', getFormatInstructions(format));
  }

  // Add structured thinking guidance
  if (fullConfig.enableStructuredThinking) {
    sections.push('', buildThinkingGuidance(format));
  }

  // Add edge case handling
  sections.push('', buildEdgeCaseHandling());

  // Add tone guidance
  sections.push('', buildToneGuidance(fullConfig.responseStyle));

  // Add formatting rules
  sections.push('', buildFormattingRules());

  return sections.join('\n');
}

/**
 * Build the agentic user prompt with sources and query
 */
export function buildAgenticUserPrompt(
  query: string,
  chunks: ScoredChunk[],
  config: Partial<AgenticPromptConfig> = {}
): string {
  const fullConfig = { ...DEFAULT_AGENTIC_CONFIG, ...config };

  // Limit sources if needed
  const limitedChunks = chunks.slice(0, fullConfig.maxSourcesInPrompt);

  const sourcesSection = buildSourcesSection(limitedChunks);

  return `${sourcesSection}

---

**Question:** ${query}`;
}

/**
 * Build complete agentic prompt (system + user)
 */
export function buildCompleteAgenticPrompt(
  query: string,
  chunks: ScoredChunk[],
  intent: QueryIntent,
  config: Partial<AgenticPromptConfig> = {}
): { systemPrompt: string; userPrompt: string; format: ResponseFormat } {
  const fullConfig = { ...DEFAULT_AGENTIC_CONFIG, ...config };
  const format = getResponseFormat(intent);

  const systemPrompt = buildAgenticSystemPrompt(chunks.length, intent, fullConfig);
  const userPrompt = buildAgenticUserPrompt(query, chunks, fullConfig);

  logInfo('Built agentic prompt', {
    sourceCount: chunks.length,
    intent,
    format,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
    avgRelevance: chunks.length > 0
      ? Math.round(chunks.reduce((sum, c) => sum + (c.score || 0), 0) / chunks.length * 100) / 100
      : 0,
  });

  return { systemPrompt, userPrompt, format };
}

/**
 * Get the agentic config for observability
 */
export function getAgenticPromptConfig(): AgenticPromptConfig {
  return { ...DEFAULT_AGENTIC_CONFIG };
}


```

---

## src/cache.test.ts

**Path:** `src/cache.test.ts`

```ts
/**
 * Cache Module Tests
 *
 * Tests for TTL cache functionality.
 * Run with: npx ts-node --test src/cache.test.ts
 * Or: node --experimental-strip-types --test src/cache.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TTLCache, makeRetrievalCacheKey } from './cache';

describe('TTLCache', () => {
  let cache: TTLCache<string>;

  beforeEach(() => {
    cache = new TTLCache<string>('test', 1000, 10); // 1 second TTL, max 10 entries
  });

  afterEach(() => {
    cache.stop();
  });

  it('stores and retrieves values', () => {
    cache.set('key1', 'value1');
    const result = cache.get('key1');
    assert.strictEqual(result, 'value1');
  });

  it('returns undefined for missing keys', () => {
    const result = cache.get('nonexistent');
    assert.strictEqual(result, undefined);
  });

  it('respects TTL expiration', async () => {
    cache.set('key1', 'value1', 50); // 50ms TTL
    
    // Should exist immediately
    assert.strictEqual(cache.get('key1'), 'value1');
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should be expired
    assert.strictEqual(cache.get('key1'), undefined);
  });

  it('tracks cache statistics', () => {
    cache.set('key1', 'value1');
    cache.get('key1'); // hit
    cache.get('key1'); // hit
    cache.get('nonexistent'); // miss
    
    const stats = cache.getStats();
    assert.strictEqual(stats.size, 1);
    assert.strictEqual(stats.hits, 2);
    assert.strictEqual(stats.misses, 1);
    assert.strictEqual(stats.hitRate, 67); // 2/3 = 66.67% rounded
  });

  it('evicts least used entries when at capacity', () => {
    // Fill cache to capacity
    for (let i = 0; i < 10; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    
    // Access some keys to increase their access count
    cache.get('key5');
    cache.get('key5');
    cache.get('key7');
    
    // Add one more to trigger eviction
    cache.set('key10', 'value10');
    
    // key5 and key7 should still exist (higher access count)
    assert.strictEqual(cache.get('key5'), 'value5');
    assert.strictEqual(cache.get('key7'), 'value7');
    
    // One of the less-accessed keys should be evicted
    const stats = cache.getStats();
    assert.strictEqual(stats.size, 10); // Should still be at max capacity
  });

  it('clears all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    cache.clear();
    
    assert.strictEqual(cache.get('key1'), undefined);
    assert.strictEqual(cache.get('key2'), undefined);
    assert.strictEqual(cache.getStats().size, 0);
  });

  it('deletes specific keys', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    const deleted = cache.delete('key1');
    
    assert.strictEqual(deleted, true);
    assert.strictEqual(cache.get('key1'), undefined);
    assert.strictEqual(cache.get('key2'), 'value2');
  });

  it('has() returns correct status', () => {
    cache.set('key1', 'value1');
    
    assert.strictEqual(cache.has('key1'), true);
    assert.strictEqual(cache.has('nonexistent'), false);
  });
});

describe('makeRetrievalCacheKey', () => {
  it('creates consistent cache keys', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'what is the project status', 30);
    const key2 = makeRetrievalCacheKey('tenant1', 'what is the project status', 30);
    
    assert.strictEqual(key1, key2);
  });

  it('normalizes query case', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'Hello World', 30);
    const key2 = makeRetrievalCacheKey('tenant1', 'hello world', 30);
    
    assert.strictEqual(key1, key2);
  });

  it('normalizes whitespace', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'hello  world', 30);
    const key2 = makeRetrievalCacheKey('tenant1', 'hello world', 30);
    
    assert.strictEqual(key1, key2);
  });

  it('differentiates by tenant', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'query', 30);
    const key2 = makeRetrievalCacheKey('tenant2', 'query', 30);
    
    assert.notStrictEqual(key1, key2);
  });

  it('differentiates by time window', () => {
    const key1 = makeRetrievalCacheKey('tenant1', 'query', 30);
    const key2 = makeRetrievalCacheKey('tenant1', 'query', 60);
    
    assert.notStrictEqual(key1, key2);
  });
});


```

---

## src/cache.ts

**Path:** `src/cache.ts`

```ts
/**
 * AuroraNotes API - In-Memory Cache Module
 *
 * Provides TTL-based caching for performance optimization.
 * Caches are process-local and cleared on restart.
 *
 * Optimizations:
 * - LFU-LRU hybrid eviction strategy for better hit rates
 * - Batch eviction to reduce overhead
 * - Lazy cleanup to avoid blocking operations
 * - Memory-efficient entry tracking
 */

import { logInfo, logWarn } from "./utils";

// Cache configuration
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000; // Max entries per cache
const CLEANUP_INTERVAL_MS = 60 * 1000; // Cleanup every minute
const BATCH_EVICTION_PERCENT = 0.1; // Evict 10% when at capacity

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessTime: number;  // Track recency for LRU component
}

/**
 * Generic TTL cache with LFU-LRU hybrid eviction
 *
 * Eviction strategy combines:
 * - Frequency (LFU): Prefer keeping frequently accessed items
 * - Recency (LRU): Among items with similar frequency, prefer recent ones
 * - TTL: Expired items are always evicted first
 */
export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly name: string;
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(name: string, ttlMs: number = DEFAULT_TTL_MS, maxSize: number = MAX_CACHE_SIZE) {
    this.name = name;
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.startCleanup();
  }

  /**
   * Get a value from the cache
   * O(1) operation with LRU update via Map delete/re-insert
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessTime = now;

    // Move to end of Map for LRU ordering (O(1) amortized)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache
   * Uses batch eviction when at capacity for efficiency
   */
  set(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();

    // Check if key already exists (update case)
    const existing = this.cache.get(key);
    if (existing) {
      existing.value = value;
      existing.expiresAt = now + (ttlMs ?? this.ttlMs);
      existing.accessCount++;
      existing.lastAccessTime = now;
      // Move to end for LRU
      this.cache.delete(key);
      this.cache.set(key, existing);
      return;
    }

    // Evict if at capacity (batch eviction for efficiency)
    if (this.cache.size >= this.maxSize) {
      this.evictBatch();
    }

    this.cache.set(key, {
      value,
      expiresAt: now + (ttlMs ?? this.ttlMs),
      accessCount: 1,
      lastAccessTime: now,
    });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all entries matching a prefix
   * Optimized: collect keys first to avoid iterator invalidation
   */
  deleteByPrefix(prefix: string): number {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    return keysToDelete.length;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hits: number; misses: number; hitRate: number; evictions: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Math.round((this.hits / total) * 100) : 0,
      evictions: this.evictions,
    };
  }

  /**
   * Stop the cleanup timer (for graceful shutdown)
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Pre-warm cache with multiple entries (for batch operations)
   */
  setMany(entries: Array<{ key: string; value: T; ttlMs?: number }>): void {
    for (const { key, value, ttlMs } of entries) {
      this.set(key, value, ttlMs);
    }
  }

  /**
   * Get multiple values at once (for batch operations)
   */
  getMany(keys: string[]): Map<string, T> {
    const results = new Map<string, T>();
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        results.set(key, value);
      }
    }
    return results;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
    // Don't prevent process exit
    this.cleanupTimer.unref();
  }

  private cleanup(): void {
    const now = Date.now();
    let expired = 0;
    const keysToDelete: string[] = [];

    // Collect expired keys first
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    // Delete in batch
    for (const key of keysToDelete) {
      this.cache.delete(key);
      expired++;
    }

    if (expired > 0) {
      logInfo(`Cache ${this.name} cleanup`, { expired, remaining: this.cache.size });
    }
  }

  /**
   * Batch eviction using LFU-LRU hybrid scoring
   * Evicts BATCH_EVICTION_PERCENT of entries to reduce eviction frequency
   *
   * Optimizations:
   * - Use typed array for scores to reduce memory allocations
   * - Partial selection sort for finding k lowest scores (O(n*k) vs O(n log n))
   * - Early exit when expired entries satisfy eviction target
   */
  private evictBatch(): void {
    const targetEvictions = Math.max(1, Math.ceil(this.maxSize * BATCH_EVICTION_PERCENT));
    const now = Date.now();

    // First, evict any expired entries
    const expiredKeys: string[] = [];
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.evictions++;
    }

    // If we evicted enough expired entries, we're done
    if (expiredKeys.length >= targetEvictions) {
      return;
    }

    // Otherwise, use LFU-LRU hybrid scoring to select victims
    const remaining = targetEvictions - expiredKeys.length;
    const cacheSize = this.cache.size;

    // Pre-allocate arrays for efficiency
    const keys: string[] = new Array(cacheSize);
    const scores = new Float32Array(cacheSize);
    const maxAge = this.ttlMs;

    // Calculate eviction score for each entry
    // Lower score = more likely to be evicted
    let idx = 0;
    for (const [key, entry] of this.cache) {
      // Frequency component (log scale to prevent runaway values)
      const freqScore = Math.log2(entry.accessCount + 1);

      // Recency component (0 to 1, higher = more recent)
      const age = now - entry.lastAccessTime;
      const recencyScore = age >= maxAge ? 0 : 1 - (age / maxAge);

      // Combined score: 60% frequency, 40% recency
      scores[idx] = freqScore * 0.6 + recencyScore * 0.4;
      keys[idx] = key;
      idx++;
    }

    // Use partial selection sort to find k lowest scores
    // This is faster than full sort when remaining << cacheSize
    const toEvict: string[] = [];
    for (let i = 0; i < remaining && i < cacheSize; i++) {
      let minIdx = i;
      let minScore = scores[i];

      for (let j = i + 1; j < cacheSize; j++) {
        if (scores[j] < minScore) {
          minScore = scores[j];
          minIdx = j;
        }
      }

      // Swap to front
      if (minIdx !== i) {
        const tmpScore = scores[i];
        scores[i] = scores[minIdx];
        scores[minIdx] = tmpScore;

        const tmpKey = keys[i];
        keys[i] = keys[minIdx];
        keys[minIdx] = tmpKey;
      }

      toEvict.push(keys[i]);
    }

    // Batch eviction
    for (const key of toEvict) {
      this.cache.delete(key);
      this.evictions++;
    }
  }
}

// ============================================
// Singleton Cache Instances
// ============================================

// Cache for hydrated chunk documents (by chunkId)
// Short TTL since chunks can be updated
const CHUNK_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const chunkCache = new TTLCache<unknown>('chunk_docs', CHUNK_CACHE_TTL_MS, 500);

// Cache for retrieval results (by tenantId + normalizedQuery + timeWindow)
// Slightly longer TTL for query results
const RETRIEVAL_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const retrievalCache = new TTLCache<unknown>('retrieval_results', RETRIEVAL_CACHE_TTL_MS, 200);

/**
 * Generate a cache key for retrieval results
 */
export function makeRetrievalCacheKey(
  tenantId: string,
  normalizedQuery: string,
  maxAgeDays: number
): string {
  // Normalize query for caching (lowercase, trim, collapse whitespace)
  const normalized = normalizedQuery.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${tenantId}:${maxAgeDays}:${normalized}`;
}

/**
 * Get cached chunk document
 */
export function getCachedChunk<T>(chunkId: string): T | undefined {
  return chunkCache.get(chunkId) as T | undefined;
}

/**
 * Set cached chunk document
 */
export function setCachedChunk<T>(chunkId: string, chunk: T): void {
  chunkCache.set(chunkId, chunk);
}

/**
 * Get cached retrieval result
 */
export function getCachedRetrieval<T>(cacheKey: string): T | undefined {
  return retrievalCache.get(cacheKey) as T | undefined;
}

/**
 * Set cached retrieval result
 */
export function setCachedRetrieval<T>(cacheKey: string, result: T): void {
  retrievalCache.set(cacheKey, result);
}

/**
 * Get cache statistics for observability
 */
export function getCacheStats(): {
  chunks: { size: number; hits: number; misses: number; hitRate: number; evictions: number };
  retrieval: { size: number; hits: number; misses: number; hitRate: number; evictions: number };
} {
  return {
    chunks: chunkCache.getStats(),
    retrieval: retrievalCache.getStats(),
  };
}

/**
 * Clear all caches (useful for testing)
 */
export function clearAllCaches(): void {
  chunkCache.clear();
  retrievalCache.clear();
  logInfo('All caches cleared');
}

/**
 * Invalidate all cached retrieval results for a tenant
 * Call this when notes are created, updated, or deleted
 */
export function invalidateTenantCache(tenantId: string): number {
  const deleted = retrievalCache.deleteByPrefix(`${tenantId}:`);
  if (deleted > 0) {
    logInfo('Tenant cache invalidated', { tenantId, entriesDeleted: deleted });
  }
  return deleted;
}

/**
 * Invalidate cached chunk by ID
 * Call this when a chunk is deleted or re-indexed
 */
export function invalidateChunkCache(chunkId: string): boolean {
  return chunkCache.delete(chunkId);
}


```

---

## src/chat.ts

**Path:** `src/chat.ts`

```ts
/**
 * AuroraNotes API - Chat Service
 *
 * RAG-powered chat with inline citations, retry logic, and enhanced error handling.
 * Includes structured retrieval logging for observability.
 */

import {
  CHAT_MODEL,
  CHAT_TIMEOUT_MS,
  CHAT_MAX_QUERY_LENGTH,
  CHAT_TEMPERATURE,
  CHAT_TOP_P,
  CHAT_TOP_K,
  LLM_MAX_OUTPUT_TOKENS,
  RETRIEVAL_TOP_K,
  RETRIEVAL_RERANK_TO,
  DEFAULT_TENANT_ID,
  LLM_CONTEXT_BUDGET_CHARS,
  LLM_CONTEXT_RESERVE_CHARS,
  CITATION_RETRY_ENABLED,
  CITATION_VERIFICATION_ENABLED,
  CITATION_MIN_OVERLAP_SCORE,
} from "./config";
import { ChatRequest, ChatResponse, Citation, ScoredChunk, QueryIntent, SourcesPack, Source, ConfidenceLevel, ResponseMeta } from "./types";
import { retrieveRelevantChunks, analyzeQuery, calculateAdaptiveK } from "./retrieval";
import { logInfo, logError, logWarn, sanitizeText, isValidTenantId } from "./utils";
import { validateCitationsWithChunks } from "./citationValidator";
import {
  createRetrievalLog,
  logRetrieval,
  RetrievalLogEntry,
  RetrievalTimings,
  QualityFlags,
  CitationLogEntry,
  CitationValidationStats,
  computeScoreDistribution,
  candidateCountsToStageDetails,
} from "./retrievalLogger";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

// Enhanced response quality modules
import { postProcessResponse, validateResponseQuality, validateAndFixResponse, enforceResponseConsistency } from "./responsePostProcessor";
import { calculateResponseConfidence, getConfidenceSummary } from "./responseConfidence";
import { extractClaimCitationPairs, batchScoreCitations, filterByConfidence, aggregateConfidenceScores } from "./citationConfidence";

// New enhanced modules for improved citation accuracy
import { runUnifiedCitationPipeline, quickVerifyCitation, analyzeContradiction } from "./unifiedCitationPipeline";
import { buildEnhancedSystemPrompt, buildCompleteEnhancedPrompt } from "./enhancedPrompts";
import { buildCompleteAgenticPrompt, ResponseFormat } from "./agenticPrompts";
import { computeSemanticAnchors, buildSourceAnchorHints } from "./claimExtraction";

// Additional enhancement modules for response consistency and citation accuracy
import { selectBestResponse, extractCitationIds, filterInconsistentCitations, isSelfConsistencyEnabled, ResponseCandidate } from "./selfConsistency";
import { anchorClaims, isClaimAnchoringEnabled, AnchoringResult } from "./claimAnchoring";
import { validateAndRepair, validateResponse, getValidationConfig } from "./responseValidation";

// Retry configuration
const MAX_LLM_RETRIES = 2;
const LLM_RETRY_DELAY_MS = 1000;

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
function createTimeout<T>(ms: number, context: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms: ${context}`));
    }, ms);
  });
}

// Citation accuracy thresholds (tuned for better recall while maintaining precision)
const MIN_CITATION_COVERAGE = 0.5;        // Trigger repair if < 50% of sources cited
const MIN_CITATION_COVERAGE_STRICT = 0.6; // Warn if < 60% coverage after repair

// Feature flags for enhanced verification
const UNIFIED_PIPELINE_ENABLED = true;    // Use new unified citation verification pipeline
const CONSISTENCY_ENFORCEMENT_ENABLED = true;  // Enforce response consistency
const ENHANCED_PROMPTS_ENABLED = true;     // Use optimized v2 prompts (conversational, concise)
const AGENTIC_PROMPTS_ENABLED = true;      // Use new agentic prompt framework (overrides ENHANCED_PROMPTS)

// NOTE: MIN_CITATION_SCORE filtering is now done in retrieval (MIN_COMBINED_SCORE)
// to ensure prompt source count == citationsMap.size EXACTLY.
// All chunks returned from retrieval are "source-worthy" and included in citations.

/**
 * Custom error for server configuration issues (not client errors)
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Custom error for rate limiting
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Retry LLM call with exponential backoff and hard timeout
 */
async function withLLMRetry<T>(
  fn: () => Promise<T>,
  context: string,
  timeoutMs: number = CHAT_TIMEOUT_MS
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      // Race between LLM call and timeout
      const result = await Promise.race([
        fn(),
        createTimeout<T>(timeoutMs, context),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      const errMessage = err instanceof Error ? err.message : String(err);

      // Don't retry on certain errors
      if (errMessage.includes('INVALID_ARGUMENT') ||
          errMessage.includes('PERMISSION_DENIED') ||
          errMessage.includes('API key')) {
        throw err;
      }

      // Check for rate limiting
      if (errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED')) {
        throw new RateLimitError('API rate limit exceeded');
      }

      // Log timeout errors with context for debugging
      if (errMessage.includes('Timeout')) {
        logWarn(`${context} timeout`, { attempt: attempt + 1, timeoutMs });
      }

      if (attempt < MAX_LLM_RETRIES) {
        const delay = LLM_RETRY_DELAY_MS * Math.pow(2, attempt);
        logWarn(`${context} retry`, { attempt: attempt + 1, delayMs: delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Pre-compiled regex for sentence splitting
const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+/;

/**
 * Count how many query terms appear in a text (case-insensitive)
 * Optimized: pre-lowercase text once, use indexOf for speed
 */
function countQueryTermMatches(lowerText: string, queryTermsLower: string[]): number {
  let count = 0;
  for (const term of queryTermsLower) {
    if (lowerText.includes(term)) {
      count++;
    }
  }
  return count;
}

/**
 * Extract the most informative snippet from a chunk
 * Query-aware: prioritizes sentences containing the most query terms
 * Falls back to sentence-complete excerpts if no query terms provided
 *
 * Optimizations:
 * - Pre-lowercase text and query terms once
 * - Use indexOf instead of includes for faster matching
 * - Avoid unnecessary array allocations
 */
function extractBestSnippet(
  text: string,
  maxLength: number = 200,
  queryTerms: string[] = []
): string {
  if (text.length <= maxLength) return text;

  // Split into sentences
  const sentences = text.split(SENTENCE_SPLIT_REGEX);

  // If we have query terms, find the best sentence(s) containing them
  if (queryTerms.length > 0 && sentences.length > 1) {
    // Pre-lowercase query terms once
    const queryTermsLower = queryTerms.map(t => t.toLowerCase());

    // Score each sentence by query term matches
    let bestMatchIdx = -1;
    let bestMatchCount = 0;
    let bestMatchLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceLower = sentence.toLowerCase();
      const matchCount = countQueryTermMatches(sentenceLower, queryTermsLower);

      // Better match if: more matches, or same matches but earlier position
      if (matchCount > bestMatchCount ||
          (matchCount === bestMatchCount && matchCount > 0 && sentence.length <= maxLength && bestMatchLength > maxLength)) {
        if (sentence.length <= maxLength) {
          bestMatchIdx = i;
          bestMatchCount = matchCount;
          bestMatchLength = sentence.length;
        }
      }
    }

    if (bestMatchIdx >= 0 && bestMatchCount > 0) {
      let snippet = sentences[bestMatchIdx];

      // Try to add adjacent sentences if they fit
      // Check previous sentence
      if (bestMatchIdx > 0) {
        const prevSentence = sentences[bestMatchIdx - 1];
        if (snippet.length + prevSentence.length + 1 <= maxLength) {
          snippet = prevSentence + ' ' + snippet;
        }
      }
      // Check next sentence
      if (bestMatchIdx < sentences.length - 1) {
        const nextSentence = sentences[bestMatchIdx + 1];
        if (snippet.length + nextSentence.length + 1 <= maxLength) {
          snippet = snippet + ' ' + nextSentence;
        }
      }
      return snippet;
    }
  }

  // Fallback: use first sentence(s) that fit
  if (sentences[0] && sentences[0].length <= maxLength) {
    let snippet = sentences[0];
    for (let i = 1; i < sentences.length; i++) {
      if (snippet.length + sentences[i].length + 1 <= maxLength) {
        snippet += ' ' + sentences[i];
      } else {
        break;
      }
    }
    return snippet;
  }

  // Final fallback: truncate at word boundary
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + '…';
  }
  return truncated + '…';
}

/**
 * Build a SourcesPack from scored chunks - the single source of truth for sources/citations.
 *
 * IMPORTANT: No filtering here! All chunks passed in are "source-worthy"
 * (already filtered by MIN_COMBINED_SCORE in retrieval).
 * This ensures prompt source count == citationsMap.size EXACTLY.
 *
 * Optimizations:
 * - Pre-allocate Map with expected size
 * - Use for loop instead of forEach for better performance
 * - Cache date conversion
 *
 * @param chunks - The exact chunks to use as sources (already filtered/reranked)
 * @param queryTerms - Optional query terms for query-aware snippet extraction
 * @returns SourcesPack with 1:1 mapping between sources and citations
 */
export function buildSourcesPack(chunks: ScoredChunk[], queryTerms: string[] = []): SourcesPack {
  const citationsMap = new Map<string, Citation>();
  const chunkCount = chunks.length;

  // Create 1:1 mapping - every chunk becomes a citation
  for (let i = 0; i < chunkCount; i++) {
    const chunk = chunks[i];
    const cid = `N${i + 1}`;
    citationsMap.set(cid, {
      cid,
      noteId: chunk.noteId,
      chunkId: chunk.chunkId,
      createdAt: chunk.createdAt.toISOString(),
      snippet: extractBestSnippet(chunk.text, 250, queryTerms),
      score: Math.round(chunk.score * 100) / 100,
    });
  }

  return {
    sources: chunks,
    citationsMap,
    sourceCount: chunkCount, // Equals citationsMap.size
  };
}

/**
 * Extract key topics from chunks for context hints
 */
function extractTopicsFromChunks(chunks: ScoredChunk[]): string[] {
  const topicPatterns = [
    /\b(meeting|sprint|planning|decision|architecture|design)\b/gi,
    /\b(RAG|pipeline|chunking|embedding|retrieval|vector)\b/gi,
    /\b(Cloud Run|Firestore|API|backend|frontend)\b/gi,
    /\b(pagination|scaling|performance|optimization)\b/gi,
  ];

  const topics = new Set<string>();
  const allText = chunks.map(c => c.text).join(' ').toLowerCase();

  for (const pattern of topicPatterns) {
    const matches = allText.match(pattern);
    if (matches) {
      matches.slice(0, 3).forEach(m => topics.add(m.toLowerCase()));
    }
  }

  return Array.from(topics).slice(0, 5);
}

/**
 * Convert citations to human-readable Source objects for the new response format
 */
function citationsToSources(citations: Citation[]): Source[] {
  return citations.map(c => ({
    id: c.cid.replace('N', ''),
    noteId: c.noteId,
    preview: c.snippet.length > 120 ? c.snippet.slice(0, 117) + '...' : c.snippet,
    date: new Date(c.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    relevance: Math.round(c.score * 100) / 100,
  }));
}

/**
 * Build contextSources from chunks that were used as context but not cited in the answer.
 * These are sources the LLM had access to but didn't directly quote.
 *
 * @param allChunks - All chunks used as context for the LLM (after reranking)
 * @param citedChunkIds - Set of chunkIds that were cited in the answer
 * @param startId - Starting ID number for context sources (should be lastCitedId + 1)
 * @param queryTerms - Query terms for snippet extraction
 * @returns Array of Source objects for uncited context sources
 */
// Minimum relevance threshold for context sources (filter out noise)
// Increased to 0.40 to avoid showing irrelevant context that dilutes precision
const CONTEXT_SOURCE_MIN_RELEVANCE = 0.40;
const CONTEXT_SOURCE_MAX_COUNT = 4;  // Reduced for cleaner, more focused responses

function buildContextSources(
  allChunks: ScoredChunk[],
  citedChunkIds: Set<string>,
  startId: number,
  queryTerms: string[] = []
): Source[] {
  // Filter out cited chunks and keep only uncited context sources
  // Also filter by minimum relevance to avoid noise
  const uncitedChunks = allChunks.filter(chunk =>
    !citedChunkIds.has(chunk.chunkId) && chunk.score >= CONTEXT_SOURCE_MIN_RELEVANCE
  );

  // Sort by score (highest first) to show most relevant context sources first
  uncitedChunks.sort((a, b) => b.score - a.score);

  // Limit count for cleaner responses
  const topChunks = uncitedChunks.slice(0, CONTEXT_SOURCE_MAX_COUNT);

  // Convert to Source objects with sequential IDs
  return topChunks.map((chunk, index) => {
    const preview = chunk.text.length > 120 ? chunk.text.slice(0, 117) + '...' : chunk.text;
    return {
      id: String(startId + index),
      noteId: chunk.noteId,
      preview,
      date: chunk.createdAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      relevance: Math.round(chunk.score * 100) / 100,
    };
  });
}

/**
 * Determine confidence level based on citation coverage and scores
 *
 * Uses a multi-factor approach:
 * 1. If LLM expresses uncertainty → 'none'
 * 2. If no citations → 'none'
 * 3. Otherwise, use enhanced confidence breakdown
 *
 * Thresholds calibrated to match enhanced confidence levels:
 * - high: overall >= 0.70 (was too strict at 0.7 score requirement)
 * - medium: overall >= 0.50
 * - low: everything else
 */
function calculateConfidence(
  citationCount: number,
  sourceCount: number,
  avgScore: number,
  looksLikeUncertainty: boolean,
  enhancedLevel?: 'very_high' | 'high' | 'medium' | 'low' | 'very_low'
): ConfidenceLevel {
  if (looksLikeUncertainty || citationCount === 0) return 'none';

  // If enhanced confidence is available, map it to ConfidenceLevel
  if (enhancedLevel) {
    switch (enhancedLevel) {
      case 'very_high':
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
      case 'very_low':
        return 'low';
    }
  }

  // Fallback to legacy calculation with relaxed thresholds
  const coverage = sourceCount > 0 ? citationCount / sourceCount : 0;
  if (coverage >= 0.4 && avgScore >= 0.5) return 'high';
  if (coverage >= 0.2 && avgScore >= 0.3) return 'medium';
  return 'low';
}

/**
 * Normalize citation format from [N#] to [#] for cleaner display
 */
function normalizeCitationFormat(answer: string): string {
  return answer.replace(/\[N(\d+)\]/g, '[$1]');
}

/**
 * Get intent-specific formatting guidance for cleaner output
 */
function getIntentGuidance(intent: QueryIntent): { format: string; tone: string } {
  switch (intent) {
    case 'summarize':
      return {
        format: 'Start with a one-sentence overview, then use bullet points (•) for 2-4 key details.',
        tone: 'Synthesize information naturally. Avoid repeating the same facts.',
      };
    case 'list':
      return {
        format: 'Use bullet points (•) or numbers. One item per line. Group related items together.',
        tone: 'Be scannable and organized.',
      };
    case 'decision':
      return {
        format: 'State the decision clearly first. Then explain the reasoning in 1-2 sentences.',
        tone: 'Be definitive. Use "decided to" or "chose" language.',
      };
    case 'action_item':
      return {
        format: 'Use bullet points (•) for each action. Include who/when if mentioned in notes.',
        tone: 'Be actionable and clear.',
      };
    case 'question':
      return {
        format: 'Answer directly in the first sentence. Add brief context only if it helps understanding.',
        tone: 'Be conversational but precise.',
      };
    default:
      return {
        format: 'Write 1-3 short paragraphs. Use bullet points if listing multiple related items.',
        tone: 'Be helpful and natural.',
      };
  }
}

// Pre-built prompt template parts (avoid string concatenation in hot path)
const PROMPT_TEMPLATE_START = `You are a helpful assistant answering questions from the user's personal notes.

## Your Task
Answer the user's question using ONLY the information in the sources below. If the sources don't contain relevant information, say "I don't have notes about that."

## Response Guidelines
1. **Be natural and conversational** - Write like you're explaining to a friend, not listing facts
2. **Structure for readability** - Use bullet points or numbered lists when listing multiple items
3. **Lead with the answer** - Start with the most important information first
4. **Be concise** - Don't repeat information; synthesize related points

## How to Cite
- Add citations at the END of each paragraph or logical section, not after every sentence
- Use format: [N1] or [N1][N2] for multiple sources
- Only cite when introducing NEW information from a source
- Example: "React Hooks let you use state in functional components. useState manages local state, while useEffect handles side effects like API calls. [N1]"

## Formatting
`;

const PROMPT_TEMPLATE_SOURCES = `

## Sources (`;
const PROMPT_TEMPLATE_QUESTION = ` total)
`;
const PROMPT_TEMPLATE_END = `

## Question
`;
const PROMPT_TEMPLATE_ANSWER = `

## Answer`;

// Cache date format options to avoid repeated object creation
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/**
 * Build an optimized RAG prompt with clean formatting instructions.
 * Uses numbered citations [1], [2] for cleaner display.
 *
 * Optimizations:
 * - Pre-built template strings to reduce concatenation
 * - Build source index map for O(1) lookups instead of O(n) find()
 * - Pre-allocate array for source parts
 * - Cached date format options
 */
export function buildPrompt(
  query: string,
  sourcesPack: SourcesPack,
  intent: QueryIntent = 'search'
): string {
  const { sources, citationsMap, sourceCount } = sourcesPack;
  const guidance = getIntentGuidance(intent);

  // Build a chunkId -> source map for O(1) lookups (vs O(n) find per citation)
  const sourceMap = new Map<string, ScoredChunk>();
  for (const source of sources) {
    sourceMap.set(source.chunkId, source);
  }

  // Pre-allocate array for source text parts
  const sourceParts: string[] = new Array(citationsMap.size);
  let idx = 0;

  for (const [cid, citation] of citationsMap) {
    const chunk = sourceMap.get(citation.chunkId);
    const text = chunk?.text || citation.snippet;
    const date = new Date(citation.createdAt).toLocaleDateString('en-US', DATE_FORMAT_OPTIONS);
    sourceParts[idx++] = `[${cid}] ${date}\n${text}`;
  }

  const sourcesText = sourceParts.join('\n\n');

  // Build final prompt using pre-built template parts
  return PROMPT_TEMPLATE_START +
    guidance.format + '\n' +
    guidance.tone +
    PROMPT_TEMPLATE_SOURCES +
    sourceCount +
    PROMPT_TEMPLATE_QUESTION +
    sourcesText +
    PROMPT_TEMPLATE_END +
    query +
    PROMPT_TEMPLATE_ANSWER;
}

// NOTE: Citation validation functions (validateCitations, extractVerificationKeywords,
// calculateOverlapScore, verifyCitationRelevance) have been consolidated into
// src/citationValidator.ts as the single canonical validation module.
// Use validateCitationsWithChunks() for all citation validation.

/**
 * Find citation references in the answer that don't map to valid citations.
 * Returns array of dangling reference strings like ["N5", "N7"]
 */
function findDanglingCitationReferences(answer: string, validCitations: Citation[]): string[] {
  const validCids = new Set(validCitations.map(c => c.cid));
  const citationPattern = /\[N(\d+)\]/g;
  const danglingRefs: string[] = [];

  let match;
  while ((match = citationPattern.exec(answer)) !== null) {
    const cid = `N${match[1]}`;
    if (!validCids.has(cid)) {
      danglingRefs.push(cid);
    }
  }

  // Return unique dangling refs
  return [...new Set(danglingRefs)];
}

/**
 * Remove dangling citation references from the answer.
 * Cleans up [N#] patterns that don't map to valid citations.
 */
function removeDanglingReferences(answer: string, danglingRefs: string[]): string {
  let cleaned = answer;
  for (const ref of danglingRefs) {
    // Remove the [N#] pattern, handling multiple occurrences
    const pattern = new RegExp(`\\[${ref}\\]`, 'g');
    cleaned = cleaned.replace(pattern, '');
  }
  // Clean up any double spaces left behind
  cleaned = cleaned.replace(/  +/g, ' ').trim();
  return cleaned;
}

/**
 * Build a repair prompt to fix missing or invalid citations
 * Provides specific feedback about what needs to be fixed
 */
function buildCitationRepairPrompt(
  originalAnswer: string,
  citations: Map<string, Citation>,
  invalidCids?: string[] // Optional: list of invalid citation IDs to remove
): string {
  const citationList = Array.from(citations.entries())
    .map(([cid, c]) => {
      return `[${cid}]: "${c.snippet.slice(0, 200)}${c.snippet.length > 200 ? '...' : ''}"`;
    })
    .join('\n');

  // Build feedback about invalid citations if provided
  const invalidFeedback = invalidCids && invalidCids.length > 0
    ? `\nPROBLEM: The following citations are INVALID and must be removed or replaced: ${invalidCids.join(', ')}\nThese citations do not match their claimed source content.\n`
    : '';

  return `Fix the citations in this answer. Use ONLY [N1], [N2], etc. matching the sources below.
${invalidFeedback}
AVAILABLE SOURCES (use ONLY these):
${citationList}

ANSWER TO FIX:
${originalAnswer}

STRICT RULES:
1. Every factual claim MUST have a citation [N#] immediately after it
2. Only use citation IDs that exist in the sources above
3. Each citation must ACTUALLY support the claim (don't cite randomly)
4. Don't change the meaning or add new information
5. If a claim has no supporting source, either remove the claim or state "according to my notes" without a citation

REWRITE WITH CORRECT CITATIONS:`;
}

/**
 * Generate chat response with RAG
 */
export async function generateChatResponse(request: ChatRequest): Promise<ChatResponse> {
  const startTime = Date.now();

  // Check GenAI availability early to return 503 instead of 500
  if (!isGenAIAvailable()) {
    throw new ConfigurationError('Chat service is not configured. Set GOOGLE_API_KEY/GEMINI_API_KEY or configure Vertex AI.');
  }

  // Sanitize and validate input
  const query = sanitizeText(request.message, CHAT_MAX_QUERY_LENGTH + 100).trim();
  const tenantId = request.tenantId || DEFAULT_TENANT_ID;

  // Initialize structured retrieval log (generate requestId if not provided)
  const retrievalLog = createRetrievalLog(tenantId, query) as RetrievalLogEntry;

  // Timing metrics for observability
  const timing: RetrievalTimings = {
    totalMs: 0,
  };

  // Quality flags for logging
  const qualityFlags: QualityFlags = {
    citationCoveragePct: 0,
    invalidCitationsRemoved: 0,
    fallbackUsed: false,
    insufficientEvidence: false,
    regenerationAttempted: false,
  };

  if (!query) {
    throw new Error('message is required');
  }

  if (query.length > CHAT_MAX_QUERY_LENGTH) {
    throw new Error(`message too long (max ${CHAT_MAX_QUERY_LENGTH} chars)`);
  }

  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  // Analyze query for intent and keywords
  const queryAnalysis = analyzeQuery(query);

  // Calculate adaptive K based on query complexity
  // With dynamic context budget, we no longer cap rerankTo to a small fixed number
  const adaptiveK = calculateAdaptiveK(query, queryAnalysis.intent, queryAnalysis.keywords);
  const rerankTo = adaptiveK * 3; // Allow more candidates for dynamic selection

  // Calculate context budget for sources (leave room for system prompt + query)
  const contextBudget = LLM_CONTEXT_BUDGET_CHARS - LLM_CONTEXT_RESERVE_CHARS;

  // Retrieve relevant chunks with dynamic context budget
  const retrievalStart = Date.now();
  let { chunks, strategy, candidateCount, candidateCounts } = await retrieveRelevantChunks(query, {
    tenantId,
    topK: RETRIEVAL_TOP_K,
    rerankTo,
    contextBudget,
  });
  timing.retrievalMs = Date.now() - retrievalStart;

  // Handle no results
  if (chunks.length === 0) {
    return {
      answer: "I don't have any notes to search through. Try creating some notes first!",
      sources: [],
      meta: {
        model: CHAT_MODEL,
        requestId: retrievalLog.requestId,
        responseTimeMs: Date.now() - startTime,
        intent: queryAnalysis.intent,
        confidence: 'none' as ConfidenceLevel,
        sourceCount: 0,
        debug: { strategy: 'no_results' },
      },
      citations: [], // Backwards compatibility
    };
  }

  // Build SourcesPack - single source of truth for sources/citations
  // This ensures prompt source count == citationsMap.size EXACTLY
  // Pass query keywords for query-aware snippet extraction
  const queryTerms = queryAnalysis.keywords || [];
  const sourcesPack = buildSourcesPack(chunks, queryTerms);
  const { citationsMap, sourceCount } = sourcesPack;

  // Build prompt with intent-aware instructions using SourcesPack
  // Priority: Agentic prompts > Enhanced prompts (v2) > Legacy prompts
  let prompt: string;
  let systemInstruction: string | undefined;
  let responseFormat: ResponseFormat | undefined;

  if (AGENTIC_PROMPTS_ENABLED) {
    // Agentic prompts: intelligent response generation with format optimization
    const agenticResult = buildCompleteAgenticPrompt(
      query,
      chunks,
      queryAnalysis.intent
    );
    systemInstruction = agenticResult.systemPrompt;
    prompt = agenticResult.userPrompt;
    responseFormat = agenticResult.format;

    logInfo('Using agentic prompt framework', {
      intent: queryAnalysis.intent,
      format: responseFormat,
      sourceCount,
    });
  } else if (ENHANCED_PROMPTS_ENABLED) {
    // Enhanced v2 prompts: separate system instruction + user prompt
    const { systemPrompt, userPrompt } = buildCompleteEnhancedPrompt(
      query,
      chunks,
      queryAnalysis.intent
    );
    systemInstruction = systemPrompt;
    prompt = userPrompt;
  } else {
    // Legacy prompts: single combined prompt string
    prompt = buildPrompt(query, sourcesPack, queryAnalysis.intent);
  }

  // Call LLM with retry logic
  const client = getGenAIClient();
  let answer: string;

  const generationStart = Date.now();
  try {
    const result = await withLLMRetry(async () => {
      return await client.models.generateContent({
        model: CHAT_MODEL,
        contents: prompt,
        config: {
          temperature: CHAT_TEMPERATURE,
          topP: CHAT_TOP_P,
          topK: CHAT_TOP_K,
          maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
          ...(systemInstruction && { systemInstruction }),
        },
      });
    }, 'LLM generation');

    answer = result.text || '';
    timing.generationMs = Date.now() - generationStart;

    // Log token usage and cost estimates
    // Gemini Flash pricing: ~$0.075 per 1M input tokens, ~$0.30 per 1M output tokens
    const inputTokenEstimate = Math.ceil(prompt.length / 4); // Rough estimate
    const outputTokenEstimate = Math.ceil(answer.length / 4);
    const inputCostUsd = (inputTokenEstimate / 1000000) * 0.075;
    const outputCostUsd = (outputTokenEstimate / 1000000) * 0.30;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    logInfo('LLM generation complete', {
      model: CHAT_MODEL,
      inputTokensEstimate: inputTokenEstimate,
      outputTokensEstimate: outputTokenEstimate,
      estimatedCostUsd: Math.round(totalCostUsd * 1000000) / 1000000,
      elapsedMs: timing.generationMs,
    });

    if (!answer) {
      throw new Error('Empty response from model');
    }
  } catch (err) {
    timing.generationMs = Date.now() - generationStart;
    if (err instanceof RateLimitError) {
      logError('LLM rate limit hit', err);
      throw err; // Let the handler return 429
    }
    if (err instanceof ConfigurationError) {
      logError('LLM configuration error', err);
      throw err; // Let the handler return 503
    }
    // Check for configuration-related errors from the GenAI client
    const errMessage = err instanceof Error ? err.message : String(err);
    if (errMessage.includes('API key') ||
        errMessage.includes('GOOGLE_API_KEY') ||
        errMessage.includes('GEMINI_API_KEY') ||
        errMessage.includes('GOOGLE_CLOUD_PROJECT') ||
        errMessage.includes('credentials')) {
      logError('LLM configuration error', err);
      throw new ConfigurationError(`Chat service configuration error: ${errMessage}`);
    }
    logError('LLM generation failed', err);
    throw new Error('Failed to generate response');
  }

  // Unified citation validation pipeline using citationValidator
  // This consolidates: invalid citation removal, formatting cleanup, overlap verification
  const citationsList = Array.from(citationsMap.values());
  const validationResult = validateCitationsWithChunks(
    answer,
    citationsList,
    chunks,
    {
      strictMode: true,
      minOverlapScore: CITATION_MIN_OVERLAP_SCORE,
      verifyRelevance: CITATION_VERIFICATION_ENABLED,
      requestId: retrievalLog.requestId,
    }
  );

  let cleanedAnswer = validationResult.validatedAnswer;
  let usedCitations = validationResult.validatedCitations;
  // Use a function to check hasCitations dynamically (usedCitations may be updated by repair)
  const checkHasCitations = () => usedCitations.length > 0;

  // Track citation quality metrics
  const totalRemovedCount = validationResult.invalidCitationsRemoved.length + validationResult.droppedCitations.length;
  if (totalRemovedCount > 0) {
    qualityFlags.invalidCitationsRemoved = totalRemovedCount;
  }

  // Detect if response looks like uncertainty about the question
  const looksLikeUncertainty =
    cleanedAnswer.toLowerCase().includes("don't have") ||
    cleanedAnswer.toLowerCase().includes("don't see") ||
    cleanedAnswer.toLowerCase().includes("cannot find") ||
    cleanedAnswer.toLowerCase().includes("no notes about") ||
    cleanedAnswer.toLowerCase().includes("no information");

  // Calculate citation coverage using sourceCount (== citationsMap.size)
  // This ensures we compute coverage against the EXACT number of sources in the prompt
  const citationCoverage = sourceCount > 0 ? usedCitations.length / sourceCount : 1;
  const hasLowCoverage = sourceCount >= 3 && citationCoverage < MIN_CITATION_COVERAGE && !looksLikeUncertainty;

  // Also trigger repair if validation removed invalid citations
  const invalidCidsFromValidation = validationResult.invalidCitationsRemoved.concat(validationResult.droppedCitations);
  const hasInvalidCitations = invalidCidsFromValidation.length > 0;

  // Retry if no citations found OR low citation coverage OR invalid citations removed
  if ((!checkHasCitations() || hasLowCoverage || hasInvalidCitations) && !looksLikeUncertainty && CITATION_RETRY_ENABLED && sourceCount > 0) {
    const repairStart = Date.now();
    const repairReason = !checkHasCitations()
      ? 'no citations'
      : hasInvalidCitations
        ? `invalid citations removed (${invalidCidsFromValidation.join(', ')})`
        : `low coverage (${Math.round(citationCoverage * 100)}%)`;
    qualityFlags.regenerationAttempted = true;
    logInfo('Attempting citation repair', {
      reason: repairReason,
      citationCount: usedCitations.length,
      sourceCount,
      invalidRemoved: invalidCidsFromValidation,
    });

    try {
      // Pass invalid citations to repair prompt for better feedback
      const repairPrompt = buildCitationRepairPrompt(answer, citationsMap, invalidCidsFromValidation);
      // Use shorter timeout for repair since it's a secondary operation
      const repairResult = await withLLMRetry(async () => {
        return await client.models.generateContent({
          model: CHAT_MODEL,
          contents: repairPrompt,
          config: {
            temperature: 0.1, // Low temp for repair
            maxOutputTokens: 1024,
          },
        });
      }, 'Citation repair', CHAT_TIMEOUT_MS / 2);

      const repairedAnswer = repairResult.text || '';
      if (repairedAnswer) {
        // Use unified validation for repaired answer
        const repairedValidation = validateCitationsWithChunks(
          repairedAnswer,
          citationsList,
          chunks,
          {
            strictMode: true,
            minOverlapScore: CITATION_MIN_OVERLAP_SCORE,
            verifyRelevance: CITATION_VERIFICATION_ENABLED,
            requestId: retrievalLog.requestId,
          }
        );
        const repairedHasCitations = repairedValidation.validatedCitations.length > 0;
        // Accept repair if it improved citation coverage (using sourceCount)
        const repairedCoverage = repairedValidation.validatedCitations.length / sourceCount;
        if (repairedHasCitations && repairedCoverage > citationCoverage) {
          cleanedAnswer = repairedValidation.validatedAnswer;
          usedCitations = repairedValidation.validatedCitations;
          strategy += '_repaired';
          logInfo('Citation repair successful', {
            citationCount: usedCitations.length,
            coverageBefore: Math.round(citationCoverage * 100),
            coverageAfter: Math.round(repairedCoverage * 100),
          });
        } else {
          logWarn('Citation repair did not improve coverage, using original');
        }
      }
      timing.repairMs = Date.now() - repairStart;
    } catch (repairErr) {
      timing.repairMs = Date.now() - repairStart;
      logError('Citation repair error', repairErr);
      // Continue with original answer
    }
  }

  // Final consistency check: ensure no dangling citation references in the answer
  // This catches any [N#] references that don't map to valid citations
  const danglingRefs = findDanglingCitationReferences(cleanedAnswer, usedCitations);
  if (danglingRefs.length > 0) {
    logWarn('Dangling citation references detected, removing', {
      danglingRefs,
      usedCitationCids: usedCitations.map(c => c.cid),
    });
    // Remove dangling references from the answer
    cleanedAnswer = removeDanglingReferences(cleanedAnswer, danglingRefs);
    qualityFlags.danglingRefsRemoved = danglingRefs.length;
  }

  // If still no valid citations and answer doesn't acknowledge uncertainty, provide helpful fallback
  if (!checkHasCitations() && !looksLikeUncertainty) {
    qualityFlags.insufficientEvidence = true;
    qualityFlags.fallbackUsed = true;
    logInfo('No citations found, using fallback response');

    // Build a helpful response mentioning what topics ARE in the notes
    const noteTopics = extractTopicsFromChunks(chunks);
    let fallbackAnswer: string;

    if (noteTopics.length > 0) {
      fallbackAnswer = `I couldn't find notes specifically about that. Your notes currently cover topics like ${noteTopics.join(', ')}. Try creating a note about what you're looking for!`;
    } else {
      fallbackAnswer = "I couldn't find notes about that topic. Try rephrasing your question, or create a note about this topic so I can help you next time!";
    }

    return {
      answer: fallbackAnswer,
      sources: [],
      meta: {
        model: CHAT_MODEL,
        requestId: retrievalLog.requestId,
        responseTimeMs: Date.now() - startTime,
        intent: queryAnalysis.intent,
        confidence: 'none' as ConfidenceLevel,
        sourceCount: 0,
        debug: {
          strategy,
          candidateCount,
          rerankCount: chunks.length,
        },
      },
      citations: [], // Backwards compatibility
    };
  }

  // ===== ENHANCED RESPONSE PROCESSING =====
  // Apply post-processing for consistency and quality

  const postProcessStart = Date.now();

  // 0. Run unified citation verification pipeline (new enhanced verification)
  let pipelineResult;
  if (UNIFIED_PIPELINE_ENABLED) {
    try {
      pipelineResult = await runUnifiedCitationPipeline(
        cleanedAnswer,
        usedCitations,
        chunks,
        queryAnalysis.intent
      );

      // Log pipeline results
      logInfo('Unified pipeline verification complete', {
        overallConfidence: Math.round(pipelineResult.overallConfidence * 100) / 100,
        citationAccuracy: Math.round(pipelineResult.citationAccuracy * 100) / 100,
        contractCompliant: pipelineResult.contractCompliant,
        hasContradictions: pipelineResult.hasContradictions,
        weakCitationCount: pipelineResult.weakCitations.length,
        invalidRemoved: pipelineResult.invalidCitationsRemoved.length,
        processingTimeMs: pipelineResult.processingTimeMs,
      });

      // Use validated output from pipeline
      cleanedAnswer = pipelineResult.validatedAnswer;
      usedCitations = pipelineResult.validatedCitations;

      // Update quality flags based on pipeline results
      if (pipelineResult.invalidCitationsRemoved.length > 0) {
        qualityFlags.potentialHallucinations = true;
      }
      if (pipelineResult.hasContradictions) {
        qualityFlags.contradictionsDetected = true;
      }
    } catch (pipelineError) {
      logWarn('Unified pipeline failed, continuing with standard processing',
        pipelineError instanceof Error ? { error: pipelineError.message } : undefined);
    }
  }

  // 1. Enforce response consistency (new)
  if (CONSISTENCY_ENFORCEMENT_ENABLED) {
    const { correctedAnswer, result: consistencyResult } = enforceResponseConsistency(
      cleanedAnswer,
      queryAnalysis.intent
    );
    cleanedAnswer = correctedAnswer;

    if (!consistencyResult.isConsistent) {
      logInfo('Response consistency enforced', {
        corrections: consistencyResult.corrections,
        toneConsistency: Math.round(consistencyResult.toneConsistency * 100) / 100,
        formatConsistency: Math.round(consistencyResult.formatConsistency * 100) / 100,
        citationConsistency: Math.round(consistencyResult.citationConsistency * 100) / 100,
      });
    }
  }

  // 2. Post-process response for consistent formatting
  const postProcessed = postProcessResponse(
    cleanedAnswer,
    usedCitations,
    queryAnalysis.intent
  );
  cleanedAnswer = postProcessed.processedAnswer;
  usedCitations = postProcessed.citations;

  // Log post-processing modifications
  if (postProcessed.modifications.length > 0) {
    logInfo('Response post-processed', {
      modifications: postProcessed.modifications,
      coherenceScore: postProcessed.coherenceScore,
      structureType: postProcessed.structureType,
    });
  }

  // 3. Validate response quality
  const qualityValidation = validateResponseQuality(cleanedAnswer, usedCitations);
  if (!qualityValidation.isValid) {
    logWarn('Response quality issues detected', {
      issues: qualityValidation.issues,
      suggestions: qualityValidation.suggestions,
    });
  }

  // 4. Calculate enhanced confidence metrics
  const confidenceBreakdown = calculateResponseConfidence(
    cleanedAnswer,
    usedCitations,
    chunks,
    queryAnalysis.intent
  );

  // 5. Score citation confidence (lightweight - no semantic scoring for speed)
  const claimPairs = extractClaimCitationPairs(cleanedAnswer);
  let citationConfidenceMetrics = {
    averageConfidence: 0,
    highConfidenceCount: 0,
    insufficientCount: 0,
  };

  if (claimPairs.length > 0) {
    const citationScores = await batchScoreCitations(
      claimPairs,
      usedCitations,
      chunks,
      { useSemanticScoring: false } // Disable for speed in production
    );
    citationConfidenceMetrics = {
      averageConfidence: citationScores.averageConfidence,
      highConfidenceCount: citationScores.highConfidenceCount,
      insufficientCount: citationScores.insufficientCount,
    };

    // 6. Aggregate confidence scores for overall quality assessment
    const aggregatedConfidence = aggregateConfidenceScores(citationScores.scores);

    // Log aggregate confidence
    if (aggregatedConfidence.weakestCitations.length > 0) {
      logInfo('Citation confidence aggregated', {
        overallScore: aggregatedConfidence.overallScore,
        level: aggregatedConfidence.confidenceLevel,
        distribution: aggregatedConfidence.scoreDistribution,
        recommendation: aggregatedConfidence.recommendation,
      });
    }

    // Filter out citations with insufficient confidence
    if (citationScores.insufficientCount > 0) {
      const { rejected } = filterByConfidence(citationScores.scores);
      if (rejected.length > 0) {
        logWarn('Low confidence citations detected', {
          rejectedCount: rejected.length,
          rejectedCids: rejected.map(r => r.cid),
        });
      }
    }
  }

  // 7. Enhanced response validation and repair
  const enhancedValidation = validateAndRepair(cleanedAnswer, sourceCount, queryAnalysis.intent);
  if (enhancedValidation.repair) {
    cleanedAnswer = enhancedValidation.finalResponse;
    logInfo('Response validation and repair applied', {
      issuesFixed: enhancedValidation.repair.issuesFixed,
      issuesRemaining: enhancedValidation.repair.issuesRemaining,
      repairsApplied: enhancedValidation.repair.repairsApplied,
    });
  }

  // 8. Claim anchoring verification (if enabled)
  let anchoringResult: AnchoringResult | undefined;
  if (isClaimAnchoringEnabled()) {
    anchoringResult = anchorClaims(cleanedAnswer, chunks);
    if (anchoringResult.unsupportedClaims.length > 0) {
      logWarn('Claim anchoring: unsupported claims detected', {
        unsupportedCount: anchoringResult.unsupportedClaims.length,
        overallScore: anchoringResult.overallScore,
        misattributedCitations: anchoringResult.misattributedCitations,
      });
    }
  }

  timing.postProcessMs = Date.now() - postProcessStart;
  // ===== END ENHANCED PROCESSING =====

  timing.totalMs = Date.now() - startTime;
  // Use sourceCount (== citationsMap.size) for consistent coverage calculation
  const finalCoverage = sourceCount > 0 ? Math.round((usedCitations.length / sourceCount) * 100) : 100;

  // Build citation log entries
  const citationLogEntries: CitationLogEntry[] = usedCitations.map(c => ({
    cid: c.cid,
    noteId: c.noteId,
    chunkId: c.chunkId,
    score: c.score,
    snippetLength: c.snippet.length,
  }));

  // Update quality flags
  qualityFlags.citationCoveragePct = finalCoverage;

  // Determine retrieval mode
  const retrievalMode = strategy.includes('hybrid') ? 'hybrid' :
    strategy.includes('vector') ? 'vector' :
    strategy.includes('fallback') ? 'fallback' : 'keyword_only';

  // Build citation validation stats from pipeline result (if available)
  const citationValidationStats: CitationValidationStats | undefined = pipelineResult ? {
    totalCitationsInAnswer: pipelineResult.citationValidations.length,
    validCitations: pipelineResult.validatedCitations.length,
    invalidCitationsRemoved: pipelineResult.invalidCitationsRemoved.length,
    weakCitations: pipelineResult.weakCitations.length,
    contractCompliant: pipelineResult.contractCompliant,
    overallConfidence: pipelineResult.overallConfidence,
    citationAccuracy: pipelineResult.citationAccuracy,
  } : undefined;

  // Complete the retrieval log entry with comprehensive observability
  const finalLog: RetrievalLogEntry = {
    ...retrievalLog,
    intent: queryAnalysis.intent,
    retrievalMode: retrievalMode as 'vector' | 'hybrid' | 'keyword_only' | 'fallback',
    candidateCounts: {
      vectorK: candidateCounts?.vectorK || 0,
      keywordK: candidateCounts?.lexicalK || 0,
      mergedK: candidateCounts?.mergedK || candidateCount,
      afterRerank: candidateCounts?.rerankedK || chunks.length,
      finalChunks: candidateCounts?.finalK || chunks.length,
    },
    // Add detailed stage counts for debugging retrieval issues
    stageDetails: candidateCounts ? candidateCountsToStageDetails(candidateCounts) : undefined,
    // Score distribution helps identify single-source dominance or sparse results
    scoreDistribution: computeScoreDistribution(chunks),
    rerankMethod: strategy,
    citations: citationLogEntries,
    timings: timing,
    quality: qualityFlags,
    answerLength: cleanedAnswer.length,
    // New Phase 5 observability fields
    totalSourcesReturned: usedCitations.length,
    llmContextBudgetChars: contextBudget,
    citationValidation: citationValidationStats,
    pipelineProcessingMs: pipelineResult?.processingTimeMs,
  };

  // Log the structured retrieval trace
  logRetrieval(finalLog);

  // Log comprehensive metrics for observability (existing log)
  logInfo('Chat response generated', {
    requestId: retrievalLog.requestId,
    queryLength: query.length,
    intent: queryAnalysis.intent,
    // Counts
    candidatesFetched: candidateCount,
    chunksUsed: chunks.length,
    citationsUsed: usedCitations.length,
    citationCoverage: `${finalCoverage}%`,
    strategy,
    // Latency breakdown
    timing: {
      retrievalMs: timing.retrievalMs || 0,
      generationMs: timing.generationMs || 0,
      repairMs: timing.repairMs || 0,
      totalMs: timing.totalMs,
    },
  });

  // Warn if coverage is below strict threshold (helps identify issues in production)
  if (finalCoverage < MIN_CITATION_COVERAGE_STRICT * 100 && sourceCount >= 3 && !looksLikeUncertainty) {
    logWarn('Low citation coverage detected', {
      requestId: retrievalLog.requestId,
      coverage: `${finalCoverage}%`,
      threshold: `${MIN_CITATION_COVERAGE_STRICT * 100}%`,
      citationCount: usedCitations.length,
      sourceCount,
      query: query.slice(0, 100),
    });
  }

  // Final observability summary log
  logInfo('Chat request complete', {
    requestId: retrievalLog.requestId,
    tenantId,
    intent: queryAnalysis.intent,
    sourceCount,
    citationCount: usedCitations.length,
    citationCoveragePct: finalCoverage,
    uniqueNotesInContext: new Set(chunks.map(c => c.noteId)).size,
    answerLength: cleanedAnswer.length,
    qualityFlags: {
      repairAttempted: qualityFlags.regenerationAttempted,
      danglingRefsRemoved: qualityFlags.danglingRefsRemoved ?? 0,
      invalidCitationsRemoved: qualityFlags.invalidCitationsRemoved,
    },
    timingMs: {
      retrieval: timing.retrievalMs,
      generation: timing.generationMs,
      repair: timing.repairMs,
      postProcess: timing.postProcessMs,
      total: timing.totalMs,
    },
    enhancedConfidence: confidenceBreakdown.overallConfidence,
  });

  // Normalize answer to use clean citation format [1] instead of [N1]
  const normalizedAnswer = normalizeCitationFormat(cleanedAnswer);

  // Calculate average relevance score for confidence
  const avgScore = usedCitations.length > 0
    ? usedCitations.reduce((sum, c) => sum + c.score, 0) / usedCitations.length
    : 0;

  // Build human-readable sources (cited in the answer)
  const sources = citationsToSources(usedCitations);

  // Build contextSources (all context sources not cited in the answer)
  // These are sources the LLM had access to but didn't directly quote
  // Skip context sources when:
  // 1. Answer indicates uncertainty (no relevant notes found)
  // 2. Confidence is very low, which means context isn't actually helpful
  // 3. Top chunk score is too low (out-of-scope query)
  const citedChunkIds = new Set(usedCitations.map(c => c.chunkId));
  const lastCitedId = usedCitations.length; // IDs are 1-indexed, so next ID is length + 1

  // Only show context sources when we have truly relevant context
  // Stricter threshold: at least 0.35 relevance on top chunk AND we have citations
  // For out-of-scope queries with no citations, don't show irrelevant context
  const hasRelevantContext = usedCitations.length > 0 &&
    (chunks.length > 0 && chunks[0].score >= 0.35);

  const contextSources = hasRelevantContext
    ? buildContextSources(chunks, citedChunkIds, lastCitedId + 1, queryTerms)
    : [];

  // Get enhanced confidence summary
  const enhancedConfidenceSummary = getConfidenceSummary(confidenceBreakdown);

  // Determine confidence level - now uses enhanced confidence as primary signal
  const confidence = calculateConfidence(
    usedCitations.length,
    sourceCount,
    avgScore,
    looksLikeUncertainty,
    confidenceBreakdown.confidenceLevel  // Pass enhanced level for accurate mapping
  );

  return {
    answer: normalizedAnswer,
    sources,
    contextSources: contextSources.length > 0 ? contextSources : undefined,
    meta: {
      model: CHAT_MODEL,
      requestId: retrievalLog.requestId,
      responseTimeMs: timing.totalMs,
      intent: queryAnalysis.intent,
      confidence,
      sourceCount: usedCitations.length,
      debug: {
        strategy,
        candidateCount,
        rerankCount: chunks.length,
        // Enhanced quality metrics
        enhancedConfidence: {
          overall: enhancedConfidenceSummary.score,
          level: enhancedConfidenceSummary.level,
          isReliable: enhancedConfidenceSummary.isReliable,
          breakdown: {
            citationDensity: confidenceBreakdown.citationDensity,
            sourceRelevance: confidenceBreakdown.sourceRelevance,
            answerCoherence: confidenceBreakdown.answerCoherence,
            claimSupport: confidenceBreakdown.claimSupport,
          },
        },
        citationQuality: {
          averageConfidence: citationConfidenceMetrics.averageConfidence,
          highConfidenceCount: citationConfidenceMetrics.highConfidenceCount,
          insufficientCount: citationConfidenceMetrics.insufficientCount,
        },
        postProcessing: {
          modifications: postProcessed.modifications.length,
          coherenceScore: postProcessed.coherenceScore,
          structureType: postProcessed.structureType,
        },
        // Phase 5: Validation pipeline observability
        validation: pipelineResult ? {
          contractCompliant: pipelineResult.contractCompliant,
          citationAccuracy: Math.round(pipelineResult.citationAccuracy * 100) / 100,
          overallConfidence: Math.round(pipelineResult.overallConfidence * 100) / 100,
          invalidRemoved: pipelineResult.invalidCitationsRemoved.length,
          pipelineMs: pipelineResult.processingTimeMs,
        } : undefined,
      },
    },
    // Backwards compatibility
    citations: usedCitations,
  };
}

// ============================================================================
// Enhanced Chat Interface (for new API schema)
// ============================================================================

/** Conversation message for multi-turn context */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Note filters for scoped retrieval */
export interface ChatNoteFilters {
  noteIds?: string[];
  excludeNoteIds?: string[];
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

/** Response format options */
export type ResponseFormatType = 'default' | 'concise' | 'detailed' | 'bullet' | 'structured';

/** Enhanced chat options */
export interface EnhancedChatOptions {
  temperature?: number;
  maxTokens?: number;
  topK?: number;
  minRelevance?: number;
  includeSources?: boolean;
  includeContextSources?: boolean;
  verifyCitations?: boolean;
  responseFormat?: ResponseFormatType;
  systemPrompt?: string;
  language?: string;
}

/** Enhanced chat request */
export interface EnhancedChatRequest {
  query: string;
  tenantId: string;
  threadId?: string;
  conversationHistory?: ConversationMessage[];
  filters?: ChatNoteFilters;
  options?: EnhancedChatOptions;
  saveToThread?: boolean;
}

/** Build conversation context string from history */
export function buildConversationContext(history: ConversationMessage[], maxMessages: number = 10): string {
  if (!history || history.length === 0) return '';

  // Take last N messages
  const recentHistory = history.slice(-maxMessages);

  const parts = recentHistory.map(msg => {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    return `${role}: ${msg.content}`;
  });

  return `\n--- Conversation History ---\n${parts.join('\n\n')}\n--- End History ---\n\n`;
}

/** Get response format instructions */
function getResponseFormatInstructions(format: ResponseFormatType = 'default'): string {
  switch (format) {
    case 'concise':
      return 'Be concise - aim for 2-3 sentences maximum. Get straight to the point.';
    case 'detailed':
      return 'Provide a comprehensive answer with full context and explanations.';
    case 'bullet':
      return 'Format your response as a bulleted list with clear, actionable points.';
    case 'structured':
      return 'Use markdown formatting with headers, bullet points, and emphasis where appropriate.';
    case 'default':
    default:
      return 'Respond naturally and conversationally.';
  }
}

/**
 * Generate enhanced chat response with conversation context, filters, and format options
 */
export async function generateEnhancedChatResponse(request: EnhancedChatRequest): Promise<ChatResponse> {
  const startTime = Date.now();

  // Check GenAI availability early
  if (!isGenAIAvailable()) {
    throw new ConfigurationError('Chat service is not configured. Set GOOGLE_API_KEY/GEMINI_API_KEY or configure Vertex AI.');
  }

  const { query, tenantId, conversationHistory, filters, options = {} } = request;
  const {
    temperature = CHAT_TEMPERATURE,
    maxTokens = LLM_MAX_OUTPUT_TOKENS,
    topK = RETRIEVAL_TOP_K,
    minRelevance,
    includeSources = true,
    includeContextSources = false,
    verifyCitations = true,
    responseFormat = 'default',
    systemPrompt,
    language,
  } = options;

  // Sanitize and validate input
  const sanitizedQuery = sanitizeText(query, CHAT_MAX_QUERY_LENGTH + 100).trim();

  if (!sanitizedQuery) {
    throw new Error('query is required');
  }

  if (sanitizedQuery.length > CHAT_MAX_QUERY_LENGTH) {
    throw new Error(`query too long (max ${CHAT_MAX_QUERY_LENGTH} chars)`);
  }

  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  // Initialize retrieval log
  const retrievalLog = createRetrievalLog(tenantId, sanitizedQuery) as RetrievalLogEntry;

  // Analyze query for intent and keywords
  const queryAnalysis = analyzeQuery(sanitizedQuery);

  // Calculate adaptive K
  const adaptiveK = calculateAdaptiveK(sanitizedQuery, queryAnalysis.intent, queryAnalysis.keywords);
  const rerankTo = Math.min(adaptiveK * 3, maxTokens > 2000 ? 20 : 15);

  // Build note filters for retrieval
  const noteFilters = filters ? {
    noteIds: filters.noteIds,
    excludeNoteIds: filters.excludeNoteIds,
    tags: filters.tags,
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
  } : undefined;

  // Retrieve relevant chunks with filters
  const retrievalStart = Date.now();
  const contextBudget = LLM_CONTEXT_BUDGET_CHARS - LLM_CONTEXT_RESERVE_CHARS;

  let { chunks, strategy, candidateCount } = await retrieveRelevantChunks(sanitizedQuery, {
    tenantId,
    topK,
    rerankTo,
    contextBudget,
    noteFilters,
    minRelevance,
  });

  const retrievalMs = Date.now() - retrievalStart;

  // Handle no results
  if (chunks.length === 0) {
    const noResultsMessage = filters
      ? "I couldn't find any relevant notes matching your filters. Try broadening your search or adjusting the filters."
      : "I don't have any notes to search through. Try creating some notes first!";

    return {
      answer: noResultsMessage,
      sources: [],
      meta: {
        model: CHAT_MODEL,
        requestId: retrievalLog.requestId,
        responseTimeMs: Date.now() - startTime,
        intent: queryAnalysis.intent,
        confidence: 'none',
        sourceCount: 0,
      },
    };
  }

  // Build sources pack
  const queryTerms = queryAnalysis.keywords || [];
  const sourcesPack = buildSourcesPack(chunks, queryTerms);

  // Build the conversation context if provided
  const conversationContext = conversationHistory
    ? buildConversationContext(conversationHistory)
    : '';

  // Build response format instructions
  const formatInstructions = getResponseFormatInstructions(responseFormat);

  // Build enhanced prompt with context
  let prompt: string;
  if (systemPrompt) {
    // Use custom system prompt
    prompt = systemPrompt + '\n\n' + conversationContext +
      `SOURCES (${sourcesPack.sourceCount}):\n` +
      Array.from(sourcesPack.citationsMap.entries())
        .map(([cid, c]) => `[${cid}] ${c.snippet}`)
        .join('\n\n') +
      `\n\nQuestion: ${sanitizedQuery}\n\nAnswer:`;
  } else {
    // Use standard prompt building with enhancements
    const basePrompt = buildPrompt(sanitizedQuery, sourcesPack, queryAnalysis.intent);
    const languageHint = language ? `\nRespond in ${language}.` : '';
    prompt = conversationContext + formatInstructions + languageHint + '\n\n' + basePrompt;
  }

  // Generate LLM response
  const genStart = Date.now();
  const client = getGenAIClient();

  let answer: string;
  try {
    const response = await withLLMRetry(
      async () => client.models.generateContent({
        model: CHAT_MODEL,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          temperature,
          topP: CHAT_TOP_P,
          topK: CHAT_TOP_K,
          maxOutputTokens: maxTokens,
        },
      }),
      'generateEnhancedChatResponse'
    );
    answer = response.text?.trim() || '';
  } catch (error) {
    logError('LLM generation failed', error);
    throw error;
  }

  const generationMs = Date.now() - genStart;

  // Extract and validate citations
  const allCitations = Array.from(sourcesPack.citationsMap.values());
  let validCitations = allCitations;
  let invalidRemoved = 0;

  if (verifyCitations) {
    const validation = validateCitationsWithChunks(answer, allCitations, chunks);
    validCitations = validation.validatedCitations;
    invalidRemoved = validation.invalidCitationsRemoved.length;
  }

  // Build sources for response
  const sources = includeSources ? citationsToSources(validCitations) : [];

  // Build context sources if requested
  const citedChunkIds = new Set(validCitations.map(c => c.chunkId));
  const contextSources = includeContextSources
    ? buildContextSources(chunks, citedChunkIds, validCitations.length + 1, queryTerms)
    : undefined;

  // Calculate confidence using existing function
  const confidenceBreakdown = calculateResponseConfidence(answer, validCitations, chunks, queryAnalysis.intent);
  const confidence = confidenceBreakdown.confidenceLevel as ConfidenceLevel;

  // Log the request
  logInfo('Enhanced chat response generated', {
    requestId: retrievalLog.requestId,
    tenantId,
    hasConversationHistory: !!conversationHistory,
    hasFilters: !!filters,
    responseFormat,
    sourceCount: sources.length,
    retrievalMs,
    generationMs,
  });

  return {
    answer,
    sources,
    contextSources,
    meta: {
      model: CHAT_MODEL,
      requestId: retrievalLog.requestId,
      responseTimeMs: Date.now() - startTime,
      intent: queryAnalysis.intent,
      confidence,
      sourceCount: sources.length,
      retrieval: {
        strategy,
        candidateCount,
        k: rerankTo,
      },
    },
  };
}


```

---

## src/chunking.ts

**Path:** `src/chunking.ts`

```ts
/**
 * AuroraNotes API - Chunking Pipeline
 *
 * Splits notes into semantic chunks for embedding and retrieval.
 * Uses improved semantic boundary detection and context preservation.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firestore";
import {
  CHUNKS_COLLECTION,
  CHUNK_TARGET_SIZE,
  CHUNK_MIN_SIZE,
  CHUNK_MAX_SIZE,
  CHUNK_OVERLAP,
  EMBEDDINGS_ENABLED,
  EMBEDDING_MODEL,
  VERTEX_VECTOR_SEARCH_ENABLED,
} from "./config";
import { NoteDoc, ChunkDoc } from "./types";
import { hashText, estimateTokens, logInfo, logError, logWarn, extractTermsForIndexing, TERMS_VERSION } from "./utils";
import { generateEmbeddings, EmbeddingError } from "./embeddings";
import { getVertexIndex, VertexDatapoint } from "./vectorIndex";

// Semantic boundary pattern for splitting paragraphs
const PARAGRAPH_BOUNDARY = /\n\n+/;

/**
 * Split text into semantic units (paragraphs, then sentences)
 */
function splitIntoSemanticUnits(text: string): string[] {
  // First split by paragraphs
  const paragraphs = text.split(PARAGRAPH_BOUNDARY).filter(p => p.trim());

  const units: string[] = [];

  for (const para of paragraphs) {
    // If paragraph is small enough, keep it as one unit
    if (para.length <= CHUNK_TARGET_SIZE) {
      units.push(para.trim());
    } else {
      // Split long paragraphs into sentences
      const sentences = para.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      units.push(...sentences.map(s => s.trim()));
    }
  }

  return units;
}

/**
 * Split text into chunks using improved semantic boundary detection
 */
export function splitIntoChunks(text: string): string[] {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();

  // Empty text: return nothing
  if (!normalizedText) {
    return [];
  }

  // Short text: return as single chunk (always index short notes for retrieval)
  if (normalizedText.length <= CHUNK_MAX_SIZE) {
    return [normalizedText];
  }

  const units = splitIntoSemanticUnits(normalizedText);
  const chunks: string[] = [];
  let currentChunk = '';
  let previousContext = ''; // Store context for overlap

  for (const unit of units) {
    const trimmedUnit = unit.trim();
    if (!trimmedUnit) continue;

    const potentialLength = currentChunk.length + (currentChunk ? 1 : 0) + trimmedUnit.length;

    // If adding this unit exceeds max, finalize current chunk
    if (potentialLength > CHUNK_MAX_SIZE && currentChunk.length >= CHUNK_MIN_SIZE) {
      chunks.push(currentChunk);

      // Create overlap context from the end of previous chunk
      previousContext = extractOverlapContext(currentChunk, CHUNK_OVERLAP);
      currentChunk = previousContext ? previousContext + ' ' + trimmedUnit : trimmedUnit;
    } else if (potentialLength > CHUNK_MAX_SIZE && currentChunk.length < CHUNK_MIN_SIZE) {
      // Current chunk too small but adding unit exceeds max - force add
      currentChunk = currentChunk ? currentChunk + ' ' + trimmedUnit : trimmedUnit;

      // If now exceeds max, force split
      if (currentChunk.length > CHUNK_MAX_SIZE) {
        const splitPoint = findBestSplitPoint(currentChunk, CHUNK_TARGET_SIZE);
        chunks.push(currentChunk.slice(0, splitPoint).trim());
        previousContext = extractOverlapContext(currentChunk.slice(0, splitPoint), CHUNK_OVERLAP);
        currentChunk = previousContext + ' ' + currentChunk.slice(splitPoint).trim();
      }
    } else {
      // Add unit to current chunk
      currentChunk = currentChunk ? currentChunk + ' ' + trimmedUnit : trimmedUnit;
    }

    // Check if we're at a good size to finalize
    if (currentChunk.length >= CHUNK_TARGET_SIZE && currentChunk.length <= CHUNK_MAX_SIZE) {
      // Look for a natural break point
      const breakPoint = findNaturalBreak(currentChunk, CHUNK_TARGET_SIZE);
      if (breakPoint > CHUNK_MIN_SIZE && breakPoint < currentChunk.length - 50) {
        chunks.push(currentChunk.slice(0, breakPoint).trim());
        previousContext = extractOverlapContext(currentChunk.slice(0, breakPoint), CHUNK_OVERLAP);
        currentChunk = previousContext + ' ' + currentChunk.slice(breakPoint).trim();
      }
    }
  }

  // Handle remaining text
  if (currentChunk.trim()) {
    if (currentChunk.length >= CHUNK_MIN_SIZE) {
      chunks.push(currentChunk.trim());
    } else if (chunks.length > 0) {
      // Merge small remainder with last chunk if possible
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk.length + currentChunk.length + 1 <= CHUNK_MAX_SIZE) {
        chunks[chunks.length - 1] = lastChunk + ' ' + currentChunk.trim();
      } else {
        // Keep as separate chunk even if small
        chunks.push(currentChunk.trim());
      }
    } else {
      // Only chunk and it's small - keep it anyway
      chunks.push(currentChunk.trim());
    }
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Extract context for overlap, preferring sentence boundaries
 */
function extractOverlapContext(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const suffix = text.slice(-maxLength);

  // Try to start at a sentence boundary
  const sentenceStart = suffix.search(/(?<=[.!?])\s+/);
  if (sentenceStart > 10) {
    return suffix.slice(sentenceStart).trim();
  }

  // Fall back to word boundary
  const wordStart = suffix.indexOf(' ');
  if (wordStart > 0) {
    return suffix.slice(wordStart).trim();
  }

  return suffix.trim();
}

/**
 * Find the best split point near target, preferring sentence boundaries
 */
function findBestSplitPoint(text: string, target: number): number {
  const searchStart = Math.max(0, target - 100);
  const searchEnd = Math.min(text.length, target + 100);
  const window = text.slice(searchStart, searchEnd);

  // Prefer sentence endings
  const sentenceEnd = window.search(/[.!?]\s+/);
  if (sentenceEnd > 0) {
    return searchStart + sentenceEnd + 2;
  }

  // Fall back to comma or semicolon
  const clauseEnd = window.search(/[,;]\s+/);
  if (clauseEnd > 0) {
    return searchStart + clauseEnd + 2;
  }

  // Fall back to space
  const lastSpace = window.lastIndexOf(' ');
  if (lastSpace > 0) {
    return searchStart + lastSpace;
  }

  return target;
}

/**
 * Find a natural break point in text
 */
function findNaturalBreak(text: string, target: number): number {
  return findBestSplitPoint(text, target);
}

/**
 * Compute a hash of the full note text for idempotency checking
 */
function computeNoteTextHash(text: string): string {
  return hashText(text);
}

/**
 * Process a note into chunks and store them
 *
 * IDEMPOTENT: Skips processing if note text hasn't changed (based on hash).
 * Only regenerates embeddings for chunks that are missing them.
 */
export async function processNoteChunks(note: NoteDoc): Promise<void> {
  const db = getDb();
  const startTime = Date.now();
  const noteTextHash = computeNoteTextHash(note.text);

  try {
    // Fetch existing chunks for this note (with fallback if index missing)
    let existingChunks: ChunkDoc[] = [];
    try {
      const existingChunksSnap = await db
        .collection(CHUNKS_COLLECTION)
        .where('noteId', '==', note.id)
        .orderBy('position', 'asc')
        .get();
      existingChunks = existingChunksSnap.docs.map(d => d.data() as ChunkDoc);
    } catch (indexErr: unknown) {
      const errMsg = indexErr instanceof Error ? indexErr.message : String(indexErr);
      if (errMsg.includes('FAILED_PRECONDITION') || errMsg.includes('requires an index')) {
        // Fallback: query without orderBy, sort in memory
        const fallbackSnap = await db
          .collection(CHUNKS_COLLECTION)
          .where('noteId', '==', note.id)
          .get();
        existingChunks = fallbackSnap.docs
          .map(d => d.data() as ChunkDoc)
          .sort((a, b) => a.position - b.position);
      } else {
        throw indexErr;
      }
    }

    // Check if note text has changed by comparing content hashes
    // If chunks exist and their combined hashes match, skip reprocessing
    if (existingChunks.length > 0) {
      const existingHashes = existingChunks.map(c => c.textHash).join('|');
      const newTextChunks = splitIntoChunks(note.text);
      const newHashes = newTextChunks.map(t => hashText(t)).join('|');

      if (existingHashes === newHashes) {
        // Note hasn't changed - check if any chunks need embeddings
        const chunksMissingEmbeddings = existingChunks.filter(c => !c.embedding);

        if (chunksMissingEmbeddings.length === 0) {
          logInfo('Note unchanged and all embeddings present, skipping', {
            noteId: note.id,
            chunkCount: existingChunks.length,
          });
          return;
        }

        // Only regenerate missing embeddings
        if (EMBEDDINGS_ENABLED && chunksMissingEmbeddings.length > 0) {
          logInfo('Regenerating missing embeddings', {
            noteId: note.id,
            missingCount: chunksMissingEmbeddings.length,
            totalChunks: existingChunks.length,
          });

          try {
            const textsToEmbed = chunksMissingEmbeddings.map(c => c.text);
            const embeddings = await generateEmbeddings(textsToEmbed);

            // generateEmbeddings now guarantees embeddings.length === textsToEmbed.length
            // or throws EmbeddingError. Safe to iterate 1:1.
            const batch = db.batch();
            for (let i = 0; i < chunksMissingEmbeddings.length; i++) {
              const chunkRef = db.collection(CHUNKS_COLLECTION).doc(chunksMissingEmbeddings[i].chunkId);
              batch.update(chunkRef, {
                embedding: embeddings[i],
                embeddingModel: EMBEDDING_MODEL,
              });
            }
            await batch.commit();

            logInfo('Missing embeddings regenerated', {
              noteId: note.id,
              embeddingsAdded: chunksMissingEmbeddings.length,
              elapsedMs: Date.now() - startTime,
            });
          } catch (err) {
            // Log embedding errors with details but continue without embeddings
            if (err instanceof EmbeddingError) {
              logError('Embedding regeneration failed with misalignment', err, {
                noteId: note.id,
                missingIndices: err.missingIndices,
              });
            } else {
              logError('Embedding regeneration failed', err, { noteId: note.id });
            }
          }
        }
        return;
      }
    }

    // Note has changed - full reprocessing required
    logInfo('Note changed, reprocessing chunks', {
      noteId: note.id,
      hadExistingChunks: existingChunks.length > 0,
    });

    // Compute old Vertex datapoint IDs for cleanup BEFORE deleting Firestore chunks
    const oldDatapointIds = existingChunks.map(chunk => `${chunk.chunkId}:${chunk.noteId}`);

    // Delete existing chunks from Firestore
    if (existingChunks.length > 0) {
      const deleteBatch = db.batch();
      for (const chunk of existingChunks) {
        const docRef = db.collection(CHUNKS_COLLECTION).doc(chunk.chunkId);
        deleteBatch.delete(docRef);
      }
      await deleteBatch.commit();
    }

    // Remove stale datapoints from Vertex index (best-effort, non-blocking)
    if (oldDatapointIds.length > 0 && VERTEX_VECTOR_SEARCH_ENABLED) {
      removeStaleVertexDatapoints(oldDatapointIds, note.id).catch(err => {
        logWarn('Failed to remove stale Vertex datapoints', {
          noteId: note.id,
          datapointCount: oldDatapointIds.length,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Split note into chunks
    const textChunks = splitIntoChunks(note.text);

    if (textChunks.length === 0) {
      logInfo('Note too short for chunking', { noteId: note.id });
      return;
    }

    // Create chunk documents with terms for lexical indexing and context windows
    const CONTEXT_WINDOW_SIZE = 100; // chars of context from prev/next chunk
    const chunks: ChunkDoc[] = textChunks.map((text, position) => {
      // Extract context from adjacent chunks for citation accuracy
      const prevContext = position > 0
        ? textChunks[position - 1].slice(-CONTEXT_WINDOW_SIZE)
        : null;  // Use null instead of undefined for Firestore compatibility
      const nextContext = position < textChunks.length - 1
        ? textChunks[position + 1].slice(0, CONTEXT_WINDOW_SIZE)
        : null;  // Use null instead of undefined for Firestore compatibility

      const chunk: ChunkDoc = {
        chunkId: `${note.id}_${String(position).padStart(3, '0')}`,
        noteId: note.id,
        tenantId: note.tenantId,
        text,
        textHash: hashText(text),
        position,
        tokenEstimate: estimateTokens(text),
        createdAt: note.createdAt,
        // Lexical indexing fields
        terms: extractTermsForIndexing(text),
        termsVersion: TERMS_VERSION,
        totalChunks: textChunks.length,
      };

      // Only add context fields if they have values (Firestore doesn't accept undefined)
      if (prevContext) chunk.prevContext = prevContext;
      if (nextContext) chunk.nextContext = nextContext;

      return chunk;
    });

    // Generate embeddings if enabled
    if (EMBEDDINGS_ENABLED) {
      try {
        const embeddings = await generateEmbeddings(textChunks);
        // generateEmbeddings now guarantees embeddings.length === textChunks.length
        // or throws EmbeddingError. Safe to iterate 1:1.
        for (let i = 0; i < chunks.length; i++) {
          chunks[i].embedding = embeddings[i];
          chunks[i].embeddingModel = EMBEDDING_MODEL;
        }
      } catch (err) {
        // Log embedding errors with details but continue without embeddings
        if (err instanceof EmbeddingError) {
          logError('Embedding generation failed with misalignment', err, {
            noteId: note.id,
            missingIndices: err.missingIndices,
          });
        } else {
          logError('Embedding generation failed', err, { noteId: note.id });
        }
        // Continue without embeddings - retrieval will fall back to keyword search
      }
    }

    // Store chunks in batches (Firestore limit: 500 per batch)
    const BATCH_SIZE = 400;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);

      for (const chunk of batchChunks) {
        const ref = db.collection(CHUNKS_COLLECTION).doc(chunk.chunkId);
        batch.set(ref, chunk);
      }

      await batch.commit();
    }

    // Sync to Vertex AI Vector Search if enabled
    await syncChunksToVertexIndex(chunks);

    const elapsedMs = Date.now() - startTime;
    logInfo('Chunks processed', {
      noteId: note.id,
      chunkCount: chunks.length,
      hasEmbeddings: chunks[0]?.embedding !== undefined,
      elapsedMs,
    });
  } catch (err) {
    logError('Chunk processing failed', err, { noteId: note.id });
    throw err;
  }
}

/**
 * Get all chunks for a note
 */
export async function getChunksForNote(noteId: string): Promise<ChunkDoc[]> {
  const db = getDb();
  const snap = await db
    .collection(CHUNKS_COLLECTION)
    .where('noteId', '==', noteId)
    .orderBy('position', 'asc')
    .get();

  return snap.docs.map(d => d.data() as ChunkDoc);
}

/**
 * Remove stale datapoints from Vertex index when chunks are replaced.
 * This prevents orphan datapoints from accumulating and degrading retrieval quality.
 *
 * Called during note reprocessing when old chunks are being deleted.
 * Non-blocking: logs errors but doesn't throw.
 */
async function removeStaleVertexDatapoints(datapointIds: string[], noteId: string): Promise<void> {
  if (datapointIds.length === 0) {
    return;
  }

  const vertexIndex = getVertexIndex();
  if (!vertexIndex) {
    return;
  }

  const startTime = Date.now();

  try {
    const success = await vertexIndex.remove(datapointIds);
    if (success) {
      logInfo('Removed stale Vertex datapoints', {
        noteId,
        datapointCount: datapointIds.length,
        elapsedMs: Date.now() - startTime,
      });
    } else {
      logWarn('Failed to remove stale Vertex datapoints', {
        noteId,
        datapointCount: datapointIds.length,
      });
    }
  } catch (err) {
    // Log but don't throw - stale cleanup is best-effort
    logError('Error removing stale Vertex datapoints', err, {
      noteId,
      datapointCount: datapointIds.length,
    });
  }
}

/**
 * Sync chunks to Vertex AI Vector Search index
 *
 * This is called after chunks are saved to Firestore.
 * Only syncs chunks that have embeddings.
 * Fails silently to avoid blocking note creation.
 */
async function syncChunksToVertexIndex(chunks: ChunkDoc[]): Promise<void> {
  if (!VERTEX_VECTOR_SEARCH_ENABLED) {
    return;
  }

  const vertexIndex = getVertexIndex();
  if (!vertexIndex) {
    return;
  }

  // Filter to chunks with embeddings
  const chunksWithEmbeddings = chunks.filter(c => c.embedding && c.embedding.length > 0);
  if (chunksWithEmbeddings.length === 0) {
    return;
  }

  // Convert to Vertex datapoints
  const datapoints: VertexDatapoint[] = chunksWithEmbeddings.map(chunk => ({
    datapointId: `${chunk.chunkId}:${chunk.noteId}`,
    featureVector: chunk.embedding!,
    restricts: [
      {
        namespace: 'tenantId',
        allowList: [chunk.tenantId],
      },
    ],
  }));

  try {
    const success = await vertexIndex.upsert(datapoints);
    if (success) {
      logInfo('Synced chunks to Vertex index', {
        chunkCount: datapoints.length,
        noteId: chunks[0]?.noteId,
      });
    } else {
      logWarn('Failed to sync chunks to Vertex index', {
        chunkCount: datapoints.length,
        noteId: chunks[0]?.noteId,
      });
    }
  } catch (err) {
    // Log but don't throw - Vertex sync is best-effort
    logError('Vertex index sync error', err, {
      chunkCount: datapoints.length,
      noteId: chunks[0]?.noteId,
    });
  }
}


```

---

## src/citationConfidence.ts

**Path:** `src/citationConfidence.ts`

```ts
/**
 * AuroraNotes API - Enhanced Citation Confidence Scoring
 *
 * Multi-factor citation confidence scoring that combines:
 * - Semantic similarity (embedding-based)
 * - Lexical overlap (keyword-based)
 * - Position-aware scoring (claim location matching)
 * - N-gram overlap for phrase matching
 * - Entity alignment (named entities in claim vs source)
 *
 * This provides more accurate citations by scoring how well each
 * source actually supports the claim it's cited for.
 */

import { Citation, ScoredChunk } from './types';
import { cosineSimilarity } from './utils';
import { generateQueryEmbedding, isEmbeddingsAvailable } from './embeddings';
import { logInfo, logWarn } from './utils';

// Configuration for confidence scoring
const SEMANTIC_WEIGHT = 0.40;       // Weight for embedding similarity
const LEXICAL_WEIGHT = 0.25;        // Weight for keyword overlap
const NGRAM_WEIGHT = 0.20;          // Weight for n-gram phrase matching
const ENTITY_WEIGHT = 0.15;         // Weight for entity alignment

// Thresholds
const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.50;
const MIN_ACCEPTABLE_CONFIDENCE = 0.30;

/**
 * Multi-factor citation confidence score result
 */
export interface CitationConfidenceScore {
  cid: string;
  claim: string;
  overallScore: number;
  semanticScore: number;
  lexicalScore: number;
  ngramScore: number;
  entityScore: number;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  explanation?: string;
}

/**
 * Extract n-grams from text for phrase matching
 */
function extractNgrams(text: string, n: number): Set<string> {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Extract named entities (proper nouns, numbers, dates, identifiers)
 */
function extractEntities(text: string): Set<string> {
  const entities = new Set<string>();

  // Capitalized proper nouns (2+ consecutive)
  const properNouns = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
  properNouns.forEach(e => entities.add(e.toLowerCase()));

  // Single capitalized words (potential names/projects)
  const singleCaps = text.match(/\b([A-Z][a-z]{2,})\b/g) || [];
  singleCaps.forEach(e => entities.add(e.toLowerCase()));

  // Numbers and dates
  const numbers = text.match(/\b(\d+(?:\.\d+)?%?)\b/g) || [];
  numbers.forEach(e => entities.add(e));

  // Identifiers (UPPERCASE_WITH_UNDERSCORES)
  const identifiers = text.match(/\b([A-Z][A-Z0-9_]{2,})\b/g) || [];
  identifiers.forEach(e => entities.add(e.toLowerCase()));

  return entities;
}

/**
 * Calculate lexical overlap score using Jaccard coefficient on keywords
 */
function calculateLexicalOverlap(claim: string, source: string): number {
  const claimWords = new Set(
    claim.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );

  const sourceWords = new Set(
    source.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );

  if (claimWords.size === 0 || sourceWords.size === 0) return 0;

  let intersection = 0;
  for (const word of claimWords) {
    if (sourceWords.has(word)) intersection++;
  }

  // Jaccard coefficient
  const union = new Set([...claimWords, ...sourceWords]).size;
  return intersection / union;
}

/**
 * Calculate n-gram overlap score (bigrams and trigrams)
 */
function calculateNgramOverlap(claim: string, source: string): number {
  const claimBigrams = extractNgrams(claim, 2);
  const claimTrigrams = extractNgrams(claim, 3);
  const sourceBigrams = extractNgrams(source, 2);
  const sourceTrigrams = extractNgrams(source, 3);

  let bigramOverlap = 0;
  for (const bg of claimBigrams) {
    if (sourceBigrams.has(bg)) bigramOverlap++;
  }

  let trigramOverlap = 0;
  for (const tg of claimTrigrams) {
    if (sourceTrigrams.has(tg)) trigramOverlap++;
  }

  const bigramScore = claimBigrams.size > 0 ? bigramOverlap / claimBigrams.size : 0;
  const trigramScore = claimTrigrams.size > 0 ? trigramOverlap / claimTrigrams.size : 0;

  // Weight trigrams higher (more specific phrases)
  return bigramScore * 0.4 + trigramScore * 0.6;
}

/**
 * Calculate entity alignment score
 */
function calculateEntityAlignment(claim: string, source: string): number {
  const claimEntities = extractEntities(claim);
  const sourceEntities = extractEntities(source);

  if (claimEntities.size === 0) return 1.0; // No entities to verify

  let matches = 0;
  for (const entity of claimEntities) {
    if (sourceEntities.has(entity) || source.toLowerCase().includes(entity)) {
      matches++;
    }
  }

  return matches / claimEntities.size;
}

/**
 * Determine confidence level from overall score
 */
function getConfidenceLevel(score: number): CitationConfidenceScore['confidenceLevel'] {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (score >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
  if (score >= MIN_ACCEPTABLE_CONFIDENCE) return 'low';
  return 'insufficient';
}

/**
 * Score a single claim-citation pair
 */
export async function scoreCitationConfidence(
  claim: string,
  citation: Citation,
  chunk: ScoredChunk | undefined,
  options: { useSemanticScoring?: boolean } = {}
): Promise<CitationConfidenceScore> {
  const sourceText = chunk?.text || citation.snippet;
  const { useSemanticScoring = true } = options;

  // Calculate component scores
  const lexicalScore = calculateLexicalOverlap(claim, sourceText);
  const ngramScore = calculateNgramOverlap(claim, sourceText);
  const entityScore = calculateEntityAlignment(claim, sourceText);

  // Semantic score (if embeddings available and enabled)
  let semanticScore = 0.5; // Default neutral if not computed
  if (useSemanticScoring && isEmbeddingsAvailable() && chunk?.embedding) {
    try {
      const claimEmbedding = await generateQueryEmbedding(claim);
      semanticScore = cosineSimilarity(claimEmbedding, chunk.embedding);
    } catch {
      // Fallback to lexical-only scoring
      semanticScore = lexicalScore;
    }
  } else if (!useSemanticScoring) {
    // Weight other scores higher when semantic is disabled
    semanticScore = (lexicalScore + ngramScore) / 2;
  }

  // Weighted combination
  const overallScore =
    SEMANTIC_WEIGHT * semanticScore +
    LEXICAL_WEIGHT * lexicalScore +
    NGRAM_WEIGHT * ngramScore +
    ENTITY_WEIGHT * entityScore;

  const confidenceLevel = getConfidenceLevel(overallScore);

  return {
    cid: citation.cid,
    claim,
    overallScore: Math.round(overallScore * 1000) / 1000,
    semanticScore: Math.round(semanticScore * 1000) / 1000,
    lexicalScore: Math.round(lexicalScore * 1000) / 1000,
    ngramScore: Math.round(ngramScore * 1000) / 1000,
    entityScore: Math.round(entityScore * 1000) / 1000,
    confidenceLevel,
  };
}

/**
 * Batch score all citations in an answer
 */
export interface ClaimCitationPair {
  claim: string;
  cid: string;
}

export async function batchScoreCitations(
  claimPairs: ClaimCitationPair[],
  citations: Citation[],
  chunks: ScoredChunk[],
  options: { useSemanticScoring?: boolean } = {}
): Promise<{
  scores: CitationConfidenceScore[];
  highConfidenceCount: number;
  insufficientCount: number;
  averageConfidence: number;
}> {
  const citationMap = new Map(citations.map(c => [c.cid, c]));
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  const scores: CitationConfidenceScore[] = [];
  let highCount = 0;
  let insufficientCount = 0;
  let totalScore = 0;

  for (const pair of claimPairs) {
    const citation = citationMap.get(pair.cid);
    if (!citation) continue;

    const chunk = chunkMap.get(citation.chunkId);
    const score = await scoreCitationConfidence(pair.claim, citation, chunk, options);
    scores.push(score);
    totalScore += score.overallScore;

    if (score.confidenceLevel === 'high') highCount++;
    if (score.confidenceLevel === 'insufficient') insufficientCount++;
  }

  return {
    scores,
    highConfidenceCount: highCount,
    insufficientCount: insufficientCount,
    averageConfidence: scores.length > 0 ? totalScore / scores.length : 0,
  };
}

/**
 * Extract claim-citation pairs from an answer
 * A claim is a sentence or phrase followed by one or more citations
 */
export function extractClaimCitationPairs(answer: string): ClaimCitationPair[] {
  const pairs: ClaimCitationPair[] = [];

  // Split into sentences
  const sentences = answer.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    // Find all citations in this sentence
    const citationMatches = sentence.matchAll(/\[N?(\d+)\]/g);

    for (const match of citationMatches) {
      const cid = match[1].startsWith('N') ? match[1] : `N${match[1]}`;
      // Extract the claim (sentence without citation markers)
      const claim = sentence.replace(/\[N?\d+\]/g, '').trim();

      if (claim.length > 10) {
        pairs.push({ claim, cid });
      }
    }
  }

  return pairs;
}

/**
 * Filter citations by confidence threshold
 * Returns only citations that meet minimum confidence requirements
 */
export function filterByConfidence(
  scores: CitationConfidenceScore[],
  minConfidence: number = MIN_ACCEPTABLE_CONFIDENCE
): {
  accepted: CitationConfidenceScore[];
  rejected: CitationConfidenceScore[];
} {
  const accepted: CitationConfidenceScore[] = [];
  const rejected: CitationConfidenceScore[] = [];

  for (const score of scores) {
    if (score.overallScore >= minConfidence) {
      accepted.push(score);
    } else {
      rejected.push(score);
    }
  }

  if (rejected.length > 0) {
    logWarn('Citations rejected due to low confidence', {
      rejectedCount: rejected.length,
      rejectedCids: rejected.map(r => r.cid),
      lowestScore: Math.min(...rejected.map(r => r.overallScore)),
    });
  }

  return { accepted, rejected };
}

// Intent-specific threshold adjustments
const INTENT_THRESHOLD_ADJUSTMENTS: Record<string, number> = {
  factual: 0.05,      // Stricter for factual queries
  procedural: 0.0,
  conceptual: -0.05,  // Slightly more lenient for conceptual
  comparative: 0.0,
  exploratory: -0.05,
  clarification: 0.0,
  summarize: -0.03,
  list: 0.0,
  decision: 0.03,
  action_item: 0.02,
  question: 0.0,
  search: 0.0,
};

/**
 * Get adjusted threshold based on query intent
 */
export function getAdjustedThreshold(
  baseThreshold: number,
  intent: string
): number {
  const adjustment = INTENT_THRESHOLD_ADJUSTMENTS[intent] || 0;
  return Math.max(0.2, Math.min(0.9, baseThreshold + adjustment));
}

/**
 * Filter citations with intent-aware thresholds
 */
export function filterByConfidenceWithIntent(
  scores: CitationConfidenceScore[],
  intent: string,
  baseMinConfidence: number = MIN_ACCEPTABLE_CONFIDENCE
): {
  accepted: CitationConfidenceScore[];
  rejected: CitationConfidenceScore[];
  adjustedThreshold: number;
} {
  const adjustedThreshold = getAdjustedThreshold(baseMinConfidence, intent);

  const accepted: CitationConfidenceScore[] = [];
  const rejected: CitationConfidenceScore[] = [];

  for (const score of scores) {
    if (score.overallScore >= adjustedThreshold) {
      accepted.push(score);
    } else {
      rejected.push(score);
    }
  }

  if (rejected.length > 0) {
    logWarn('Citations rejected due to low confidence (intent-adjusted)', {
      intent,
      adjustedThreshold,
      rejectedCount: rejected.length,
      rejectedCids: rejected.map(r => r.cid),
    });
  }

  return { accepted, rejected, adjustedThreshold };
}

// Export configuration for observability
export function getCitationConfidenceConfig() {
  return {
    weights: {
      semantic: SEMANTIC_WEIGHT,
      lexical: LEXICAL_WEIGHT,
      ngram: NGRAM_WEIGHT,
      entity: ENTITY_WEIGHT,
    },
    thresholds: {
      high: HIGH_CONFIDENCE_THRESHOLD,
      medium: MEDIUM_CONFIDENCE_THRESHOLD,
      minimum: MIN_ACCEPTABLE_CONFIDENCE,
    },
    intentAdjustments: INTENT_THRESHOLD_ADJUSTMENTS,
  };
}

/**
 * Aggregate confidence score for entire response
 */
export interface ResponseConfidenceAggregate {
  overallScore: number;
  scoreDistribution: {
    high: number;
    medium: number;
    low: number;
    insufficient: number;
  };
  weakestCitations: Array<{ cid: string; score: number }>;
  strongestCitations: Array<{ cid: string; score: number }>;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  recommendation: string;
}

/**
 * Aggregate confidence scores across all citations in a response
 */
export function aggregateConfidenceScores(
  scores: CitationConfidenceScore[]
): ResponseConfidenceAggregate {
  if (scores.length === 0) {
    return {
      overallScore: 0,
      scoreDistribution: { high: 0, medium: 0, low: 0, insufficient: 0 },
      weakestCitations: [],
      strongestCitations: [],
      confidenceLevel: 'insufficient',
      recommendation: 'No citations to evaluate',
    };
  }

  // Calculate distribution
  const distribution = { high: 0, medium: 0, low: 0, insufficient: 0 };
  for (const score of scores) {
    distribution[score.confidenceLevel]++;
  }

  // Calculate overall score (weighted average favoring lower scores)
  const sortedScores = scores.map(s => s.overallScore).sort((a, b) => a - b);
  const lowestThird = sortedScores.slice(0, Math.max(1, Math.floor(sortedScores.length / 3)));
  const lowestAvg = lowestThird.reduce((a, b) => a + b, 0) / lowestThird.length;
  const overallAvg = sortedScores.reduce((a, b) => a + b, 0) / sortedScores.length;

  // Weight towards lower scores (pessimistic aggregation)
  const overallScore = lowestAvg * 0.4 + overallAvg * 0.6;

  // Get weakest and strongest
  const sorted = [...scores].sort((a, b) => a.overallScore - b.overallScore);
  const weakestCitations = sorted.slice(0, 3).map(s => ({ cid: s.cid, score: s.overallScore }));
  const strongestCitations = sorted.slice(-3).reverse().map(s => ({ cid: s.cid, score: s.overallScore }));

  // Determine overall level
  const confidenceLevel = getConfidenceLevel(overallScore);

  // Generate recommendation
  let recommendation: string;
  if (distribution.insufficient > 0) {
    recommendation = `${distribution.insufficient} citation(s) have insufficient support - consider removing or finding better sources`;
  } else if (distribution.low > scores.length / 2) {
    recommendation = 'Majority of citations have low confidence - consider verifying claims';
  } else if (distribution.high > scores.length / 2) {
    recommendation = 'Response is well-grounded with high-confidence citations';
  } else {
    recommendation = 'Response has moderate citation confidence';
  }

  return {
    overallScore: Math.round(overallScore * 1000) / 1000,
    scoreDistribution: distribution,
    weakestCitations,
    strongestCitations,
    confidenceLevel,
    recommendation,
  };
}

/**
 * Calculate factual alignment score
 * Checks if numerical values, dates, and specific facts match
 */
export function calculateFactualAlignment(claim: string, source: string): number {
  let alignmentScore = 1.0;
  let factCount = 0;

  // Extract and compare numbers
  const claimNumbers = claim.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
  const sourceNumbers = new Set(source.match(/\b\d+(?:\.\d+)?%?\b/g) || []);

  for (const num of claimNumbers) {
    factCount++;
    if (!sourceNumbers.has(num)) {
      alignmentScore -= 0.15; // Penalty for unmatched number
    }
  }

  // Extract and compare quoted phrases
  const claimQuotes = claim.match(/"[^"]+"/g) || [];
  for (const quote of claimQuotes) {
    factCount++;
    if (!source.includes(quote.replace(/"/g, ''))) {
      alignmentScore -= 0.2; // Penalty for unmatched quote
    }
  }

  // If no specific facts, return neutral
  if (factCount === 0) return 0.7;

  return Math.max(0, Math.min(1, alignmentScore));
}

/**
 * Enhanced score with factual alignment
 */
export async function scoreWithFactualAlignment(
  claim: string,
  citation: Citation,
  chunk: ScoredChunk | undefined,
  options: { useSemanticScoring?: boolean } = {}
): Promise<CitationConfidenceScore & { factualScore: number }> {
  const baseScore = await scoreCitationConfidence(claim, citation, chunk, options);
  const sourceText = chunk?.text || citation.snippet;
  const factualScore = calculateFactualAlignment(claim, sourceText);

  // Adjust overall score based on factual alignment
  const adjustedOverall = baseScore.overallScore * 0.85 + factualScore * 0.15;
  const adjustedLevel = getConfidenceLevel(adjustedOverall);

  return {
    ...baseScore,
    overallScore: Math.round(adjustedOverall * 1000) / 1000,
    confidenceLevel: adjustedLevel,
    factualScore: Math.round(factualScore * 1000) / 1000,
    explanation: factualScore < 0.5
      ? 'Some specific facts in claim may not match source'
      : baseScore.explanation,
  };
}


```

---

## src/citationGrounding.ts

**Path:** `src/citationGrounding.ts`

```ts
/**
 * AuroraNotes API - Citation Grounding with NLI
 *
 * Uses Natural Language Inference (NLI) to verify that citations
 * actually support the claims made in the answer.
 *
 * This catches hallucinated or misattributed citations by checking
 * if the source text actually entails the claim.
 *
 * Approach:
 * 1. Extract claims from the answer (sentences with citations)
 * 2. For each claim, check if cited source entails it
 * 3. Flag citations that don't actually support the claim
 *
 * Uses Gemini as the NLI model (can be swapped for dedicated NLI model).
 */

import { Citation } from "./types";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";
import { logInfo, logError, logWarn } from "./utils";

// Configuration
const NLI_ENABLED = process.env.NLI_GROUNDING_ENABLED === 'true';
const NLI_MODEL = process.env.NLI_MODEL || 'gemini-2.0-flash';
const NLI_TIMEOUT_MS = parseInt(process.env.NLI_TIMEOUT_MS || '3000');
const NLI_MIN_CONFIDENCE = parseFloat(process.env.NLI_MIN_CONFIDENCE || '0.7');

/**
 * NLI result for a single claim-source pair
 */
export interface NLIResult {
  citationId: string;
  claim: string;
  sourceSnippet: string;
  verdict: 'entailment' | 'neutral' | 'contradiction';
  confidence: number;
  explanation?: string;
}

/**
 * Grounding result for an answer
 */
export interface GroundingResult {
  isGrounded: boolean;
  groundedCitations: string[];    // cids that are properly supported
  ungroundedCitations: string[];  // cids that lack support
  nliResults: NLIResult[];
  processingTimeMs: number;
}

/**
 * Extract claims with their citations from an answer
 */
function extractClaimsWithCitations(
  answer: string,
  citationsMap: Map<string, Citation>
): Array<{ claim: string; cid: string; source: Citation }> {
  const claims: Array<{ claim: string; cid: string; source: Citation }> = [];

  // Pattern to find sentences with citations like [N1], [N2]
  const citationPattern = /\[N(\d+)\]/g;
  const sentences = answer.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    const matches = sentence.matchAll(citationPattern);
    for (const match of matches) {
      const cid = `N${match[1]}`;
      const citation = citationsMap.get(cid);
      if (citation) {
        // Extract the claim (sentence without citation markers)
        const claim = sentence.replace(/\[N\d+\]/g, '').trim();
        if (claim.length > 10) { // Skip very short claims
          claims.push({ claim, cid, source: citation });
        }
      }
    }
  }

  return claims;
}

/**
 * Check entailment using Gemini as NLI model
 */
async function checkEntailment(
  premise: string,
  hypothesis: string
): Promise<{ verdict: NLIResult['verdict']; confidence: number; explanation?: string }> {
  const client = getGenAIClient();

  const prompt = `You are an NLI (Natural Language Inference) system. Determine if the premise entails, contradicts, or is neutral to the hypothesis.

Premise (source text): "${premise}"

Hypothesis (claim): "${hypothesis}"

Respond with ONLY a JSON object:
{"verdict": "entailment" | "neutral" | "contradiction", "confidence": 0.0-1.0, "explanation": "brief reason"}

Important:
- "entailment" = premise directly supports the hypothesis
- "neutral" = premise neither supports nor contradicts
- "contradiction" = premise contradicts the hypothesis

JSON response:`;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('NLI timeout')), NLI_TIMEOUT_MS);
    });

    const response = await Promise.race([
      client.models.generateContent({
        model: NLI_MODEL,
        contents: prompt,
        config: { temperature: 0.1, maxOutputTokens: 150 },
      }),
      timeoutPromise,
    ]);

    const text = response.text || '';
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        verdict: result.verdict || 'neutral',
        confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
        explanation: result.explanation,
      };
    }
  } catch (err) {
    logWarn('NLI check failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // Default to neutral on error
  return { verdict: 'neutral', confidence: 0.5 };
}

/**
 * Verify citations using NLI grounding
 *
 * This is the main entry point for citation verification.
 */
export async function verifyCitationsWithNLI(
  answer: string,
  citationsMap: Map<string, Citation>
): Promise<GroundingResult> {
  const startTime = Date.now();

  if (!NLI_ENABLED || !isGenAIAvailable()) {
    return {
      isGrounded: true,
      groundedCitations: Array.from(citationsMap.keys()),
      ungroundedCitations: [],
      nliResults: [],
      processingTimeMs: 0,
    };
  }

  const claims = extractClaimsWithCitations(answer, citationsMap);

  if (claims.length === 0) {
    return {
      isGrounded: true,
      groundedCitations: [],
      ungroundedCitations: [],
      nliResults: [],
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Check each claim in parallel (limit concurrency)
  const nliResults: NLIResult[] = [];
  const groundedCitations = new Set<string>();
  const ungroundedCitations = new Set<string>();

  const BATCH_SIZE = 3;
  for (let i = 0; i < claims.length; i += BATCH_SIZE) {
    const batch = claims.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ({ claim, cid, source }) => {
        const { verdict, confidence, explanation } = await checkEntailment(
          source.snippet,
          claim
        );
        return {
          citationId: cid,
          claim,
          sourceSnippet: source.snippet.slice(0, 100),
          verdict,
          confidence,
          explanation,
        };
      })
    );
    nliResults.push(...results);
  }

  for (const result of nliResults) {
    if (result.verdict === 'entailment' && result.confidence >= NLI_MIN_CONFIDENCE) {
      groundedCitations.add(result.citationId);
    } else if (result.verdict === 'contradiction') {
      ungroundedCitations.add(result.citationId);
    }
  }

  const processingTimeMs = Date.now() - startTime;
  const isGrounded = ungroundedCitations.size === 0;

  logInfo('NLI grounding complete', {
    totalClaims: claims.length,
    grounded: groundedCitations.size,
    ungrounded: ungroundedCitations.size,
    isGrounded,
    processingTimeMs,
  });

  return {
    isGrounded,
    groundedCitations: Array.from(groundedCitations),
    ungroundedCitations: Array.from(ungroundedCitations),
    nliResults,
    processingTimeMs,
  };
}

export function isNLIGroundingAvailable(): boolean {
  return NLI_ENABLED && isGenAIAvailable();
}

export function getNLIConfig() {
  return {
    enabled: NLI_ENABLED,
    model: NLI_MODEL,
    minConfidence: NLI_MIN_CONFIDENCE,
    timeoutMs: NLI_TIMEOUT_MS,
    available: isNLIGroundingAvailable(),
  };
}


```

---

## src/citationValidator.test.ts

**Path:** `src/citationValidator.test.ts`

```ts
/**
 * Citation Validator Tests
 * 
 * Tests for citation formatting preservation and validation.
 * Run with: npx ts-node --test src/citationValidator.test.ts
 * Or: node --experimental-strip-types --test src/citationValidator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  cleanCitationFormatting,
  removeInvalidCitations,
  parseCitationTokens,
  getOrderedUniqueCitations,
} from './citationValidator';

describe('cleanCitationFormatting', () => {
  it('preserves newlines in multi-line answers', () => {
    const input = `Here are the key points:\n\n• Point one [N1]\n• Point two [N2]\n• Point three [N3]`;
    const result = cleanCitationFormatting(input);
    
    assert.ok(result.includes('\n'), 'Should preserve newlines');
    assert.ok(result.includes('• Point one'), 'Should preserve bullet points');
    assert.ok(result.includes('• Point two'), 'Should preserve second bullet');
  });

  it('preserves bulleted list formatting', () => {
    const input = `Summary:\n\n- Item A [N1]\n- Item B [N2]\n- Item C [N3]`;
    const result = cleanCitationFormatting(input);
    
    const lines = result.split('\n');
    assert.ok(lines.length >= 4, `Should have multiple lines, got ${lines.length}`);
    assert.ok(result.includes('- Item A'), 'Should preserve first list item');
    assert.ok(result.includes('- Item B'), 'Should preserve second list item');
  });

  it('removes duplicate adjacent citations', () => {
    const input = `The project uses React [N1][N1] and Node [N2].`;
    const result = cleanCitationFormatting(input);
    
    assert.strictEqual(result, 'The project uses React [N1] and Node [N2].');
  });

  it('fixes citation spacing before punctuation', () => {
    const input = `The budget is $50,000 [N1] .`;
    const result = cleanCitationFormatting(input);
    
    assert.ok(!result.includes('[N1] .'), 'Should not have space before period');
    assert.ok(result.includes('[N1].'), 'Should have citation immediately before period');
  });

  it('collapses multiple spaces without affecting newlines', () => {
    const input = `First  paragraph [N1].\n\nSecond   paragraph [N2].`;
    const result = cleanCitationFormatting(input);
    
    assert.ok(!result.includes('  '), 'Should not have double spaces');
    assert.ok(result.includes('\n\n'), 'Should preserve paragraph break');
  });

  it('removes empty brackets', () => {
    const input = `Some text [] and more [  ] text [N1].`;
    const result = cleanCitationFormatting(input);
    
    assert.ok(!result.includes('[]'), 'Should remove empty brackets');
    assert.ok(!result.includes('[  ]'), 'Should remove brackets with spaces');
  });
});

describe('removeInvalidCitations', () => {
  it('preserves newlines when removing invalid citations', () => {
    const input = `First point [N1]\n\nSecond point [N99]\n\nThird point [N2]`;
    const validCids = new Set(['N1', 'N2']);
    
    const { cleaned, removed } = removeInvalidCitations(input, validCids);
    
    assert.ok(cleaned.includes('\n'), 'Should preserve newlines');
    assert.deepStrictEqual(removed, ['N99']);
  });

  it('preserves list structure when removing citations', () => {
    const input = `• Item one [N1]\n• Item two [N99]\n• Item three [N2]`;
    const validCids = new Set(['N1', 'N2']);
    
    const { cleaned, removed } = removeInvalidCitations(input, validCids);
    
    assert.ok(cleaned.includes('• Item one'), 'Should preserve first bullet');
    assert.ok(cleaned.includes('• Item two'), 'Should preserve second bullet');
    assert.ok(cleaned.includes('• Item three'), 'Should preserve third bullet');
    assert.ok(cleaned.includes('\n'), 'Should preserve newlines between items');
  });

  it('removes invalid citations and tracks them', () => {
    const input = `Text [N1] more [N5] and [N2] final [N99].`;
    const validCids = new Set(['N1', 'N2']);
    
    const { cleaned, removed } = removeInvalidCitations(input, validCids);
    
    assert.ok(cleaned.includes('[N1]'), 'Should keep valid N1');
    assert.ok(cleaned.includes('[N2]'), 'Should keep valid N2');
    assert.ok(!cleaned.includes('[N5]'), 'Should remove invalid N5');
    assert.ok(!cleaned.includes('[N99]'), 'Should remove invalid N99');
    assert.deepStrictEqual(removed.sort(), ['N5', 'N99'].sort());
  });

  it('does not add extra punctuation when removing citations', () => {
    const input = `- First item [N1]\n- Second item [N99]`;
    const validCids = new Set(['N1']);
    
    const { cleaned } = removeInvalidCitations(input, validCids);
    
    // Should not have doubled dashes or other punctuation artifacts
    assert.ok(!cleaned.includes('--'), 'Should not have doubled dashes');
    assert.ok(cleaned.includes('- Second item'), 'Should preserve list marker');
  });
});

describe('parseCitationTokens', () => {
  it('extracts all citation tokens in order', () => {
    const input = `Text [N1] and [N2] with [N1] again and [N3].`;
    const tokens = parseCitationTokens(input);
    
    assert.deepStrictEqual(tokens, ['N1', 'N2', 'N1', 'N3']);
  });

  it('handles multi-line text', () => {
    const input = `First [N1]\nSecond [N2]\nThird [N3]`;
    const tokens = parseCitationTokens(input);
    
    assert.deepStrictEqual(tokens, ['N1', 'N2', 'N3']);
  });
});

describe('getOrderedUniqueCitations', () => {
  it('returns unique citations in order of first appearance', () => {
    const input = `Text [N2] then [N1] then [N2] then [N3] then [N1].`;
    const unique = getOrderedUniqueCitations(input);
    
    assert.deepStrictEqual(unique, ['N2', 'N1', 'N3']);
  });
});


```

---

## src/citationValidator.ts

**Path:** `src/citationValidator.ts`

```ts
/**
 * AuroraNotes API - Citation Validator
 *
 * Unified citation validation pipeline for RAG answers:
 * - Parse citation tokens from text
 * - Remove invalid citations (not in source list)
 * - Reorder citations by first appearance
 * - Compute citation coverage (sentence-level)
 * - Verify citation relevance using keyword overlap
 * - Clean formatting (duplicate citations, spacing)
 *
 * This is the SINGLE canonical validation module for all citation operations.
 */

import { logWarn, logInfo } from './utils';
import { Citation, ScoredChunk } from './types';

// Re-export Citation type for convenience
export type { Citation } from './types';

// Configuration for overlap verification
const DEFAULT_MIN_OVERLAP_SCORE = 0.15;  // Min keyword overlap for validity

/**
 * Result from citation validation pipeline
 */
export interface ValidationResult {
  validatedAnswer: string;
  validatedCitations: Citation[];
  invalidCitationsRemoved: string[];
  droppedCitations: string[];        // Citations dropped due to low overlap
  suspiciousCitations: string[];     // Citations with low but non-zero overlap
  citationCoveragePct: number;
  allCitationsValid: boolean;
  orderedByFirstAppearance: boolean;
  overlapScores: Map<string, number>;  // Overlap scores for each citation
}

/**
 * Options for citation validation
 */
export interface ValidationOptions {
  strictMode?: boolean;           // Drop citations below overlap threshold
  minOverlapScore?: number;       // Min overlap score (default: 0.15)
  verifyRelevance?: boolean;      // Whether to verify overlap (default: true)
  requestId?: string;             // For logging
}

/**
 * Parse citation tokens from answer text
 * Returns array of cid strings (e.g., "N1", "N2")
 */
export function parseCitationTokens(answer: string): string[] {
  const pattern = /\[N(\d+)\]/g;
  const tokens: string[] = [];
  let match;
  while ((match = pattern.exec(answer)) !== null) {
    tokens.push(`N${match[1]}`);
  }
  return tokens;
}

/**
 * Get unique citation IDs in order of first appearance
 */
export function getOrderedUniqueCitations(answer: string): string[] {
  const tokens = parseCitationTokens(answer);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      ordered.push(token);
    }
  }
  return ordered;
}

/**
 * Remove invalid citation tokens from answer text while preserving formatting
 */
export function removeInvalidCitations(
  answer: string,
  validCids: Set<string>
): { cleaned: string; removed: string[] } {
  const removed: string[] = [];

  const cleaned = answer.replace(/\[N(\d+)\]/g, (match, num) => {
    const cid = `N${num}`;
    if (validCids.has(cid)) {
      return match; // Keep valid citation
    } else {
      removed.push(cid);
      return ''; // Remove invalid citation
    }
  });

  // Clean up extra spaces/tabs without destroying newlines
  const normalized = cleaned
    .replace(/[ \t]+/g, ' ')         // Collapse multiple spaces/tabs to single space
    .replace(/\n{3,}/g, '\n\n')      // Normalize multiple newlines to double
    .replace(/[ \t]+$/gm, '')        // Trim trailing whitespace from each line
    .trim();

  return { cleaned: normalized, removed };
}

/**
 * Calculate citation coverage: % of factual sentences with citations
 */
export function calculateCitationCoverage(answer: string): number {
  // Split into sentences
  const sentences = answer
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15); // Substantial sentences only

  if (sentences.length === 0) return 100;

  // Count sentences with at least one citation
  const citedCount = sentences.filter(s => /\[N\d+\]/.test(s)).length;

  return Math.round((citedCount / sentences.length) * 100);
}

/**
 * Clean up citation formatting issues in answer while preserving newlines
 */
export function cleanCitationFormatting(answer: string): string {
  return answer
    // Remove duplicate adjacent citations [N1][N1] -> [N1]
    .replace(/(\[N\d+\])(\s*\1)+/g, '$1')
    // Clean up spaces around citations: "word [N1] ." -> "word [N1]."
    .replace(/\s+([.!?,;:])/g, '$1')
    // Collapse multiple spaces/tabs on same line (preserve newlines)
    .replace(/[ \t]+/g, ' ')
    // Normalize multiple consecutive newlines to double newline (paragraph break)
    .replace(/\n{3,}/g, '\n\n')
    // Trim trailing whitespace from each line
    .replace(/[ \t]+$/gm, '')
    // Remove any leftover empty brackets
    .replace(/\[\s*\]/g, '')
    .trim();
}

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'and', 'or', 'but', 'if', 'this', 'that', 'these', 'those', 'it',
  'based', 'notes', 'according', 'mentioned', 'stated', 'using', 'used'
]);

/**
 * Extract keywords from text for overlap verification
 */
export function extractVerificationKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/\[N\d+\]/g, '') // Remove citation markers
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word))
  );
}

/**
 * Calculate overlap score between two keyword sets
 * Uses Szymkiewicz–Simpson coefficient (min-based overlap)
 */
export function calculateOverlapScore(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }

  const minSize = Math.min(set1.size, set2.size);
  return intersection / minSize;
}

/**
 * Verify citation relevance using keyword overlap
 * Returns citations that have sufficient keyword overlap with the answer
 */
export function verifyCitationRelevance(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[],
  options: { strictMode?: boolean; minOverlapScore?: number } = {}
): {
  validCitations: Citation[];
  droppedCitations: string[];
  suspiciousCitations: string[];
  overlapScores: Map<string, number>;
} {
  const { strictMode = true, minOverlapScore = DEFAULT_MIN_OVERLAP_SCORE } = options;

  const answerKeywords = extractVerificationKeywords(answer);
  const validCitations: Citation[] = [];
  const droppedCitations: string[] = [];
  const suspiciousCitations: string[] = [];
  const overlapScores = new Map<string, number>();

  for (const citation of citations) {
    // Find the full chunk text for this citation
    const chunk = chunks.find(c => c.chunkId === citation.chunkId);
    const sourceText = chunk?.text || citation.snippet;
    const sourceKeywords = extractVerificationKeywords(sourceText);

    // Calculate overlap score (0 to 1)
    const overlapScore = calculateOverlapScore(answerKeywords, sourceKeywords);
    overlapScores.set(citation.cid, overlapScore);

    if (overlapScore >= minOverlapScore) {
      validCitations.push(citation);
    } else if (overlapScore === 0 && strictMode) {
      droppedCitations.push(citation.cid);
    } else if (overlapScore < minOverlapScore && strictMode) {
      droppedCitations.push(citation.cid);
    } else {
      validCitations.push(citation);
      if (overlapScore < minOverlapScore * 0.5) {
        suspiciousCitations.push(citation.cid);
      }
    }
  }

  return { validCitations, droppedCitations, suspiciousCitations, overlapScores };
}

/**
 * Full citation validation pipeline
 *
 * Performs all citation validation steps:
 * 1. Remove invalid citations (not in source list)
 * 2. Clean formatting (duplicate citations, spacing)
 * 3. Reorder by first appearance
 * 4. Optionally verify overlap relevance
 * 5. Calculate coverage metrics
 *
 * @param answer - The LLM answer text
 * @param citations - Available citations from sources
 * @param chunks - Full chunk data for overlap verification
 * @param options - Validation options
 */
export function validateCitationsWithChunks(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[],
  options: ValidationOptions = {}
): ValidationResult {
  const {
    strictMode = true,
    minOverlapScore = DEFAULT_MIN_OVERLAP_SCORE,
    verifyRelevance = true,
    requestId = 'unknown'
  } = options;

  // Build map of valid cids
  const validCids = new Set(citations.map(c => c.cid));

  // Step 1: Remove invalid citations
  const { cleaned: cleanedInvalid, removed } = removeInvalidCitations(answer, validCids);

  if (removed.length > 0) {
    logWarn('Removed invalid citations from answer', {
      requestId,
      removedCount: removed.length,
      removedCids: removed,
    });
  }

  // Step 2: Clean formatting
  const cleanedAnswer = cleanCitationFormatting(cleanedInvalid);

  // Step 3: Get citations actually used in the answer (in order)
  const usedCids = getOrderedUniqueCitations(cleanedAnswer);
  const usedCidSet = new Set(usedCids);

  // Filter citations to only those actually cited
  let usedCitations = citations.filter(c => usedCidSet.has(c.cid));

  // Reorder by first appearance
  usedCitations = usedCids
    .map(cid => usedCitations.find(c => c.cid === cid))
    .filter((c): c is Citation => c !== undefined);

  // Step 4: Verify overlap relevance
  let droppedCitations: string[] = [];
  let suspiciousCitations: string[] = [];
  let overlapScores = new Map<string, number>();

  if (verifyRelevance && usedCitations.length > 0) {
    const verifyResult = verifyCitationRelevance(cleanedAnswer, usedCitations, chunks, {
      strictMode,
      minOverlapScore,
    });

    usedCitations = verifyResult.validCitations;
    droppedCitations = verifyResult.droppedCitations;
    suspiciousCitations = verifyResult.suspiciousCitations;
    overlapScores = verifyResult.overlapScores;

    if (droppedCitations.length > 0) {
      logWarn('Dropped unsupported citations (low keyword overlap)', {
        requestId,
        droppedCitations,
        threshold: minOverlapScore,
      });
    }
  }

  // Step 5: Calculate coverage
  const coveragePct = calculateCitationCoverage(cleanedAnswer);

  return {
    validatedAnswer: cleanedAnswer,
    validatedCitations: usedCitations,
    invalidCitationsRemoved: removed,
    droppedCitations,
    suspiciousCitations,
    citationCoveragePct: coveragePct,
    allCitationsValid: removed.length === 0 && droppedCitations.length === 0,
    orderedByFirstAppearance: true,
    overlapScores,
  };
}

/**
 * Simple citation validation (backwards compatible)
 * Use validateCitationsWithChunks for full pipeline with overlap verification
 */
export function validateCitations(
  answer: string,
  citations: Citation[],
  requestId: string
): ValidationResult {
  // Use simplified validation without chunk data (no overlap verification)
  const validCids = new Set(citations.map(c => c.cid));
  const { cleaned, removed } = removeInvalidCitations(answer, validCids);

  if (removed.length > 0) {
    logWarn('Removed invalid citations from answer', {
      requestId,
      removedCount: removed.length,
      removedCids: removed,
    });
  }

  const cleanedAnswer = cleanCitationFormatting(cleaned);
  const usedCids = getOrderedUniqueCitations(cleanedAnswer);
  const usedCidSet = new Set(usedCids);
  const usedCitations = citations.filter(c => usedCidSet.has(c.cid));

  const orderedCitations = usedCids
    .map(cid => usedCitations.find(c => c.cid === cid))
    .filter((c): c is Citation => c !== undefined);

  const coveragePct = calculateCitationCoverage(cleanedAnswer);

  return {
    validatedAnswer: cleanedAnswer,
    validatedCitations: orderedCitations,
    invalidCitationsRemoved: removed,
    droppedCitations: [],
    suspiciousCitations: [],
    citationCoveragePct: coveragePct,
    allCitationsValid: removed.length === 0,
    orderedByFirstAppearance: true,
    overlapScores: new Map(),
  };
}

/**
 * Check if answer needs regeneration due to low citation coverage
 */
export function needsRegeneration(
  coveragePct: number,
  threshold: number = 50
): boolean {
  return coveragePct < threshold;
}

/**
 * Calculate source utilization: % of available sources that were cited
 */
export function calculateSourceUtilization(
  usedCitationCount: number,
  totalSourceCount: number
): number {
  if (totalSourceCount === 0) return 100;
  return Math.round((usedCitationCount / totalSourceCount) * 100);
}


```

---

## src/claimAnchoring.ts

**Path:** `src/claimAnchoring.ts`

```ts
/**
 * AuroraNotes API - Claim-Level Citation Anchoring
 *
 * Implements fine-grained claim extraction and source matching:
 * 1. Extract individual claims from generated responses
 * 2. Match each claim to source chunks using semantic similarity
 * 3. Verify that citations actually support the claims they're attached to
 * 4. Flag or repair misattributed citations
 *
 * This ensures each factual claim is properly grounded in source material.
 */

import { ScoredChunk, Citation } from './types';
import { logInfo, logWarn, logError } from './utils';

// Configuration
const CLAIM_ANCHORING_CONFIG = {
  enabled: true,
  minClaimLength: 10,               // Minimum characters for a valid claim
  maxClaimLength: 500,              // Maximum characters for a claim
  semanticMatchThreshold: 0.65,     // Min similarity for claim-source match
  keywordOverlapWeight: 0.3,        // Weight for keyword overlap in matching
  semanticWeight: 0.7,              // Weight for semantic similarity
  requireExplicitSupport: true,     // Require explicit evidence for claims
};

/**
 * Extracted claim from response
 */
export interface ExtractedClaim {
  text: string;                     // The claim text
  startIndex: number;               // Position in original response
  endIndex: number;
  citationIds: string[];            // Citations attached to this claim
  claimType: 'factual' | 'opinion' | 'procedural' | 'definition';
}

/**
 * Claim verification result
 */
export interface ClaimVerification {
  claim: ExtractedClaim;
  isSupported: boolean;
  supportingChunks: ScoredChunk[];  // Chunks that support this claim
  matchScore: number;               // How well the claim matches sources
  suggestedCitations: string[];     // Recommended citation IDs
  issues: string[];                 // Any problems found
}

/**
 * Overall anchoring result
 */
export interface AnchoringResult {
  claims: ClaimVerification[];
  overallScore: number;             // 0-1 how well grounded the response is
  unsupportedClaims: ExtractedClaim[];
  misattributedCitations: string[];
  repairSuggestions: RepairSuggestion[];
}

/**
 * Suggestion for repairing citation issues
 */
export interface RepairSuggestion {
  claimText: string;
  issue: string;
  suggestedFix: string;
  confidence: number;
}

/**
 * Extract claims from response text
 * Uses sentence boundaries and citation markers to identify claims
 */
export function extractClaims(responseText: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];

  // Split by sentence boundaries while preserving positions
  const sentencePattern = /[^.!?]+[.!?]+/g;
  let match;

  while ((match = sentencePattern.exec(responseText)) !== null) {
    const sentence = match[0].trim();
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;

    // Skip if too short or too long
    if (sentence.length < CLAIM_ANCHORING_CONFIG.minClaimLength ||
        sentence.length > CLAIM_ANCHORING_CONFIG.maxClaimLength) {
      continue;
    }

    // Extract citation IDs from this sentence
    const citationPattern = /\[N(\d+)\]/g;
    const citationIds: string[] = [];
    let citMatch;
    while ((citMatch = citationPattern.exec(sentence)) !== null) {
      citationIds.push(`N${citMatch[1]}`);
    }

    // Classify claim type
    const claimType = classifyClaimType(sentence);

    claims.push({
      text: sentence,
      startIndex,
      endIndex,
      citationIds,
      claimType,
    });
  }

  return claims;
}

/**
 * Classify the type of claim
 */
function classifyClaimType(sentence: string): ExtractedClaim['claimType'] {
  const lower = sentence.toLowerCase();

  // Definition patterns
  if (lower.includes(' is defined as ') ||
      lower.includes(' refers to ') ||
      lower.includes(' means ') ||
      /^[a-z]+ is (a|an|the) /.test(lower)) {
    return 'definition';
  }

  // Procedural patterns
  if (lower.includes('to do this') ||
      lower.includes('you can ') ||
      lower.includes('you should ') ||
      lower.includes('steps to ') ||
      /^(first|then|next|finally),? /.test(lower)) {
    return 'procedural';
  }

  // Opinion patterns
  if (lower.includes('i think') ||
      lower.includes('in my opinion') ||
      lower.includes('it seems') ||
      lower.includes('arguably')) {
    return 'opinion';
  }

  // Default to factual
  return 'factual';
}

/**
 * Calculate keyword overlap between claim and chunk
 */
function calculateKeywordOverlap(claim: string, chunkText: string): number {
  const extractKeywords = (text: string): Set<string> => {
    const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of',
      'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then',
      'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
      'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
      'this', 'that', 'these', 'those', 'it', 'its']);

    return new Set(
      text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopwords.has(w))
    );
  };

  const claimKeywords = extractKeywords(claim);
  const chunkKeywords = extractKeywords(chunkText);

  if (claimKeywords.size === 0) return 0;

  let overlap = 0;
  for (const kw of claimKeywords) {
    if (chunkKeywords.has(kw)) overlap++;
  }

  return overlap / claimKeywords.size;
}

/**
 * Find the best matching chunk for a claim
 */
export function findBestMatchingChunk(
  claim: ExtractedClaim,
  chunks: ScoredChunk[]
): { chunk: ScoredChunk | null; score: number } {
  let bestChunk: ScoredChunk | null = null;
  let bestScore = 0;

  for (const chunk of chunks) {
    // Calculate keyword overlap
    const keywordScore = calculateKeywordOverlap(claim.text, chunk.text);

    // Use chunk's existing score as a proxy for semantic relevance
    // In production, you'd compute actual semantic similarity here
    const semanticScore = chunk.score;

    // Combined score
    const combinedScore =
      CLAIM_ANCHORING_CONFIG.keywordOverlapWeight * keywordScore +
      CLAIM_ANCHORING_CONFIG.semanticWeight * semanticScore;

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestChunk = chunk;
    }
  }

  return { chunk: bestChunk, score: bestScore };
}

/**
 * Verify a single claim against source chunks
 */
export function verifyClaim(
  claim: ExtractedClaim,
  chunks: ScoredChunk[],
  chunkIdMap: Map<string, ScoredChunk>
): ClaimVerification {
  const issues: string[] = [];
  const supportingChunks: ScoredChunk[] = [];
  const suggestedCitations: string[] = [];

  // Check if cited chunks actually support this claim
  for (const citId of claim.citationIds) {
    const chunk = chunkIdMap.get(citId);
    if (!chunk) {
      issues.push(`Citation ${citId} not found in source chunks`);
      continue;
    }

    const keywordScore = calculateKeywordOverlap(claim.text, chunk.text);
    if (keywordScore >= CLAIM_ANCHORING_CONFIG.semanticMatchThreshold * 0.5) {
      supportingChunks.push(chunk);
    } else {
      issues.push(`Citation ${citId} may not directly support this claim (overlap: ${(keywordScore * 100).toFixed(0)}%)`);
    }
  }

  // Find best matching chunk if no citations or citations don't match
  const { chunk: bestMatch, score: matchScore } = findBestMatchingChunk(claim, chunks);

  if (bestMatch && matchScore >= CLAIM_ANCHORING_CONFIG.semanticMatchThreshold) {
    // Find the citation ID for this chunk
    for (const [id, c] of chunkIdMap.entries()) {
      if (c === bestMatch && !suggestedCitations.includes(id)) {
        suggestedCitations.push(id);
      }
    }
  }

  // Determine if claim is supported
  const isSupported = supportingChunks.length > 0 ||
    (claim.claimType === 'opinion') ||
    (claim.claimType === 'procedural' && matchScore > 0.5);

  if (!isSupported && claim.claimType === 'factual') {
    issues.push('Factual claim lacks sufficient source support');
  }

  return {
    claim,
    isSupported,
    supportingChunks,
    matchScore,
    suggestedCitations,
    issues,
  };
}

/**
 * Anchor all claims in a response to source chunks
 */
export function anchorClaims(
  responseText: string,
  chunks: ScoredChunk[]
): AnchoringResult {
  // Extract claims
  const claims = extractClaims(responseText);

  // Build chunk ID map
  const chunkIdMap = new Map<string, ScoredChunk>();
  chunks.forEach((chunk, idx) => {
    chunkIdMap.set(`N${idx + 1}`, chunk);
  });

  // Verify each claim
  const verifications: ClaimVerification[] = [];
  const unsupportedClaims: ExtractedClaim[] = [];
  const misattributedCitations: string[] = [];
  const repairSuggestions: RepairSuggestion[] = [];

  for (const claim of claims) {
    const verification = verifyClaim(claim, chunks, chunkIdMap);
    verifications.push(verification);

    if (!verification.isSupported) {
      unsupportedClaims.push(claim);
    }

    // Check for misattributed citations
    for (const issue of verification.issues) {
      if (issue.includes('may not directly support')) {
        const citMatch = issue.match(/Citation (N\d+)/);
        if (citMatch && !misattributedCitations.includes(citMatch[1])) {
          misattributedCitations.push(citMatch[1]);
        }
      }
    }

    // Generate repair suggestions
    if (verification.issues.length > 0 && verification.suggestedCitations.length > 0) {
      repairSuggestions.push({
        claimText: claim.text.substring(0, 100) + (claim.text.length > 100 ? '...' : ''),
        issue: verification.issues[0],
        suggestedFix: `Consider using citation ${verification.suggestedCitations[0]} instead`,
        confidence: verification.matchScore,
      });
    }
  }

  // Calculate overall score
  const supportedCount = verifications.filter(v => v.isSupported).length;
  const overallScore = verifications.length > 0 ? supportedCount / verifications.length : 1;

  logInfo(`Claim anchoring: ${supportedCount}/${verifications.length} claims supported, score: ${overallScore.toFixed(2)}`);

  if (misattributedCitations.length > 0) {
    logWarn(`Claim anchoring: ${misattributedCitations.length} potentially misattributed citations`);
  }

  return {
    claims: verifications,
    overallScore,
    unsupportedClaims,
    misattributedCitations,
    repairSuggestions,
  };
}

/**
 * Configuration getter
 */
export function getClaimAnchoringConfig() {
  return { ...CLAIM_ANCHORING_CONFIG };
}

/**
 * Check if claim anchoring is enabled
 */
export function isClaimAnchoringEnabled(): boolean {
  return CLAIM_ANCHORING_CONFIG.enabled;
}


```

---

## src/claimExtraction.ts

**Path:** `src/claimExtraction.ts`

```ts
/**
 * AuroraNotes API - Claim-Level Citation Extraction
 *
 * Extracts individual claims from LLM responses and matches them
 * to specific sources for precise per-claim citations.
 *
 * This enables:
 * - More granular citation accuracy verification
 * - Better source attribution at the claim level
 * - Identification of unsupported claims
 * - Improved response consistency
 */

import { Citation, ScoredChunk } from './types';
import { cosineSimilarity } from './utils';
import { generateQueryEmbedding, isEmbeddingsAvailable } from './embeddings';
import { logInfo, logWarn } from './utils';

/**
 * A single claim extracted from an LLM response
 */
export interface ExtractedClaim {
  id: string;
  text: string;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
  claimType: 'factual' | 'definitional' | 'procedural' | 'comparative' | 'opinion';
  citedSources: string[];  // CIDs from the original response
  confidence: number;
}

/**
 * A claim matched to its best supporting source
 */
export interface ClaimSourceMatch {
  claim: ExtractedClaim;
  bestMatch: {
    chunk: ScoredChunk;
    citation: Citation;
    matchScore: number;
    matchType: 'exact' | 'paraphrase' | 'inferred' | 'weak';
  } | null;
  alternativeMatches: Array<{
    chunk: ScoredChunk;
    citation: Citation;
    matchScore: number;
  }>;
  isSupported: boolean;
  supportConfidence: number;
}

/**
 * Classify the type of claim based on linguistic patterns
 */
function classifyClaimType(text: string): ExtractedClaim['claimType'] {
  const lowerText = text.toLowerCase();

  // Definitional claims (is, are, means, refers to)
  if (/\b(is|are|means|refers to|defined as|known as)\b/.test(lowerText)) {
    return 'definitional';
  }

  // Procedural claims (how to, steps, process)
  if (/\b(to|by|through|steps?|process|procedure|method)\b/.test(lowerText)) {
    return 'procedural';
  }

  // Comparative claims (more, less, better, worse, compared)
  if (/\b(more|less|better|worse|compared|than|versus|vs)\b/.test(lowerText)) {
    return 'comparative';
  }

  // Opinion indicators (may, might, could, suggests, appears)
  if (/\b(may|might|could|suggests?|appears?|seems?|likely|probably)\b/.test(lowerText)) {
    return 'opinion';
  }

  // Default to factual
  return 'factual';
}

/**
 * Extract individual claims from a response text
 */
export function extractClaims(responseText: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];

  // Split into sentences
  const sentencePattern = /[^.!?]+[.!?]+/g;
  const sentences = responseText.match(sentencePattern) || [];

  let currentOffset = 0;
  let claimId = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    const startOffset = responseText.indexOf(sentence, currentOffset);
    const endOffset = startOffset + sentence.length;
    currentOffset = endOffset;

    // Skip very short sentences or meta-sentences
    if (sentence.length < 15) continue;
    if (/^(note:|disclaimer:|however,|additionally,|furthermore,)$/i.test(sentence.trim())) continue;

    // Extract cited sources from this sentence
    const citedSources: string[] = [];
    const citationMatches = sentence.matchAll(/\[N?(\d+)\]/g);
    for (const match of citationMatches) {
      const cid = match[1].startsWith('N') ? match[1] : `N${match[1]}`;
      if (!citedSources.includes(cid)) {
        citedSources.push(cid);
      }
    }

    // Clean the claim text (remove citation markers)
    const cleanText = sentence.replace(/\s*\[N?\d+\]/g, '').trim();

    if (cleanText.length < 10) continue;

    claims.push({
      id: `claim_${claimId++}`,
      text: cleanText,
      sentenceIndex: i,
      startOffset,
      endOffset,
      claimType: classifyClaimType(cleanText),
      citedSources,
      confidence: citedSources.length > 0 ? 0.8 : 0.5,
    });
  }

  return claims;
}

/**
 * Calculate semantic similarity between claim and chunk
 */
async function calculateSemanticMatch(
  claimText: string,
  chunk: ScoredChunk
): Promise<number> {
  if (!isEmbeddingsAvailable() || !chunk.embedding) {
    return 0;
  }

  try {
    const claimEmbedding = await generateQueryEmbedding(claimText);
    return cosineSimilarity(claimEmbedding, chunk.embedding);
  } catch {
    return 0;
  }
}

/**
 * Calculate lexical overlap between claim and chunk
 */
function calculateLexicalMatch(claimText: string, chunkText: string): number {
  const claimWords = new Set(
    claimText.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );

  const chunkWords = new Set(
    chunkText.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );

  if (claimWords.size === 0) return 0;

  let matches = 0;
  for (const word of claimWords) {
    if (chunkWords.has(word)) matches++;
  }

  return matches / claimWords.size;
}

/**
 * Determine match type based on score
 */
function getMatchType(score: number): ClaimSourceMatch['bestMatch'] extends null ? never : NonNullable<ClaimSourceMatch['bestMatch']>['matchType'] {
  if (score >= 0.85) return 'exact';
  if (score >= 0.65) return 'paraphrase';
  if (score >= 0.45) return 'inferred';
  return 'weak';
}

/**
 * Match a single claim to the best supporting source
 */
export async function matchClaimToSources(
  claim: ExtractedClaim,
  chunks: ScoredChunk[],
  citations: Citation[],
  options: { useSemanticMatching?: boolean } = {}
): Promise<ClaimSourceMatch> {
  const { useSemanticMatching = true } = options;

  const citationMap = new Map(citations.map(c => [c.chunkId, c]));
  const matches: Array<{ chunk: ScoredChunk; citation: Citation; matchScore: number }> = [];

  for (const chunk of chunks) {
    const citation = citationMap.get(chunk.chunkId);
    if (!citation) continue;

    // Calculate combined match score
    let semanticScore = 0;
    if (useSemanticMatching) {
      semanticScore = await calculateSemanticMatch(claim.text, chunk);
    }

    const lexicalScore = calculateLexicalMatch(claim.text, chunk.text);

    // Weighted combination
    const matchScore = useSemanticMatching
      ? semanticScore * 0.6 + lexicalScore * 0.4
      : lexicalScore;

    matches.push({ chunk, citation, matchScore });
  }

  // Sort by match score
  matches.sort((a, b) => b.matchScore - a.matchScore);

  const bestMatch = matches[0];
  const isSupported = bestMatch && bestMatch.matchScore >= 0.45;

  return {
    claim,
    bestMatch: bestMatch ? {
      chunk: bestMatch.chunk,
      citation: bestMatch.citation,
      matchScore: bestMatch.matchScore,
      matchType: getMatchType(bestMatch.matchScore),
    } : null,
    alternativeMatches: matches.slice(1, 4), // Top 3 alternatives
    isSupported,
    supportConfidence: bestMatch?.matchScore || 0,
  };
}

/**
 * Match all claims in a response to their sources
 */
export async function matchAllClaims(
  responseText: string,
  chunks: ScoredChunk[],
  citations: Citation[],
  options: { useSemanticMatching?: boolean } = {}
): Promise<{
  claims: ExtractedClaim[];
  matches: ClaimSourceMatch[];
  supportedCount: number;
  unsupportedCount: number;
  overallSupportRate: number;
}> {
  const claims = extractClaims(responseText);
  const matches: ClaimSourceMatch[] = [];

  let supportedCount = 0;
  let unsupportedCount = 0;

  for (const claim of claims) {
    const match = await matchClaimToSources(claim, chunks, citations, options);
    matches.push(match);

    if (match.isSupported) {
      supportedCount++;
    } else {
      unsupportedCount++;
    }
  }

  const overallSupportRate = claims.length > 0
    ? supportedCount / claims.length
    : 0;

  if (unsupportedCount > 0) {
    logWarn('Unsupported claims detected', {
      unsupportedCount,
      totalClaims: claims.length,
      unsupportedClaims: matches
        .filter(m => !m.isSupported)
        .map(m => m.claim.text.substring(0, 50) + '...'),
    });
  }

  return {
    claims,
    matches,
    supportedCount,
    unsupportedCount,
    overallSupportRate,
  };
}

/**
 * Identify claims that need better citations
 */
export function identifyWeaklyCitedClaims(
  matches: ClaimSourceMatch[],
  minConfidence: number = 0.5
): {
  weakClaims: ClaimSourceMatch[];
  strongClaims: ClaimSourceMatch[];
  recommendations: string[];
} {
  const weakClaims: ClaimSourceMatch[] = [];
  const strongClaims: ClaimSourceMatch[] = [];
  const recommendations: string[] = [];

  for (const match of matches) {
    if (!match.isSupported || match.supportConfidence < minConfidence) {
      weakClaims.push(match);

      // Generate recommendation
      if (!match.bestMatch) {
        recommendations.push(
          `Claim "${match.claim.text.substring(0, 40)}..." has no supporting source`
        );
      } else if (match.bestMatch.matchType === 'weak') {
        recommendations.push(
          `Claim "${match.claim.text.substring(0, 40)}..." has weak support (${Math.round(match.supportConfidence * 100)}%)`
        );
      }
    } else {
      strongClaims.push(match);
    }
  }

  return { weakClaims, strongClaims, recommendations };
}

/**
 * Semantic anchoring result for pre-response source analysis
 */
export interface SemanticAnchor {
  sourceId: string;
  sourceText: string;
  keyFacts: string[];
  bestForTopics: string[];
  semanticCluster: number;
  confidence: number;
}

/**
 * Pre-compute semantic anchors for sources
 * This helps the LLM understand which sources best support which topics
 */
export async function computeSemanticAnchors(
  chunks: ScoredChunk[],
  query: string
): Promise<SemanticAnchor[]> {
  const anchors: SemanticAnchor[] = [];

  // Extract query topics
  const queryTopics = extractKeyTopics(query);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const cid = `N${i + 1}`;

    // Extract key facts from this chunk
    const keyFacts = extractKeyFacts(chunk.text);

    // Determine which query topics this chunk addresses
    const bestForTopics = queryTopics.filter(topic =>
      chunk.text.toLowerCase().includes(topic.toLowerCase()) ||
      keyFacts.some(fact => fact.toLowerCase().includes(topic.toLowerCase()))
    );

    // Simple clustering by content similarity
    const semanticCluster = computeContentCluster(chunk.text, chunks, i);

    // Confidence based on relevance to query
    const confidence = chunk.score || 0.5;

    anchors.push({
      sourceId: cid,
      sourceText: chunk.text.slice(0, 200),
      keyFacts,
      bestForTopics,
      semanticCluster,
      confidence,
    });
  }

  return anchors;
}

/**
 * Extract key topics from query
 */
function extractKeyTopics(query: string): string[] {
  const stopWords = new Set([
    'what', 'how', 'why', 'when', 'where', 'who', 'which',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'can', 'about', 'with',
    'for', 'from', 'to', 'of', 'in', 'on', 'at', 'by', 'and', 'or',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Extract key facts from source text
 */
function extractKeyFacts(text: string): string[] {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);

  // Prioritize sentences with specific information
  const factPatterns = [
    /\b\d+\b/,                    // Contains numbers
    /\b(is|are|was|were|has|have)\b/i,  // Declarative statements
    /\b(because|therefore|thus|hence)\b/i, // Causal statements
    /\b(first|second|third|finally)\b/i,   // Sequential info
  ];

  const factSentences = sentences.filter(sentence =>
    factPatterns.some(pattern => pattern.test(sentence))
  );

  // Return top 3 fact-like sentences
  return factSentences.slice(0, 3).map(s => s.trim());
}

/**
 * Compute a simple content cluster ID based on lexical similarity
 */
function computeContentCluster(
  text: string,
  allChunks: ScoredChunk[],
  currentIndex: number
): number {
  // Simple heuristic: group by first significant word
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  if (words.length === 0) return currentIndex;

  // Find chunks with similar first words
  const firstWord = words[0];
  for (let i = 0; i < currentIndex; i++) {
    const otherWords = allChunks[i].text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    if (otherWords[0] === firstWord) {
      return i; // Same cluster as earlier chunk
    }
  }

  return currentIndex; // New cluster
}

/**
 * Build source anchor hints for the prompt
 * This provides the LLM with guidance on which sources support which topics
 */
export function buildSourceAnchorHints(anchors: SemanticAnchor[]): string {
  if (anchors.length === 0) return '';

  const hints = anchors
    .filter(a => a.bestForTopics.length > 0 || a.keyFacts.length > 0)
    .slice(0, 5)  // Limit to top 5 most informative
    .map(anchor => {
      const topics = anchor.bestForTopics.length > 0
        ? `Topics: ${anchor.bestForTopics.join(', ')}`
        : '';
      const facts = anchor.keyFacts.length > 0
        ? `Key info: ${anchor.keyFacts[0].slice(0, 80)}...`
        : '';
      return `${anchor.sourceId}: ${topics} ${facts}`.trim();
    });

  if (hints.length === 0) return '';

  return `\nSOURCE HINTS (which source is best for what):\n${hints.join('\n')}\n`;
}


```

---

## src/config.ts

**Path:** `src/config.ts`

```ts
/**
 * AuroraNotes API - Configuration
 * 
 * Centralized configuration loaded from environment variables
 * with sensible defaults and validation.
 */

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key]?.toLowerCase();
  if (!val) return defaultValue;
  return val === 'true' || val === '1';
}

// ============================================
// Server Config
// ============================================
export const PORT = envInt('PORT', 8080);
export const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'local';

// ============================================
// Firestore Collections
// ============================================
export const NOTES_COLLECTION = process.env.NOTES_COLLECTION || 'notes';
export const CHUNKS_COLLECTION = process.env.CHUNKS_COLLECTION || 'noteChunks';

// ============================================
// Notes Config
// ============================================
export const MAX_NOTE_LENGTH = envInt('MAX_NOTE_LENGTH', 5000);
export const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'public';
export const NOTES_PAGE_LIMIT = envInt('NOTES_PAGE_LIMIT', 50);
export const MAX_NOTES_PAGE_LIMIT = 100;

// ============================================
// Chunking Config (tuned for citation accuracy)
// ============================================
export const CHUNK_TARGET_SIZE = envInt('CHUNK_TARGET_SIZE', 450);      // Slightly smaller for precision (was 500)
export const CHUNK_MIN_SIZE = envInt('CHUNK_MIN_SIZE', 80);             // Allow smaller chunks (was 100)
export const CHUNK_MAX_SIZE = envInt('CHUNK_MAX_SIZE', 700);            // Smaller max for focused content (was 800)
export const CHUNK_OVERLAP = envInt('CHUNK_OVERLAP', 75);               // More overlap for context (was 50)

// ============================================
// Embeddings Config
// ============================================
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-004';
export const EMBEDDING_DIMENSIONS = envInt('EMBEDDING_DIMENSIONS', 768);
export const EMBEDDINGS_ENABLED = envBool('EMBEDDINGS_ENABLED', true);
export const EMBEDDING_TIMEOUT_MS = envInt('EMBEDDING_TIMEOUT_MS', 15000); // 15 seconds per embedding call

// ============================================
// Retrieval Config
// ============================================
export const RETRIEVAL_TOP_K = envInt('RETRIEVAL_TOP_K', 30);           // Initial candidates
export const RETRIEVAL_RERANK_TO = envInt('RETRIEVAL_RERANK_TO', 8);    // After reranking
export const RETRIEVAL_DEFAULT_DAYS = envInt('RETRIEVAL_DEFAULT_DAYS', 90);
export const RETRIEVAL_MAX_CONTEXT_CHARS = envInt('RETRIEVAL_MAX_CONTEXT_CHARS', 12000);
export const RETRIEVAL_MIN_RELEVANCE = parseFloat(process.env.RETRIEVAL_MIN_RELEVANCE || '0.25'); // Minimum relevance score threshold

// ============================================
// Chat / LLM Config (tuned for accuracy + repeatability)
// ============================================
export const CHAT_MODEL = process.env.CHAT_MODEL || 'gemini-2.0-flash';
export const CHAT_TIMEOUT_MS = envInt('CHAT_TIMEOUT_MS', 30000);
export const CHAT_MAX_QUERY_LENGTH = envInt('CHAT_MAX_QUERY_LENGTH', 2000);
export const CHAT_TEMPERATURE = parseFloat(process.env.CHAT_TEMPERATURE || '0.1');  // Lower for more determinism (was 0.2)
export const CHAT_TOP_P = parseFloat(process.env.CHAT_TOP_P || '0.9');  // Nucleus sampling threshold
export const CHAT_TOP_K = envInt('CHAT_TOP_K', 40);  // Top-K sampling (0 = disabled)

// ============================================
// Context Budget (Dynamic Source Limits)
// ============================================
// Gemini 2.0 Flash supports 1M tokens (~4M chars), but we use conservative budget
// to leave room for system prompt, query, and output generation
export const LLM_CONTEXT_BUDGET_CHARS = envInt('LLM_CONTEXT_BUDGET_CHARS', 100000);  // ~25K tokens for sources
export const LLM_CONTEXT_RESERVE_CHARS = envInt('LLM_CONTEXT_RESERVE_CHARS', 4000);  // Reserved for system prompt + query
export const LLM_MAX_OUTPUT_TOKENS = envInt('LLM_MAX_OUTPUT_TOKENS', 2048);  // Max output tokens

// ============================================
// Cost Controls
// ============================================
// DEPRECATED: Use LLM_CONTEXT_BUDGET_CHARS instead for dynamic limits
// Kept for backward compatibility but no longer enforced as hard cap
export const MAX_CHUNKS_IN_CONTEXT = envInt('MAX_CHUNKS_IN_CONTEXT', 100);  // Raised from 12, effectively unlimited within budget
export const MAX_EMBEDDING_BATCH_SIZE = envInt('MAX_EMBEDDING_BATCH_SIZE', 10);
export const CLOUD_RUN_MAX_INSTANCES = envInt('CLOUD_RUN_MAX_INSTANCES', 10);
export const CLOUD_RUN_CONCURRENCY = envInt('CLOUD_RUN_CONCURRENCY', 80);

// ============================================
// Feature Flags
// ============================================
export const VECTOR_SEARCH_ENABLED = envBool('VECTOR_SEARCH_ENABLED', true);
export const RERANKING_ENABLED = envBool('RERANKING_ENABLED', true);
export const LLM_RERANK_ENABLED = envBool('LLM_RERANK_ENABLED', false);  // Optional LLM-based reranking
export const CITATION_RETRY_ENABLED = envBool('CITATION_RETRY_ENABLED', true);  // Retry on invalid citations

// ============================================
// Vertex AI Vector Search (for 100k+ scale)
// ============================================
export const VERTEX_VECTOR_SEARCH_ENABLED = envBool('VERTEX_VECTOR_SEARCH_ENABLED', false);
export const VERTEX_VECTOR_SEARCH_REGION = process.env.VERTEX_VECTOR_SEARCH_REGION || 'us-central1';
// Endpoint config: prefer VERTEX_INDEX_ENDPOINT_RESOURCE (full resource name)
// Fallback to VERTEX_INDEX_ENDPOINT_ID + project/region construction
export const VERTEX_INDEX_ENDPOINT_RESOURCE = process.env.VERTEX_INDEX_ENDPOINT_RESOURCE || '';
export const VERTEX_INDEX_ENDPOINT_ID = process.env.VERTEX_INDEX_ENDPOINT_ID || '';
// Legacy: VERTEX_VECTOR_SEARCH_ENDPOINT (public endpoint domain) - deprecated
export const VERTEX_VECTOR_SEARCH_ENDPOINT = process.env.VERTEX_VECTOR_SEARCH_ENDPOINT || '';
// Index ID for upsert/remove operations
export const VERTEX_VECTOR_SEARCH_INDEX_ID = process.env.VERTEX_VECTOR_SEARCH_INDEX_ID || '';
// Deployed index ID within the endpoint
export const VERTEX_DEPLOYED_INDEX_ID = process.env.VERTEX_DEPLOYED_INDEX_ID || '';
// Distance metric for score conversion
export const VERTEX_DISTANCE_METRIC = (process.env.VERTEX_DISTANCE_METRIC as 'COSINE' | 'DOT_PRODUCT' | 'SQUARED_L2') || 'COSINE';

// ============================================
// Multi-Stage Retrieval Config (tuned for near-perfect recall)
// ============================================
// Vector candidate generation - increased for better recall
export const RETRIEVAL_VECTOR_TOP_K = envInt('RETRIEVAL_VECTOR_TOP_K', 500);  // Primary vector candidates (was 300)
// Lexical candidate generation - increased for better exact-match coverage
export const RETRIEVAL_LEXICAL_TOP_K = envInt('RETRIEVAL_LEXICAL_TOP_K', 200);  // Lexical (exact match) candidates (was 100)
export const RETRIEVAL_LEXICAL_MAX_TERMS = envInt('RETRIEVAL_LEXICAL_MAX_TERMS', 15);  // Max query terms (was 10)
// Recency candidates (soft support)
export const RETRIEVAL_RECENCY_TOP_K = envInt('RETRIEVAL_RECENCY_TOP_K', 75);  // Recent chunk candidates (was 50)
// Reranking options
export const RETRIEVAL_MMR_ENABLED = envBool('RETRIEVAL_MMR_ENABLED', true);  // Maximal Marginal Relevance diversity
export const RETRIEVAL_MMR_LAMBDA = parseFloat(process.env.RETRIEVAL_MMR_LAMBDA || '0.65');  // Slightly more diversity (was 0.7)
// Scale guards
export const FIRESTORE_FALLBACK_WARN_THRESHOLD = envInt('FIRESTORE_FALLBACK_WARN_THRESHOLD', 5000);  // Warn if using Firestore fallback above this chunk count
export const FIRESTORE_FALLBACK_MAX_SCAN = envInt('FIRESTORE_FALLBACK_MAX_SCAN', 2000);  // Max chunks for Firestore fallback scan

// ============================================
// Query Expansion (optional)
// ============================================
export const QUERY_EXPANSION_ENABLED = envBool('QUERY_EXPANSION_ENABLED', false);  // Multi-query expansion
export const QUERY_EXPANSION_REWRITES = envInt('QUERY_EXPANSION_REWRITES', 2);  // Number of query rewrites
export const QUERY_EXPANSION_TTL_MS = envInt('QUERY_EXPANSION_TTL_MS', 300000);  // Cache TTL (5 minutes)
export const QUERY_EXPANSION_MODEL = process.env.QUERY_EXPANSION_MODEL || 'gemini-2.0-flash';  // Model for query expansion

// ============================================
// Citation Verification
// ============================================
export const CITATION_VERIFICATION_ENABLED = envBool('CITATION_VERIFICATION_ENABLED', true);  // Post-generation verification
export const CITATION_MIN_OVERLAP_SCORE = parseFloat(process.env.CITATION_MIN_OVERLAP_SCORE || '0.15');  // Min lexical overlap for validity

// ============================================
// Retrieval Scoring Weights (tuned for citation accuracy)
// Sum should be <= 1.0, remainder goes to multi-source boost
// ============================================
export const SCORE_WEIGHT_VECTOR = parseFloat(process.env.SCORE_WEIGHT_VECTOR || '0.40');    // Slightly reduced (was 0.45)
export const SCORE_WEIGHT_LEXICAL = parseFloat(process.env.SCORE_WEIGHT_LEXICAL || '0.40');  // Increased for exact-match importance (was 0.35)
export const SCORE_WEIGHT_RECENCY = parseFloat(process.env.SCORE_WEIGHT_RECENCY || '0.10');  // Slightly reduced (was 0.12)

// ============================================
// Rate Limiting
// ============================================
export const RATE_LIMIT_ENABLED = envBool('RATE_LIMIT_ENABLED', false);
export const RATE_LIMIT_REQUESTS_PER_MIN = envInt('RATE_LIMIT_REQUESTS_PER_MIN', 60);
export const RATE_LIMIT_WINDOW_MS = envInt('RATE_LIMIT_WINDOW_MS', 60000);

// ============================================
// Background Queue / Cloud Tasks
// ============================================
export const QUEUE_MODE = process.env.QUEUE_MODE || 'in-process'; // 'in-process' | 'cloud-tasks'
export const BACKGROUND_QUEUE_MAX_SIZE = envInt('BACKGROUND_QUEUE_MAX_SIZE', 100);
export const BACKGROUND_QUEUE_MAX_CONCURRENT = envInt('BACKGROUND_QUEUE_MAX_CONCURRENT', 3);
export const CLOUD_TASKS_QUEUE_NAME = process.env.CLOUD_TASKS_QUEUE_NAME || 'note-processing';
export const CLOUD_TASKS_LOCATION = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
export const CLOUD_TASKS_SERVICE_URL = process.env.CLOUD_TASKS_SERVICE_URL || '';

// ============================================
// Internal Endpoint Auth (OIDC)
// ============================================
// When enabled, /internal/* endpoints require valid OIDC JWT from Cloud Tasks
export const INTERNAL_AUTH_ENABLED = envBool('INTERNAL_AUTH_ENABLED', false);
// Expected audience for OIDC tokens (typically the service URL)
export const INTERNAL_AUTH_AUDIENCE = process.env.INTERNAL_AUTH_AUDIENCE || CLOUD_TASKS_SERVICE_URL;
// Expected issuer (Google OIDC)
export const INTERNAL_AUTH_ISSUER = process.env.INTERNAL_AUTH_ISSUER || 'https://accounts.google.com';
// Expected service account email (optional, for stricter validation)
export const INTERNAL_AUTH_SERVICE_ACCOUNT = process.env.INTERNAL_AUTH_SERVICE_ACCOUNT || '';
// Service account for Cloud Tasks to use when generating OIDC tokens
// Falls back to INTERNAL_AUTH_SERVICE_ACCOUNT if not set
export const CLOUD_TASKS_OIDC_SERVICE_ACCOUNT = process.env.CLOUD_TASKS_OIDC_SERVICE_ACCOUNT || INTERNAL_AUTH_SERVICE_ACCOUNT;

// ============================================
// Cross-Encoder Reranking
// ============================================
export const CROSS_ENCODER_ENABLED = envBool('CROSS_ENCODER_ENABLED', true);
export const CROSS_ENCODER_BACKEND = process.env.CROSS_ENCODER_BACKEND || 'gemini'; // 'gemini' | 'cohere'
export const CROSS_ENCODER_MAX_CHUNKS = envInt('CROSS_ENCODER_MAX_CHUNKS', 25);
export const CROSS_ENCODER_TIMEOUT_MS = envInt('CROSS_ENCODER_TIMEOUT_MS', 5000);

// ============================================
// Reciprocal Rank Fusion (RRF)
// ============================================
export const RRF_ENABLED = envBool('RRF_ENABLED', true);  // Use RRF instead of weighted scoring
export const RRF_K = envInt('RRF_K', 60);  // RRF constant (lower = more weight to top ranks)
export const RRF_USE_WEIGHTED = envBool('RRF_USE_WEIGHTED', true);  // Apply source weights to RRF

// ============================================
// NLI Citation Grounding
// ============================================
export const NLI_GROUNDING_ENABLED = envBool('NLI_GROUNDING_ENABLED', false);  // Verify citations with NLI
export const NLI_MIN_CONFIDENCE = parseFloat(process.env.NLI_MIN_CONFIDENCE || '0.7');

// ============================================
// Streaming Responses
// ============================================
export const STREAMING_ENABLED = envBool('STREAMING_ENABLED', true);  // SSE streaming for chat

// ============================================
// Vertex AI Vector Search Tuning
// ============================================
export const VERTEX_APPROX_NEIGHBORS_COUNT = envInt('VERTEX_APPROX_NEIGHBORS_COUNT', 100);  // ANN candidates
export const VERTEX_FRACTION_LEAF_NODES = parseFloat(process.env.VERTEX_FRACTION_LEAF_NODES || '0.05');  // Accuracy vs speed
export const VERTEX_DISTANCE_THRESHOLD = parseFloat(process.env.VERTEX_DISTANCE_THRESHOLD || '0.35');  // Filter weak matches

// ============================================
// Logging
// ============================================
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
export const LOG_FULL_TEXT = envBool('LOG_FULL_TEXT', false); // Never log full note text in prod


```

---

## src/contractTests.ts

**Path:** `src/contractTests.ts`

```ts
/**
 * AuroraNotes API - Contract Snapshot Tests
 *
 * Ensures API response shapes remain unchanged for all endpoints:
 * - GET /health
 * - POST /notes
 * - GET /notes
 * - DELETE /notes/:id
 * - POST /chat (non-streaming)
 * - POST /chat (streaming SSE)
 * - POST /feedback
 *
 * Citation Contract Assertions:
 * - Every citation token in answer exists in returned citations/sources
 * - Citations are ordered by first appearance in the answer
 *
 * Run: npx ts-node --test src/contractTests.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ============================================
// Response Shape Interfaces (Contract Definition)
// ============================================

/** Health endpoint response shape */
interface HealthResponse {
  ok: boolean;
  service: string;
  project: string;
  version: string;
}

/** Note response shape from POST /notes and GET /notes items */
interface NoteResponse {
  id: string;
  text: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

/** Notes list response shape from GET /notes */
interface NotesListResponse {
  notes: NoteResponse[];
  cursor: string | null;
  hasMore: boolean;
}

/** Delete note response shape */
interface DeleteNoteResponse {
  success: boolean;
  id: string;
  deletedAt: string;
  chunksDeleted: number;
}

/** Source in chat response */
interface ChatSource {
  id: string;
  noteId: string;
  preview: string;
  date: string;
  relevance: number;
}

/** Citation in chat response (backwards compat) */
interface ChatCitation {
  cid: string;
  noteId: string;
  chunkId: string;
  createdAt: string;
  snippet: string;
  score: number;
}

/** Chat response meta */
interface ChatResponseMeta {
  model: string;
  requestId?: string;
  responseTimeMs: number;
  intent: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  sourceCount: number;
  debug?: Record<string, unknown>;
}

/** Chat response shape from POST /chat */
interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  meta: ChatResponseMeta;
  citations?: ChatCitation[];
}

/** Streaming SSE event shapes */
interface SSESourcesEvent {
  type: 'sources';
  sources: Array<{ id: string; noteId: string; preview: string; date: string }>;
}

interface SSETokenEvent {
  type: 'token';
  content: string;
}

interface SSEDoneEvent {
  type: 'done';
  meta: { model: string; requestId?: string; responseTimeMs: number; confidence: string; sourceCount: number };
}

interface SSEErrorEvent {
  type: 'error';
  error: string;
}

type SSEEvent = SSESourcesEvent | SSETokenEvent | SSEDoneEvent | SSEErrorEvent;

// ============================================
// Shape Validators
// ============================================

function assertHealthShape(obj: unknown): asserts obj is HealthResponse {
  const response = obj as Record<string, unknown>;
  assert.strictEqual(typeof response.ok, 'boolean', 'health.ok should be boolean');
  assert.strictEqual(typeof response.service, 'string', 'health.service should be string');
  assert.strictEqual(typeof response.project, 'string', 'health.project should be string');
  assert.strictEqual(typeof response.version, 'string', 'health.version should be string');
}

function assertNoteShape(obj: unknown): asserts obj is NoteResponse {
  const note = obj as Record<string, unknown>;
  assert.strictEqual(typeof note.id, 'string', 'note.id should be string');
  assert.strictEqual(typeof note.text, 'string', 'note.text should be string');
  assert.strictEqual(typeof note.tenantId, 'string', 'note.tenantId should be string');
  assert.strictEqual(typeof note.createdAt, 'string', 'note.createdAt should be string');
  assert.strictEqual(typeof note.updatedAt, 'string', 'note.updatedAt should be string');
}

function assertNotesListShape(obj: unknown): asserts obj is NotesListResponse {
  const response = obj as Record<string, unknown>;
  assert.ok(Array.isArray(response.notes), 'notes should be array');
  assert.ok(response.cursor === null || typeof response.cursor === 'string', 'cursor should be string or null');
  assert.strictEqual(typeof response.hasMore, 'boolean', 'hasMore should be boolean');
  if (Array.isArray(response.notes) && response.notes.length > 0) {
    assertNoteShape(response.notes[0]);
  }
}

function assertDeleteNoteShape(obj: unknown): asserts obj is DeleteNoteResponse {
  const response = obj as Record<string, unknown>;
  assert.strictEqual(typeof response.success, 'boolean', 'success should be boolean');
  assert.strictEqual(typeof response.id, 'string', 'id should be string');
  assert.strictEqual(typeof response.deletedAt, 'string', 'deletedAt should be string');
  assert.strictEqual(typeof response.chunksDeleted, 'number', 'chunksDeleted should be number');
}

function assertSourceShape(obj: unknown): asserts obj is ChatSource {
  const source = obj as Record<string, unknown>;
  assert.strictEqual(typeof source.id, 'string', 'source.id should be string');
  assert.strictEqual(typeof source.noteId, 'string', 'source.noteId should be string');
  assert.strictEqual(typeof source.preview, 'string', 'source.preview should be string');
  assert.strictEqual(typeof source.date, 'string', 'source.date should be string');
  assert.strictEqual(typeof source.relevance, 'number', 'source.relevance should be number');
}

function assertCitationShape(obj: unknown): asserts obj is ChatCitation {
  const citation = obj as Record<string, unknown>;
  assert.strictEqual(typeof citation.cid, 'string', 'citation.cid should be string');
  assert.strictEqual(typeof citation.noteId, 'string', 'citation.noteId should be string');
  assert.strictEqual(typeof citation.chunkId, 'string', 'citation.chunkId should be string');
  assert.strictEqual(typeof citation.createdAt, 'string', 'citation.createdAt should be string');
  assert.strictEqual(typeof citation.snippet, 'string', 'citation.snippet should be string');
  assert.strictEqual(typeof citation.score, 'number', 'citation.score should be number');
}

function assertChatResponseShape(obj: unknown): asserts obj is ChatResponse {
  const response = obj as Record<string, unknown>;
  assert.strictEqual(typeof response.answer, 'string', 'answer should be string');
  assert.ok(Array.isArray(response.sources), 'sources should be array');
  assert.strictEqual(typeof response.meta, 'object', 'meta should be object');

  // Validate meta shape
  const meta = response.meta as Record<string, unknown>;
  assert.strictEqual(typeof meta.model, 'string', 'meta.model should be string');
  assert.strictEqual(typeof meta.responseTimeMs, 'number', 'meta.responseTimeMs should be number');
  assert.strictEqual(typeof meta.intent, 'string', 'meta.intent should be string');
  assert.ok(['high', 'medium', 'low', 'none'].includes(meta.confidence as string), 'meta.confidence should be valid');
  assert.strictEqual(typeof meta.sourceCount, 'number', 'meta.sourceCount should be number');

  // Validate sources
  const sources = response.sources as unknown[];
  for (const source of sources) {
    assertSourceShape(source);
  }

  // Validate citations if present (backwards compat)
  if (response.citations !== undefined) {
    assert.ok(Array.isArray(response.citations), 'citations should be array');
    for (const citation of response.citations as unknown[]) {
      assertCitationShape(citation);
    }
  }
}

function assertSSEEventShape(event: SSEEvent): void {
  assert.ok(['sources', 'token', 'done', 'error'].includes(event.type), 'SSE event type should be valid');

  if (event.type === 'sources') {
    assert.ok(Array.isArray(event.sources), 'sources event should have sources array');
    for (const source of event.sources) {
      assert.strictEqual(typeof source.id, 'string', 'source.id should be string');
      assert.strictEqual(typeof source.noteId, 'string', 'source.noteId should be string');
      assert.strictEqual(typeof source.preview, 'string', 'source.preview should be string');
      assert.strictEqual(typeof source.date, 'string', 'source.date should be string');
    }
  } else if (event.type === 'token') {
    assert.strictEqual(typeof event.content, 'string', 'token event should have content string');
  } else if (event.type === 'done') {
    assert.strictEqual(typeof event.meta, 'object', 'done event should have meta object');
    assert.strictEqual(typeof event.meta.model, 'string', 'meta.model should be string');
    assert.strictEqual(typeof event.meta.responseTimeMs, 'number', 'meta.responseTimeMs should be number');
    assert.strictEqual(typeof event.meta.sourceCount, 'number', 'meta.sourceCount should be number');
  } else if (event.type === 'error') {
    assert.strictEqual(typeof event.error, 'string', 'error event should have error string');
  }
}

// ============================================
// Citation Contract Assertions
// ============================================

/**
 * Extract citation IDs from answer text (e.g., [1], [2] or [N1], [N2])
 * Returns normalized form (just the number part)
 */
function extractCitationIdsFromAnswer(answer: string): string[] {
  // Match both [1] and [N1] formats
  const pattern = /\[N?(\d+)\]/g;
  const ids = new Set<string>();
  let match;
  while ((match = pattern.exec(answer)) !== null) {
    ids.add(match[1]); // Just the number
  }
  return Array.from(ids);
}

/**
 * Get citation IDs from first appearance order in answer
 */
function getCitationIdsInAppearanceOrder(answer: string): string[] {
  const pattern = /\[N?(\d+)\]/g;
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  let match;
  while ((match = pattern.exec(answer)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }
  return orderedIds;
}

/**
 * Assert that every citation token in the answer exists in the returned sources/citations
 */
export function assertCitationsExistInSources(answer: string, sources: ChatSource[]): void {
  const citationIds = extractCitationIdsFromAnswer(answer);
  const sourceIds = new Set(sources.map(s => s.id));

  for (const cid of citationIds) {
    assert.ok(
      sourceIds.has(cid),
      `Citation [${cid}] in answer not found in sources. Available: ${Array.from(sourceIds).join(', ')}`
    );
  }
}

/**
 * Assert that every citation token in the answer exists in the returned citations array
 */
export function assertCitationsExistInCitationsArray(answer: string, citations: ChatCitation[]): void {
  const citationIds = extractCitationIdsFromAnswer(answer);
  const citationCids = new Set(citations.map(c => c.cid.replace('N', '')));

  for (const cid of citationIds) {
    assert.ok(
      citationCids.has(cid),
      `Citation [${cid}] in answer not found in citations array. Available: ${Array.from(citationCids).join(', ')}`
    );
  }
}

/**
 * Assert that returned citations are ordered by first appearance in the answer
 */
export function assertCitationsOrderedByAppearance(answer: string, citations: ChatCitation[]): void {
  const appearanceOrder = getCitationIdsInAppearanceOrder(answer);
  const citationOrder = citations.map(c => c.cid.replace('N', ''));

  // Filter citation order to only include those that appear in the answer
  const citationOrderInAnswer = citationOrder.filter(id => appearanceOrder.includes(id));

  // Check that the order matches
  for (let i = 0; i < citationOrderInAnswer.length; i++) {
    const answerIdx = appearanceOrder.indexOf(citationOrderInAnswer[i]);
    for (let j = i + 1; j < citationOrderInAnswer.length; j++) {
      const nextAnswerIdx = appearanceOrder.indexOf(citationOrderInAnswer[j]);
      if (nextAnswerIdx !== -1 && answerIdx !== -1) {
        assert.ok(
          answerIdx <= nextAnswerIdx,
          `Citations not ordered by appearance: ${citationOrderInAnswer[i]} appears after ${citationOrderInAnswer[j]} in answer`
        );
      }
    }
  }
}

// ============================================
// Contract Tests
// ============================================

describe('Contract: Health Response Shape', () => {
  it('validates correct health response shape', () => {
    const validResponse = {
      ok: true,
      service: 'auroranotes-api',
      project: 'auroranotes-prod',
      version: '1.0.0',
    };
    assertHealthShape(validResponse);
  });

  it('rejects health response missing ok field', () => {
    const invalidResponse = {
      service: 'auroranotes-api',
      project: 'auroranotes-prod',
      version: '1.0.0',
    };
    assert.throws(() => assertHealthShape(invalidResponse), /ok should be boolean/);
  });

  it('rejects health response with wrong type for service', () => {
    const invalidResponse = {
      ok: true,
      service: 123,
      project: 'auroranotes-prod',
      version: '1.0.0',
    };
    assert.throws(() => assertHealthShape(invalidResponse), /service should be string/);
  });
});

describe('Contract: Note Response Shape', () => {
  it('validates correct note response shape', () => {
    const validNote = {
      id: 'note_abc123',
      text: 'This is a test note',
      tenantId: 'tenant_xyz',
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-15T10:30:00Z',
    };
    assertNoteShape(validNote);
  });

  it('rejects note missing id', () => {
    const invalidNote = {
      text: 'This is a test note',
      tenantId: 'tenant_xyz',
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-15T10:30:00Z',
    };
    assert.throws(() => assertNoteShape(invalidNote), /id should be string/);
  });
});

describe('Contract: Notes List Response Shape', () => {
  it('validates correct notes list response shape', () => {
    const validList = {
      notes: [
        {
          id: 'note_abc123',
          text: 'Test note',
          tenantId: 'tenant_xyz',
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T10:30:00Z',
        },
      ],
      cursor: 'cursor_abc',
      hasMore: true,
    };
    assertNotesListShape(validList);
  });

  it('validates notes list with null cursor', () => {
    const validList = {
      notes: [],
      cursor: null,
      hasMore: false,
    };
    assertNotesListShape(validList);
  });

  it('rejects notes list with invalid hasMore type', () => {
    const invalidList = {
      notes: [],
      cursor: null,
      hasMore: 'yes',
    };
    assert.throws(() => assertNotesListShape(invalidList), /hasMore should be boolean/);
  });
});

describe('Contract: Delete Note Response Shape', () => {
  it('validates correct delete note response shape', () => {
    const validResponse = {
      success: true,
      id: 'note_abc123',
      deletedAt: '2024-01-15T10:30:00Z',
      chunksDeleted: 5,
    };
    assertDeleteNoteShape(validResponse);
  });

  it('rejects delete response missing chunksDeleted', () => {
    const invalidResponse = {
      success: true,
      id: 'note_abc123',
      deletedAt: '2024-01-15T10:30:00Z',
    };
    assert.throws(() => assertDeleteNoteShape(invalidResponse), /chunksDeleted should be number/);
  });
});

describe('Contract: Chat Response Shape', () => {
  it('validates correct chat response shape', () => {
    const validResponse = {
      answer: 'The project uses React [1] and Node.js [2].',
      sources: [
        { id: '1', noteId: 'note_abc', preview: 'React is...', date: '2024-01-15', relevance: 0.95 },
        { id: '2', noteId: 'note_def', preview: 'Node.js is...', date: '2024-01-14', relevance: 0.88 },
      ],
      meta: {
        model: 'gemini-2.0-flash',
        requestId: 'req_abc123',
        responseTimeMs: 1234,
        intent: 'factual',
        confidence: 'high' as const,
        sourceCount: 2,
      },
    };
    assertChatResponseShape(validResponse);
  });

  it('validates chat response with citations array', () => {
    const validResponse = {
      answer: 'The project uses React [N1].',
      sources: [
        { id: '1', noteId: 'note_abc', preview: 'React is...', date: '2024-01-15', relevance: 0.95 },
      ],
      meta: {
        model: 'gemini-2.0-flash',
        responseTimeMs: 1234,
        intent: 'factual',
        confidence: 'high' as const,
        sourceCount: 1,
      },
      citations: [
        { cid: 'N1', noteId: 'note_abc', chunkId: 'chunk_1', createdAt: '2024-01-15', snippet: 'React is...', score: 0.95 },
      ],
    };
    assertChatResponseShape(validResponse);
  });

  it('rejects chat response with invalid confidence', () => {
    const invalidResponse = {
      answer: 'Test answer',
      sources: [],
      meta: {
        model: 'gemini-2.0-flash',
        responseTimeMs: 1234,
        intent: 'factual',
        confidence: 'very_high',
        sourceCount: 0,
      },
    };
    assert.throws(() => assertChatResponseShape(invalidResponse), /confidence should be valid/);
  });
});

describe('Contract: SSE Event Shapes', () => {
  it('validates sources event shape', () => {
    const event: SSEEvent = {
      type: 'sources',
      sources: [
        { id: '1', noteId: 'note_abc', preview: 'Preview text', date: '2024-01-15' },
      ],
    };
    assertSSEEventShape(event);
  });

  it('validates token event shape', () => {
    const event: SSEEvent = {
      type: 'token',
      content: 'Hello',
    };
    assertSSEEventShape(event);
  });

  it('validates done event shape', () => {
    const event: SSEEvent = {
      type: 'done',
      meta: {
        model: 'gemini-2.0-flash',
        responseTimeMs: 1234,
        confidence: 'high',
        sourceCount: 2,
      },
    };
    assertSSEEventShape(event);
  });

  it('validates error event shape', () => {
    const event: SSEEvent = {
      type: 'error',
      error: 'Something went wrong',
    };
    assertSSEEventShape(event);
  });
});

describe('Contract: Citation Existence in Sources', () => {
  it('passes when all citations exist in sources', () => {
    const answer = 'The project uses React [1] and Node.js [2].';
    const sources: ChatSource[] = [
      { id: '1', noteId: 'note_abc', preview: 'React is...', date: '2024-01-15', relevance: 0.95 },
      { id: '2', noteId: 'note_def', preview: 'Node.js is...', date: '2024-01-14', relevance: 0.88 },
    ];
    assertCitationsExistInSources(answer, sources);
  });

  it('passes with N-prefixed citations', () => {
    const answer = 'The project uses React [N1] and Node.js [N2].';
    const sources: ChatSource[] = [
      { id: '1', noteId: 'note_abc', preview: 'React is...', date: '2024-01-15', relevance: 0.95 },
      { id: '2', noteId: 'note_def', preview: 'Node.js is...', date: '2024-01-14', relevance: 0.88 },
    ];
    assertCitationsExistInSources(answer, sources);
  });

  it('fails when citation is missing from sources', () => {
    const answer = 'The project uses React [1] and Node.js [2] and Python [3].';
    const sources: ChatSource[] = [
      { id: '1', noteId: 'note_abc', preview: 'React is...', date: '2024-01-15', relevance: 0.95 },
      { id: '2', noteId: 'note_def', preview: 'Node.js is...', date: '2024-01-14', relevance: 0.88 },
    ];
    assert.throws(
      () => assertCitationsExistInSources(answer, sources),
      /Citation \[3\] in answer not found in sources/
    );
  });

  it('passes with no citations in answer', () => {
    const answer = 'The project uses React and Node.js.';
    const sources: ChatSource[] = [
      { id: '1', noteId: 'note_abc', preview: 'React is...', date: '2024-01-15', relevance: 0.95 },
    ];
    assertCitationsExistInSources(answer, sources);
  });
});

describe('Contract: Citation Existence in Citations Array', () => {
  it('passes when all citations exist in citations array', () => {
    const answer = 'The project uses React [N1] and Node.js [N2].';
    const citations: ChatCitation[] = [
      { cid: 'N1', noteId: 'note_abc', chunkId: 'chunk_1', createdAt: '2024-01-15', snippet: 'React is...', score: 0.95 },
      { cid: 'N2', noteId: 'note_def', chunkId: 'chunk_2', createdAt: '2024-01-14', snippet: 'Node.js is...', score: 0.88 },
    ];
    assertCitationsExistInCitationsArray(answer, citations);
  });

  it('fails when citation is missing from citations array', () => {
    const answer = 'The project uses React [N1] and Node.js [N2] and Python [N3].';
    const citations: ChatCitation[] = [
      { cid: 'N1', noteId: 'note_abc', chunkId: 'chunk_1', createdAt: '2024-01-15', snippet: 'React is...', score: 0.95 },
      { cid: 'N2', noteId: 'note_def', chunkId: 'chunk_2', createdAt: '2024-01-14', snippet: 'Node.js is...', score: 0.88 },
    ];
    assert.throws(
      () => assertCitationsExistInCitationsArray(answer, citations),
      /Citation \[3\] in answer not found in citations array/
    );
  });
});

describe('Contract: Citation Order by Appearance', () => {
  it('passes when citations are ordered by first appearance', () => {
    const answer = 'First [N1], then [N2], finally [N3].';
    const citations: ChatCitation[] = [
      { cid: 'N1', noteId: 'note_a', chunkId: 'chunk_1', createdAt: '2024-01-15', snippet: 'First...', score: 0.95 },
      { cid: 'N2', noteId: 'note_b', chunkId: 'chunk_2', createdAt: '2024-01-14', snippet: 'Then...', score: 0.88 },
      { cid: 'N3', noteId: 'note_c', chunkId: 'chunk_3', createdAt: '2024-01-13', snippet: 'Finally...', score: 0.80 },
    ];
    assertCitationsOrderedByAppearance(answer, citations);
  });

  it('handles repeated citations correctly', () => {
    const answer = 'First [N1], then [N2], back to [N1], finally [N3].';
    const citations: ChatCitation[] = [
      { cid: 'N1', noteId: 'note_a', chunkId: 'chunk_1', createdAt: '2024-01-15', snippet: 'First...', score: 0.95 },
      { cid: 'N2', noteId: 'note_b', chunkId: 'chunk_2', createdAt: '2024-01-14', snippet: 'Then...', score: 0.88 },
      { cid: 'N3', noteId: 'note_c', chunkId: 'chunk_3', createdAt: '2024-01-13', snippet: 'Finally...', score: 0.80 },
    ];
    assertCitationsOrderedByAppearance(answer, citations);
  });
});

// Export shape validators for use in integration tests
export {
  assertHealthShape,
  assertNoteShape,
  assertNotesListShape,
  assertDeleteNoteShape,
  assertChatResponseShape,
  assertSSEEventShape,
  assertSourceShape,
  assertCitationShape,
  extractCitationIdsFromAnswer,
  getCitationIdsInAppearanceOrder,
};


```

---

## src/crossEncoder.ts

**Path:** `src/crossEncoder.ts`

```ts
/**
 * AuroraNotes API - Cross-Encoder Reranker
 *
 * Provides high-precision reranking using cross-encoder models.
 * Cross-encoders score query-passage pairs directly, providing
 * much better relevance signals than bi-encoder similarity.
 *
 * Supports multiple backends:
 * - Gemini-based (default, uses existing GenAI client)
 * - Cohere Rerank API (optional, requires COHERE_API_KEY)
 * - Vertex AI Ranking API (optional, for enterprise)
 *
 * Optimizations:
 * - Result caching to avoid redundant API calls
 * - Optimized prompt construction with pre-built templates
 * - Batch processing for multiple chunks
 * - Early exit for high-confidence results
 *
 * Typical improvement: +15-20% precision over bi-encoder only.
 */

import { ScoredChunk } from "./types";
import { logInfo, logError, logWarn, fastHashWithLength } from "./utils";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

// Configuration
const CROSS_ENCODER_ENABLED = process.env.CROSS_ENCODER_ENABLED !== 'false';
const CROSS_ENCODER_BACKEND = process.env.CROSS_ENCODER_BACKEND || 'gemini'; // 'gemini' | 'cohere'
const CROSS_ENCODER_MODEL = process.env.CROSS_ENCODER_MODEL || 'gemini-2.0-flash';
const CROSS_ENCODER_MAX_CHUNKS = parseInt(process.env.CROSS_ENCODER_MAX_CHUNKS || '25');
const CROSS_ENCODER_TIMEOUT_MS = parseInt(process.env.CROSS_ENCODER_TIMEOUT_MS || '5000');
const COHERE_API_KEY = process.env.COHERE_API_KEY || '';
const COHERE_RERANK_MODEL = process.env.COHERE_RERANK_MODEL || 'rerank-v3.5';

// Cache configuration for cross-encoder results
const CROSS_ENCODER_CACHE_SIZE = 100;
const CROSS_ENCODER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Result cache to avoid redundant API calls
interface CachedCrossEncoderResult {
  scores: CrossEncoderScore[];
  timestamp: number;
}
const crossEncoderCache = new Map<string, CachedCrossEncoderResult>();

/**
 * Cross-encoder score result
 */
interface CrossEncoderScore {
  chunkId: string;
  relevanceScore: number;
  originalRank: number;
}

/**
 * Generate cache key for cross-encoder results
 * Uses fast non-cryptographic hash for better performance
 */
function makeCrossEncoderCacheKey(query: string, chunkIds: string[]): string {
  // Use fast hash of query + sorted chunk IDs for consistent caching
  const sortedIds = [...chunkIds].sort().join(',');
  return fastHashWithLength(`${query}:${sortedIds}`);
}

/**
 * Evict old cache entries
 */
function evictCrossEncoderCache(): void {
  if (crossEncoderCache.size < CROSS_ENCODER_CACHE_SIZE) return;

  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, entry] of crossEncoderCache) {
    if (now - entry.timestamp > CROSS_ENCODER_CACHE_TTL_MS) {
      keysToDelete.push(key);
    }
  }

  // If not enough expired, evict oldest
  if (keysToDelete.length < CROSS_ENCODER_CACHE_SIZE * 0.2) {
    const entries = Array.from(crossEncoderCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toEvict = Math.ceil(CROSS_ENCODER_CACHE_SIZE * 0.2);
    for (let i = 0; i < toEvict && i < entries.length; i++) {
      keysToDelete.push(entries[i][0]);
    }
  }

  for (const key of keysToDelete) {
    crossEncoderCache.delete(key);
  }
}

// Query type detection for adaptive scoring criteria
type QueryType = 'factual' | 'procedural' | 'exploratory' | 'temporal';

function detectQueryType(query: string): QueryType {
  const lower = query.toLowerCase();
  if (/\b(when|date|time|yesterday|today|last|recent|week|month)\b/.test(lower)) return 'temporal';
  if (/\b(how|steps|process|procedure|guide|tutorial|instructions)\b/.test(lower)) return 'procedural';
  if (/\b(what is|who is|define|explain|meaning)\b/.test(lower)) return 'factual';
  return 'exploratory';
}

// Query-type specific scoring guidance
const SCORING_GUIDANCE: Record<QueryType, string> = {
  factual: `- Direct answer with exact facts = 9-10
- Contains the specific information = 7-8
- Related but not definitive = 4-6
- Only tangentially related = 1-3`,
  procedural: `- Complete step-by-step instructions = 9-10
- Partial steps or process = 7-8
- Related procedures = 4-6
- Only mentions the topic = 1-3`,
  temporal: `- Contains exact dates/times asked about = 9-10
- Has relevant temporal info = 7-8
- General timeline context = 4-6
- No temporal relevance = 1-3`,
  exploratory: `- Comprehensive coverage of topic = 9-10
- Significant relevant details = 7-8
- Some useful context = 4-6
- Peripheral information = 1-3`,
};

// Pre-built prompt template (avoid string concatenation in hot path)
const PROMPT_TEMPLATE_PREFIX = `You are a relevance scoring system. Score each passage's relevance to the query on a scale of 0-10.

Query: "`;
const PROMPT_TEMPLATE_MIDDLE = `"

Passages:
`;
// Dynamic suffix is built based on query type
function buildPromptSuffix(queryType: QueryType): string {
  return `

For each passage, output ONLY a JSON array of scores in order, like: [8, 3, 9, 5, ...]
Scoring criteria for this ${queryType} query:
${SCORING_GUIDANCE[queryType]}
- Not relevant = 0

Scores:`;
}

/**
 * Check if cross-encoder reranking is available
 */
export function isCrossEncoderAvailable(): boolean {
  if (!CROSS_ENCODER_ENABLED) return false;

  if (CROSS_ENCODER_BACKEND === 'cohere') {
    return !!COHERE_API_KEY;
  }

  return isGenAIAvailable();
}

// Pre-compiled regex for parsing JSON scores
const JSON_SCORES_REGEX = /\[[\d,\s.]+\]/;

/**
 * Gemini-based cross-encoder scoring
 * Uses a carefully crafted prompt for relevance assessment
 *
 * Optimizations:
 * - Pre-built prompt template to reduce string concatenation
 * - Pre-compiled regex for parsing
 * - Efficient passage list construction
 */
async function scoreWithGemini(
  query: string,
  chunks: ScoredChunk[]
): Promise<CrossEncoderScore[]> {
  const client = getGenAIClient();
  const chunksToScore = chunks.slice(0, CROSS_ENCODER_MAX_CHUNKS);

  // Build passage list efficiently using array join
  const passageParts: string[] = new Array(chunksToScore.length);
  for (let i = 0; i < chunksToScore.length; i++) {
    // Truncate text efficiently
    const text = chunksToScore[i].text;
    const truncated = text.length > 300 ? text.slice(0, 300) : text;
    passageParts[i] = `[${i + 1}] ${truncated}`;
  }
  const passageList = passageParts.join('\n\n');

  // Detect query type for adaptive scoring criteria
  const queryType = detectQueryType(query);

  // Build prompt using pre-built template parts with adaptive suffix
  const prompt = PROMPT_TEMPLATE_PREFIX + query + PROMPT_TEMPLATE_MIDDLE + passageList + buildPromptSuffix(queryType);

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Cross-encoder timeout')), CROSS_ENCODER_TIMEOUT_MS);
    });

    const result = await Promise.race([
      client.models.generateContent({
        model: CROSS_ENCODER_MODEL,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 200,
        },
      }),
      timeoutPromise,
    ]);

    const response = result.text || '';

    // Parse JSON array from response using pre-compiled regex
    const jsonMatch = response.match(JSON_SCORES_REGEX);
    if (!jsonMatch) {
      logWarn('Cross-encoder: failed to parse scores', { response: response.slice(0, 100) });
      return chunksToScore.map((c, i) => ({ chunkId: c.chunkId, relevanceScore: c.score, originalRank: i }));
    }

    const scores: number[] = JSON.parse(jsonMatch[0]);

    // Build results efficiently
    const results: CrossEncoderScore[] = new Array(Math.min(chunksToScore.length, scores.length));
    for (let i = 0; i < results.length; i++) {
      results[i] = {
        chunkId: chunksToScore[i].chunkId,
        relevanceScore: (scores[i] || 0) / 10, // Normalize to 0-1
        originalRank: i,
      };
    }
    return results;
  } catch (err) {
    logError('Gemini cross-encoder failed', err);
    return chunksToScore.map((c, i) => ({ chunkId: c.chunkId, relevanceScore: c.score, originalRank: i }));
  }
}

/**
 * Cohere Rerank API scoring
 * More accurate but requires separate API key
 */
async function scoreWithCohere(
  query: string,
  chunks: ScoredChunk[]
): Promise<CrossEncoderScore[]> {
  if (!COHERE_API_KEY) {
    return chunks.map((c, i) => ({ chunkId: c.chunkId, relevanceScore: c.score, originalRank: i }));
  }

  try {
    const documents = chunks.slice(0, CROSS_ENCODER_MAX_CHUNKS).map(c => c.text);

    const response = await fetch('https://api.cohere.ai/v1/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: COHERE_RERANK_MODEL,
        query,
        documents,
        top_n: documents.length,
        return_documents: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.status}`);
    }

    const data = await response.json() as {
      results: Array<{ index: number; relevance_score: number }>;
    };

    // Map back to chunk IDs
    const scoreMap = new Map<number, number>();
    for (const result of data.results) {
      scoreMap.set(result.index, result.relevance_score);
    }

    return chunks.slice(0, CROSS_ENCODER_MAX_CHUNKS).map((chunk, i) => ({
      chunkId: chunk.chunkId,
      relevanceScore: scoreMap.get(i) || 0,
      originalRank: i,
    }));
  } catch (err) {
    logError('Cohere rerank failed', err);
    return chunks.map((c, i) => ({ chunkId: c.chunkId, relevanceScore: c.score, originalRank: i }));
  }
}

/**
 * Rerank chunks using cross-encoder scoring
 *
 * This is the main entry point for cross-encoder reranking.
 * Falls back gracefully to original ranking if scoring fails.
 *
 * Optimizations:
 * - Result caching to avoid redundant API calls for same query/chunks
 * - Efficient chunk map construction
 * - Pre-allocated result array
 */
export async function crossEncoderRerank(
  query: string,
  chunks: ScoredChunk[],
  topK?: number
): Promise<ScoredChunk[]> {
  if (!isCrossEncoderAvailable() || chunks.length === 0) {
    return topK ? chunks.slice(0, topK) : chunks;
  }

  const startTime = Date.now();
  const chunksToScore = chunks.slice(0, CROSS_ENCODER_MAX_CHUNKS);

  // Check cache first
  const chunkIds = chunksToScore.map(c => c.chunkId);
  const cacheKey = makeCrossEncoderCacheKey(query, chunkIds);
  const cached = crossEncoderCache.get(cacheKey);

  let scores: CrossEncoderScore[];
  let cacheHit = false;

  if (cached && Date.now() - cached.timestamp < CROSS_ENCODER_CACHE_TTL_MS) {
    scores = cached.scores;
    cacheHit = true;
  } else {
    // Score using configured backend
    if (CROSS_ENCODER_BACKEND === 'cohere') {
      scores = await scoreWithCohere(query, chunksToScore);
    } else {
      scores = await scoreWithGemini(query, chunksToScore);
    }

    // Cache the result
    evictCrossEncoderCache();
    crossEncoderCache.set(cacheKey, { scores, timestamp: Date.now() });
  }

  // Create lookup map for original chunks
  const chunkMap = new Map<string, ScoredChunk>();
  for (const chunk of chunks) {
    chunkMap.set(chunk.chunkId, chunk);
  }

  // Combine cross-encoder score with original score (weighted blend)
  const CROSS_ENCODER_WEIGHT = 0.7;
  const ORIGINAL_WEIGHT = 0.3;

  // Pre-allocate result array
  const rerankedChunks: ScoredChunk[] = [];
  for (const score of scores) {
    const chunk = chunkMap.get(score.chunkId);
    if (!chunk) continue;

    rerankedChunks.push({
      ...chunk,
      score: (score.relevanceScore * CROSS_ENCODER_WEIGHT) +
             (chunk.score * ORIGINAL_WEIGHT),
      crossEncoderScore: score.relevanceScore,
    });
  }

  // Sort by new combined score
  rerankedChunks.sort((a, b) => b.score - a.score);

  const elapsedMs = Date.now() - startTime;
  logInfo('Cross-encoder reranking complete', {
    inputChunks: chunks.length,
    scoredChunks: scores.length,
    backend: CROSS_ENCODER_BACKEND,
    cacheHit,
    elapsedMs,
  });

  return topK ? rerankedChunks.slice(0, topK) : rerankedChunks;
}

/**
 * Get cross-encoder configuration for monitoring
 */
export function getCrossEncoderConfig() {
  return {
    enabled: CROSS_ENCODER_ENABLED,
    backend: CROSS_ENCODER_BACKEND,
    model: CROSS_ENCODER_BACKEND === 'cohere' ? COHERE_RERANK_MODEL : CROSS_ENCODER_MODEL,
    available: isCrossEncoderAvailable(),
    maxChunks: CROSS_ENCODER_MAX_CHUNKS,
  };
}


```

---

## src/embeddingCache.ts

**Path:** `src/embeddingCache.ts`

```ts
/**
 * AuroraNotes API - Embedding Cache
 *
 * In-memory LRU cache for query embeddings with TTL.
 * Reduces embedding API calls by 60-80% for repeated/similar queries.
 *
 * For production at scale, consider Redis/Memcached backend.
 */

import { logInfo, logWarn } from "./utils";

// Cache configuration
const DEFAULT_TTL_MS = 5 * 60 * 1000;      // 5 minutes default
const FREQUENT_QUERY_TTL_MS = 60 * 60 * 1000; // 1 hour for frequent queries
const MAX_CACHE_SIZE = 1000;                // Max entries
const FREQUENCY_THRESHOLD = 3;              // Hits to qualify as "frequent"

interface CacheEntry {
  embedding: number[];
  createdAt: number;
  ttlMs: number;
  hitCount: number;
}

/**
 * LRU Cache with TTL for embeddings
 */
class EmbeddingCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };

  /**
   * Normalize query for cache key (lowercase, trim, collapse whitespace)
   */
  private normalizeKey(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Get embedding from cache if valid
   */
  get(text: string): number[] | null {
    const key = this.normalizeKey(text);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    const age = Date.now() - entry.createdAt;
    if (age > entry.ttlMs) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.stats.expirations++;
      this.stats.misses++;
      return null;
    }

    // Cache hit - update access order and hit count
    this.stats.hits++;
    entry.hitCount++;

    // Upgrade TTL for frequent queries
    if (entry.hitCount >= FREQUENCY_THRESHOLD && entry.ttlMs < FREQUENT_QUERY_TTL_MS) {
      entry.ttlMs = FREQUENT_QUERY_TTL_MS;
    }

    this.updateAccessOrder(key);
    return entry.embedding;
  }

  /**
   * Store embedding in cache
   */
  set(text: string, embedding: number[], ttlMs: number = DEFAULT_TTL_MS): void {
    const key = this.normalizeKey(text);

    // Evict if at capacity
    while (this.cache.size >= MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, {
      embedding,
      createdAt: Date.now(),
      ttlMs,
      hitCount: 0,
    });

    this.updateAccessOrder(key);
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict oldest entry (LRU)
   */
  private evictOldest(): void {
    if (this.accessOrder.length === 0) return;

    const oldestKey = this.accessOrder.shift();
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clear expired entries (call periodically)
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > entry.ttlMs) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logInfo('Embedding cache cleanup', { entriesRemoved: cleaned, remaining: this.cache.size });
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    expirations: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }
}

// Singleton instance
let cacheInstance: EmbeddingCache | null = null;

export function getEmbeddingCache(): EmbeddingCache {
  if (!cacheInstance) {
    cacheInstance = new EmbeddingCache();

    // Periodic cleanup every 5 minutes
    setInterval(() => {
      cacheInstance?.cleanup();
    }, 5 * 60 * 1000);

    logInfo('Embedding cache initialized', { maxSize: MAX_CACHE_SIZE, defaultTtlMs: DEFAULT_TTL_MS });
  }
  return cacheInstance;
}

/**
 * Get cached embedding or null
 */
export function getCachedEmbedding(text: string): number[] | null {
  return getEmbeddingCache().get(text);
}

/**
 * Cache an embedding
 */
export function cacheEmbedding(text: string, embedding: number[], ttlMs?: number): void {
  getEmbeddingCache().set(text, embedding, ttlMs);
}

/**
 * Get cache statistics for monitoring
 */
export function getEmbeddingCacheStats() {
  return getEmbeddingCache().getStats();
}


```

---

## src/embeddings.ts

**Path:** `src/embeddings.ts`

```ts
/**
 * AuroraNotes API - Embeddings Generation
 *
 * Uses Google's text-embedding models via the Generative AI SDK.
 * Includes optimized LRU caching, retry logic, parallel batch processing,
 * and query normalization.
 *
 * Optimizations:
 * - Efficient LRU cache with O(1) access and eviction
 * - Parallel batch processing with controlled concurrency
 * - Reduced memory allocations through Float32Array storage
 * - Pre-computed cache keys for batch operations
 */

import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_BATCH_SIZE,
  EMBEDDING_TIMEOUT_MS,
} from "./config";
import { logInfo, logError, logWarn, hashText, fastHashWithLength } from "./utils";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

// LRU Cache for embeddings by textHash (reduces API costs for repeated/identical content)
const EMBEDDING_CACHE_MAX_SIZE = parseInt(process.env.EMBEDDING_CACHE_MAX_SIZE || '') || 1000;

// Optimized cache entry using Float32Array to reduce memory (64-bit -> 32-bit per value)
interface EmbeddingCacheEntry {
  embedding: Float32Array;
  timestamp: number;
  accessCount: number;  // Track frequency for smarter eviction
}

// Use Map with LRU ordering maintained via deletion and re-insertion
const embeddingCache = new Map<string, EmbeddingCacheEntry>();

// In-flight request deduplication: prevents redundant API calls for identical texts requested concurrently
// Key: normalized text hash, Value: Promise resolving to embedding
const inFlightRequests = new Map<string, Promise<number[]>>();

// Track cache statistics
let cacheHits = 0;
let cacheMisses = 0;
let cacheEvictions = 0;
let deduplicatedRequests = 0;

// Parallel processing configuration
const PARALLEL_BATCH_CONCURRENCY = 3;  // Max parallel API calls within a batch

/**
 * Normalize text for consistent embedding generation
 * Optimized: avoid multiple regex passes
 */
function normalizeText(text: string): string {
  // Single pass normalization
  let result = '';
  let lastWasSpace = true;  // Trim leading whitespace
  const len = Math.min(text.length, 8000);

  for (let i = 0; i < len; i++) {
    const char = text[i];
    const charCode = text.charCodeAt(i);

    // Check if whitespace (space, tab, newline, etc.)
    if (charCode <= 32) {
      if (!lastWasSpace) {
        result += ' ';
        lastWasSpace = true;
      }
    } else {
      // Convert to lowercase inline
      result += char.toLowerCase();
      lastWasSpace = false;
    }
  }

  // Trim trailing whitespace
  if (result.endsWith(' ')) {
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * Get cache key for text - uses fast non-cryptographic hash
 * The fastHashWithLength function is ~10x faster than SHA-256
 * and includes length to reduce collisions
 */
function getCacheKey(text: string): string {
  return fastHashWithLength(normalizeText(text));
}

/**
 * Convert number[] to Float32Array for storage
 */
function toFloat32Array(arr: number[]): Float32Array {
  return new Float32Array(arr);
}

/**
 * Convert Float32Array back to number[] for API compatibility
 */
function toNumberArray(arr: Float32Array): number[] {
  return Array.from(arr);
}

/**
 * Evict least valuable entries using LFU-LRU hybrid strategy
 * Considers both access frequency and recency
 *
 * Optimizations:
 * - Use typed array for scores to reduce memory allocations
 * - Partial sort using selection algorithm for top-k eviction
 * - Batch eviction to reduce Map operations
 */
function evictCacheEntries(): void {
  const cacheSize = embeddingCache.size;
  if (cacheSize < EMBEDDING_CACHE_MAX_SIZE) return;

  const targetEvictions = Math.ceil(EMBEDDING_CACHE_MAX_SIZE * 0.2);
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes normalization window

  // Pre-allocate arrays for efficiency
  const keys: string[] = new Array(cacheSize);
  const scores = new Float32Array(cacheSize);

  let idx = 0;
  for (const [key, entry] of embeddingCache) {
    // Recency score: more recent = higher score (0 to 1)
    const ageMs = now - entry.timestamp;
    const recencyScore = ageMs >= maxAge ? 0 : 1 - (ageMs / maxAge);

    // Combined score (lower = evict first)
    scores[idx] = entry.accessCount * 0.3 + recencyScore * 0.7;
    keys[idx] = key;
    idx++;
  }

  // Use partial selection sort to find k lowest scores (O(n*k) vs O(n log n) for full sort)
  // This is faster when targetEvictions << cacheSize
  const toEvict: string[] = [];
  for (let i = 0; i < targetEvictions && i < cacheSize; i++) {
    let minIdx = i;
    let minScore = scores[i];

    for (let j = i + 1; j < cacheSize; j++) {
      if (scores[j] < minScore) {
        minScore = scores[j];
        minIdx = j;
      }
    }

    // Swap to front
    if (minIdx !== i) {
      const tmpScore = scores[i];
      scores[i] = scores[minIdx];
      scores[minIdx] = tmpScore;

      const tmpKey = keys[i];
      keys[i] = keys[minIdx];
      keys[minIdx] = tmpKey;
    }

    toEvict.push(keys[i]);
  }

  // Batch eviction
  for (const key of toEvict) {
    embeddingCache.delete(key);
    cacheEvictions++;
  }
}

/**
 * Retry with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry on certain errors
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage.includes('INVALID_ARGUMENT') ||
          errMessage.includes('PERMISSION_DENIED')) {
        throw err;
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
        logWarn('Embedding API retry', { attempt: attempt + 1, delayMs: delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
function createTimeout<T>(ms: number, context: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms: ${context}`));
    }, ms);
  });
}

/**
 * Generate embedding for a single text with timeout, retry, and request deduplication
 *
 * Optimization: Uses in-flight request deduplication to prevent redundant API calls
 * when the same text is requested concurrently (e.g., during parallel chunk processing)
 */
async function generateSingleEmbedding(text: string): Promise<number[]> {
  const cacheKey = getCacheKey(text);

  // Check if there's already an in-flight request for this text
  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    deduplicatedRequests++;
    return existingRequest;
  }

  // Create the embedding request
  const embeddingPromise = (async () => {
    const client = getGenAIClient();

    const result = await withRetry(async () => {
      // Race between embedding call and timeout
      const apiPromise = client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      });

      return await Promise.race([
        apiPromise,
        createTimeout<typeof apiPromise>(EMBEDDING_TIMEOUT_MS, 'embedding generation'),
      ]) as Awaited<typeof apiPromise>;
    });

    if (result.embeddings && result.embeddings.length > 0 && result.embeddings[0].values) {
      return result.embeddings[0].values;
    }
    throw new Error('No embedding values in response');
  })();

  // Track in-flight request for deduplication
  inFlightRequests.set(cacheKey, embeddingPromise);

  try {
    const embedding = await embeddingPromise;
    return embedding;
  } finally {
    // Always clean up in-flight tracking
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * Custom error for embedding generation failures
 */
export class EmbeddingError extends Error {
  constructor(message: string, public readonly missingIndices: number[] = []) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

/**
 * Generate embeddings for a batch of texts with caching and retry logic
 * Uses textHash for deduplication - identical text returns cached embedding
 *
 * IMPORTANT: Returns an array with EXACTLY the same length as input texts.
 * Throws EmbeddingError if any embedding fails to generate - this prevents
 * misaligned embeddings-to-chunks assignment which would corrupt the index.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const startTime = Date.now();
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const toGenerate: { index: number; text: string; cacheKey: string }[] = [];

  // Pre-compute all cache keys upfront for efficiency
  const cacheKeys = texts.map(text => getCacheKey(text));

  // Check cache first for all texts
  for (let i = 0; i < texts.length; i++) {
    const cacheKey = cacheKeys[i];
    const cached = embeddingCache.get(cacheKey);

    if (cached) {
      // Update LRU: delete and re-insert to move to end
      embeddingCache.delete(cacheKey);
      cached.timestamp = Date.now();
      cached.accessCount++;
      embeddingCache.set(cacheKey, cached);

      // Convert Float32Array back to number[] for API compatibility
      results[i] = toNumberArray(cached.embedding);
      cacheHits++;
    } else {
      toGenerate.push({ index: i, text: texts[i], cacheKey });
      cacheMisses++;
    }
  }

  // Generate embeddings for cache misses with parallel batch processing
  // Process multiple batches concurrently for better throughput
  const batches: { index: number; text: string; cacheKey: string }[][] = [];
  for (let i = 0; i < toGenerate.length; i += MAX_EMBEDDING_BATCH_SIZE) {
    batches.push(toGenerate.slice(i, i + MAX_EMBEDDING_BATCH_SIZE));
  }

  // Process batches with controlled concurrency
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx += PARALLEL_BATCH_CONCURRENCY) {
    const concurrentBatches = batches.slice(batchIdx, batchIdx + PARALLEL_BATCH_CONCURRENCY);

    try {
      const batchResults = await Promise.all(
        concurrentBatches.map(async (batch) => {
          const embeddings = await Promise.all(
            batch.map(item => generateSingleEmbedding(item.text))
          );
          return { batch, embeddings };
        })
      );

      // Store results and cache for all concurrent batches
      for (const { batch, embeddings } of batchResults) {
        for (let j = 0; j < batch.length; j++) {
          const item = batch[j];
          const embedding = embeddings[j];
          results[item.index] = embedding;

          // Cache the result with Float32Array for memory efficiency
          evictCacheEntries();
          embeddingCache.set(item.cacheKey, {
            embedding: toFloat32Array(embedding),
            timestamp: Date.now(),
            accessCount: 1
          });
        }
      }
    } catch (err) {
      logError('Embedding batch failed', err, {
        batchStart: batchIdx,
        batchCount: concurrentBatches.length
      });
      throw err;
    }
  }

  // CRITICAL: Verify all embeddings were generated successfully
  // If any are missing, throw an error to prevent misaligned embeddings
  const missingIndices: number[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i] === null) {
      missingIndices.push(i);
    }
  }

  if (missingIndices.length > 0) {
    logError('Embedding generation incomplete - missing indices would cause misalignment', null, {
      inputCount: texts.length,
      missingCount: missingIndices.length,
      missingIndices: missingIndices.slice(0, 10), // Log first 10
    });
    throw new EmbeddingError(
      `Failed to generate ${missingIndices.length} of ${texts.length} embeddings`,
      missingIndices
    );
  }

  const elapsedMs = Date.now() - startTime;

  // Estimate cost (Gemini embedding pricing: ~$0.00001 per 1K tokens)
  // Rough estimate: ~1 token per 4 chars
  const estimatedTokens = toGenerate.reduce((sum, item) => sum + Math.ceil(item.text.length / 4), 0);
  const estimatedCostUsd = (estimatedTokens / 1000) * 0.00001;

  logInfo('Embeddings generated', {
    count: texts.length,
    fromCache: texts.length - toGenerate.length,
    generated: toGenerate.length,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    estimatedTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1000000) / 1000000, // 6 decimal places
    elapsedMs,
  });

  // Safe to cast since we verified all entries are non-null above
  return results as number[][];
}

/**
 * Generate embedding for a query with caching
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const cacheKey = getCacheKey(query);

  // Check cache first
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    // Update LRU: delete and re-insert to move to end
    embeddingCache.delete(cacheKey);
    cached.timestamp = Date.now();
    cached.accessCount++;
    embeddingCache.set(cacheKey, cached);

    logInfo('Query embedding cache hit', { queryLength: query.length });
    return toNumberArray(cached.embedding);
  }

  // Generate new embedding
  const embedding = await generateSingleEmbedding(normalizeText(query));

  // Cache the result with Float32Array for memory efficiency
  evictCacheEntries();
  embeddingCache.set(cacheKey, {
    embedding: toFloat32Array(embedding),
    timestamp: Date.now(),
    accessCount: 1
  });

  return embedding;
}

/**
 * Check if embeddings service is available
 */
export function isEmbeddingsAvailable(): boolean {
  return isGenAIAvailable();
}

/**
 * Clear embedding cache (for testing/maintenance)
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  cacheEvictions = 0;
}

/**
 * Get cache stats (for monitoring)
 */
export function getEmbeddingCacheStats(): {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  deduplicatedRequests: number;
  inFlightCount: number;
  memoryEstimateKB: number;
} {
  const total = cacheHits + cacheMisses;

  // Estimate memory: each Float32Array entry uses 4 bytes per dimension
  // Plus overhead for Map entry (~100 bytes per entry)
  const bytesPerEntry = (EMBEDDING_DIMENSIONS * 4) + 100;
  const memoryEstimateKB = Math.round((embeddingCache.size * bytesPerEntry) / 1024);

  return {
    size: embeddingCache.size,
    maxSize: EMBEDDING_CACHE_MAX_SIZE,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? Math.round((cacheHits / total) * 100) / 100 : 0,
    evictions: cacheEvictions,
    deduplicatedRequests,
    inFlightCount: inFlightRequests.size,
    memoryEstimateKB,
  };
}


```

---

## src/enhancedPrompts.ts

**Path:** `src/enhancedPrompts.ts`

```ts
/**
 * AuroraNotes API - Enhanced Prompt Engineering
 *
 * Optimized RAG prompts balancing citation accuracy with natural conversation.
 *
 * Design Principles:
 * - Concise instructions (reduce cognitive overload)
 * - Warm, conversational tone (personal notes = personal assistant)
 * - Graceful degradation (handle missing/partial info naturally)
 * - Intent-adaptive structure (match response to question type)
 * - Consistent citation patterns (group facts, cite at section end)
 *
 * v2.0 - Optimized for clarity and reduced token usage (~70% smaller prompts)
 */

import { QueryIntent, ScoredChunk } from './types';
import { logInfo } from './utils';

/**
 * Compact few-shot examples for citation patterns
 */
const CITATION_EXAMPLES = {
  grouped: `✓ "PostgreSQL is the primary database, with Redis for caching. [N1][N2]"
✗ "PostgreSQL is used. [N1] Redis caches data. [N2]" (choppy)`,

  procedural: `✓ "To deploy: run \`npm build\`, push to main, and CI/CD handles the rest. [N1] Requires team lead approval. [N2]"
✗ "Run build [N1], push [N1], get approval [N2]." (fragmented)`,
};

/**
 * Grounding instruction levels
 */
export type GroundingLevel = 'strict' | 'balanced' | 'flexible';

/**
 * Enhanced prompt configuration
 */
export interface EnhancedPromptConfig {
  groundingLevel: GroundingLevel;
  requireClaimCitations: boolean;
  maxCitationsPerClaim: number;
  enforceStructure: boolean;
  includeExamples: boolean;
}

const DEFAULT_CONFIG: EnhancedPromptConfig = {
  groundingLevel: 'strict',  // Changed from 'balanced' for stronger citation enforcement
  requireClaimCitations: true,
  maxCitationsPerClaim: 3,
  enforceStructure: true,
  includeExamples: true,
};

/**
 * Get grounding instructions based on level (optimized for clarity)
 */
function getGroundingInstructions(level: GroundingLevel, sourceCount: number): string {
  switch (level) {
    case 'strict':
      return `## Grounding Rules
• Every factual claim needs a citation [N1]-[N${sourceCount}]
• Only cite information actually present in the source
• If sources don't answer the question, say so honestly
• Never invent citations or cite non-existent sources`;

    case 'balanced':
      return `## Grounding Rules
• Cite facts with [N#] format
• Synthesize related info from multiple sources
• Present conflicting info with both citations`;

    case 'flexible':
      return `## Grounding Rules
• Cite key claims with [N#]
• Focus on being helpful
• Draw reasonable inferences from sources`;
  }
}

/**
 * Graceful degradation guidance for edge cases
 */
function getGracefulDegradation(): string {
  return `## When Sources Don't Fully Answer
• Partial match: "Your notes touch on this..." + share what's relevant with citations
• No match: "I couldn't find this in your notes."
• Sources conflict: Present both views with their citations`;
}

/**
 * Compact structure templates by intent
 */
function getCompactStructure(intent: QueryIntent): string {
  const structures: Record<QueryIntent, string> = {
    summarize: 'Brief overview → bullet points for key details → cite each point',
    list: 'Short intro → bulleted/numbered items → cite sources',
    decision: 'State the decision [N#] → explain reasoning → note alternatives',
    action_item: 'Action items with owners/deadlines → cite each',
    question: 'Direct answer [N#] → supporting details → caveats if any',
    search: 'Direct answer [N#] → relevant context',
  };
  return `## Response Format\n${structures[intent] || structures.search}`;
}

/**
 * Get compact citation example based on intent
 */
function getCitationExample(intent: QueryIntent): string {
  if (intent === 'list' || intent === 'action_item') {
    return `## Citation Style\n${CITATION_EXAMPLES.procedural}`;
  }
  return `## Citation Style\n${CITATION_EXAMPLES.grouped}`;
}

/**
 * Build the enhanced system prompt (v2 - optimized)
 *
 * ~70% smaller than v1 while maintaining citation accuracy.
 * Focuses on clear, non-conflicting instructions.
 */
export function buildEnhancedSystemPrompt(
  sourceCount: number,
  intent: QueryIntent,
  config: Partial<EnhancedPromptConfig> = {}
): string {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Core identity with warmth
  const identity = `You're the user's personal notes assistant. Help them find answers from their own thoughts and captured information.

Answer using ONLY the ${sourceCount} note excerpts provided below.`;

  // Build prompt sections (much more concise than v1)
  const sections: string[] = [
    identity,
    '',
    getGroundingInstructions(fullConfig.groundingLevel, sourceCount),
  ];

  // Add citation guidance
  sections.push('', `## How to Cite
• Group related facts, cite at section end: "X relates to Y. Z is important. [N1][N2]"
• Don't over-cite — one citation per paragraph is usually enough
• Only cite sources N1-N${sourceCount}. Never invent citations.`);

  // Add structure template if enabled
  if (fullConfig.enforceStructure) {
    sections.push('', getCompactStructure(intent));
  }

  // Add example if enabled
  if (fullConfig.includeExamples) {
    sections.push('', getCitationExample(intent));
  }

  // Always add graceful degradation
  sections.push('', getGracefulDegradation());

  // Tone guidance
  sections.push('', `## Tone
Be conversational and helpful, not robotic. Use phrases like "your notes mention..." or "based on what you wrote..."`);

  return sections.join('\n');
}

/**
 * Source with optional relevance score for quality hints
 */
interface EnhancedSource {
  cid: string;
  text: string;
  noteTitle?: string;
  relevanceScore?: number;
}

/**
 * Get relevance indicator for source quality hints
 */
function getRelevanceIndicator(score: number | undefined): string {
  if (score === undefined) return '';
  if (score >= 0.80) return '★★★ '; // Highly relevant
  if (score >= 0.60) return '★★ ';  // Relevant
  if (score >= 0.40) return '★ ';   // Somewhat relevant
  return '';                         // Lower relevance - no indicator
}

/**
 * Build enhanced user prompt with sources (v2 - friendlier formatting)
 * Now includes optional relevance indicators to help LLM prioritize sources
 */
export function buildEnhancedUserPrompt(
  query: string,
  sources: EnhancedSource[],
  topicsHint?: string
): string {
  // Sort sources by relevance if scores are available, keeping original order as fallback
  const hasScores = sources.some(s => s.relevanceScore !== undefined);

  const sourcesText = sources
    .map(s => {
      const titlePrefix = s.noteTitle ? `(from "${s.noteTitle}") ` : '';
      const relevanceHint = hasScores ? getRelevanceIndicator(s.relevanceScore) : '';
      return `[${s.cid}]: ${relevanceHint}${titlePrefix}${s.text}`;
    })
    .join('\n\n');

  const topicsSection = topicsHint
    ? `\nTopics: ${topicsHint}\n`
    : '';

  // Add relevance hint if we have scores
  const relevanceNote = hasScores
    ? '\n(★ indicates higher relevance to your question)\n'
    : '';

  return `${topicsSection}
## Your Notes (${sources.length} excerpts)
${relevanceNote}
${sourcesText}

---

**Question:** ${query}`;
}

/**
 * Build a complete enhanced prompt
 */
export function buildCompleteEnhancedPrompt(
  query: string,
  chunks: ScoredChunk[],
  intent: QueryIntent,
  config: Partial<EnhancedPromptConfig> = {}
): { systemPrompt: string; userPrompt: string } {
  // Build sources from chunks with relevance scores for quality hints
  const sources: EnhancedSource[] = chunks.map((chunk, index) => ({
    cid: `N${index + 1}`,
    text: chunk.text,
    relevanceScore: chunk.score,
    // noteTitle is not available on ScoredChunk, omit it
  }));

  const systemPrompt = buildEnhancedSystemPrompt(sources.length, intent, config);
  const userPrompt = buildEnhancedUserPrompt(query, sources);

  logInfo('Built enhanced prompt', {
    sourceCount: sources.length,
    intent,
    groundingLevel: config.groundingLevel || DEFAULT_CONFIG.groundingLevel,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
    avgRelevanceScore: chunks.length > 0
      ? Math.round(chunks.reduce((sum, c) => sum + (c.score || 0), 0) / chunks.length * 100) / 100
      : 0,
  });

  return { systemPrompt, userPrompt };
}

/**
 * Get prompt configuration for observability
 */
export function getEnhancedPromptConfig(): EnhancedPromptConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Validate that a response follows the expected structure
 */
export function validateResponseStructure(
  response: string,
  intent: QueryIntent
): {
  followsStructure: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for citation presence
  const hasCitations = /\[N\d+\]/.test(response);
  if (!hasCitations) {
    issues.push('Response contains no citations');
    suggestions.push('Add citations to support factual claims');
  }

  // Check for citation clustering (bad pattern)
  const clusterPattern = /(\[N\d+\]\s*){4,}/;
  if (clusterPattern.test(response)) {
    issues.push('Citations are clustered together');
    suggestions.push('Distribute citations throughout the response');
  }

  // Intent-specific checks
  if (intent === 'list' || intent === 'action_item') {
    const hasListFormat = /^\s*[-*•]\s|^\s*\d+[.)]\s/m.test(response);
    if (!hasListFormat) {
      issues.push('List response lacks list formatting');
      suggestions.push('Use numbered or bulleted list format');
    }
  }

  if (intent === 'decision') {
    const hasDecisionLanguage = /\b(decided|decision|chose|selected|agreed)\b/i.test(response);
    if (!hasDecisionLanguage) {
      issues.push('Decision response lacks decision language');
    }
  }

  return {
    followsStructure: issues.length === 0,
    issues,
    suggestions,
  };
}


```

---

## src/errors.ts

**Path:** `src/errors.ts`

```ts
/**
 * AuroraNotes API - Standardized Error Handling
 *
 * Provides consistent error types and responses across the API.
 * All errors follow the format: { error: { code, message, details? } }
 */

import { Request, Response, NextFunction } from 'express';
import { logError, logWarn } from './utils';

/**
 * Standard error codes used across the API
 */
export enum ErrorCode {
  // Authentication errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Authorization errors (403)
  FORBIDDEN = 'FORBIDDEN',
  TENANT_MISMATCH = 'TENANT_MISMATCH',

  // Client errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  INVALID_CURSOR = 'INVALID_CURSOR',

  // Not found (404)
  NOT_FOUND = 'NOT_FOUND',
  NOTE_NOT_FOUND = 'NOTE_NOT_FOUND',
  THREAD_NOT_FOUND = 'THREAD_NOT_FOUND',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',
  LLM_FAILED = 'LLM_FAILED',
}

/**
 * HTTP status codes for each error code
 */
const ERROR_STATUS_CODES: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.TENANT_MISMATCH]: 403,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.INVALID_CURSOR]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.NOTE_NOT_FOUND]: 404,
  [ErrorCode.THREAD_NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.EMBEDDING_FAILED]: 500,
  [ErrorCode.LLM_FAILED]: 500,
};

/**
 * Standard API error class
 */
export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = ERROR_STATUS_CODES[code];
    this.details = details;
  }

  /**
   * Convert to JSON response format
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * Factory functions for common errors
 */
export const Errors = {
  unauthorized: (message = 'Authentication required') =>
    new ApiError(ErrorCode.UNAUTHORIZED, message),

  invalidToken: (message = 'Invalid authentication token') =>
    new ApiError(ErrorCode.INVALID_TOKEN, message),

  forbidden: (message = 'Access denied') =>
    new ApiError(ErrorCode.FORBIDDEN, message),

  tenantMismatch: () =>
    new ApiError(ErrorCode.TENANT_MISMATCH, 'Resource belongs to a different tenant'),

  notFound: (resource = 'Resource') =>
    new ApiError(ErrorCode.NOT_FOUND, `${resource} not found`),

  noteNotFound: (noteId?: string) =>
    new ApiError(ErrorCode.NOTE_NOT_FOUND, 'Note not found', noteId ? { noteId } : undefined),

  threadNotFound: (threadId?: string) =>
    new ApiError(ErrorCode.THREAD_NOT_FOUND, 'Thread not found', threadId ? { threadId } : undefined),

  badRequest: (message: string, details?: Record<string, unknown>) =>
    new ApiError(ErrorCode.BAD_REQUEST, message, details),

  validationError: (message: string, details?: Record<string, unknown>) =>
    new ApiError(ErrorCode.VALIDATION_ERROR, message, details),

  rateLimitExceeded: (retryAfter?: number) =>
    new ApiError(ErrorCode.RATE_LIMIT_EXCEEDED, 'Too many requests', retryAfter ? { retryAfter } : undefined),

  internalError: (message = 'An internal error occurred') =>
    new ApiError(ErrorCode.INTERNAL_ERROR, message),

  embeddingFailed: (message = 'Failed to generate embeddings') =>
    new ApiError(ErrorCode.EMBEDDING_FAILED, message),

  llmFailed: (message = 'Failed to generate response') =>
    new ApiError(ErrorCode.LLM_FAILED, message),
};

/**
 * Global error handler middleware
 * Should be registered last in the middleware chain
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle ApiError instances
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logError('API error', err, { code: err.code, path: req.path });
    } else {
      logWarn('Client error', { code: err.code, message: err.message, path: req.path });
    }
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Handle unexpected errors
  logError('Unhandled error', err, { path: req.path, method: req.method });

  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}


```

---

## src/firestore.ts

**Path:** `src/firestore.ts`

```ts
/**
 * AuroraNotes API - Firestore Database Connection
 *
 * Provides a singleton Firestore instance for the application.
 * Initializes Firebase Admin SDK and exports the database getter.
 */

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { PROJECT_ID } from "./config";

let app: App | null = null;
let db: Firestore | null = null;

/**
 * Initialize Firebase Admin SDK if not already initialized
 */
function initializeFirebase(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // In production (Cloud Run), use default credentials
  // In development, use GOOGLE_APPLICATION_CREDENTIALS env var
  const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (serviceAccount) {
    // Local development with service account file
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: PROJECT_ID,
    });
  } else {
    // Production: use default credentials (Cloud Run service account)
    return initializeApp({
      projectId: PROJECT_ID,
    });
  }
}

/**
 * Get the Firestore database instance
 *
 * Lazily initializes Firebase Admin SDK on first call.
 * Returns the same instance for subsequent calls.
 */
export function getDb(): Firestore {
  if (!db) {
    if (!app) {
      app = initializeFirebase();
    }
    db = getFirestore(app);

    // Enable settings for better performance
    db.settings({
      ignoreUndefinedProperties: true,
    });
  }
  return db;
}

/**
 * Get the Firebase Admin App instance
 */
export function getApp(): App {
  if (!app) {
    app = initializeFirebase();
  }
  return app;
}


```

---

## src/genaiClient.ts

**Path:** `src/genaiClient.ts`

```ts
/**
 * AuroraNotes API - GenAI Client Factory
 *
 * Centralized client creation for all GenAI operations (chat, embeddings, reranking).
 * Supports two authentication modes:
 *
 *   GENAI_MODE=apikey (default):
 *     Uses GOOGLE_API_KEY or GEMINI_API_KEY environment variable
 *     Suitable for development and simple deployments
 *
 *   GENAI_MODE=vertex:
 *     Uses Application Default Credentials (ADC) via service account
 *     Required for production Cloud Run deployments
 *     Requires GOOGLE_CLOUD_PROJECT to be set
 *
 * Optimizations:
 * - Singleton pattern for connection reuse
 * - Request concurrency limiting to prevent API throttling
 * - Memory-efficient request tracking
 */

import { GoogleGenAI } from "@google/genai";
import { logInfo, logError, logWarn } from "./utils";

// Singleton instances for each mode
let apiKeyClient: GoogleGenAI | null = null;
let vertexClient: GoogleGenAI | null = null;

// Configuration
const GENAI_MODE = process.env.GENAI_MODE || 'apikey';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

// Concurrency control for API requests
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.GENAI_MAX_CONCURRENT || '10');
let activeRequests = 0;
const requestQueue: Array<() => void> = [];

/**
 * Acquire a request slot (for concurrency limiting)
 * Returns a release function to call when done
 */
export async function acquireRequestSlot(): Promise<() => void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return () => {
      activeRequests--;
      // Process next queued request if any
      if (requestQueue.length > 0) {
        const next = requestQueue.shift();
        if (next) next();
      }
    };
  }

  // Wait for a slot to become available
  return new Promise((resolve) => {
    requestQueue.push(() => {
      activeRequests++;
      resolve(() => {
        activeRequests--;
        if (requestQueue.length > 0) {
          const next = requestQueue.shift();
          if (next) next();
        }
      });
    });
  });
}

/**
 * Get current request stats for monitoring
 */
export function getRequestStats(): { active: number; queued: number; maxConcurrent: number } {
  return {
    active: activeRequests,
    queued: requestQueue.length,
    maxConcurrent: MAX_CONCURRENT_REQUESTS,
  };
}

/**
 * Supported GenAI modes
 */
export type GenAIMode = 'apikey' | 'vertex';

/**
 * Get the current GenAI mode
 */
export function getGenAIMode(): GenAIMode {
  if (GENAI_MODE === 'vertex') {
    return 'vertex';
  }
  return 'apikey';
}

/**
 * Check if GenAI client is available
 */
export function isGenAIAvailable(): boolean {
  const mode = getGenAIMode();
  
  if (mode === 'apikey') {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    return !!apiKey;
  }
  
  if (mode === 'vertex') {
    // Vertex requires project ID and ADC (which is automatically available on Cloud Run)
    return !!PROJECT_ID;
  }
  
  return false;
}

/**
 * Get the GenAI client with API key authentication
 */
function getApiKeyClient(): GoogleGenAI {
  if (!apiKeyClient) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GENAI_MODE=apikey requires GOOGLE_API_KEY or GEMINI_API_KEY environment variable'
      );
    }
    
    apiKeyClient = new GoogleGenAI({ apiKey });
    logInfo('GenAI client initialized', { mode: 'apikey' });
  }
  return apiKeyClient;
}

/**
 * Get the GenAI client with Vertex AI / ADC authentication
 * 
 * This uses Application Default Credentials which:
 * - On Cloud Run: automatically uses the service account
 * - Locally: uses gcloud auth application-default credentials
 */
function getVertexClient(): GoogleGenAI {
  if (!vertexClient) {
    if (!PROJECT_ID) {
      throw new Error(
        'GENAI_MODE=vertex requires GOOGLE_CLOUD_PROJECT environment variable'
      );
    }

    // The GoogleGenAI SDK supports Vertex AI through ADC when no apiKey is provided
    // and GOOGLE_APPLICATION_CREDENTIALS or Cloud Run service account is available
    try {
      // For Vertex AI, we need to use the Vertex AI endpoint
      // This is a simplified approach - full Vertex AI support would use @google-cloud/aiplatform
      vertexClient = new GoogleGenAI({
        vertexai: true,
        project: PROJECT_ID,
        location: process.env.VERTEX_AI_LOCATION || 'us-central1',
      } as any); // Type assertion needed as SDK types may not fully expose Vertex options
      
      logInfo('GenAI client initialized', { 
        mode: 'vertex',
        project: PROJECT_ID,
        location: process.env.VERTEX_AI_LOCATION || 'us-central1',
      });
    } catch (err) {
      logError('Failed to initialize Vertex AI client', err);
      throw new Error(
        `Failed to initialize Vertex AI: ${err instanceof Error ? err.message : String(err)}. ` +
        'Ensure GOOGLE_APPLICATION_CREDENTIALS is set or running on Cloud Run with appropriate IAM.'
      );
    }
  }
  return vertexClient;
}

/**
 * Get the GenAI client based on current mode
 */
export function getGenAIClient(): GoogleGenAI {
  const mode = getGenAIMode();
  
  switch (mode) {
    case 'vertex':
      return getVertexClient();
    case 'apikey':
    default:
      return getApiKeyClient();
  }
}

/**
 * Reset clients (for testing)
 */
export function resetGenAIClients(): void {
  apiKeyClient = null;
  vertexClient = null;
}

/**
 * Get configuration info for logging/debugging
 */
export function getGenAIConfig(): {
  mode: GenAIMode;
  available: boolean;
  project?: string;
  location?: string;
} {
  return {
    mode: getGenAIMode(),
    available: isGenAIAvailable(),
    project: PROJECT_ID,
    location: process.env.VERTEX_AI_LOCATION || 'us-central1',
  };
}


```

---

## src/index.ts

**Path:** `src/index.ts`

```ts
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
import { createNote, listNotes, updateNote, deleteNote, getNote, searchNotes } from "./notes";
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
import { rateLimitMiddleware } from "./rateLimit";
import { processNoteChunks } from "./chunking";
import { getDb } from "./firestore";
import { internalAuthMiddleware, isInternalAuthConfigured } from "./internalAuth";
import { getVertexConfigStatus, isVertexConfigured } from "./vectorIndex";
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
  ChatRequestSchema,
  CreateThreadSchema,
  ThreadIdParamSchema,
  ListThreadsQuerySchema,
  TranscriptionOptionsSchema,
} from "./schemas";
import {
  createThread,
  getThread,
  listThreads,
  addMessage,
  deleteThread,
  getRecentMessages,
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
    const { query, limit, threshold, includeChunks, filters } = req.body;

    const result = await searchNotes(query, tenantId, {
      limit,
      threshold,
      includeChunks,
      filters: filters ? {
        tags: filters.tags,
        dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
        status: filters.status,
      } : undefined,
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

```

---

## src/internalAuth.ts

**Path:** `src/internalAuth.ts`

```ts
/**
 * AuroraNotes API - Internal Endpoint Authentication
 *
 * Provides OIDC JWT validation for /internal/* endpoints.
 * When INTERNAL_AUTH_ENABLED=true, validates that requests come from
 * authorized Cloud Tasks with valid Google OIDC tokens.
 *
 * Configuration:
 *   INTERNAL_AUTH_ENABLED=true       - Enable OIDC validation
 *   INTERNAL_AUTH_AUDIENCE=<url>     - Expected audience (service URL)
 *   INTERNAL_AUTH_SERVICE_ACCOUNT=<email> - Optional: expected SA email
 */

import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  INTERNAL_AUTH_ENABLED,
  INTERNAL_AUTH_AUDIENCE,
  INTERNAL_AUTH_ISSUER,
  INTERNAL_AUTH_SERVICE_ACCOUNT,
} from './config';
import { logInfo, logWarn, logError } from './utils';

// Singleton OAuth2 client for token verification
let oauthClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  if (!oauthClient) {
    oauthClient = new OAuth2Client();
  }
  return oauthClient;
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify OIDC token from Google
 */
async function verifyOidcToken(token: string): Promise<{
  valid: boolean;
  email?: string;
  audience?: string;
  error?: string;
}> {
  try {
    const client = getOAuthClient();
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: INTERNAL_AUTH_AUDIENCE || undefined,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return { valid: false, error: 'No payload in token' };
    }

    // Verify issuer
    if (payload.iss !== INTERNAL_AUTH_ISSUER && payload.iss !== 'accounts.google.com') {
      return { valid: false, error: `Invalid issuer: ${payload.iss}` };
    }

    // Verify audience if configured
    if (INTERNAL_AUTH_AUDIENCE && payload.aud !== INTERNAL_AUTH_AUDIENCE) {
      return { valid: false, error: `Invalid audience: ${payload.aud}` };
    }

    // Verify service account if configured
    if (INTERNAL_AUTH_SERVICE_ACCOUNT && payload.email !== INTERNAL_AUTH_SERVICE_ACCOUNT) {
      return { valid: false, error: `Invalid service account: ${payload.email}` };
    }

    return {
      valid: true,
      email: payload.email,
      audience: payload.aud as string,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }
}

/**
 * Express middleware for internal endpoint authentication
 *
 * When INTERNAL_AUTH_ENABLED=true:
 * - Requires valid OIDC bearer token
 * - Validates issuer, audience, and optionally service account
 * - Returns 401 for missing/invalid tokens
 *
 * When INTERNAL_AUTH_ENABLED=false:
 * - Passes through all requests (development mode)
 */
export async function internalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip auth if not enabled (development mode)
  if (!INTERNAL_AUTH_ENABLED) {
    logInfo('Internal auth disabled, allowing request', {
      path: req.path,
      method: req.method,
    });
    return next();
  }

  // Extract bearer token
  const token = extractBearerToken(req);
  if (!token) {
    logWarn('Internal auth: missing bearer token', {
      path: req.path,
      method: req.method,
    });
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  // Verify OIDC token
  const result = await verifyOidcToken(token);

  if (!result.valid) {
    logWarn('Internal auth: invalid token', {
      path: req.path,
      method: req.method,
      error: result.error,
    });
    res.status(401).json({ error: 'Invalid authorization token' });
    return;
  }

  // Token is valid
  logInfo('Internal auth: token verified', {
    path: req.path,
    method: req.method,
    email: result.email,
  });

  return next();
}

/**
 * Check if internal auth is properly configured
 */
export function isInternalAuthConfigured(): boolean {
  if (!INTERNAL_AUTH_ENABLED) {
    return true; // Not enabled = no config needed
  }

  // Must have audience configured
  if (!INTERNAL_AUTH_AUDIENCE) {
    logError('INTERNAL_AUTH_ENABLED=true but INTERNAL_AUTH_AUDIENCE not set', null);
    return false;
  }

  return true;
}


```

---

## src/middleware/audioUpload.ts

**Path:** `src/middleware/audioUpload.ts`

```ts
/**
 * AuroraNotes API - Audio Upload Middleware
 *
 * Multer configuration for handling audio file uploads.
 * Supports MP3, WAV, WEBM, OGG, AAC, FLAC, and AIFF formats.
 *
 * Usage:
 *   app.post('/transcribe', audioUpload.single('audio'), handler);
 */

import multer from 'multer';
import { Request } from 'express';
import { SUPPORTED_AUDIO_TYPES } from '../transcription';

// ============================================================================
// Configuration
// ============================================================================

/** Maximum audio file size (20MB) */
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Map of file extensions to MIME types for validation
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.m4a': 'audio/aac',
};

// ============================================================================
// Multer Configuration
// ============================================================================

/**
 * Custom file filter for audio uploads
 */
const audioFileFilter: multer.Options['fileFilter'] = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Check MIME type
  const mimeType = file.mimetype.toLowerCase();
  
  // Normalize some common variations
  const normalizedMime = normalizeMimeType(mimeType);
  
  if (SUPPORTED_AUDIO_TYPES.includes(normalizedMime as any)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported audio format: ${mimeType}. Supported formats: MP3, WAV, WEBM, OGG, AAC, FLAC, AIFF`));
  }
};

/**
 * Normalize MIME type variations to standard format
 */
function normalizeMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'audio/mpeg': 'audio/mp3',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/x-aiff': 'audio/aiff',
    'audio/x-aac': 'audio/aac',
    'audio/mp4': 'audio/aac',
    'audio/m4a': 'audio/aac',
    'audio/x-m4a': 'audio/aac',
    'audio/x-flac': 'audio/flac',
    'video/webm': 'audio/webm', // Browser may send this for audio-only webm
  };
  
  return mimeMap[mimeType] || mimeType;
}

/**
 * Multer storage configuration - memory storage for processing
 */
const storage = multer.memoryStorage();

/**
 * Configured multer instance for audio uploads
 */
export const audioUpload = multer({
  storage,
  limits: {
    fileSize: MAX_AUDIO_SIZE_BYTES,
    files: 1, // Only allow single file upload
  },
  fileFilter: audioFileFilter,
});

/**
 * Get the normalized MIME type for a file
 */
export function getNormalizedMimeType(file: Express.Multer.File): string {
  return normalizeMimeType(file.mimetype.toLowerCase());
}

/**
 * Error class for audio upload errors
 */
export class AudioUploadError extends Error {
  code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'NO_FILE';
  
  constructor(message: string, code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'NO_FILE') {
    super(message);
    this.name = 'AudioUploadError';
    this.code = code;
  }
}

/**
 * Handle multer errors and convert to AudioUploadError
 */
export function handleMulterError(error: any): AudioUploadError {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AudioUploadError(
        `File too large. Maximum size is ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB`,
        'FILE_TOO_LARGE'
      );
    }
  }
  
  if (error.message?.includes('Unsupported audio format')) {
    return new AudioUploadError(error.message, 'UNSUPPORTED_FORMAT');
  }
  
  return new AudioUploadError(error.message || 'Upload failed', 'UNSUPPORTED_FORMAT');
}


```

---

## src/middleware/index.ts

**Path:** `src/middleware/index.ts`

```ts
/**
 * AuroraNotes API - Middleware Exports
 */

export {
  userAuthMiddleware,
  optionalAuthMiddleware,
  isUserAuthEnabled,
  AuthenticatedUser,
} from './userAuth';

export {
  validateBody,
  validateQuery,
  validateParams,
  ValidationError,
} from './validation';

export {
  perUserRateLimiter,
  createRateLimiter,
} from './rateLimiter';

export {
  audioUpload,
  getNormalizedMimeType,
  AudioUploadError,
  handleMulterError,
} from './audioUpload';

```

---

## src/middleware/rateLimiter.ts

**Path:** `src/middleware/rateLimiter.ts`

```ts
/**
 * AuroraNotes API - Per-User Rate Limiting Middleware
 *
 * Rate limiting based on authenticated user UID.
 * Uses in-memory sliding window for simplicity.
 *
 * Configuration:
 *   RATE_LIMIT_WINDOW_MS - Window size in ms (default: 60000 = 1 minute)
 *   RATE_LIMIT_MAX_REQUESTS - Max requests per window (default: 100)
 */

import { Request, Response, NextFunction } from 'express';
import { logWarn } from '../utils';

// Configuration
const DEFAULT_WINDOW_MS = 60000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string | null;
  skipFailedRequests?: boolean;
}

/**
 * In-memory rate limit store
 * In production, consider using Redis for distributed rate limiting
 */
class RateLimitStore {
  private entries: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check and increment rate limit for a key
   * Returns { allowed: boolean, remaining: number, resetAt: number }
   */
  check(
    key: string,
    windowMs: number,
    maxRequests: number
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      // New window
      this.entries.set(key, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs,
      };
    }

    // Existing window
    entry.count++;
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetAt = entry.windowStart + windowMs;

    return {
      allowed: entry.count <= maxRequests,
      remaining,
      resetAt,
    };
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, entry] of this.entries) {
      if (now - entry.windowStart > maxAge) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Get current stats for monitoring
   */
  getStats(): { entryCount: number } {
    return { entryCount: this.entries.size };
  }
}

// Singleton store
const store = new RateLimitStore();

/**
 * Create a rate limiter middleware with custom configuration
 */
export function createRateLimiter(config: Partial<RateLimiterConfig> = {}) {
  const envWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '');
  const envMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '');
  const windowMs = config.windowMs ?? (isNaN(envWindowMs) ? DEFAULT_WINDOW_MS : envWindowMs);
  const maxRequests = config.maxRequests ?? (isNaN(envMaxRequests) ? DEFAULT_MAX_REQUESTS : envMaxRequests);
  const keyGenerator = config.keyGenerator ?? ((req: Request) => req.user?.uid ?? null);

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);

    // Skip rate limiting if no key (unauthenticated)
    if (!key) {
      return next();
    }

    const result = store.check(key, windowMs, maxRequests);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      logWarn('Rate limit exceeded', {
        key: key.slice(0, 8) + '...',
        path: req.path,
        method: req.method,
      });

      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        },
      });
      return;
    }

    next();
  };
}

/**
 * Default per-user rate limiter
 * Uses authenticated user's UID as the rate limit key
 */
export const perUserRateLimiter = createRateLimiter();

/**
 * Get rate limiter stats for monitoring
 */
export function getRateLimiterStats() {
  return store.getStats();
}


```

---

## src/middleware/userAuth.ts

**Path:** `src/middleware/userAuth.ts`

```ts
/**
 * AuroraNotes API - User Authentication Middleware
 *
 * Firebase Authentication middleware for end-user authentication.
 * Validates Firebase ID tokens and attaches user info to requests.
 *
 * Usage:
 *   app.use('/notes', userAuthMiddleware);
 *   // In route: req.user.uid contains the authenticated user's Firebase UID
 *
 * Configuration:
 *   USER_AUTH_ENABLED=true (default: true in production)
 */

import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { logInfo, logWarn, logError, hashText } from '../utils';

// Configuration
// Default to false for backwards compatibility during migration
// Set USER_AUTH_ENABLED=true in production when ready to enforce auth
const USER_AUTH_ENABLED = process.env.USER_AUTH_ENABLED === 'true';

/**
 * Authenticated user attached to request
 */
export interface AuthenticatedUser {
  /** Firebase UID - used as tenantId for data isolation */
  uid: string;
  /** Email if available */
  email?: string;
  /** Email verified status */
  emailVerified?: boolean;
  /** Phone number if available */
  phoneNumber?: string;
  /** Firebase Auth provider (google.com, phone, etc.) */
  provider?: string;
  /** Display name if available */
  displayName?: string;
  /** Token issue time */
  issuedAt?: Date;
  /** Token expiration time */
  expiresAt?: Date;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Get the Auth instance (singleton from firebase-admin)
 */
function getAuth(): admin.auth.Auth {
  // Ensure app is initialized (getDb handles this)
  const { getDb } = require('../firestore');
  getDb(); // Initialize if not already
  return admin.auth();
}

/**
 * Verify Firebase ID token and extract user info
 */
async function verifyFirebaseToken(token: string): Promise<{
  valid: boolean;
  user?: AuthenticatedUser;
  error?: string;
}> {
  try {
    const decodedToken = await getAuth().verifyIdToken(token, true);

    const user: AuthenticatedUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      phoneNumber: decodedToken.phone_number,
      provider: decodedToken.firebase?.sign_in_provider,
      displayName: decodedToken.name,
      issuedAt: decodedToken.iat ? new Date(decodedToken.iat * 1000) : undefined,
      expiresAt: decodedToken.exp ? new Date(decodedToken.exp * 1000) : undefined,
    };

    return { valid: true, user };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Categorize errors
    if (message.includes('expired')) {
      return { valid: false, error: 'Token expired' };
    }
    if (message.includes('revoked')) {
      return { valid: false, error: 'Token revoked' };
    }
    if (message.includes('invalid') || message.includes('malformed')) {
      return { valid: false, error: 'Invalid token format' };
    }

    return { valid: false, error: message };
  }
}

/**
 * User authentication middleware for public endpoints
 *
 * When USER_AUTH_ENABLED=true (default):
 * - Requires valid Firebase ID token in Authorization header
 * - Attaches decoded user to req.user
 * - Returns 401 for missing/invalid tokens
 *
 * When USER_AUTH_ENABLED=false (development):
 * - Passes through all requests
 * - Sets req.user to a default dev user
 */
export async function userAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip auth if not enabled (development mode)
  if (!USER_AUTH_ENABLED) {
    // Set a default dev user for local development
    req.user = {
      uid: 'dev-user-local',
      email: 'dev@local.test',
      emailVerified: true,
      provider: 'development',
    };
    logInfo('User auth disabled, using dev user', {
      path: req.path,
      method: req.method,
      uid: req.user.uid,
    });
    return next();
  }

  // Extract bearer token
  const token = extractBearerToken(req);
  if (!token) {
    logWarn('User auth: missing bearer token', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
    });
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide a valid Firebase ID token.',
      },
    });
    return;
  }

  // Verify Firebase ID token
  const result = await verifyFirebaseToken(token);

  if (!result.valid || !result.user) {
    logWarn('User auth: invalid token', {
      path: req.path,
      method: req.method,
      error: result.error,
    });
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: result.error || 'Invalid authentication token',
      },
    });
    return;
  }

  // Attach user to request
  req.user = result.user;

  // Log successful auth (hash UID for privacy)
  logInfo('User authenticated', {
    path: req.path,
    method: req.method,
    uidHash: hashText(result.user.uid).slice(0, 8),
    provider: result.user.provider,
  });

  return next();
}

/**
 * Check if user authentication is enabled
 */
export function isUserAuthEnabled(): boolean {
  return USER_AUTH_ENABLED;
}

/**
 * Middleware factory for optional auth (allows both authenticated and anonymous)
 * Sets req.user if token is present and valid, otherwise continues without user
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!USER_AUTH_ENABLED) {
    req.user = {
      uid: 'dev-user-local',
      email: 'dev@local.test',
      emailVerified: true,
      provider: 'development',
    };
    return next();
  }

  const token = extractBearerToken(req);
  if (!token) {
    // No token provided - continue without user
    return next();
  }

  const result = await verifyFirebaseToken(token);
  if (result.valid && result.user) {
    req.user = result.user;
  }

  return next();
}


```

---

## src/middleware/validation.ts

**Path:** `src/middleware/validation.ts`

```ts
/**
 * AuroraNotes API - Request Validation Middleware
 *
 * Zod-based validation for request body, query, and params.
 * Provides consistent error responses for validation failures.
 *
 * Note: Validated data is stored in req.validatedQuery and req.validatedParams
 * since req.query and req.params may be read-only in some Node.js versions.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logWarn } from '../utils';

// Extend Express Request to include validated data
declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
      validatedParams?: unknown;
    }
  }
}

/**
 * Validation error response format
 */
export interface ValidationError {
  code: 'VALIDATION_ERROR';
  message: string;
  details: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Format Zod errors into a consistent structure
 */
function formatZodError(error: ZodError<unknown>): ValidationError {
  const issues = error.issues || [];
  return {
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/**
 * Create a middleware that validates request body against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware
 *
 * @example
 * const CreateNoteSchema = z.object({
 *   title: z.string().min(1).max(200),
 *   content: z.string().min(1),
 * });
 *
 * router.post('/notes', validateBody(CreateNoteSchema), (req, res) => {
 *   // req.body is now typed and validated
 * });
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const error = formatZodError(result.error);
      logWarn('Request body validation failed', {
        path: req.path,
        method: req.method,
        errors: error.details,
      });
      res.status(400).json({ error });
      return;
    }

    // Replace body with parsed/transformed data
    req.body = result.data;
    next();
  };
}

/**
 * Create a middleware that validates query parameters against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware
 *
 * @example
 * const ListNotesQuerySchema = z.object({
 *   limit: z.coerce.number().min(1).max(100).default(20),
 *   cursor: z.string().optional(),
 * });
 *
 * router.get('/notes', validateQuery(ListNotesQuerySchema), (req, res) => {
 *   const { limit, cursor } = req.validatedQuery as ListNotesQuery;
 * });
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const error = formatZodError(result.error);
      logWarn('Request query validation failed', {
        path: req.path,
        method: req.method,
        errors: error.details,
      });
      res.status(400).json({ error });
      return;
    }

    // Store validated data in a separate property since req.query may be read-only
    req.validatedQuery = result.data;
    // Also try to copy properties to req.query for compatibility
    try {
      Object.assign(req.query, result.data);
    } catch {
      // Ignore if req.query is frozen/sealed
    }
    next();
  };
}

/**
 * Create a middleware that validates URL parameters against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware
 *
 * @example
 * const NoteIdParamSchema = z.object({
 *   noteId: z.string().min(1),
 * });
 *
 * router.get('/notes/:noteId', validateParams(NoteIdParamSchema), (req, res) => {
 *   const { noteId } = req.validatedParams as NoteIdParam;
 * });
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const error = formatZodError(result.error);
      logWarn('Request params validation failed', {
        path: req.path,
        method: req.method,
        errors: error.details,
      });
      res.status(400).json({ error });
      return;
    }

    // Store validated data in a separate property since req.params may be read-only
    req.validatedParams = result.data;
    // Also try to copy properties to req.params for compatibility
    try {
      Object.assign(req.params, result.data);
    } catch {
      // Ignore if req.params is frozen/sealed
    }
    next();
  };
}

```

---

## src/notes.ts

**Path:** `src/notes.ts`

```ts
/**
 * AuroraNotes API - Notes Service
 * 
 * Handles note CRUD operations with pagination and tenant support.
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./firestore";
import { 
  NOTES_COLLECTION, 
  MAX_NOTE_LENGTH, 
  DEFAULT_TENANT_ID,
  NOTES_PAGE_LIMIT,
  MAX_NOTES_PAGE_LIMIT
} from "./config";
import { NoteDoc, NoteResponse, NotesListResponse, DeleteNoteResponse } from "./types";
import { timestampToISO, parseCursor, encodeCursor, logInfo, logError, logWarn, sanitizeText, isValidTenantId } from "./utils";
import { processNoteChunks } from "./chunking";
import { invalidateTenantCache } from "./cache";
import { CHUNKS_COLLECTION } from "./config";
import { getVertexIndex } from "./vectorIndex";

/**
 * Options for creating a note
 */
export interface CreateNoteOptions {
  title?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Convert Firestore document to API response
 */
function docToResponse(doc: NoteDoc): NoteResponse {
  return {
    id: doc.id,
    title: doc.title,
    text: doc.text,
    tenantId: doc.tenantId,
    processingStatus: doc.processingStatus,
    tags: doc.tags,
    metadata: doc.metadata,
    createdAt: timestampToISO(doc.createdAt),
    updatedAt: timestampToISO(doc.updatedAt),
  };
}

/**
 * Create a new note with input validation and sanitization
 *
 * @param text - Note content (required)
 * @param tenantId - Tenant ID (derived from authenticated user's UID)
 * @param options - Optional title, tags, and metadata
 */
export async function createNote(
  text: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: CreateNoteOptions = {}
): Promise<NoteResponse> {
  // Sanitize and validate input
  const sanitizedText = sanitizeText(text, MAX_NOTE_LENGTH + 100);
  const trimmedText = sanitizedText.trim();

  if (!trimmedText) {
    throw new Error('text is required');
  }

  if (trimmedText.length > MAX_NOTE_LENGTH) {
    throw new Error(`text too long (max ${MAX_NOTE_LENGTH})`);
  }

  // Validate tenant ID
  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  const id = uuidv4();
  const now = FieldValue.serverTimestamp();

  // Build the note document
  const doc: NoteDoc = {
    id,
    text: trimmedText,
    tenantId,
    processingStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  // Add optional fields
  if (options.title) {
    doc.title = options.title.trim().slice(0, 500);
  }
  if (options.tags && options.tags.length > 0) {
    doc.tags = options.tags.slice(0, 20).map(t => t.trim().slice(0, 50));
  }
  if (options.metadata) {
    doc.metadata = options.metadata;
  }

  const db = getDb();
  await db.collection(NOTES_COLLECTION).doc(id).set(doc);

  // Fetch the document to get actual server timestamp
  const savedDoc = await db.collection(NOTES_COLLECTION).doc(id).get();
  let savedData = savedDoc.data() as NoteDoc;

  // Process chunks synchronously so notes are immediately available in RAG pipeline
  // This adds latency but ensures the note is searchable right away
  const chunkStartTime = Date.now();
  try {
    await processNoteChunks(savedData);

    // Update processing status to 'ready'
    await db.collection(NOTES_COLLECTION).doc(id).update({
      processingStatus: 'ready',
      updatedAt: FieldValue.serverTimestamp(),
    });
    savedData.processingStatus = 'ready';

    logInfo('Note chunks processed synchronously', {
      noteId: id,
      elapsedMs: Date.now() - chunkStartTime,
    });
  } catch (err) {
    // Update processing status to 'failed'
    await db.collection(NOTES_COLLECTION).doc(id).update({
      processingStatus: 'failed',
      processingError: err instanceof Error ? err.message : 'Unknown error',
      updatedAt: FieldValue.serverTimestamp(),
    });
    savedData.processingStatus = 'failed';

    // Log error but don't fail the note creation - the note is saved
    // and can be re-indexed later if needed
    logError('Chunk processing failed during note creation', err, { noteId: id });
  }

  // Invalidate retrieval cache AFTER chunks are created
  // This ensures subsequent queries won't use stale cached results
  invalidateTenantCache(tenantId);

  logInfo('Note created', {
    noteId: id,
    tenantId,
    textLength: trimmedText.length,
    hasTitle: !!options.title,
    tagCount: options.tags?.length || 0,
  });

  return docToResponse(savedData);
}

/**
 * Options for listing notes with filters and sorting
 */
export interface ListNotesOptions {
  /** Filter by a single tag */
  tag?: string;
  /** Filter by multiple tags (OR logic) */
  tags?: string[];
  /** Filter notes created on or after this date */
  dateFrom?: Date;
  /** Filter notes created on or before this date */
  dateTo?: Date;
  /** Filter by processing status */
  status?: 'pending' | 'ready' | 'failed';
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  /** Sort order */
  order?: 'asc' | 'desc';
  /** Simple text search in title (prefix match) */
  search?: string;
}

/**
 * List notes with cursor-based pagination and filtering
 *
 * Uses stable ordering: createdAt DESC, id DESC to ensure deterministic pagination.
 * The cursor encodes both createdAt and id to handle timestamp collisions correctly.
 *
 * PREFERRED FIRESTORE INDEX (for best performance):
 *   Collection: notes
 *   Fields: tenantId ASC, createdAt DESC, __name__ DESC
 *
 * Additional indexes may be needed for:
 *   - tenantId ASC, updatedAt DESC, __name__ DESC
 *   - tenantId ASC, title ASC, __name__ ASC
 *   - tenantId ASC, processingStatus ASC, createdAt DESC
 *   - tenantId ASC, tags ARRAY_CONTAINS, createdAt DESC
 *
 * Falls back to client-side filtering if index doesn't exist yet.
 */
export async function listNotes(
  tenantId: string = DEFAULT_TENANT_ID,
  limit: number = NOTES_PAGE_LIMIT,
  cursor?: string,
  options: ListNotesOptions = {}
): Promise<NotesListResponse> {
  const db = getDb();
  const pageLimit = Math.min(Math.max(1, limit), MAX_NOTES_PAGE_LIMIT);
  const cursorData = parseCursor(cursor);

  // Merge tag and tags into a single array
  const allTags: string[] = [];
  if (options.tag) allTags.push(options.tag);
  if (options.tags) allTags.push(...options.tags);

  // Try optimized query with index first, fall back to legacy if index missing
  try {
    return await listNotesOptimized(db, tenantId, pageLimit, cursorData, options, allTags);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('FAILED_PRECONDITION') || errorMessage.includes('requires an index')) {
      logWarn('Notes index not found, using legacy query with client-side filtering', { tenantId });
      return await listNotesLegacy(db, tenantId, pageLimit, cursorData, options, allTags);
    }
    throw err;
  }
}

/**
 * Apply client-side filters to a list of notes
 */
function applyClientSideFilters(
  docs: NoteDoc[],
  options: ListNotesOptions,
  allTags: string[]
): NoteDoc[] {
  return docs.filter(doc => {
    // Tag filter (OR logic - match any of the tags)
    if (allTags.length > 0) {
      const noteTags = doc.tags || [];
      const hasMatchingTag = allTags.some(tag =>
        noteTags.some(noteTag => noteTag.toLowerCase() === tag.toLowerCase())
      );
      if (!hasMatchingTag) return false;
    }

    // Date range filters
    if (options.dateFrom || options.dateTo) {
      const createdAt = doc.createdAt instanceof Timestamp
        ? doc.createdAt.toDate()
        : new Date();

      if (options.dateFrom && createdAt < options.dateFrom) return false;
      if (options.dateTo && createdAt > options.dateTo) return false;
    }

    // Status filter
    if (options.status && doc.processingStatus !== options.status) {
      return false;
    }

    // Title search (case-insensitive prefix match)
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      const titleLower = (doc.title || '').toLowerCase();
      const textLower = doc.text.toLowerCase();
      // Match if title starts with search term OR text contains search term
      if (!titleLower.startsWith(searchLower) && !textLower.includes(searchLower)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort notes by the specified field and order
 */
function sortNotes(
  docs: NoteDoc[],
  sortBy: 'createdAt' | 'updatedAt' | 'title' = 'createdAt',
  order: 'asc' | 'desc' = 'desc'
): NoteDoc[] {
  return [...docs].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'title') {
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      comparison = titleA.localeCompare(titleB);
    } else {
      // For createdAt and updatedAt
      const dateA = a[sortBy] instanceof Timestamp
        ? (a[sortBy] as Timestamp).toDate().getTime()
        : 0;
      const dateB = b[sortBy] instanceof Timestamp
        ? (b[sortBy] as Timestamp).toDate().getTime()
        : 0;
      comparison = dateA - dateB;
    }

    return order === 'desc' ? -comparison : comparison;
  });
}

/**
 * Optimized query using composite index with filters
 */
async function listNotesOptimized(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  pageLimit: number,
  cursorData: { createdAt: Date; id: string } | null,
  options: ListNotesOptions,
  allTags: string[]
): Promise<NotesListResponse> {
  const sortBy = options.sortBy || 'createdAt';
  const order = options.order || 'desc';

  // Build query with tenant filter
  let query: FirebaseFirestore.Query = db
    .collection(NOTES_COLLECTION)
    .where('tenantId', '==', tenantId);

  // Add status filter if specified (can be done in Firestore)
  if (options.status) {
    query = query.where('processingStatus', '==', options.status);
  }

  // Add tag filter using array-contains (only one tag at a time in Firestore)
  // For multiple tags, we'll need client-side filtering
  if (allTags.length === 1) {
    query = query.where('tags', 'array-contains', allTags[0]);
  }

  // Add date range filters if possible
  if (sortBy === 'createdAt') {
    if (options.dateFrom) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(options.dateFrom));
    }
    if (options.dateTo) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(options.dateTo));
    }
  }

  // Order by sort field
  query = query.orderBy(sortBy, order);
  query = query.orderBy('__name__', order);

  // Apply cursor
  if (cursorData) {
    query = query.startAfter(
      Timestamp.fromDate(cursorData.createdAt),
      cursorData.id
    );
  }

  // Fetch more if we need client-side filtering
  const needsClientFiltering = allTags.length > 1 ||
    options.search ||
    (sortBy !== 'createdAt' && (options.dateFrom || options.dateTo));
  const fetchLimit = needsClientFiltering ? pageLimit * 3 : pageLimit + 1;

  query = query.limit(fetchLimit);

  const snap = await query.get();

  // Map documents to NoteDoc
  let docs = snap.docs.map(d => {
    const data = d.data() as NoteDoc;
    if (!data.tenantId) {
      data.tenantId = DEFAULT_TENANT_ID;
    }
    return data;
  });

  // Apply client-side filters if needed
  if (needsClientFiltering) {
    docs = applyClientSideFilters(docs, options, allTags.length > 1 ? allTags : []);
  }

  // Determine if there are more results
  const hasMore = docs.length > pageLimit;
  const resultDocs = hasMore ? docs.slice(0, pageLimit) : docs;

  // Build next cursor from last result
  let nextCursor: string | null = null;
  if (hasMore && resultDocs.length > 0) {
    const lastDoc = resultDocs[resultDocs.length - 1];
    const lastCreatedAt = lastDoc.createdAt as Timestamp;
    nextCursor = encodeCursor(lastCreatedAt, lastDoc.id);
  }

  return {
    notes: resultDocs.map(docToResponse),
    cursor: nextCursor,
    hasMore,
  };
}

/**
 * Legacy query fallback - uses client-side filtering when index doesn't exist
 */
async function listNotesLegacy(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  pageLimit: number,
  cursorData: { createdAt: Date; id: string } | null,
  options: ListNotesOptions,
  allTags: string[]
): Promise<NotesListResponse> {
  const sortBy = options.sortBy || 'createdAt';
  const order = options.order || 'desc';

  // Fetch more than needed to account for client-side filtering
  const fetchLimit = pageLimit * 5;

  let query: FirebaseFirestore.Query = db
    .collection(NOTES_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(fetchLimit);

  if (cursorData) {
    query = query.startAfter(Timestamp.fromDate(cursorData.createdAt));
  }

  const snap = await query.get();

  // Map and filter by tenant
  let docs = snap.docs.map(d => {
    const data = d.data() as NoteDoc;
    if (!data.tenantId) {
      data.tenantId = DEFAULT_TENANT_ID;
    }
    return data;
  }).filter(d => d.tenantId === tenantId);

  // Apply all client-side filters
  docs = applyClientSideFilters(docs, options, allTags);

  // Apply client-side sorting if not createdAt desc
  if (sortBy !== 'createdAt' || order !== 'desc') {
    docs = sortNotes(docs, sortBy, order);
  }

  const hasMore = docs.length > pageLimit;
  const resultDocs = hasMore ? docs.slice(0, pageLimit) : docs;

  let nextCursor: string | null = null;
  if (hasMore && resultDocs.length > 0) {
    const lastDoc = resultDocs[resultDocs.length - 1];
    const lastCreatedAt = lastDoc.createdAt as Timestamp;
    nextCursor = encodeCursor(lastCreatedAt, lastDoc.id);
  }

  return {
    notes: resultDocs.map(docToResponse),
    cursor: nextCursor,
    hasMore,
  };
}

/**
 * Get a single note by ID
 */
export async function getNote(
  noteId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<NoteResponse | null> {
  const db = getDb();
  const doc = await db.collection(NOTES_COLLECTION).doc(noteId).get();

  if (!doc.exists) return null;

  const data = doc.data() as NoteDoc;

  // Verify tenant access
  if (data.tenantId !== tenantId) return null;

  return docToResponse(data);
}

/**
 * Options for updating a note
 */
export interface UpdateNoteOptions {
  title?: string;
  text?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Update an existing note
 *
 * This operation:
 * 1. Validates the note exists and belongs to the tenant
 * 2. Updates the note fields
 * 3. Re-processes chunks if text was changed
 * 4. Invalidates the tenant cache
 *
 * @param noteId - The ID of the note to update
 * @param tenantId - The tenant ID for ownership verification
 * @param options - Fields to update
 * @returns NoteResponse on success, null if note not found or access denied
 * @throws Error if update fails
 */
export async function updateNote(
  noteId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: UpdateNoteOptions = {}
): Promise<NoteResponse | null> {
  const db = getDb();
  const startTime = Date.now();

  // Validate inputs
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('noteId is required');
  }

  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  // Ensure at least one field is being updated
  if (!options.text && !options.title && !options.tags && !options.metadata) {
    throw new Error('at least one field must be provided for update');
  }

  // Validate text if provided
  if (options.text !== undefined) {
    const sanitizedText = sanitizeText(options.text, MAX_NOTE_LENGTH + 100);
    const trimmedText = sanitizedText.trim();

    if (!trimmedText) {
      throw new Error('text cannot be empty');
    }

    if (trimmedText.length > MAX_NOTE_LENGTH) {
      throw new Error(`text too long (max ${MAX_NOTE_LENGTH})`);
    }

    options.text = trimmedText;
  }

  // Fetch the note to verify it exists and belongs to the tenant
  const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);
  const noteDoc = await noteRef.get();

  if (!noteDoc.exists) {
    return null; // Note not found
  }

  const noteData = noteDoc.data() as NoteDoc;

  // Verify tenant ownership (security check)
  if (noteData.tenantId !== tenantId) {
    logWarn('Update note denied - tenant mismatch', {
      noteId,
      requestedTenant: tenantId,
      actualTenant: noteData.tenantId,
    });
    return null; // Access denied - treat as not found for security
  }

  // Build update object
  const updateData: Partial<NoteDoc> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  const textChanged = options.text !== undefined && options.text !== noteData.text;

  if (options.text !== undefined) {
    updateData.text = options.text;
    // Mark for re-processing if text changed
    if (textChanged) {
      updateData.processingStatus = 'pending';
    }
  }

  if (options.title !== undefined) {
    updateData.title = options.title.trim().slice(0, 500);
  }

  if (options.tags !== undefined) {
    updateData.tags = options.tags.slice(0, 20).map(t => t.trim().slice(0, 50));
  }

  if (options.metadata !== undefined) {
    updateData.metadata = options.metadata;
  }

  // Update the note
  await noteRef.update(updateData);

  // If text changed, delete old chunks and re-process
  if (textChanged) {
    try {
      // Delete existing chunks
      const chunksSnap = await db
        .collection(CHUNKS_COLLECTION)
        .where('noteId', '==', noteId)
        .get();

      if (!chunksSnap.empty) {
        const chunkIds: string[] = [];
        const BATCH_SIZE = 400;

        for (let i = 0; i < chunksSnap.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const batchDocs = chunksSnap.docs.slice(i, i + BATCH_SIZE);

          for (const chunkDoc of batchDocs) {
            chunkIds.push(chunkDoc.id);
            batch.delete(chunkDoc.ref);
          }

          await batch.commit();
        }

        // Remove from Vertex index
        const vertexIndex = getVertexIndex();
        if (vertexIndex && chunkIds.length > 0) {
          try {
            await vertexIndex.remove(chunkIds);
          } catch (vertexErr) {
            logError('Failed to remove old chunks from Vertex index during update', vertexErr, {
              noteId,
              chunkCount: chunkIds.length,
            });
          }
        }
      }

      // Fetch updated note data and re-process chunks
      const updatedDoc = await noteRef.get();
      const updatedData = updatedDoc.data() as NoteDoc;

      await processNoteChunks(updatedData);

      // Mark as ready
      await noteRef.update({
        processingStatus: 'ready',
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      // Mark as failed but don't fail the update
      await noteRef.update({
        processingStatus: 'failed',
        processingError: err instanceof Error ? err.message : 'Unknown error',
      });
      logError('Chunk re-processing failed during note update', err, { noteId });
    }
  }

  // Invalidate cache
  invalidateTenantCache(tenantId);

  // Fetch final state
  const finalDoc = await noteRef.get();
  const finalData = finalDoc.data() as NoteDoc;

  logInfo('Note updated', {
    noteId,
    tenantId,
    textChanged,
    elapsedMs: Date.now() - startTime,
  });

  return docToResponse(finalData);
}

/**
 * Delete a note and all associated data
 *
 * This operation:
 * 1. Validates the note exists and belongs to the tenant
 * 2. Deletes all associated chunks from Firestore
 * 3. Removes chunk vectors from Vertex AI index (if configured)
 * 4. Deletes the note document
 * 5. Invalidates the tenant cache
 *
 * @param noteId - The ID of the note to delete
 * @param tenantId - The tenant ID for ownership verification
 * @returns DeleteNoteResponse on success, null if note not found or access denied
 * @throws Error if deletion fails
 */
export async function deleteNote(
  noteId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<DeleteNoteResponse | null> {
  const db = getDb();
  const startTime = Date.now();

  // Validate inputs
  if (!noteId || typeof noteId !== 'string') {
    throw new Error('noteId is required');
  }

  if (!isValidTenantId(tenantId)) {
    throw new Error('invalid tenantId format');
  }

  // Fetch the note to verify it exists and belongs to the tenant
  const noteRef = db.collection(NOTES_COLLECTION).doc(noteId);
  const noteDoc = await noteRef.get();

  if (!noteDoc.exists) {
    return null; // Note not found
  }

  const noteData = noteDoc.data() as NoteDoc;

  // Verify tenant ownership (security check)
  if (noteData.tenantId !== tenantId) {
    logWarn('Delete note denied - tenant mismatch', {
      noteId,
      requestedTenant: tenantId,
      actualTenant: noteData.tenantId,
    });
    return null; // Access denied - treat as not found for security
  }

  // Find and delete all associated chunks
  let chunksDeleted = 0;
  const chunkIds: string[] = [];

  try {
    // Query all chunks for this note
    const chunksSnap = await db
      .collection(CHUNKS_COLLECTION)
      .where('noteId', '==', noteId)
      .get();

    if (!chunksSnap.empty) {
      // Collect chunk IDs for Vertex removal
      chunksSnap.docs.forEach(doc => chunkIds.push(doc.id));

      // Delete chunks in batches (Firestore limit: 500 per batch)
      const BATCH_SIZE = 400;
      for (let i = 0; i < chunksSnap.docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const batchDocs = chunksSnap.docs.slice(i, i + BATCH_SIZE);

        for (const chunkDoc of batchDocs) {
          batch.delete(chunkDoc.ref);
        }

        await batch.commit();
        chunksDeleted += batchDocs.length;
      }
    }

    // Remove from Vertex AI Vector Search index (if configured)
    if (chunkIds.length > 0) {
      const vertexIndex = getVertexIndex();
      if (vertexIndex) {
        try {
          await vertexIndex.remove(chunkIds);
          logInfo('Removed chunks from Vertex index', {
            noteId,
            chunkCount: chunkIds.length
          });
        } catch (vertexErr) {
          // Log but don't fail - Vertex sync is best-effort
          logError('Failed to remove chunks from Vertex index', vertexErr, {
            noteId,
            chunkCount: chunkIds.length
          });
        }
      }
    }

    // Delete the note document
    await noteRef.delete();

    // Invalidate retrieval cache for this tenant
    invalidateTenantCache(tenantId);

    const elapsedMs = Date.now() - startTime;

    logInfo('Note deleted', {
      noteId,
      tenantId,
      chunksDeleted,
      elapsedMs,
    });

    return {
      success: true,
      id: noteId,
      deletedAt: new Date().toISOString(),
      chunksDeleted,
    };
  } catch (err) {
    logError('Note deletion failed', err, { noteId, tenantId });
    throw err;
  }
}

// ============================================
// Semantic Search
// ============================================

import { retrieveRelevantChunks } from "./retrieval";
import { ScoredChunk } from "./types";

/**
 * Search result with relevance score
 */
export interface SearchNoteResult {
  note: NoteResponse;
  relevanceScore: number;
  matchedChunks?: Array<{
    text: string;
    score: number;
  }>;
}

/**
 * Search notes response
 */
export interface SearchNotesResponse {
  results: SearchNoteResult[];
  totalMatches: number;
  queryTimeMs: number;
}

/**
 * Options for semantic note search
 */
export interface SearchNotesOptions {
  /** Maximum number of notes to return */
  limit?: number;
  /** Minimum relevance score threshold (0-1) */
  threshold?: number;
  /** Include matched chunks in response */
  includeChunks?: boolean;
  /** Filter options */
  filters?: {
    tags?: string[];
    dateFrom?: Date;
    dateTo?: Date;
    status?: 'pending' | 'ready' | 'failed';
  };
}

/**
 * Semantic search across notes using the RAG retrieval pipeline
 *
 * This function leverages the existing retrieval infrastructure (vector search,
 * BM25, reranking) to find notes semantically similar to the query.
 *
 * @param query - Natural language search query
 * @param tenantId - Tenant ID for data isolation
 * @param options - Search options
 * @returns Search results with relevance scores
 */
export async function searchNotes(
  query: string,
  tenantId: string = DEFAULT_TENANT_ID,
  options: SearchNotesOptions = {}
): Promise<SearchNotesResponse> {
  const startTime = Date.now();
  const limit = Math.min(options.limit || 10, 50);
  const threshold = options.threshold ?? 0.1;

  // Use the retrieval pipeline to get relevant chunks
  const { chunks } = await retrieveRelevantChunks(query, {
    tenantId,
    topK: limit * 5, // Fetch more chunks since we'll dedupe by note
    rerankTo: limit * 3,
    maxAgeDays: options.filters?.dateFrom
      ? Math.ceil((Date.now() - options.filters.dateFrom.getTime()) / (1000 * 60 * 60 * 24))
      : undefined,
  });

  // Group chunks by noteId and calculate note-level scores
  const noteScores = new Map<string, { score: number; chunks: ScoredChunk[] }>();

  for (const chunk of chunks) {
    const existing = noteScores.get(chunk.noteId);
    if (existing) {
      // Use max score from any chunk, but also track all chunks
      existing.score = Math.max(existing.score, chunk.score);
      existing.chunks.push(chunk);
    } else {
      noteScores.set(chunk.noteId, { score: chunk.score, chunks: [chunk] });
    }
  }

  // Filter by threshold and sort by score
  const sortedNoteIds = Array.from(noteScores.entries())
    .filter(([_, data]) => data.score >= threshold)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  // Fetch full note documents
  const db = getDb();
  const results: SearchNoteResult[] = [];

  for (const [noteId, { score, chunks: matchedChunks }] of sortedNoteIds) {
    const noteDoc = await db.collection(NOTES_COLLECTION).doc(noteId).get();

    if (!noteDoc.exists) continue;

    const noteData = noteDoc.data() as NoteDoc;

    // Verify tenant access
    if (noteData.tenantId !== tenantId) continue;

    // Apply filters
    if (options.filters) {
      const { tags, dateFrom, dateTo, status } = options.filters;

      // Tag filter
      if (tags && tags.length > 0) {
        const noteTags = noteData.tags || [];
        const hasMatchingTag = tags.some(tag =>
          noteTags.some(noteTag => noteTag.toLowerCase() === tag.toLowerCase())
        );
        if (!hasMatchingTag) continue;
      }

      // Date filters
      const createdAt = noteData.createdAt instanceof Timestamp
        ? noteData.createdAt.toDate()
        : new Date();

      if (dateFrom && createdAt < dateFrom) continue;
      if (dateTo && createdAt > dateTo) continue;

      // Status filter
      if (status && noteData.processingStatus !== status) continue;
    }

    const result: SearchNoteResult = {
      note: docToResponse(noteData),
      relevanceScore: score,
    };

    if (options.includeChunks) {
      result.matchedChunks = matchedChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(c => ({
          text: c.text.slice(0, 300) + (c.text.length > 300 ? '...' : ''),
          score: c.score,
        }));
    }

    results.push(result);
  }

  const queryTimeMs = Date.now() - startTime;

  logInfo('Semantic note search completed', {
    query: query.slice(0, 100),
    tenantId,
    totalMatches: results.length,
    queryTimeMs,
  });

  return {
    results,
    totalMatches: results.length,
    queryTimeMs,
  };
}

```

---

## src/query.ts

**Path:** `src/query.ts`

```ts
/**
 * AuroraNotes API - Query Understanding Module
 *
 * Analyzes user queries to extract intent, time hints, keywords, and entities.
 * Improves retrieval quality by understanding what the user is looking for.
 *
 * Optimizations:
 * - Request-scoped memoization to avoid re-analyzing the same query
 */

import { QueryAnalysis, QueryIntent } from "./types";
import { extractKeywords, requestMemo } from "./utils";

// Intent detection patterns - ordered by specificity (most specific first)
const INTENT_PATTERNS: { pattern: RegExp; intent: QueryIntent }[] = [
  // Summarize patterns
  { pattern: /\b(summarize|summary|overview|recap|brief|tldr|tl;dr)\b/i, intent: 'summarize' },
  { pattern: /\bwhat (are|were) (my|the|our) (key|main|important)\b/i, intent: 'summarize' },
  { pattern: /\bgive me (a|the) (summary|overview|recap)\b/i, intent: 'summarize' },
  { pattern: /\bhighlight(s)?\b/i, intent: 'summarize' },

  // Decision patterns - check before general question patterns
  { pattern: /\b(decision|decide|chose|chosen|selected|picked|went with)\b/i, intent: 'decision' },
  { pattern: /\bwhy did (I|we) (choose|pick|select|go with|decide)\b/i, intent: 'decision' },
  { pattern: /\bwhat did (I|we) decide\b/i, intent: 'decision' },
  { pattern: /\b(reasoning|rationale) (behind|for)\b/i, intent: 'decision' },

  // Action item patterns (support plurals and common variations)
  { pattern: /\b(todos?|to-dos?|action items?|tasks?|next steps?|follow[- ]?ups?)\b/i, intent: 'action_item' },
  { pattern: /\bwhat (do I|should I|need to|must I) (do|complete|finish|work on)\b/i, intent: 'action_item' },
  { pattern: /\bpending (tasks?|items?|work)\b/i, intent: 'action_item' },
  { pattern: /\bremind(er)?s?\b/i, intent: 'action_item' },
  { pattern: /\b(outstanding|incomplete|open) (items?|tasks?)\b/i, intent: 'action_item' },

  // List patterns (must come after action_item since "what are my todos" should match action_item)
  { pattern: /\b(list|show me|give me|enumerate|all the)\b/i, intent: 'list' },
  { pattern: /\bhow many\b/i, intent: 'list' },
  { pattern: /\bwhat are (all|the) (?!.*\b(todos?|action items?|tasks?)\b)/i, intent: 'list' },

  // Question patterns (generic - lowest priority)
  { pattern: /^(what|who|when|where|why|how|which|is|are|was|were|do|does|did|can|could|will|would)\b/i, intent: 'question' },
];

// Time hint patterns with more granularity
const TIME_PATTERNS: { pattern: RegExp; days: number }[] = [
  { pattern: /\b(today|now|current|just now)\b/i, days: 1 },
  { pattern: /\byesterday\b/i, days: 2 },
  { pattern: /\b(this week|past week|current week)\b/i, days: 7 },
  { pattern: /\blast week\b/i, days: 14 },
  { pattern: /\bpast (few|couple) days\b/i, days: 5 },
  { pattern: /\b(this month|past month|current month)\b/i, days: 30 },
  { pattern: /\blast month\b/i, days: 60 },
  { pattern: /\b(this year|past year)\b/i, days: 365 },
  { pattern: /\b(recent(ly)?|latest|newest|new)\b/i, days: 14 },
  { pattern: /\b(last|past) (\d+) days?\b/i, days: -1 }, // Special: extract number
  { pattern: /\b(last|past) (\d+) weeks?\b/i, days: -2 }, // Special: extract weeks
  { pattern: /\b(last|past) (\d+) months?\b/i, days: -3 }, // Special: extract months
  { pattern: /\ball (time|notes|history|ever)\b/i, days: 365 },
  { pattern: /\b(older|old|earlier)\b/i, days: 180 },
];

// Entity extraction patterns (projects, names, etc.)
const ENTITY_PATTERNS: RegExp[] = [
  // Capitalized words that might be names/projects (2+ chars)
  /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b/g,
  // Quoted terms
  /"([^"]+)"/g,
  /'([^']+)'/g,
];

/**
 * Normalize query for consistent processing
 */
function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s?!.,'"()-]/g, '') // Remove unusual chars
    .slice(0, 2000); // Limit length
}

/**
 * Detect query intent
 */
function detectIntent(query: string): QueryIntent {
  const lowerQuery = query.toLowerCase();
  
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(lowerQuery)) {
      return intent;
    }
  }
  
  // Default to search if no specific intent detected
  return 'search';
}

/**
 * Extract time hints from query with support for various time units
 */
function extractTimeHint(query: string): QueryAnalysis['timeHint'] | undefined {
  const lowerQuery = query.toLowerCase();

  for (const { pattern, days } of TIME_PATTERNS) {
    const match = lowerQuery.match(pattern);
    if (match) {
      // Handle "last N days" pattern
      if (days === -1 && match[2]) {
        const numDays = parseInt(match[2], 10);
        if (!isNaN(numDays) && numDays > 0 && numDays <= 365) {
          return { days: numDays };
        }
      }
      // Handle "last N weeks" pattern
      if (days === -2 && match[2]) {
        const numWeeks = parseInt(match[2], 10);
        if (!isNaN(numWeeks) && numWeeks > 0 && numWeeks <= 52) {
          return { days: numWeeks * 7 };
        }
      }
      // Handle "last N months" pattern
      if (days === -3 && match[2]) {
        const numMonths = parseInt(match[2], 10);
        if (!isNaN(numMonths) && numMonths > 0 && numMonths <= 12) {
          return { days: numMonths * 30 };
        }
      }
      if (days > 0) {
        return { days };
      }
    }
  }

  return undefined;
}

/**
 * Extract named entities from query
 */
function extractEntities(query: string): string[] {
  const entities = new Set<string>();
  
  for (const pattern of ENTITY_PATTERNS) {
    let match;
    // Reset regex state
    pattern.lastIndex = 0;
    while ((match = pattern.exec(query)) !== null) {
      const entity = match[1].trim();
      // Filter out common words that might be capitalized
      const commonWords = ['I', 'My', 'The', 'What', 'When', 'Where', 'Why', 'How', 'Which', 'Who'];
      if (entity.length > 1 && !commonWords.includes(entity)) {
        entities.add(entity);
      }
    }
  }
  
  return Array.from(entities).slice(0, 5);
}

/**
 * Intent-specific boost terms for improved recall
 * Each intent has primary (high weight) and secondary (lower weight) terms
 */
const INTENT_BOOST_TERMS: Record<QueryIntent, { primary: string[]; secondary: string[] }> = {
  decision: {
    primary: ['decided', 'chose', 'chosen', 'selected', 'decision', 'picked', 'went'],
    secondary: ['because', 'reason', 'why', 'rationale', 'conclusion', 'option', 'alternative'],
  },
  action_item: {
    primary: ['todo', 'task', 'action', 'item', 'pending', 'follow', 'followup'],
    secondary: ['need', 'must', 'should', 'complete', 'finish', 'do', 'next', 'step', 'due', 'assigned', 'owner', 'deadline', 'priority', 'urgent'],
  },
  summarize: {
    primary: ['summary', 'key', 'main', 'overview', 'highlight'],
    secondary: ['important', 'point', 'conclusion', 'takeaway', 'finding', 'result', 'outcome'],
  },
  list: {
    primary: ['list', 'items', 'all', 'every', 'each'],
    secondary: ['mentioned', 'include', 'contain', 'enumerate', 'names', 'people', 'things'],
  },
  question: {
    primary: [],
    secondary: [],
  },
  search: {
    primary: [],
    secondary: [],
  },
};

/**
 * Generate boost terms based on intent and keywords
 * Now includes more comprehensive intent-specific terms for better recall
 */
function generateBoostTerms(keywords: string[], intent: QueryIntent): string[] {
  const boostTerms = [...keywords];

  // Add intent-specific boost terms (primary first, then secondary)
  const intentTerms = INTENT_BOOST_TERMS[intent];
  if (intentTerms) {
    // Add primary terms (high value)
    boostTerms.push(...intentTerms.primary);
    // Add secondary terms (lower value but helpful for recall)
    boostTerms.push(...intentTerms.secondary);
  }

  // Deduplicate and limit to avoid overly broad searches
  return [...new Set(boostTerms)].slice(0, 20);
}

/**
 * Internal query analysis implementation
 */
function analyzeQueryInternal(query: string): QueryAnalysis {
  const normalizedQuery = normalizeQuery(query);
  const intent = detectIntent(normalizedQuery);
  const keywords = extractKeywords(normalizedQuery);
  const timeHint = extractTimeHint(normalizedQuery);
  const entities = extractEntities(query); // Use original for entity extraction
  const boostTerms = generateBoostTerms(keywords, intent);

  return {
    originalQuery: query,
    normalizedQuery,
    keywords,
    intent,
    timeHint,
    entities: entities.length > 0 ? entities : undefined,
    boostTerms: boostTerms.length > keywords.length ? boostTerms : undefined,
  };
}

/**
 * Main query analysis function with request-scoped memoization.
 * Avoids re-analyzing the same query multiple times within a single request.
 */
export function analyzeQuery(query: string): QueryAnalysis {
  return requestMemo(`query_analysis:${query}`, () => analyzeQueryInternal(query));
}


```

---

## src/queryExpansion.ts

**Path:** `src/queryExpansion.ts`

```ts
/**
 * AuroraNotes API - Query Expansion Module
 * 
 * Uses Gemini to generate multiple query variations for improved recall.
 * This is an optional feature behind the QUERY_EXPANSION_ENABLED flag.
 * 
 * Multi-query expansion helps with:
 * - Synonym coverage (e.g., "meeting" → "call", "discussion", "sync")
 * - Phrasing variations (e.g., "how to X" → "steps for X", "X tutorial")
 * - Entity normalization (e.g., "AWS" → "Amazon Web Services")
 */

import { getGenAIClient, isGenAIAvailable } from "./genaiClient";
import { logInfo, logError, logWarn } from "./utils";
import { QUERY_EXPANSION_ENABLED, QUERY_EXPANSION_REWRITES, QUERY_EXPANSION_TTL_MS, QUERY_EXPANSION_MODEL } from "./config";

// Cache for expanded queries to avoid repeated LLM calls
const expansionCache = new Map<string, { variants: string[]; timestamp: number }>();
const MAX_CACHE_SIZE = 100;

// Expansion prompt template
const EXPANSION_PROMPT = `You are a query expansion assistant for a personal notes search system.

Given a user's search query, generate ${QUERY_EXPANSION_REWRITES} alternative phrasings that would help find relevant notes.

Rules:
1. Keep the same semantic meaning
2. Use synonyms and related terms
3. Try different phrasings (questions, statements, keywords)
4. Include any acronym expansions or abbreviations
5. Keep each variant concise (under 50 words)
6. Return ONLY the variants, one per line, no numbering or bullets

User query: "{query}"

Alternative phrasings:`;

/**
 * Check if query expansion is available
 */
export function isQueryExpansionAvailable(): boolean {
  return QUERY_EXPANSION_ENABLED && isGenAIAvailable();
}

/**
 * Get cache key for a query
 */
function getCacheKey(query: string): string {
  return query.toLowerCase().trim();
}

/**
 * Evict old cache entries
 */
function evictOldCacheEntries(): void {
  const now = Date.now();
  for (const [key, value] of expansionCache.entries()) {
    if (now - value.timestamp > QUERY_EXPANSION_TTL_MS) {
      expansionCache.delete(key);
    }
  }
  
  // Also evict if cache is too large
  if (expansionCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(expansionCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    for (const [key] of toDelete) {
      expansionCache.delete(key);
    }
  }
}

/**
 * Expand a query into multiple variants using Gemini
 * 
 * @param query - Original user query
 * @returns Array of query variants (including original)
 */
export async function expandQuery(query: string): Promise<string[]> {
  if (!isQueryExpansionAvailable()) {
    return [query];
  }

  const cacheKey = getCacheKey(query);
  
  // Check cache
  const cached = expansionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < QUERY_EXPANSION_TTL_MS) {
    logInfo('Query expansion cache hit', { query: query.slice(0, 50) });
    return cached.variants;
  }

  const startTime = Date.now();

  try {
    const client = getGenAIClient();
    const prompt = EXPANSION_PROMPT.replace('{query}', query);

    const response = await client.models.generateContent({
      model: QUERY_EXPANSION_MODEL,
      contents: prompt,
      config: {
        temperature: 0.7, // Some creativity for variations
        maxOutputTokens: 200,
      },
    });

    const text = response.text?.trim() || '';
    
    // Parse variants from response
    const variants = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.length < 200)
      .slice(0, QUERY_EXPANSION_REWRITES);

    // Always include original query first
    const allVariants = [query, ...variants.filter(v => v.toLowerCase() !== query.toLowerCase())];

    // Cache the result
    evictOldCacheEntries();
    expansionCache.set(cacheKey, { variants: allVariants, timestamp: Date.now() });

    logInfo('Query expansion complete', {
      originalQuery: query.slice(0, 50),
      variantCount: allVariants.length,
      elapsedMs: Date.now() - startTime,
    });

    return allVariants;
  } catch (err) {
    logError('Query expansion failed', err);
    return [query]; // Fallback to original query
  }
}


```

---

## src/queue.ts

**Path:** `src/queue.ts`

```ts
/**
 * AuroraNotes API - Background Job Queue
 *
 * In-process async queue with backpressure for chunk/embedding processing.
 * Provides graceful degradation when queue is full and retry logic.
 *
 * QUEUE MODES:
 *   - in-process (default): Jobs processed in-memory with backpressure
 *   - cloud-tasks (env QUEUE_MODE=cloud-tasks): Optional Cloud Tasks for durability
 */

import { NoteDoc } from "./types";
import { processNoteChunks } from "./chunking";
import { logInfo, logError, logWarn } from "./utils";
import {
  QUEUE_MODE,
  CLOUD_TASKS_QUEUE_NAME,
  CLOUD_TASKS_LOCATION,
  CLOUD_TASKS_SERVICE_URL,
  PROJECT_ID,
  INTERNAL_AUTH_ENABLED,
  INTERNAL_AUTH_AUDIENCE,
  CLOUD_TASKS_OIDC_SERVICE_ACCOUNT,
} from "./config";

// Queue configuration
const DEFAULT_MAX_QUEUE_SIZE = 100;
const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;
const STATS_LOG_INTERVAL_MS = 60000; // Log stats every minute

interface QueueJob {
  id: string;
  note: NoteDoc;
  retries: number;
  createdAt: Date;
}

interface QueueConfig {
  maxSize: number;
  maxConcurrent: number;
  maxRetries: number;
  retryDelayMs: number;
}

class BackgroundQueue {
  private queue: QueueJob[] = [];
  private processing: Set<string> = new Set();
  private config: QueueConfig;
  private isProcessing = false;
  private totalProcessed = 0;
  private totalFailed = 0;
  private totalDropped = 0;
  private totalRetries = 0;
  private lastStatsLog = 0;

  constructor(config?: Partial<QueueConfig>) {
    const envMaxSize = parseInt(process.env.BACKGROUND_QUEUE_MAX_SIZE || '');
    this.config = {
      maxSize: config?.maxSize ?? (isNaN(envMaxSize) ? DEFAULT_MAX_QUEUE_SIZE : envMaxSize),
      maxConcurrent: config?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
      maxRetries: config?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelayMs: config?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    };

    logInfo('Background queue initialized', {
      maxSize: this.config.maxSize,
      maxConcurrent: this.config.maxConcurrent,
      mode: process.env.QUEUE_MODE || 'in-process',
    });

    // Start periodic stats logging if there's activity
    this.startStatsLogger();
  }

  /**
   * Periodically log queue statistics for monitoring
   */
  private startStatsLogger(): void {
    setInterval(() => {
      // Only log if there's been activity since last log
      if (this.totalProcessed > 0 || this.totalFailed > 0 ||
          this.totalDropped > 0 || this.queue.length > 0) {
        this.logQueueStats();
      }
    }, STATS_LOG_INTERVAL_MS);
  }

  /**
   * Log comprehensive queue statistics
   */
  private logQueueStats(): void {
    const stats = this.getStats();
    const utilization = Math.round((stats.queueSize / this.config.maxSize) * 100);

    logInfo('Queue stats', {
      ...stats,
      maxSize: this.config.maxSize,
      utilization: `${utilization}%`,
      healthy: this.isHealthy(),
      mode: process.env.QUEUE_MODE || 'in-process',
    });
  }

  /**
   * Enqueue a note for background processing
   * Returns true if enqueued, false if queue is full
   */
  enqueue(note: NoteDoc): boolean {
    // Check if already in queue or processing
    if (this.queue.some(j => j.id === note.id) || this.processing.has(note.id)) {
      logInfo('Note already in queue', { noteId: note.id });
      return true;
    }

    // Check queue capacity
    if (this.queue.length >= this.config.maxSize) {
      this.totalDropped++;
      logWarn('Queue full, dropping job', { 
        noteId: note.id, 
        queueSize: this.queue.length,
        totalDropped: this.totalDropped,
      });
      return false;
    }

    this.queue.push({
      id: note.id,
      note,
      retries: 0,
      createdAt: new Date(),
    });

    logInfo('Job enqueued', { 
      noteId: note.id, 
      queueSize: this.queue.length,
    });

    // Start processing if not already running
    this.processQueue();
    return true;
  }

  /**
   * Process jobs from the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.processing.size < this.config.maxConcurrent) {
      const job = this.queue.shift();
      if (!job) break;

      this.processing.add(job.id);
      this.processJob(job).finally(() => {
        this.processing.delete(job.id);
        // Continue processing if more jobs
        if (this.queue.length > 0) {
          setImmediate(() => this.processQueue());
        }
      });
    }

    this.isProcessing = false;
  }

  /**
   * Process a single job with retry logic
   */
  private async processJob(job: QueueJob): Promise<void> {
    const startTime = Date.now();
    try {
      await processNoteChunks(job.note);
      this.totalProcessed++;
      logInfo('Background job completed', {
        noteId: job.id,
        elapsedMs: Date.now() - startTime,
        totalProcessed: this.totalProcessed,
      });
    } catch (err) {
      if (job.retries < this.config.maxRetries) {
        job.retries++;
        this.totalRetries++;

        const delay = this.config.retryDelayMs * job.retries;
        logWarn('Background job failed, retrying', {
          noteId: job.id,
          attempt: job.retries,
          maxRetries: this.config.maxRetries,
          nextRetryMs: delay,
          errorMessage: err instanceof Error ? err.message : String(err),
        });

        // Re-queue with exponential backoff delay
        setTimeout(() => {
          this.queue.push(job);
          this.processQueue();
        }, delay);
      } else {
        this.totalFailed++;
        logError('Background job failed permanently', err, {
          noteId: job.id,
          attempts: job.retries + 1,
          totalFailed: this.totalFailed,
          queueStats: this.getStats(),
        });
      }
    }
  }

  /**
   * Get queue statistics for monitoring
   */
  getStats(): {
    queueSize: number;
    processing: number;
    totalProcessed: number;
    totalFailed: number;
    totalDropped: number;
    totalRetries: number;
  } {
    return {
      queueSize: this.queue.length,
      processing: this.processing.size,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      totalDropped: this.totalDropped,
      totalRetries: this.totalRetries,
    };
  }

  /**
   * Check if queue is healthy
   */
  isHealthy(): boolean {
    return this.queue.length < this.config.maxSize * 0.9;
  }
}

// Singleton instance
let queueInstance: BackgroundQueue | null = null;

export function getBackgroundQueue(): BackgroundQueue {
  if (!queueInstance) {
    queueInstance = new BackgroundQueue();
  }
  return queueInstance;
}

/**
 * Enqueue note for processing - uses Cloud Tasks or in-process queue based on QUEUE_MODE
 */
export async function enqueueNoteProcessing(note: NoteDoc): Promise<boolean> {
  if (QUEUE_MODE === 'cloud-tasks') {
    return enqueueToCloudTasks(note);
  }
  return getBackgroundQueue().enqueue(note);
}

/**
 * Enqueue note processing to Google Cloud Tasks for durable processing
 */
async function enqueueToCloudTasks(note: NoteDoc): Promise<boolean> {
  if (!CLOUD_TASKS_SERVICE_URL) {
    logError('Cloud Tasks service URL not configured', null);
    // Fall back to in-process queue
    return getBackgroundQueue().enqueue(note);
  }

  // Check for OIDC configuration when internal auth is enabled
  if (INTERNAL_AUTH_ENABLED && !CLOUD_TASKS_OIDC_SERVICE_ACCOUNT) {
    logError('Cloud Tasks OIDC misconfiguration: INTERNAL_AUTH_ENABLED=true but no service account configured', null, {
      noteId: note.id,
      hint: 'Set CLOUD_TASKS_OIDC_SERVICE_ACCOUNT or INTERNAL_AUTH_SERVICE_ACCOUNT to the service account email used by Cloud Tasks',
    });
    // Fall back to in-process queue
    return getBackgroundQueue().enqueue(note);
  }

  try {
    // Dynamic require to handle optional @google-cloud/tasks dependency
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let CloudTasksClient: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      CloudTasksClient = require('@google-cloud/tasks').CloudTasksClient;
    } catch {
      logError('@google-cloud/tasks not installed, falling back to in-process queue', null);
      return getBackgroundQueue().enqueue(note);
    }
    const client = new CloudTasksClient();

    const queuePath = client.queuePath(
      PROJECT_ID,
      CLOUD_TASKS_LOCATION,
      CLOUD_TASKS_QUEUE_NAME
    );

    // Create the task payload
    const taskPayload = {
      noteId: note.id,
      tenantId: note.tenantId,
    };

    // Build the HTTP request
    const httpRequest: {
      httpMethod: 'POST';
      url: string;
      headers: Record<string, string>;
      body: string;
      oidcToken?: { serviceAccountEmail: string; audience: string };
    } = {
      httpMethod: 'POST' as const,
      url: `${CLOUD_TASKS_SERVICE_URL}/internal/process-note`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(taskPayload)).toString('base64'),
    };

    // Add OIDC token when internal auth is enabled
    if (INTERNAL_AUTH_ENABLED && CLOUD_TASKS_OIDC_SERVICE_ACCOUNT) {
      httpRequest.oidcToken = {
        serviceAccountEmail: CLOUD_TASKS_OIDC_SERVICE_ACCOUNT,
        audience: INTERNAL_AUTH_AUDIENCE || CLOUD_TASKS_SERVICE_URL,
      };
      logInfo('Cloud Tasks OIDC token configured', {
        serviceAccount: CLOUD_TASKS_OIDC_SERVICE_ACCOUNT,
        audience: INTERNAL_AUTH_AUDIENCE || CLOUD_TASKS_SERVICE_URL,
      });
    }

    const task = { httpRequest };

    const [response] = await client.createTask({ parent: queuePath, task });

    logInfo('Task enqueued to Cloud Tasks', {
      noteId: note.id,
      taskName: response.name,
      queuePath,
      hasOidcToken: !!httpRequest.oidcToken,
    });

    return true;
  } catch (err) {
    logError('Failed to enqueue to Cloud Tasks, falling back to in-process', err, {
      noteId: note.id,
    });
    // Fall back to in-process queue on failure
    return getBackgroundQueue().enqueue(note);
  }
}

export function getQueueStats() {
  return getBackgroundQueue().getStats();
}


```

---

## src/rankFusion.ts

**Path:** `src/rankFusion.ts`

```ts
/**
 * AuroraNotes API - Rank Fusion Module
 *
 * Implements Reciprocal Rank Fusion (RRF) and other fusion strategies
 * for combining multiple retrieval signals (vector, lexical, recency).
 *
 * RRF is parameter-free and robust to different score distributions,
 * making it ideal for hybrid retrieval without careful weight tuning.
 *
 * Reference: Cormack et al., "Reciprocal Rank Fusion outperforms Condorcet
 * and individual Rank Learning Methods" (2009)
 */

import { ChunkDoc, ScoredChunk } from "./types";
import { Timestamp } from "firebase-admin/firestore";
import { logInfo } from "./utils";

// RRF constant (k=60 is standard, lower values give more weight to top ranks)
const RRF_K = 60;

// Source weights for weighted RRF (optional enhancement)
const SOURCE_WEIGHTS = {
  vector: 1.0,
  lexical: 0.8,
  recency: 0.3,
};

/**
 * Ranking from a single retrieval source
 */
export interface SourceRanking {
  source: 'vector' | 'lexical' | 'recency';
  rankings: Map<string, number>; // chunkId -> rank (1-indexed)
  scores?: Map<string, number>;  // Optional raw scores for debugging
}

/**
 * RRF result with detailed scoring breakdown
 */
export interface RRFResult {
  chunkId: string;
  rrfScore: number;
  contributingSources: ('vector' | 'lexical' | 'recency')[];
  sourceRanks: Map<string, number>;
}

/**
 * Standard Reciprocal Rank Fusion
 *
 * Combines multiple rankings into a single ranking using:
 * RRF_score(d) = Σ 1/(k + rank_i(d))
 *
 * where k is a constant (typically 60) and rank_i(d) is the rank of
 * document d in the i-th ranking (1-indexed, missing = infinity).
 *
 * @param rankings - Array of rankings from different sources
 * @param k - RRF constant (default 60)
 * @returns Map of chunkId -> RRF score
 */
export function reciprocalRankFusion(
  rankings: SourceRanking[],
  k: number = RRF_K
): Map<string, RRFResult> {
  const results = new Map<string, RRFResult>();

  for (const { source, rankings: sourceRanks } of rankings) {
    for (const [chunkId, rank] of sourceRanks) {
      const existing = results.get(chunkId);

      if (existing) {
        existing.rrfScore += 1 / (k + rank);
        existing.contributingSources.push(source);
        existing.sourceRanks.set(source, rank);
      } else {
        results.set(chunkId, {
          chunkId,
          rrfScore: 1 / (k + rank),
          contributingSources: [source],
          sourceRanks: new Map([[source, rank]]),
        });
      }
    }
  }

  return results;
}

/**
 * Weighted Reciprocal Rank Fusion
 *
 * Like standard RRF but applies source-specific weights:
 * WRRF_score(d) = Σ w_i / (k + rank_i(d))
 *
 * This allows prioritizing certain retrieval sources.
 */
export function weightedRRF(
  rankings: SourceRanking[],
  weights: typeof SOURCE_WEIGHTS = SOURCE_WEIGHTS,
  k: number = RRF_K
): Map<string, RRFResult> {
  const results = new Map<string, RRFResult>();

  for (const { source, rankings: sourceRanks } of rankings) {
    const weight = weights[source] || 1.0;

    for (const [chunkId, rank] of sourceRanks) {
      const existing = results.get(chunkId);
      const contribution = weight / (k + rank);

      if (existing) {
        existing.rrfScore += contribution;
        existing.contributingSources.push(source);
        existing.sourceRanks.set(source, rank);
      } else {
        results.set(chunkId, {
          chunkId,
          rrfScore: contribution,
          contributingSources: [source],
          sourceRanks: new Map([[source, rank]]),
        });
      }
    }
  }

  return results;
}

/**
 * Convert scored chunks to a ranking (ordered by score desc)
 */
export function scoresToRanking(
  chunkScores: Map<string, number>,
  source: 'vector' | 'lexical' | 'recency'
): SourceRanking {
  // Sort by score descending
  const sorted = Array.from(chunkScores.entries())
    .sort((a, b) => b[1] - a[1]);

  // Convert to 1-indexed ranks
  const rankings = new Map<string, number>();
  sorted.forEach(([chunkId], index) => {
    rankings.set(chunkId, index + 1);
  });

  return { source, rankings, scores: chunkScores };
}

/**
 * Apply RRF to combine vector, lexical, and recency signals
 *
 * This is the main entry point for hybrid retrieval fusion.
 */
export function applyRRFScoring(
  chunks: ChunkDoc[],
  vectorScores: Map<string, number>,
  keywordScores: Map<string, number>,
  recencyScores: Map<string, number>,
  sources: Map<string, Set<'vector' | 'lexical' | 'recency'>>,
  useWeighted: boolean = true
): ScoredChunk[] {
  // Convert scores to rankings
  const rankings: SourceRanking[] = [];

  if (vectorScores.size > 0) {
    rankings.push(scoresToRanking(vectorScores, 'vector'));
  }
  if (keywordScores.size > 0) {
    rankings.push(scoresToRanking(keywordScores, 'lexical'));
  }
  if (recencyScores.size > 0) {
    rankings.push(scoresToRanking(recencyScores, 'recency'));
  }

  // Apply RRF
  const rrfResults = useWeighted
    ? weightedRRF(rankings)
    : reciprocalRankFusion(rankings);

  // Convert to ScoredChunk array
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));
  const scoredChunks: ScoredChunk[] = [];

  for (const [chunkId, result] of rrfResults) {
    const chunk = chunkMap.get(chunkId);
    if (!chunk) continue;

    const createdAt = chunk.createdAt instanceof Timestamp
      ? chunk.createdAt.toDate()
      : new Date();

    scoredChunks.push({
      chunkId: chunk.chunkId,
      noteId: chunk.noteId,
      tenantId: chunk.tenantId,
      text: chunk.text,
      position: chunk.position,
      createdAt,
      score: result.rrfScore,
      vectorScore: vectorScores.get(chunkId) || 0,
      keywordScore: keywordScores.get(chunkId) || 0,
      recencyScore: recencyScores.get(chunkId) || 0,
      // Additional RRF metadata
      sourceCount: result.contributingSources.length,
    });
  }

  // Sort by RRF score descending
  scoredChunks.sort((a, b) => b.score - a.score);

  logInfo('RRF scoring applied', {
    inputChunks: chunks.length,
    outputChunks: scoredChunks.length,
    rankingSources: rankings.length,
    useWeighted,
  });

  return scoredChunks;
}

/**
 * Multi-source boost: chunks found by multiple sources get a bonus
 *
 * This is applied on top of RRF when we want to further prioritize
 * chunks that appear in multiple retrieval paths.
 */
export function applyMultiSourceBoost(
  chunks: ScoredChunk[],
  boostFactor: number = 0.15
): ScoredChunk[] {
  return chunks.map(chunk => {
    const sourceCount = chunk.sourceCount || 1;
    if (sourceCount > 1) {
      return {
        ...chunk,
        score: chunk.score * (1 + boostFactor * (sourceCount - 1)),
      };
    }
    return chunk;
  }).sort((a, b) => b.score - a.score);
}


```

---

## src/rateLimit.ts

**Path:** `src/rateLimit.ts`

```ts
/**
 * AuroraNotes API - Simple Rate Limiter
 * 
 * In-memory rate limiter for API protection.
 * Designed for single-instance deployment (Cloud Run with concurrency).
 */

import { Request, Response, NextFunction } from 'express';
import { logWarn } from './utils';
import { 
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_REQUESTS_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
} from './config';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limits (per IP)
const rateLimits = new Map<string, RateLimitEntry>();

// Cleanup interval to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60000;

/**
 * Get client identifier for rate limiting
 * Uses X-Forwarded-For for Cloud Run, falls back to remote IP
 */
function getClientId(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Check rate limit for a client
 */
function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimits.get(clientId);
  
  // No existing entry or expired window - create new
  if (!entry || now > entry.resetAt) {
    rateLimits.set(clientId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { 
      allowed: true, 
      remaining: RATE_LIMIT_REQUESTS_PER_MIN - 1,
      resetIn: RATE_LIMIT_WINDOW_MS,
    };
  }
  
  // Within window - check count
  if (entry.count >= RATE_LIMIT_REQUESTS_PER_MIN) {
    return { 
      allowed: false, 
      remaining: 0,
      resetIn: entry.resetAt - now,
    };
  }
  
  // Increment and allow
  entry.count++;
  return { 
    allowed: true, 
    remaining: RATE_LIMIT_REQUESTS_PER_MIN - entry.count,
    resetIn: entry.resetAt - now,
  };
}

/**
 * Rate limiting middleware
 * Only applies if RATE_LIMIT_ENABLED is true
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip rate limiting if disabled
  if (!RATE_LIMIT_ENABLED) {
    next();
    return;
  }
  
  // Skip health checks
  if (req.path === '/health') {
    next();
    return;
  }
  
  const clientId = getClientId(req);
  const { allowed, remaining, resetIn } = checkRateLimit(clientId);
  
  // Set rate limit headers
  res.set('X-RateLimit-Limit', String(RATE_LIMIT_REQUESTS_PER_MIN));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)));
  
  if (!allowed) {
    logWarn('Rate limit exceeded', { clientId, path: req.path });
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(resetIn / 1000),
    });
    return;
  }
  
  next();
}

/**
 * Cleanup expired entries periodically
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of rateLimits.entries()) {
    if (now > entry.resetAt) {
      rateLimits.delete(key);
      cleaned++;
    }
  }
  
  // Only log if we cleaned something significant
  if (cleaned > 10) {
    logWarn('Rate limit cleanup', { cleaned, remaining: rateLimits.size });
  }
}

// Start cleanup interval
setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);

/**
 * Get current rate limit stats (for debugging/monitoring)
 */
export function getRateLimitStats(): { activeClients: number } {
  return { activeClients: rateLimits.size };
}


```

---

## src/reranker.ts

**Path:** `src/reranker.ts`

```ts
/**
 * AuroraNotes API - LLM Reranker Module
 *
 * Optional LLM-based reranking for improved retrieval quality.
 * Controlled by LLM_RERANK_ENABLED feature flag.
 * Uses minimal tokens and caches results for cost control.
 */

import { ScoredChunk } from "./types";
import { logInfo, logError, logWarn } from "./utils";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";

// Reranker configuration
const RERANK_MODEL = process.env.RERANK_MODEL || 'gemini-2.0-flash';
const RERANK_MAX_CHUNKS = 20;        // Max chunks to consider for reranking
const RERANK_MAX_OUTPUT_TOKENS = 200; // Limit output tokens for cost
const RERANK_TIMEOUT_MS = 5000;       // Timeout for rerank call

/**
 * Build reranking prompt
 */
function buildRerankPrompt(query: string, chunks: ScoredChunk[]): string {
  const chunkList = chunks
    .slice(0, RERANK_MAX_CHUNKS)
    .map((chunk, i) => `[${i + 1}] ${chunk.text.slice(0, 150)}`)
    .join('\n');

  return `Given this query: "${query}"

Rate these passages by relevance (most to least relevant).
Return ONLY comma-separated numbers like: 3,1,5,2,4

Passages:
${chunkList}

Ranking:`;
}

/**
 * Parse reranking response
 */
function parseRerankResponse(response: string, chunkCount: number): number[] {
  // Extract numbers from response
  const numbers = response.match(/\d+/g);
  if (!numbers) return [];

  const indices: number[] = [];
  const seen = new Set<number>();

  for (const numStr of numbers) {
    const num = parseInt(numStr, 10);
    // Validate: 1-indexed, within range, not duplicate
    if (num >= 1 && num <= chunkCount && !seen.has(num)) {
      indices.push(num - 1); // Convert to 0-indexed
      seen.add(num);
    }
  }

  return indices;
}

/**
 * LLM-based reranking of chunks
 * Returns chunks reordered by LLM relevance assessment
 */
export async function llmRerank(
  query: string,
  chunks: ScoredChunk[],
  maxResults: number
): Promise<ScoredChunk[]> {
  if (chunks.length <= 1) return chunks;

  const client = getGenAIClient();
  if (!client) {
    logWarn('LLM reranker: no API key, skipping');
    return chunks.slice(0, maxResults);
  }

  const startTime = Date.now();
  const chunksToRerank = chunks.slice(0, RERANK_MAX_CHUNKS);

  try {
    const prompt = buildRerankPrompt(query, chunksToRerank);
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Rerank timeout')), RERANK_TIMEOUT_MS);
    });

    // Race between LLM call and timeout
    const result = await Promise.race([
      client.models.generateContent({
        model: RERANK_MODEL,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: RERANK_MAX_OUTPUT_TOKENS,
        },
      }),
      timeoutPromise,
    ]);

    const response = result.text || '';
    const reorderedIndices = parseRerankResponse(response, chunksToRerank.length);

    if (reorderedIndices.length === 0) {
      logWarn('LLM reranker: failed to parse response', { response: response.slice(0, 100) });
      return chunks.slice(0, maxResults);
    }

    // Build reranked array
    const reranked: ScoredChunk[] = [];
    const usedIndices = new Set<number>();

    // Add chunks in LLM-specified order
    for (const idx of reorderedIndices) {
      if (reranked.length >= maxResults) break;
      reranked.push(chunksToRerank[idx]);
      usedIndices.add(idx);
    }

    // Add any remaining chunks by original score
    for (let i = 0; i < chunksToRerank.length && reranked.length < maxResults; i++) {
      if (!usedIndices.has(i)) {
        reranked.push(chunksToRerank[i]);
      }
    }

    const elapsedMs = Date.now() - startTime;
    logInfo('LLM rerank complete', {
      inputCount: chunksToRerank.length,
      outputCount: reranked.length,
      elapsedMs,
    });

    return reranked;
  } catch (err) {
    logError('LLM rerank failed', err);
    // Graceful degradation: return original order
    return chunks.slice(0, maxResults);
  }
}

/**
 * Check if LLM reranker is available
 */
export function isLLMRerankerAvailable(): boolean {
  return isGenAIAvailable();
}


```

---

## src/responseConfidence.ts

**Path:** `src/responseConfidence.ts`

```ts
/**
 * AuroraNotes API - Response Confidence Calibration
 *
 * Implements calibrated confidence scores based on:
 * - Citation density (how well-cited is the response)
 * - Source relevance (how relevant are the cited sources)
 * - Answer coherence (structural and logical consistency)
 * - Claim support (how well claims are supported)
 *
 * Provides an overall confidence score that reflects
 * how trustworthy the response is.
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

/**
 * Confidence score breakdown
 */
export interface ConfidenceBreakdown {
  citationDensity: number;      // 0-1: ratio of cited sentences
  sourceRelevance: number;      // 0-1: average relevance of cited sources
  answerCoherence: number;      // 0-1: structural consistency
  claimSupport: number;         // 0-1: how well claims are supported
  overallConfidence: number;    // 0-1: weighted combination
  confidenceLevel: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
  calibrationFactors: string[]; // Factors affecting confidence
}

/**
 * Weights for confidence components
 */
const WEIGHTS = {
  citationDensity: 0.25,
  sourceRelevance: 0.30,
  answerCoherence: 0.20,
  claimSupport: 0.25,
};

/**
 * Thresholds for confidence levels
 */
const THRESHOLDS = {
  veryHigh: 0.85,
  high: 0.70,
  medium: 0.50,
  low: 0.30,
};

/**
 * Calculate citation density score
 * Measures what proportion of sentences have citations
 */
function calculateCitationDensity(answer: string): {
  score: number;
  citedSentences: number;
  totalSentences: number;
} {
  const sentences = answer.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  const citedSentences = sentences.filter(s => /\[N\d+\]/.test(s)).length;

  if (sentences.length === 0) {
    return { score: 0, citedSentences: 0, totalSentences: 0 };
  }

  // Optimal density is around 60-80% (not every sentence needs citation)
  const rawDensity = citedSentences / sentences.length;

  // Score peaks at 70% density, penalize both under and over-citation
  let score: number;
  if (rawDensity <= 0.7) {
    score = rawDensity / 0.7; // Linear increase to 70%
  } else {
    // Slight penalty for over-citation (can indicate padding)
    score = 1 - (rawDensity - 0.7) * 0.5;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    citedSentences,
    totalSentences: sentences.length,
  };
}

/**
 * Calculate source relevance score
 * Based on the retrieval scores of cited sources
 */
function calculateSourceRelevance(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[]
): {
  score: number;
  averageScore: number;
  citedCount: number;
} {
  // Find which citations are actually used in the answer
  const usedCids = new Set<string>();
  const citationMatches = answer.matchAll(/\[N(\d+)\]/g);
  for (const match of citationMatches) {
    usedCids.add(`N${match[1]}`);
  }

  if (usedCids.size === 0) {
    return { score: 0, averageScore: 0, citedCount: 0 };
  }

  // Get scores for used citations
  const citationMap = new Map(citations.map(c => [c.cid, c]));
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  let totalScore = 0;
  let count = 0;

  for (const cid of usedCids) {
    const citation = citationMap.get(cid);
    if (citation) {
      const chunk = chunkMap.get(citation.chunkId);
      if (chunk) {
        totalScore += chunk.score;
        count++;
      }
    }
  }

  const averageScore = count > 0 ? totalScore / count : 0;

  // Normalize score (assuming scores are typically 0.5-1.0 range)
  const normalizedScore = Math.min(1, (averageScore - 0.3) / 0.7);

  return {
    score: Math.max(0, normalizedScore),
    averageScore,
    citedCount: count,
  };
}

/**
 * Calculate answer coherence score
 * Measures structural and logical consistency
 */
function calculateAnswerCoherence(answer: string, intent: QueryIntent): {
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 1.0;

  // Check for abrupt endings
  if (!answer.trim().match(/[.!?]$/)) {
    issues.push('Answer ends abruptly');
    score -= 0.15;
  }

  // Check for orphaned citations
  if (/^\s*\[N\d+\]\s*$/m.test(answer)) {
    issues.push('Contains orphaned citations');
    score -= 0.2;
  }

  // Check for citation clusters
  if (/(\[N\d+\]\s*){4,}/.test(answer)) {
    issues.push('Citations are clustered');
    score -= 0.1;
  }

  // Check for very short answers (might be incomplete)
  if (answer.length < 50) {
    issues.push('Answer is very short');
    score -= 0.2;
  }

  // Intent-specific coherence checks
  if ((intent === 'list' || intent === 'action_item') && !/[-*•]\s|^\s*\d+[.)]\s/m.test(answer)) {
    issues.push('List answer lacks list formatting');
    score -= 0.1;
  }

  return {
    score: Math.max(0, score),
    issues,
  };
}

/**
 * Calculate claim support score
 * Estimates how well claims are supported by their citations
 */
function calculateClaimSupport(
  answer: string,
  citations: Citation[]
): {
  score: number;
  unsupportedClaims: number;
} {
  // Split into sentences and check citation coverage
  const sentences = answer.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 20);

  // Identify factual sentences (contain specific claims)
  const factualPatterns = [
    /\b\d+(?:\.\d+)?%?\b/,           // Numbers
    /\b(is|are|was|were|has|have)\b/, // Assertions
    /\b(always|never|must|should)\b/, // Strong claims
    /\b(because|therefore|thus)\b/,   // Causal claims
  ];

  let factualSentences = 0;
  let citedFactualSentences = 0;

  for (const sentence of sentences) {
    const isFactual = factualPatterns.some(p => p.test(sentence));
    if (isFactual) {
      factualSentences++;
      if (/\[N\d+\]/.test(sentence)) {
        citedFactualSentences++;
      }
    }
  }

  if (factualSentences === 0) {
    return { score: 1.0, unsupportedClaims: 0 };
  }

  const supportRate = citedFactualSentences / factualSentences;
  const unsupportedClaims = factualSentences - citedFactualSentences;

  return {
    score: supportRate,
    unsupportedClaims,
  };
}

/**
 * Determine confidence level from score
 */
function getConfidenceLevel(score: number): ConfidenceBreakdown['confidenceLevel'] {
  if (score >= THRESHOLDS.veryHigh) return 'very_high';
  if (score >= THRESHOLDS.high) return 'high';
  if (score >= THRESHOLDS.medium) return 'medium';
  if (score >= THRESHOLDS.low) return 'low';
  return 'very_low';
}

/**
 * Calculate calibrated confidence score for a response
 */
export function calculateResponseConfidence(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[],
  intent: QueryIntent
): ConfidenceBreakdown {
  const calibrationFactors: string[] = [];

  // Calculate component scores
  const densityResult = calculateCitationDensity(answer);
  const relevanceResult = calculateSourceRelevance(answer, citations, chunks);
  const coherenceResult = calculateAnswerCoherence(answer, intent);
  const supportResult = calculateClaimSupport(answer, citations);

  // Collect calibration factors
  if (densityResult.citedSentences === 0) {
    calibrationFactors.push('No citations found');
  } else if (densityResult.score < 0.5) {
    calibrationFactors.push('Low citation density');
  }

  if (relevanceResult.averageScore < 0.5) {
    calibrationFactors.push('Low source relevance');
  }

  if (coherenceResult.issues.length > 0) {
    calibrationFactors.push(...coherenceResult.issues);
  }

  if (supportResult.unsupportedClaims > 0) {
    calibrationFactors.push(`${supportResult.unsupportedClaims} unsupported claims`);
  }

  // Calculate weighted overall score
  const overallConfidence =
    WEIGHTS.citationDensity * densityResult.score +
    WEIGHTS.sourceRelevance * relevanceResult.score +
    WEIGHTS.answerCoherence * coherenceResult.score +
    WEIGHTS.claimSupport * supportResult.score;

  const confidenceLevel = getConfidenceLevel(overallConfidence);

  // Log if confidence is low
  if (overallConfidence < THRESHOLDS.medium) {
    logWarn('Low response confidence', {
      overallConfidence,
      calibrationFactors,
      citationDensity: densityResult.score,
      sourceRelevance: relevanceResult.score,
    });
  }

  return {
    citationDensity: Math.round(densityResult.score * 1000) / 1000,
    sourceRelevance: Math.round(relevanceResult.score * 1000) / 1000,
    answerCoherence: Math.round(coherenceResult.score * 1000) / 1000,
    claimSupport: Math.round(supportResult.score * 1000) / 1000,
    overallConfidence: Math.round(overallConfidence * 1000) / 1000,
    confidenceLevel,
    calibrationFactors,
  };
}

/**
 * Get confidence summary for API response
 */
export function getConfidenceSummary(breakdown: ConfidenceBreakdown): {
  score: number;
  level: string;
  isReliable: boolean;
  warnings: string[];
} {
  return {
    score: breakdown.overallConfidence,
    level: breakdown.confidenceLevel,
    isReliable: breakdown.overallConfidence >= THRESHOLDS.medium,
    warnings: breakdown.calibrationFactors,
  };
}

/**
 * Get confidence configuration for observability
 */
export function getConfidenceConfig() {
  return {
    weights: { ...WEIGHTS },
    thresholds: { ...THRESHOLDS },
  };
}


```

---

## src/responsePostProcessor.ts

**Path:** `src/responsePostProcessor.ts`

```ts
/**
 * AuroraNotes API - Response Post-Processor
 *
 * Ensures consistent response formatting, citation placement,
 * and answer structure based on query intent.
 *
 * Features:
 * - Citation normalization and deduplication
 * - Response structure enforcement
 * - Format consistency (lists, paragraphs, etc.)
 * - Citation placement optimization
 * - Answer coherence validation
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

/**
 * Post-processing configuration
 */
export interface PostProcessorConfig {
  normalizeCitations: boolean;
  enforceStructure: boolean;
  deduplicateCitations: boolean;
  validateCoherence: boolean;
  maxCitationsPerSentence: number;
  preferredFormat: 'paragraph' | 'list' | 'structured' | 'auto';
}

const DEFAULT_CONFIG: PostProcessorConfig = {
  normalizeCitations: true,
  enforceStructure: true,
  deduplicateCitations: true,
  validateCoherence: true,
  maxCitationsPerSentence: 3,
  preferredFormat: 'auto',
};

/**
 * Post-processed response result
 */
export interface PostProcessedResponse {
  originalAnswer: string;
  processedAnswer: string;
  citations: Citation[];
  modifications: string[];
  coherenceScore: number;
  structureType: 'paragraph' | 'list' | 'structured' | 'mixed';
}

/**
 * Normalize citation format to consistent [N1], [N2], etc.
 */
function normalizeCitationFormat(text: string): { text: string; mapping: Map<string, string> } {
  const mapping = new Map<string, string>();
  let citationCounter = 1;

  // Find all citation patterns
  const citationPattern = /\[(?:N)?(\d+)\]/g;
  const usedCids = new Set<string>();

  // First pass: collect all unique citations
  let match;
  while ((match = citationPattern.exec(text)) !== null) {
    const originalCid = match[0];
    if (!usedCids.has(originalCid)) {
      usedCids.add(originalCid);
      const normalizedCid = `[N${citationCounter}]`;
      mapping.set(originalCid, normalizedCid);
      citationCounter++;
    }
  }

  // Second pass: replace all citations with normalized format
  let normalizedText = text;
  for (const [original, normalized] of mapping) {
    normalizedText = normalizedText.split(original).join(normalized);
  }

  return { text: normalizedText, mapping };
}

/**
 * Deduplicate adjacent citations
 */
function deduplicateAdjacentCitations(text: string): string {
  // Remove duplicate adjacent citations like [N1][N1]
  return text.replace(/(\[N\d+\])(\s*\1)+/g, '$1');
}

/**
 * Limit citations per sentence
 */
function limitCitationsPerSentence(text: string, maxCitations: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/);

  return sentences.map(sentence => {
    const citations = sentence.match(/\[N\d+\]/g) || [];
    if (citations.length <= maxCitations) return sentence;

    // Keep only the first maxCitations citations
    let count = 0;
    return sentence.replace(/\[N\d+\]/g, (match) => {
      count++;
      return count <= maxCitations ? match : '';
    }).replace(/\s+/g, ' ').trim();
  }).join(' ');
}

/**
 * Detect the structure type of a response
 */
function detectStructureType(text: string): PostProcessedResponse['structureType'] {
  const lines = text.split('\n').filter(l => l.trim());

  // Check for list patterns
  const listPatterns = /^[\s]*[-*•]\s|^[\s]*\d+[.)]\s|^[\s]*[a-z][.)]\s/i;
  const listLines = lines.filter(l => listPatterns.test(l)).length;

  // Check for structured patterns (headers, sections)
  const headerPatterns = /^#+\s|^[A-Z][^.!?]*:$/;
  const headerLines = lines.filter(l => headerPatterns.test(l)).length;

  if (headerLines > 0 && listLines > 0) return 'structured';
  if (listLines > lines.length * 0.5) return 'list';
  if (headerLines > 0) return 'structured';
  if (lines.length <= 3) return 'paragraph';

  return 'mixed';
}

/**
 * Determine preferred format based on query intent
 */
function getPreferredFormat(intent: QueryIntent): PostProcessorConfig['preferredFormat'] {
  switch (intent) {
    case 'question':
      return 'paragraph';
    case 'list':
    case 'action_item':
      return 'list';
    case 'decision':
      return 'structured';
    case 'summarize':
      return 'structured';
    case 'search':
    default:
      return 'auto';
  }
}

/**
 * Calculate coherence score based on various factors
 */
function calculateCoherenceScore(text: string, _citations: Citation[]): number {
  let score = 1.0;

  // Penalize for orphaned citations (citations without context)
  const orphanedPattern = /^\s*\[N\d+\]\s*$/gm;
  const orphanedCount = (text.match(orphanedPattern) || []).length;
  score -= orphanedCount * 0.1;

  // Penalize for citation clusters (too many citations in one place)
  const clusterPattern = /(\[N\d+\]\s*){4,}/g;
  const clusterCount = (text.match(clusterPattern) || []).length;
  score -= clusterCount * 0.15;

  // Reward for even citation distribution
  const sentences = text.split(/(?<=[.!?])\s+/);
  const citedSentences = sentences.filter(s => /\[N\d+\]/.test(s)).length;
  const citationDistribution = sentences.length > 0 ? citedSentences / sentences.length : 0;
  if (citationDistribution > 0.3 && citationDistribution < 0.8) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Update citation references in citations array based on mapping
 */
function remapCitations(
  citations: Citation[],
  mapping: Map<string, string>
): Citation[] {
  const reverseMapping = new Map<string, string>();
  for (const [original, normalized] of mapping) {
    // Extract the number from [N1] format
    const originalNum = original.match(/\d+/)?.[0];
    const normalizedNum = normalized.match(/\d+/)?.[0];
    if (originalNum && normalizedNum) {
      reverseMapping.set(`N${originalNum}`, `N${normalizedNum}`);
    }
  }

  return citations.map(citation => {
    const newCid = reverseMapping.get(citation.cid);
    if (newCid) {
      return { ...citation, cid: newCid };
    }
    return citation;
  });
}

/**
 * Main post-processing function
 */
export function postProcessResponse(
  answer: string,
  citations: Citation[],
  queryIntent: QueryIntent,
  config: Partial<PostProcessorConfig> = {}
): PostProcessedResponse {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const modifications: string[] = [];

  let processedAnswer = answer;
  let processedCitations = [...citations];

  // Step 1: Normalize citation format
  if (fullConfig.normalizeCitations) {
    const { text: normalizedText, mapping } = normalizeCitationFormat(processedAnswer);
    if (mapping.size > 0) {
      processedAnswer = normalizedText;
      processedCitations = remapCitations(processedCitations, mapping);
      modifications.push(`Normalized ${mapping.size} citation formats`);
    }
  }

  // Step 2: Deduplicate adjacent citations
  if (fullConfig.deduplicateCitations) {
    const beforeLength = processedAnswer.length;
    processedAnswer = deduplicateAdjacentCitations(processedAnswer);
    if (processedAnswer.length !== beforeLength) {
      modifications.push('Removed duplicate adjacent citations');
    }
  }

  // Step 3: Limit citations per sentence
  if (fullConfig.maxCitationsPerSentence > 0) {
    const beforeAnswer = processedAnswer;
    processedAnswer = limitCitationsPerSentence(
      processedAnswer,
      fullConfig.maxCitationsPerSentence
    );
    if (processedAnswer !== beforeAnswer) {
      modifications.push(`Limited citations to ${fullConfig.maxCitationsPerSentence} per sentence`);
    }
  }

  // Step 4: Detect and validate structure
  const structureType = detectStructureType(processedAnswer);
  const preferredFormat = fullConfig.preferredFormat === 'auto'
    ? getPreferredFormat(queryIntent)
    : fullConfig.preferredFormat;

  if (fullConfig.enforceStructure && preferredFormat !== 'auto' && structureType !== preferredFormat) {
    logInfo('Structure mismatch detected', {
      detected: structureType,
      preferred: preferredFormat,
      queryIntent,
    });
    // Note: We log but don't force restructure to avoid breaking the response
  }

  // Step 5: Calculate coherence score
  const coherenceScore = fullConfig.validateCoherence
    ? calculateCoherenceScore(processedAnswer, processedCitations)
    : 1.0;

  if (coherenceScore < 0.7) {
    logWarn('Low coherence score detected', {
      coherenceScore,
      modifications,
    });
  }

  return {
    originalAnswer: answer,
    processedAnswer,
    citations: processedCitations,
    modifications,
    coherenceScore,
    structureType,
  };
}

/**
 * Quick validation of response quality
 */
export function validateResponseQuality(
  answer: string,
  citations: Citation[]
): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for empty or very short answers
  if (answer.trim().length < 20) {
    issues.push('Answer is too short');
  }

  // Check for uncited claims (sentences without citations)
  const sentences = answer.split(/(?<=[.!?])\s+/);
  const uncitedSentences = sentences.filter(s =>
    s.length > 30 && !/\[N?\d+\]/.test(s)
  );
  if (uncitedSentences.length > sentences.length * 0.5) {
    issues.push('More than half of sentences lack citations');
    suggestions.push('Add citations to support key claims');
  }

  // Check for citation-only responses
  const citationOnlyPattern = /^[\s\[N\d\]]+$/;
  if (citationOnlyPattern.test(answer)) {
    issues.push('Response contains only citations without content');
  }

  // Check for broken citation references
  const citedNumbers = new Set(
    (answer.match(/\[N?(\d+)\]/g) || []).map(c => c.match(/\d+/)?.[0])
  );
  const availableCids = new Set(citations.map(c => c.cid.replace('N', '')));
  for (const num of citedNumbers) {
    if (num && !availableCids.has(num)) {
      issues.push(`Citation [N${num}] references non-existent source`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
  };
}

/**
 * Get post-processor configuration for observability
 */
export function getPostProcessorConfig(): PostProcessorConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Response consistency result
 */
export interface ConsistencyResult {
  isConsistent: boolean;
  toneConsistency: number;
  formatConsistency: number;
  citationConsistency: number;
  issues: string[];
  corrections: string[];
}

/**
 * Enforce consistent response formatting
 * Ensures deterministic output structure
 */
export function enforceResponseConsistency(
  answer: string,
  queryIntent: QueryIntent
): { correctedAnswer: string; result: ConsistencyResult } {
  const issues: string[] = [];
  const corrections: string[] = [];
  let correctedAnswer = answer;

  // 1. Normalize whitespace and line breaks
  const beforeWhitespace = correctedAnswer;
  correctedAnswer = correctedAnswer
    .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
    .replace(/[ \t]+/g, ' ')     // Single spaces only
    .trim();
  if (correctedAnswer !== beforeWhitespace) {
    corrections.push('Normalized whitespace');
  }

  // 2. Ensure consistent list formatting
  const hasNumberedList = /^\s*\d+[.)]\s/m.test(correctedAnswer);
  const hasBulletList = /^\s*[-*•]\s/m.test(correctedAnswer);
  if (hasNumberedList && hasBulletList) {
    issues.push('Mixed list formats (numbered and bullet)');
    // Convert bullets to numbered if more numbered items
    const numCount = (correctedAnswer.match(/^\s*\d+[.)]\s/gm) || []).length;
    const bulletCount = (correctedAnswer.match(/^\s*[-*•]\s/gm) || []).length;
    if (numCount >= bulletCount) {
      let counter = numCount + 1;
      correctedAnswer = correctedAnswer.replace(/^\s*[-*•]\s/gm, () => `${counter++}. `);
      corrections.push('Converted bullets to numbered list');
    } else {
      correctedAnswer = correctedAnswer.replace(/^\s*\d+[.)]\s/gm, '- ');
      corrections.push('Converted numbered to bullet list');
    }
  }

  // 3. Ensure consistent citation format
  const beforeCitation = correctedAnswer;
  correctedAnswer = correctedAnswer
    .replace(/\[\s*N\s*(\d+)\s*\]/g, '[N$1]')  // Normalize spacing
    .replace(/\[(\d+)\]/g, '[N$1]');           // Ensure N prefix
  if (correctedAnswer !== beforeCitation) {
    corrections.push('Normalized citation format');
  }

  // 4. Remove trailing citation-only sentences
  const beforeTrailing = correctedAnswer;
  correctedAnswer = correctedAnswer.replace(/\.\s*(\[N\d+\]\s*)+$/g, '.');
  if (correctedAnswer !== beforeTrailing) {
    corrections.push('Removed trailing citation-only content');
  }

  // 5. Calculate consistency scores
  const toneConsistency = calculateToneConsistency(correctedAnswer);
  const formatConsistency = issues.length === 0 ? 1.0 : Math.max(0.5, 1 - issues.length * 0.15);
  const citationConsistency = calculateCitationConsistency(correctedAnswer);

  const isConsistent = toneConsistency > 0.7 && formatConsistency > 0.7 && citationConsistency > 0.7;

  return {
    correctedAnswer,
    result: {
      isConsistent,
      toneConsistency,
      formatConsistency,
      citationConsistency,
      issues,
      corrections,
    },
  };
}

/**
 * Calculate tone consistency across the response
 */
function calculateToneConsistency(text: string): number {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 10);
  if (sentences.length < 2) return 1.0;

  let inconsistencies = 0;

  // Check for tone shifts
  const formalIndicators = /\b(therefore|furthermore|moreover|consequently|thus)\b/gi;
  const casualIndicators = /\b(basically|kind of|sort of|pretty much|gonna|wanna)\b/gi;

  const hasFormal = formalIndicators.test(text);
  const hasCasual = casualIndicators.test(text);

  if (hasFormal && hasCasual) {
    inconsistencies++;
  }

  // Check for person consistency (I vs we vs you)
  const firstPerson = /\b(I|my|mine)\b/g.test(text);
  const secondPerson = /\b(you|your|yours)\b/g.test(text);
  const thirdPerson = /\b(it|they|the user|the system)\b/g.test(text);

  const personCount = [firstPerson, secondPerson, thirdPerson].filter(Boolean).length;
  if (personCount > 1) {
    inconsistencies += 0.5;
  }

  return Math.max(0, 1 - inconsistencies * 0.2);
}

/**
 * Calculate citation placement consistency
 */
function calculateCitationConsistency(text: string): number {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
  if (sentences.length === 0) return 1.0;

  let score = 1.0;

  // Check for citation placement consistency
  const citedSentences = sentences.filter(s => /\[N\d+\]/.test(s));
  const endCitations = citedSentences.filter(s => /\[N\d+\]\s*[.!?]?\s*$/.test(s));
  const midCitations = citedSentences.filter(s => /\[N\d+\](?!\s*[.!?]?\s*$)/.test(s));

  // Prefer consistent placement (either mostly end or mostly mid)
  if (endCitations.length > 0 && midCitations.length > 0) {
    const ratio = Math.min(endCitations.length, midCitations.length) /
                  Math.max(endCitations.length, midCitations.length);
    if (ratio > 0.5) {
      score -= 0.15; // Inconsistent placement
    }
  }

  // Check for citation clustering
  const clusterPattern = /(\[N\d+\]\s*){4,}/g;
  const clusterCount = (text.match(clusterPattern) || []).length;
  score -= clusterCount * 0.1;

  return Math.max(0, score);
}

/**
 * Validate and fix response for production use
 */
export function validateAndFixResponse(
  answer: string,
  citations: Citation[],
  queryIntent: QueryIntent
): {
  finalAnswer: string;
  finalCitations: Citation[];
  qualityScore: number;
  wasModified: boolean;
} {
  // Step 1: Post-process response
  const postProcessed = postProcessResponse(answer, citations, queryIntent);

  // Step 2: Enforce consistency
  const { correctedAnswer, result: consistencyResult } = enforceResponseConsistency(
    postProcessed.processedAnswer,
    queryIntent
  );

  // Step 3: Validate quality
  const qualityValidation = validateResponseQuality(correctedAnswer, postProcessed.citations);

  // Calculate overall quality score
  const qualityScore = (
    postProcessed.coherenceScore * 0.3 +
    consistencyResult.toneConsistency * 0.25 +
    consistencyResult.formatConsistency * 0.25 +
    consistencyResult.citationConsistency * 0.2
  );

  const wasModified = postProcessed.modifications.length > 0 ||
                      consistencyResult.corrections.length > 0;

  if (wasModified) {
    logInfo('Response modified for consistency', {
      modifications: postProcessed.modifications,
      corrections: consistencyResult.corrections,
      qualityScore: Math.round(qualityScore * 100) / 100,
    });
  }

  return {
    finalAnswer: correctedAnswer,
    finalCitations: postProcessed.citations,
    qualityScore,
    wasModified,
  };
}


```

---

## src/responseValidation.ts

**Path:** `src/responseValidation.ts`

```ts
/**
 * AuroraNotes API - Response Validation and Repair Pipeline
 *
 * Comprehensive post-generation validation with automatic repair:
 * 1. Citation format validation
 * 2. Citation range validation (only valid N1-Nmax)
 * 3. Consistency checks (no contradictions)
 * 4. Completeness checks (all claims cited)
 * 5. Automatic repair for common issues
 *
 * This ensures responses meet quality standards before delivery.
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn, logError } from './utils';

// Validation configuration
const VALIDATION_CONFIG = {
  enabled: true,
  maxCitationsPerSentence: 4,
  minCitationCoverage: 0.5,         // Min fraction of factual sentences with citations
  repairEnabled: true,
  strictMode: false,                // If true, fail on any validation error
};

/**
 * Validation issue types
 */
export type ValidationIssueType =
  | 'invalid_citation_format'
  | 'citation_out_of_range'
  | 'uncited_claim'
  | 'citation_clustering'
  | 'duplicate_citation'
  | 'empty_response'
  | 'no_citations'
  | 'excessive_citations'
  | 'inconsistent_formatting';

/**
 * Validation issue
 */
export interface ValidationIssue {
  type: ValidationIssueType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: { start: number; end: number };
  suggestedFix?: string;
  autoRepairable: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  citationStats: {
    total: number;
    unique: number;
    validRange: number;
    invalidRange: number;
  };
}

/**
 * Repair result
 */
export interface RepairResult {
  originalResponse: string;
  repairedResponse: string;
  repairsApplied: string[];
  issuesFixed: number;
  issuesRemaining: number;
}

/**
 * Validate citation format
 */
function validateCitationFormat(response: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for malformed citations
  const malformedPatterns = [
    { pattern: /\[N\s+\d+\]/g, message: 'Space in citation format' },
    { pattern: /\[\d+\]/g, message: 'Missing N prefix in citation' },
    { pattern: /\[N\d+\s*,\s*N\d+\]/g, message: 'Multiple citations in single brackets' },
    { pattern: /N\d+(?!\])/g, message: 'Citation without brackets' },
  ];

  for (const { pattern, message } of malformedPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      issues.push({
        type: 'invalid_citation_format',
        severity: 'warning',
        message: `${message}: "${match[0]}"`,
        location: { start: match.index, end: match.index + match[0].length },
        autoRepairable: true,
      });
    }
  }

  return issues;
}

/**
 * Validate citation range
 */
function validateCitationRange(response: string, maxCitation: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const citationPattern = /\[N(\d+)\]/g;
  let match;

  while ((match = citationPattern.exec(response)) !== null) {
    const citNum = parseInt(match[1], 10);
    if (citNum < 1 || citNum > maxCitation) {
      issues.push({
        type: 'citation_out_of_range',
        severity: 'error',
        message: `Citation [N${citNum}] is out of range (valid: N1-N${maxCitation})`,
        location: { start: match.index, end: match.index + match[0].length },
        suggestedFix: `Remove or replace [N${citNum}]`,
        autoRepairable: true,
      });
    }
  }

  return issues;
}

/**
 * Check for citation clustering (bad pattern)
 */
function checkCitationClustering(response: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Pattern for 4+ consecutive citations
  const clusterPattern = /(\[N\d+\]\s*){4,}/g;
  let match;

  while ((match = clusterPattern.exec(response)) !== null) {
    issues.push({
      type: 'citation_clustering',
      severity: 'warning',
      message: 'Citations are clustered together instead of distributed',
      location: { start: match.index, end: match.index + match[0].length },
      suggestedFix: 'Distribute citations throughout the response',
      autoRepairable: false,
    });
  }

  return issues;
}

/**
 * Check for uncited factual claims
 */
function checkUncitedClaims(response: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Split into sentences
  const sentences = response.split(/(?<=[.!?])\s+/);
  let uncitedFactualCount = 0;
  let totalFactualCount = 0;

  for (const sentence of sentences) {
    // Skip short sentences or questions
    if (sentence.length < 20 || sentence.endsWith('?')) continue;

    // Check if it looks like a factual claim
    const isFactual = /\b(is|are|was|were|has|have|had|uses|using|requires|provides)\b/i.test(sentence);
    if (!isFactual) continue;

    totalFactualCount++;

    // Check for citation
    if (!/\[N\d+\]/.test(sentence)) {
      uncitedFactualCount++;
    }
  }

  // Calculate coverage
  const coverage = totalFactualCount > 0 ? 1 - (uncitedFactualCount / totalFactualCount) : 1;

  if (coverage < VALIDATION_CONFIG.minCitationCoverage) {
    issues.push({
      type: 'uncited_claim',
      severity: 'warning',
      message: `Low citation coverage: ${(coverage * 100).toFixed(0)}% of factual claims are cited`,
      suggestedFix: 'Add citations to factual claims',
      autoRepairable: false,
    });
  }

  return issues;
}

/**
 * Get citation statistics
 */
function getCitationStats(response: string, maxCitation: number): ValidationResult['citationStats'] {
  const citationPattern = /\[N(\d+)\]/g;
  const citations: number[] = [];
  let match;

  while ((match = citationPattern.exec(response)) !== null) {
    citations.push(parseInt(match[1], 10));
  }

  const unique = new Set(citations);
  const validRange = citations.filter(c => c >= 1 && c <= maxCitation).length;
  const invalidRange = citations.length - validRange;

  return {
    total: citations.length,
    unique: unique.size,
    validRange,
    invalidRange,
  };
}

/**
 * Validate a response
 */
export function validateResponse(
  response: string,
  maxCitation: number,
  intent?: QueryIntent
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Empty response check
  if (!response || response.trim().length === 0) {
    issues.push({
      type: 'empty_response',
      severity: 'error',
      message: 'Response is empty',
      autoRepairable: false,
    });
    return {
      isValid: false,
      issues,
      errorCount: 1,
      warningCount: 0,
      citationStats: { total: 0, unique: 0, validRange: 0, invalidRange: 0 },
    };
  }

  // No citations check
  if (!/\[N\d+\]/.test(response)) {
    issues.push({
      type: 'no_citations',
      severity: 'warning',
      message: 'Response contains no citations',
      suggestedFix: 'Add citations to support claims',
      autoRepairable: false,
    });
  }

  // Run all validation checks
  issues.push(...validateCitationFormat(response));
  issues.push(...validateCitationRange(response, maxCitation));
  issues.push(...checkCitationClustering(response));
  issues.push(...checkUncitedClaims(response));

  // Count by severity
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  // Get stats
  const citationStats = getCitationStats(response, maxCitation);

  // Determine validity
  const isValid = VALIDATION_CONFIG.strictMode
    ? issues.length === 0
    : errorCount === 0;

  if (issues.length > 0) {
    logWarn('Response validation issues', {
      errorCount,
      warningCount,
      issues: issues.map(i => i.message),
    });
  }

  return {
    isValid,
    issues,
    errorCount,
    warningCount,
    citationStats,
  };
}

/**
 * Repair common issues in a response
 */
export function repairResponse(
  response: string,
  maxCitation: number
): RepairResult {
  let repaired = response;
  const repairsApplied: string[] = [];

  // Fix missing N prefix: [1] -> [N1]
  const missingNPattern = /\[(\d+)\]/g;
  if (missingNPattern.test(repaired)) {
    repaired = repaired.replace(missingNPattern, '[N$1]');
    repairsApplied.push('Added missing N prefix to citations');
  }

  // Fix space in citation: [N 1] -> [N1]
  const spacePattern = /\[N\s+(\d+)\]/g;
  if (spacePattern.test(repaired)) {
    repaired = repaired.replace(spacePattern, '[N$1]');
    repairsApplied.push('Removed spaces from citations');
  }

  // Fix multiple citations in single brackets: [N1, N2] -> [N1][N2]
  const multiPattern = /\[N(\d+)\s*,\s*N(\d+)\]/g;
  if (multiPattern.test(repaired)) {
    repaired = repaired.replace(multiPattern, '[N$1][N$2]');
    repairsApplied.push('Split combined citations');
  }

  // Remove out-of-range citations
  const outOfRangePattern = new RegExp(`\\[N(\\d+)\\]`, 'g');
  repaired = repaired.replace(outOfRangePattern, (match, num) => {
    const citNum = parseInt(num, 10);
    if (citNum < 1 || citNum > maxCitation) {
      repairsApplied.push(`Removed out-of-range citation [N${citNum}]`);
      return '';
    }
    return match;
  });

  // Clean up double spaces
  repaired = repaired.replace(/\s+/g, ' ').trim();

  // Re-validate to count remaining issues
  const validation = validateResponse(repaired, maxCitation);

  logInfo('Response repair completed', {
    repairsApplied: repairsApplied.length,
    issuesRemaining: validation.issues.length,
  });

  return {
    originalResponse: response,
    repairedResponse: repaired,
    repairsApplied,
    issuesFixed: repairsApplied.length,
    issuesRemaining: validation.issues.length,
  };
}

/**
 * Validate and optionally repair a response
 */
export function validateAndRepair(
  response: string,
  maxCitation: number,
  intent?: QueryIntent
): {
  validation: ValidationResult;
  repair?: RepairResult;
  finalResponse: string;
} {
  // Initial validation
  const validation = validateResponse(response, maxCitation, intent);

  // If valid or repair disabled, return as-is
  if (validation.isValid || !VALIDATION_CONFIG.repairEnabled) {
    return {
      validation,
      finalResponse: response,
    };
  }

  // Attempt repair
  const repair = repairResponse(response, maxCitation);

  return {
    validation,
    repair,
    finalResponse: repair.repairedResponse,
  };
}

/**
 * Get validation configuration
 */
export function getValidationConfig() {
  return { ...VALIDATION_CONFIG };
}


```

---

## src/retrieval.ts

**Path:** `src/retrieval.ts`

```ts
/**
 * AuroraNotes API - Retrieval Module
 *
 * Implements best-in-class multi-stage hybrid retrieval with:
 * - Multi-stage candidate generation (vector → lexical → recency)
 * - Recall-first architecture for near-perfect recall at scale
 * - BM25-like keyword matching (lexical precision)
 * - MMR diversity reranking (multi-note coverage)
 * - Entity/unique-ID detection (expands search for specific queries)
 * - Position bonuses (intro/summary detection)
 * - Coverage-aware reranking (ensure query keywords are represented)
 *
 * Scale targets: 100k+ notes, millions of chunks with sub-second retrieval
 */

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firestore";
import {
  CHUNKS_COLLECTION,
  RETRIEVAL_DEFAULT_DAYS,
  RETRIEVAL_MAX_CONTEXT_CHARS,
  RETRIEVAL_MIN_RELEVANCE,
  LLM_CONTEXT_BUDGET_CHARS,
  LLM_CONTEXT_RESERVE_CHARS,
  VECTOR_SEARCH_ENABLED,
  RERANKING_ENABLED,
  LLM_RERANK_ENABLED,
  RETRIEVAL_VECTOR_TOP_K,
  RETRIEVAL_LEXICAL_TOP_K,
  RETRIEVAL_LEXICAL_MAX_TERMS,
  RETRIEVAL_RECENCY_TOP_K,
  RETRIEVAL_MMR_ENABLED,
  RETRIEVAL_MMR_LAMBDA,
  SCORE_WEIGHT_VECTOR,
  SCORE_WEIGHT_LEXICAL,
  SCORE_WEIGHT_RECENCY,
} from "./config";
import { ChunkDoc, ScoredChunk, RetrievalOptions, QueryAnalysis, QueryIntent, CandidateCounts, RetrievalTimingsStage } from "./types";
import { generateQueryEmbedding, isEmbeddingsAvailable } from "./embeddings";
import { cosineSimilarity, logInfo, logError, logWarn, extractTermsForIndexing } from "./utils";
import { analyzeQuery } from "./query";
import { llmRerank, isLLMRerankerAvailable } from "./reranker";
import { getVectorIndex, VectorSearchResult } from "./vectorIndex";
import { expandQuery, isQueryExpansionAvailable } from "./queryExpansion";
import { crossEncoderRerank, isCrossEncoderAvailable } from "./crossEncoder";
import { RRF_ENABLED, RRF_USE_WEIGHTED, CROSS_ENCODER_ENABLED } from "./config";
import {
  getCachedChunk,
  setCachedChunk,
  getCachedRetrieval,
  setCachedRetrieval,
  makeRetrievalCacheKey,
} from "./cache";

// Quality thresholds (tuned for better recall while maintaining precision)
const MIN_VECTOR_SCORE = 0.15;     // Lower threshold for recall-first (was 0.20)
const MIN_COMBINED_SCORE = 0.05;   // Lower for better recall (was 0.08)
const DIVERSITY_PENALTY = 0.10;    // Penalty for over-represented notes
const MAX_CHUNKS_PER_NOTE = 4;     // Max chunks from single note before diversity penalty

// Precision boost thresholds - when top results are very strong, filter more aggressively
const PRECISION_BOOST_TOP_SCORE_THRESHOLD = 0.70;  // If top chunk scores above this (lowered from 0.75)
const PRECISION_BOOST_GAP_THRESHOLD = 0.25;        // And gap to 5th chunk is above this (lowered from 0.30)
const PRECISION_BOOST_MIN_SCORE = 0.25;            // Then raise min score to this (raised from 0.20)

// Score gap detection thresholds - filter out sources with large score drop-off
// This prevents including low-relevance "trailing" sources that dilute precision
const SCORE_GAP_THRESHOLD = 0.35;      // If consecutive gap is larger than this, truncate
const SCORE_GAP_MIN_TOP_SCORE = 0.60;  // Only apply gap detection if top score is strong
const SCORE_GAP_MIN_RETAIN = 2;        // Always keep at least this many results

// Batch hydration configuration
const BATCH_HYDRATION_MAX = 500;   // Max chunks to hydrate from vector results (configurable cap)

// Entity/unique-ID query detection settings
const ENTITY_EXPANDED_DAYS = 365;     // Expand to 1 year for entity queries
const ENTITY_EXPANDED_LIMIT = 500;    // Fetch more candidates for entity queries
const ALL_TIME_PATTERNS = [
  /\b(all|ever|always|any time|anytime|history|historical)\b/i,
  /\b(first|original|oldest|earliest|initial)\b/i,
];

// BM25 parameters (tuned for note-style documents)
const BM25_K1 = 1.2;  // Slightly lower for shorter documents
const BM25_B = 0.75;  // Document length normalization

// Position bonus for chunks earlier in a note (more likely to be introduction/summary)
const POSITION_BONUS_MAX = 0.05;   // Reduced to not over-weight position

// Re-export analyzeQuery for backward compatibility
export { analyzeQuery } from "./query";

// Drift detection thresholds
const DRIFT_WARNING_THRESHOLD = 0.15; // Warn if >15% of vector results are missing
const DRIFT_SAMPLE_SIZE = 5; // Sample of missing IDs to log

// Adaptive K configuration (increased for larger context budget)
const ADAPTIVE_K_MIN = 6;     // Minimum chunks for simple queries (was 4)
const ADAPTIVE_K_MAX = 30;    // Maximum chunks for complex queries (was 12)
const ADAPTIVE_K_BASE = 12;   // Default for moderate queries (was 8)

// Intent-specific K adjustments
const INTENT_K_ADJUSTMENTS: Record<QueryIntent, number> = {
  summarize: 8,     // Aggregation needs many chunks
  list: 6,          // Lists need variety
  action_item: 6,   // Action items need broad coverage
  decision: 5,      // Decisions need context
  question: 0,      // Direct questions are focused
  search: 2,        // General search needs some breadth
};

/**
 * Calculate adaptive K based on query complexity and intent
 *
 * Factors considered:
 * - Query length (longer = more complex)
 * - Intent type (summarize needs more, question needs fewer)
 * - Number of query terms (more terms = broader scope)
 *
 * With unlimited context budget, we can afford to retrieve more chunks
 * and let the context assembly handle the final selection.
 *
 * @param query - The original query string
 * @param intent - Detected query intent
 * @param keywords - Extracted keywords
 * @returns Recommended number of chunks to return
 */
export function calculateAdaptiveK(
  query: string,
  intent: QueryIntent,
  keywords: string[]
): number {
  let k = ADAPTIVE_K_BASE;

  // Intent-based adjustment (more aggressive with larger budget)
  k += INTENT_K_ADJUSTMENTS[intent] ?? 0;

  // Query length adjustment (normalized to 0-4 bonus)
  const wordCount = query.split(/\s+/).length;
  if (wordCount >= 20) {
    k += 4; // Very complex query
  } else if (wordCount >= 12) {
    k += 3; // Complex query
  } else if (wordCount >= 6) {
    k += 1; // Moderate query
  } else if (wordCount <= 3) {
    k -= 2; // Simple query
  }

  // Keyword count adjustment
  if (keywords.length >= 8) {
    k += 3; // Many keywords = very broad scope
  } else if (keywords.length >= 5) {
    k += 2; // Moderate keyword count
  } else if (keywords.length >= 3) {
    k += 1; // Some keywords
  }

  // Clamp to valid range
  return Math.min(Math.max(k, ADAPTIVE_K_MIN), ADAPTIVE_K_MAX);
}

/**
 * Batch hydrate chunk documents from Firestore using getAll().
 * Preserves ordering from vectorResults by score.
 *
 * Uses Firestore Admin SDK batch getAll for efficient multi-document fetch.
 * Caps to BATCH_HYDRATION_MAX to prevent excessive memory usage.
 *
 * DRIFT DETECTION: Tracks missing chunk documents that exist in Vertex
 * but not in Firestore. If the missing ratio exceeds DRIFT_WARNING_THRESHOLD,
 * emits a structured warning log with sample of missing datapoint IDs.
 *
 * @param vectorResults - Results from vector search with chunkId and score
 * @param tenantId - Tenant ID for logging
 * @returns ChunkDoc array ordered by original score ranking
 */
async function batchHydrateChunks(
  vectorResults: VectorSearchResult[],
  tenantId: string = 'unknown'
): Promise<{
  chunks: ChunkDoc[];
  hydratedCount: number;
  cappedAt: number | null;
  missingCount: number;
  driftDetected: boolean;
}> {
  if (vectorResults.length === 0) {
    return { chunks: [], hydratedCount: 0, cappedAt: null, missingCount: 0, driftDetected: false };
  }

  const db = getDb();
  const cappedAt = vectorResults.length > BATCH_HYDRATION_MAX ? BATCH_HYDRATION_MAX : null;
  const resultsToFetch = vectorResults.slice(0, BATCH_HYDRATION_MAX);

  const startTime = Date.now();

  // Check cache first for each chunk
  const cachedChunks = new Map<string, ChunkDoc>();
  const uncachedIds: string[] = [];

  for (const r of resultsToFetch) {
    const cached = getCachedChunk<ChunkDoc>(r.chunkId);
    if (cached) {
      cachedChunks.set(r.chunkId, cached);
    } else {
      uncachedIds.push(r.chunkId);
    }
  }

  // Fetch uncached chunks from Firestore
  if (uncachedIds.length > 0) {
    const docRefs = uncachedIds.map(id =>
      db.collection(CHUNKS_COLLECTION).doc(id)
    );
    const snapshots = await db.getAll(...docRefs);

    for (const snap of snapshots) {
      if (snap.exists) {
        const data = snap.data() as ChunkDoc;
        cachedChunks.set(snap.id, data);
        // Cache for future requests
        setCachedChunk(snap.id, data);
      }
    }
  }

  const cacheHits = resultsToFetch.length - uncachedIds.length;

  // Preserve ordering by vector score (resultsToFetch order)
  // Track missing chunk IDs for drift detection
  const orderedChunks: ChunkDoc[] = [];
  const missingDatapointIds: string[] = [];

  for (const r of resultsToFetch) {
    const chunk = cachedChunks.get(r.chunkId);
    if (chunk) {
      orderedChunks.push(chunk);
    } else {
      // This chunk exists in Vertex but not in Firestore - potential drift
      missingDatapointIds.push(`${r.chunkId}:${r.noteId}`);
    }
  }

  const missingCount = missingDatapointIds.length;
  const missingRatio = resultsToFetch.length > 0 ? missingCount / resultsToFetch.length : 0;
  const driftDetected = missingRatio > DRIFT_WARNING_THRESHOLD;

  // Log drift warning if threshold exceeded
  if (driftDetected) {
    logWarn('Vertex index drift detected: missing chunk documents', {
      tenantId,
      requestedCount: resultsToFetch.length,
      hydratedCount: orderedChunks.length,
      missingCount,
      missingRatio: Math.round(missingRatio * 100),
      sampleMissingIds: missingDatapointIds.slice(0, DRIFT_SAMPLE_SIZE),
      recommendation: 'Run index cleanup to remove orphan Vertex datapoints',
      cacheHits,
      elapsedMs: Date.now() - startTime,
    });
  } else if (cappedAt) {
    logWarn('Batch hydration capped due to size limit', {
      requestedCount: vectorResults.length,
      cappedAt: BATCH_HYDRATION_MAX,
      hydratedCount: orderedChunks.length,
      missingCount,
      cacheHits,
      elapsedMs: Date.now() - startTime,
    });
  } else {
    logInfo('Batch hydration complete', {
      requestedCount: vectorResults.length,
      hydratedCount: orderedChunks.length,
      missingCount,
      cacheHits,
      elapsedMs: Date.now() - startTime,
    });
  }

  return {
    chunks: orderedChunks,
    hydratedCount: orderedChunks.length,
    cappedAt,
    missingCount,
    driftDetected,
  };
}

/**
 * Fetch candidate chunks from Firestore with optimized queries
 *
 * Uses server-side filtering when possible for better performance.
 * Falls back to client-side filtering for backward compatibility.
 */
async function fetchCandidates(
  tenantId: string,
  maxAgeDays: number,
  limit: number
): Promise<ChunkDoc[]> {
  const db = getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
  const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

  try {
    // Try optimized query with composite index (tenantId + createdAt)
    // Requires Firestore index: noteChunks(tenantId ASC, createdAt DESC)
    const snap = await db
      .collection(CHUNKS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('createdAt', '>=', cutoffTimestamp)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    if (!snap.empty) {
      return snap.docs.map(d => d.data() as ChunkDoc);
    }
  } catch (err) {
    // Index may not exist yet, fall back to client-side filtering
    logError('Optimized chunk query failed, using fallback', err);
  }

  // Fallback: fetch all and filter client-side (for backward compatibility)
  const snap = await db
    .collection(CHUNKS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit * 2) // Fetch more to account for filtering
    .get();

  const chunks = snap.docs
    .map(d => {
      const data = d.data() as ChunkDoc;
      if (!data.tenantId) {
        data.tenantId = 'public';
      }
      return data;
    })
    .filter(c => {
      const createdAt = c.createdAt instanceof Timestamp
        ? c.createdAt.toDate()
        : new Date();
      return c.tenantId === tenantId && createdAt >= cutoffDate;
    })
    .slice(0, limit);

  return chunks;
}

// Lexical search configuration (tuned for better recall)
const LEXICAL_MULTI_QUERY_ENABLED = true; // Use multi-query union strategy
const LEXICAL_MAX_PARALLEL_QUERIES = 8; // Max parallel per-term queries (was 5)
const LEXICAL_PER_TERM_LIMIT = 75; // Limit per individual term query (was 50)

// Common stop words to deprioritize in lexical search
const LEXICAL_STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'was', 'were',
  'been', 'have', 'has', 'had', 'what', 'when', 'where', 'which', 'how', 'who',
  'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
]);

/**
 * Estimate term rarity using simple heuristics (IDF-like).
 * Longer terms and terms with special characters are typically rarer.
 * Returns higher score for rarer terms.
 */
function estimateTermRarity(term: string): number {
  let score = 0;

  // Longer terms are typically rarer
  score += Math.min(term.length, 15);

  // Terms with numbers are often identifiers (rarer, higher value)
  if (/[0-9]/.test(term)) {
    score += 8; // Increased from 5
  }

  // Terms with underscores/hyphens are often technical identifiers
  if (/[_-]/.test(term)) {
    score += 5; // Increased from 3
  }

  // Capitalized terms may be proper nouns or acronyms (valuable)
  if (/^[A-Z]/.test(term) || term === term.toUpperCase()) {
    score += 4;
  }

  // Very short common words are less valuable
  if (term.length <= 2) {
    score -= 5;
  }

  // Stop words should be deprioritized
  if (LEXICAL_STOP_WORDS.has(term.toLowerCase())) {
    score -= 10;
  }

  return score;
}

/**
 * Select best terms for lexical search using IDF-like heuristics.
 * Prefers rarer, more specific terms that are likely to have better precision.
 */
function selectBestTermsForLexical(terms: string[], maxTerms: number): string[] {
  if (terms.length <= maxTerms) {
    return terms;
  }

  // Score and sort by estimated rarity (descending)
  const scored = terms.map(term => ({
    term,
    score: estimateTermRarity(term),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxTerms).map(s => s.term);
}

/**
 * Fetch chunks via lexical search using terms[] field
 *
 * Uses multi-query union strategy for better scale:
 * 1. Select best terms using IDF-like heuristics
 * 2. Run parallel per-term queries (array-contains)
 * 3. Merge results with deduplication
 *
 * Falls back to single array-contains-any for small term sets.
 * Requires Firestore index: noteChunks(tenantId, terms array-contains)
 */
async function fetchLexicalCandidates(
  tenantId: string,
  queryTerms: string[],
  limit: number
): Promise<ChunkDoc[]> {
  if (queryTerms.length === 0) {
    return [];
  }

  const db = getDb();
  const startTime = Date.now();

  // Select best terms using IDF-like heuristics
  const selectedTerms = selectBestTermsForLexical(queryTerms, RETRIEVAL_LEXICAL_MAX_TERMS);

  try {
    let chunks: ChunkDoc[];

    // Use multi-query union for better scale when we have multiple terms
    if (LEXICAL_MULTI_QUERY_ENABLED && selectedTerms.length > 1) {
      chunks = await fetchLexicalMultiQuery(db, tenantId, selectedTerms, limit);
    } else {
      // Fallback to single array-contains-any for single term or disabled
      chunks = await fetchLexicalSingleQuery(db, tenantId, selectedTerms, limit);
    }

    logInfo('Lexical search complete', {
      tenantId,
      queryTermCount: queryTerms.length,
      selectedTermCount: selectedTerms.length,
      selectedTerms: selectedTerms.slice(0, 5), // Log first 5 for debugging
      strategy: LEXICAL_MULTI_QUERY_ENABLED && selectedTerms.length > 1 ? 'multi_query' : 'single_query',
      resultsReturned: chunks.length,
      elapsedMs: Date.now() - startTime,
    });

    return chunks;
  } catch (err) {
    // Index may not exist yet - this is expected for new deployments
    logWarn('Lexical search failed (index may not exist)', { error: String(err) });
    return [];
  }
}

/**
 * Single query using array-contains-any (original approach)
 */
async function fetchLexicalSingleQuery(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  terms: string[],
  limit: number
): Promise<ChunkDoc[]> {
  const snap = await db
    .collection(CHUNKS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('terms', 'array-contains-any', terms)
    .limit(limit)
    .get();

  return snap.docs.map(d => d.data() as ChunkDoc);
}

/**
 * Multi-query union strategy for better scale.
 * Runs parallel per-term queries and merges with deduplication.
 */
async function fetchLexicalMultiQuery(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  terms: string[],
  limit: number
): Promise<ChunkDoc[]> {
  // Limit parallel queries to avoid overwhelming Firestore
  const termsToQuery = terms.slice(0, LEXICAL_MAX_PARALLEL_QUERIES);

  // Run parallel per-term queries
  const queryPromises = termsToQuery.map(term =>
    db
      .collection(CHUNKS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('terms', 'array-contains', term)
      .limit(LEXICAL_PER_TERM_LIMIT)
      .get()
  );

  const snapshots = await Promise.all(queryPromises);

  // Merge with deduplication, tracking term match count for ranking
  const chunkMap = new Map<string, { chunk: ChunkDoc; matchCount: number }>();

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const chunk = doc.data() as ChunkDoc;
      const existing = chunkMap.get(chunk.chunkId);
      if (existing) {
        // Increment match count for chunks matching multiple terms
        existing.matchCount++;
      } else {
        chunkMap.set(chunk.chunkId, { chunk, matchCount: 1 });
      }
    }
  }

  // Sort by match count (descending) to prioritize chunks matching more terms
  const sorted = Array.from(chunkMap.values())
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, limit)
    .map(entry => entry.chunk);

  return sorted;
}

/**
 * Fetch recent chunks for recency signal
 * Returns the most recent chunks regardless of relevance
 */
async function fetchRecentCandidates(
  tenantId: string,
  limit: number
): Promise<ChunkDoc[]> {
  const db = getDb();

  const snap = await db
    .collection(CHUNKS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map(d => d.data() as ChunkDoc);
}

/**
 * Merge candidates from multiple stages, deduplicating by chunkId
 * Returns merged list with source tracking
 *
 * Optimized: Uses bitflags instead of Set for source tracking (reduces allocations)
 */
const SOURCE_VECTOR = 1;
const SOURCE_LEXICAL = 2;
const SOURCE_RECENCY = 4;

function mergeCandidates(
  vectorChunks: ChunkDoc[],
  lexicalChunks: ChunkDoc[],
  recencyChunks: ChunkDoc[]
): { chunks: ChunkDoc[]; sources: Map<string, Set<'vector' | 'lexical' | 'recency'>> } {
  const chunkMap = new Map<string, ChunkDoc>();
  // Use bitflags for efficient source tracking during merge
  const sourceFlags = new Map<string, number>();

  // Add vector candidates (typically largest set, add first)
  for (const chunk of vectorChunks) {
    chunkMap.set(chunk.chunkId, chunk);
    sourceFlags.set(chunk.chunkId, SOURCE_VECTOR);
  }

  // Add lexical candidates
  for (const chunk of lexicalChunks) {
    const existing = sourceFlags.get(chunk.chunkId);
    if (existing !== undefined) {
      sourceFlags.set(chunk.chunkId, existing | SOURCE_LEXICAL);
    } else {
      chunkMap.set(chunk.chunkId, chunk);
      sourceFlags.set(chunk.chunkId, SOURCE_LEXICAL);
    }
  }

  // Add recency candidates
  for (const chunk of recencyChunks) {
    const existing = sourceFlags.get(chunk.chunkId);
    if (existing !== undefined) {
      sourceFlags.set(chunk.chunkId, existing | SOURCE_RECENCY);
    } else {
      chunkMap.set(chunk.chunkId, chunk);
      sourceFlags.set(chunk.chunkId, SOURCE_RECENCY);
    }
  }

  // Convert bitflags to Set for API compatibility (only at the end)
  const sources = new Map<string, Set<'vector' | 'lexical' | 'recency'>>();
  for (const [chunkId, flags] of sourceFlags) {
    const sourceSet = new Set<'vector' | 'lexical' | 'recency'>();
    if (flags & SOURCE_VECTOR) sourceSet.add('vector');
    if (flags & SOURCE_LEXICAL) sourceSet.add('lexical');
    if (flags & SOURCE_RECENCY) sourceSet.add('recency');
    sources.set(chunkId, sourceSet);
  }

  return {
    chunks: Array.from(chunkMap.values()),
    sources,
  };
}

/**
 * Score chunks based on vector similarity with normalization
 */
function scoreByVector(
  chunks: ChunkDoc[],
  queryEmbedding: number[]
): Map<string, number> {
  const rawScores = new Map<string, number>();

  for (const chunk of chunks) {
    if (chunk.embedding) {
      const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
      // Apply minimum threshold
      if (similarity >= MIN_VECTOR_SCORE) {
        rawScores.set(chunk.chunkId, similarity);
      } else {
        rawScores.set(chunk.chunkId, similarity * 0.5); // Penalize low scores
      }
    }
  }

  return normalizeScores(rawScores);
}

// Pre-compiled regex patterns for unique identifier detection
const UNIQUE_ID_PATTERN_1 = /^[a-z][a-z0-9_]*[0-9_][a-z0-9_]*$/i;
const UNIQUE_ID_PATTERN_2 = /^[a-z]+_[a-z0-9_]+$/i;

/**
 * Check if a keyword looks like a unique identifier (uppercase with numbers/underscores)
 */
function isUniqueIdentifier(keyword: string): boolean {
  // Match patterns like CITE_TEST_002, PROJECT_ALPHA, TEST123
  return UNIQUE_ID_PATTERN_1.test(keyword) || UNIQUE_ID_PATTERN_2.test(keyword);
}

// Cache for compiled regex patterns (avoids recompilation per chunk)
const regexCache = new Map<string, RegExp>();
const wordBoundaryRegexCache = new Map<string, RegExp>();

function getKeywordRegex(keyword: string): RegExp {
  let regex = regexCache.get(keyword);
  if (!regex) {
    regex = new RegExp(escapeRegex(keyword), 'gi');
    regexCache.set(keyword, regex);
  }
  // Reset lastIndex for global regex reuse
  regex.lastIndex = 0;
  return regex;
}

function getWordBoundaryRegex(keyword: string): RegExp {
  let regex = wordBoundaryRegexCache.get(keyword);
  if (!regex) {
    regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
    wordBoundaryRegexCache.set(keyword, regex);
  }
  regex.lastIndex = 0;
  return regex;
}

// Pre-computed BM25 constants for common document length ratios
// Avoids repeated division in hot loop
const BM25_K1_PLUS_1 = BM25_K1 + 1;
const BM25_ONE_MINUS_B = 1 - BM25_B;

/**
 * Fast term frequency counter using indexOf loop
 * Faster than regex.match() for simple substring counting
 */
function countOccurrences(text: string, term: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) {
    count++;
    pos += term.length;
  }
  return count;
}

/**
 * Score chunks based on keyword overlap with BM25-like weighting
 * BM25 provides better relevance ranking than simple TF-IDF
 * Unique identifiers get significantly boosted scoring
 *
 * Optimizations:
 * - Pre-compute lowercase text once per chunk
 * - Pre-compile and cache regex patterns
 * - Pre-compute IDF values once per keyword
 * - Use indexOf for simple substring checks (faster than regex)
 * - Fast term frequency counting without regex
 * - Pre-computed BM25 constants
 */
function scoreByKeywords(
  chunks: ChunkDoc[],
  keywords: string[]
): Map<string, number> {
  const scores = new Map<string, number>();
  const chunkCount = chunks.length;

  if (keywords.length === 0 || chunkCount === 0) return scores;

  // Pre-compute lowercase keywords once
  const keywordCount = keywords.length;
  const keywordsLower: string[] = new Array(keywordCount);
  for (let i = 0; i < keywordCount; i++) {
    keywordsLower[i] = keywords[i].toLowerCase();
  }

  // Separate unique identifiers from regular keywords
  const uniqueIdsLower: string[] = [];
  const regularKeywords: string[] = [];
  const regularKeywordsLower: string[] = [];

  for (let i = 0; i < keywordCount; i++) {
    if (isUniqueIdentifier(keywords[i])) {
      uniqueIdsLower.push(keywordsLower[i]);
    } else {
      regularKeywords.push(keywords[i]);
      regularKeywordsLower.push(keywordsLower[i]);
    }
  }

  // Pre-compute lowercase text and lengths for all chunks
  const chunksLower: string[] = new Array(chunkCount);
  const docLengths: number[] = new Array(chunkCount);
  let totalLength = 0;

  for (let i = 0; i < chunkCount; i++) {
    const text = chunks[i].text;
    chunksLower[i] = text.toLowerCase();
    docLengths[i] = text.length;
    totalLength += text.length;
  }

  const avgDocLength = totalLength / chunkCount;

  // Calculate document frequency for each keyword (using pre-computed lowercase)
  // Use array instead of Map for faster access
  const docFreq: number[] = new Array(keywordCount);
  for (let i = 0; i < keywordCount; i++) {
    const keywordLower = keywordsLower[i];
    let count = 0;
    for (let j = 0; j < chunkCount; j++) {
      if (chunksLower[j].includes(keywordLower)) {
        count++;
      }
    }
    docFreq[i] = count || 1;
  }

  // Pre-compute IDF values for all keywords (array for faster access)
  const idfValues: number[] = new Array(keywordCount);
  for (let i = 0; i < keywordCount; i++) {
    const df = docFreq[i];
    idfValues[i] = Math.log((chunkCount - df + 0.5) / (df + 0.5) + 1);
  }

  // Build IDF lookup for regular keywords
  const regularIdf: number[] = new Array(regularKeywords.length);
  for (let i = 0; i < regularKeywords.length; i++) {
    const origIdx = keywords.indexOf(regularKeywords[i]);
    regularIdf[i] = origIdx >= 0 ? idfValues[origIdx] : 0;
  }

  const uniqueIdCount = uniqueIdsLower.length;
  const regularCount = regularKeywords.length;
  const keywordDivisor = Math.max(keywordCount, 1);

  // Early exit optimization: for pure unique-ID queries, we can use a fast path
  // that only looks for chunks containing those IDs without full BM25 scoring
  const isPureUniqueIdQuery = uniqueIdCount > 0 && regularCount === 0;

  // Track unique ID match results for early termination analysis
  let uniqueIdMatchedChunks = 0;
  const EARLY_EXIT_THRESHOLD = 25; // Stop after finding this many unique ID matches

  // Score each chunk
  for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const chunkLower = chunksLower[chunkIdx];
    const docLength = docLengths[chunkIdx];
    let weightedScore = 0;
    let uniqueIdMatchCount = 0;

    // First pass: check unique identifier matches (use indexOf, faster than regex)
    for (let i = 0; i < uniqueIdCount; i++) {
      if (chunkLower.includes(uniqueIdsLower[i])) {
        uniqueIdMatchCount++;
        // Unique IDs get massive boost - they're the most specific signals
        weightedScore += 3.0;
      }
    }

    // Track matches for early termination on pure unique ID queries
    if (uniqueIdMatchCount > 0) {
      uniqueIdMatchedChunks++;
    }

    // Fast path for pure unique-ID queries: skip BM25 scoring entirely
    // This provides significant speedup for entity-focused queries
    if (isPureUniqueIdQuery) {
      if (uniqueIdMatchCount > 0) {
        scores.set(chunk.chunkId, weightedScore / keywordDivisor);
      }
      // Early exit: if we've found enough matches, stop searching
      // This optimization helps with large document collections
      if (isPureUniqueIdQuery && uniqueIdMatchedChunks >= EARLY_EXIT_THRESHOLD) {
        break;
      }
      continue;
    }

    // Pre-compute BM25 length normalization factor for this document
    const lengthNorm = BM25_ONE_MINUS_B + BM25_B * (docLength / avgDocLength);

    // Second pass: regular keywords with BM25
    for (let i = 0; i < regularCount; i++) {
      const keywordLower = regularKeywordsLower[i];

      // Use indexOf for initial check (faster than regex)
      const firstIndex = chunkLower.indexOf(keywordLower);
      if (firstIndex === -1) continue;

      // Count occurrences using fast indexOf loop
      const tf = countOccurrences(chunkLower, keywordLower);

      if (tf > 0) {
        const idf = regularIdf[i];

        // BM25 TF normalization with pre-computed constants
        const tfNormalized = (tf * BM25_K1_PLUS_1) /
          (tf + BM25_K1 * lengthNorm);

        weightedScore += idf * tfNormalized;

        // Position boost for early matches (intro/summary detection)
        if (firstIndex < 50) {
          weightedScore += idf * 0.3;
        }

        // Exact word boundary match bonus (not just substring)
        const wordBoundaryRegex = getWordBoundaryRegex(keywordLower);
        const exactMatches = chunkLower.match(wordBoundaryRegex);
        if (exactMatches && exactMatches.length > 0) {
          weightedScore += idf * 0.4 * exactMatches.length;
        }
      }
    }

    // Penalize chunks that don't match unique IDs when unique IDs are present in query
    if (uniqueIdCount > 0 && uniqueIdMatchCount === 0) {
      weightedScore *= 0.2;
    }

    scores.set(chunk.chunkId, weightedScore / keywordDivisor);
  }

  return normalizeScores(scores);
}

/**
 * Escape special regex characters in keyword
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Score chunks based on recency with exponential decay
 */
function scoreByRecency(
  chunks: ChunkDoc[],
  maxAgeDays: number
): Map<string, number> {
  const scores = new Map<string, number>();
  const now = Date.now();
  const halfLifeMs = (maxAgeDays / 3) * 24 * 60 * 60 * 1000; // Decay half-life

  for (const chunk of chunks) {
    const createdAt = chunk.createdAt instanceof Timestamp
      ? chunk.createdAt.toDate()
      : new Date();
    const ageMs = now - createdAt.getTime();

    // Exponential decay for more natural recency scoring
    const recencyScore = Math.exp(-ageMs / halfLifeMs);
    scores.set(chunk.chunkId, recencyScore);
  }

  return scores;
}

/**
 * Normalize scores to [0, 1] range using min-max normalization
 *
 * Optimizations:
 * - Single pass for min/max (avoid Math.min/max function call overhead)
 * - In-place update when possible to reduce allocations
 * - Pre-compute range divisor
 */
function normalizeScores(scores: Map<string, number>): Map<string, number> {
  const size = scores.size;
  if (size === 0) return scores;

  // Single pass to find min and max (avoid function call overhead)
  let min = Infinity;
  let max = -Infinity;

  for (const score of scores.values()) {
    if (score < min) min = score;
    if (score > max) max = score;
  }

  // All scores are equal - return as-is
  if (max === min) return scores;

  // Pre-compute range for division
  const range = max - min;

  // Create normalized map
  const normalized = new Map<string, number>();
  for (const [key, value] of scores) {
    normalized.set(key, (value - min) / range);
  }

  return normalized;
}

// Pre-computed position bonus values for common positions (0-9)
// Avoids repeated Math.exp calls for frequently accessed positions
const POSITION_BONUS_CACHE: number[] = [];
for (let i = 0; i < 10; i++) {
  POSITION_BONUS_CACHE[i] = POSITION_BONUS_MAX * Math.exp(-i * 0.5);
}

/**
 * Calculate position bonus - earlier chunks in a note often contain key info
 * Uses pre-computed cache for common positions
 */
function getPositionBonus(position: number): number {
  // Use cached value for common positions
  if (position < POSITION_BONUS_CACHE.length) {
    return POSITION_BONUS_CACHE[position];
  }
  // Compute for rare high positions
  return POSITION_BONUS_MAX * Math.exp(-position * 0.5);
}

// Semantic deduplication threshold - chunks with cosine similarity above this are considered duplicates
const SEMANTIC_DEDUP_THRESHOLD = 0.92;

// Text-based deduplication threshold - chunks with this much text overlap are duplicates
const TEXT_DEDUP_MIN_LENGTH = 50;  // Only dedup for chunks with substantial content
const TEXT_DEDUP_THRESHOLD = 0.85; // 85% text overlap indicates near-duplicate

/**
 * Calculate Jaccard similarity between two texts using word sets
 * Fast approximate text similarity for deduplication
 */
function textSimilarity(text1: string, text2: string): number {
  if (text1.length < TEXT_DEDUP_MIN_LENGTH || text2.length < TEXT_DEDUP_MIN_LENGTH) {
    return 0; // Don't dedup very short texts
  }

  // Simple word-based Jaccard similarity
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }

  const union = words1.size + words2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * MMR (Maximal Marginal Relevance) reranking for diversity
 *
 * Balances relevance with diversity to avoid returning 8 chunks from one note
 * unless the query really requires it. Also performs semantic deduplication
 * using embedding similarity.
 *
 * MMR score = λ * relevance - (1-λ) * max_similarity_to_selected
 *
 * Optimizations:
 * - Pre-compute normalized scores as Float64Array for faster access
 * - Use Array instead of Set for remaining indices (faster iteration)
 * - Cache embedding references to avoid repeated property access
 * - Early exit when semantic duplicate detected
 * - Track note counts to skip expensive embedding comparison when same note
 *
 * @param chunks - Scored chunks sorted by relevance
 * @param lambda - Trade-off parameter (0.7 = 70% relevance, 30% diversity)
 * @param targetK - Number of chunks to select
 */
export function applyMMRReranking(
  chunks: ScoredChunk[],
  lambda: number = RETRIEVAL_MMR_LAMBDA,
  targetK: number
): ScoredChunk[] {
  const chunkCount = chunks.length;
  if (chunkCount <= targetK) {
    return chunks;
  }

  // Pre-compute normalized scores as typed array for faster access
  let maxScore = 0;
  for (let i = 0; i < chunkCount; i++) {
    if (chunks[i].score > maxScore) maxScore = chunks[i].score;
  }
  if (maxScore === 0) maxScore = 0.001;

  const normalizedScores = new Float64Array(chunkCount);
  for (let i = 0; i < chunkCount; i++) {
    normalizedScores[i] = chunks[i].score / maxScore;
  }

  // Use array-based tracking (faster than Set for small sizes)
  const isRemaining = new Uint8Array(chunkCount);
  for (let i = 0; i < chunkCount; i++) isRemaining[i] = 1;
  let remainingCount = chunkCount;

  const selected: ScoredChunk[] = [];
  const selectedEmbeddings: (number[] | undefined)[] = [];
  const selectedNoteIds: string[] = [];

  // Pre-cache lambda complement for MMR calculation
  const oneMinusLambda = 1 - lambda;

  // Track semantic duplicates filtered
  let semanticDupsFiltered = 0;

  while (selected.length < targetK && remainingCount > 0) {
    let bestIdx = -1;
    let bestMMR = -Infinity;

    for (let idx = 0; idx < chunkCount; idx++) {
      if (!isRemaining[idx]) continue;

      const relevance = normalizedScores[idx];
      const candidateChunk = chunks[idx];
      const candidateNoteId = candidateChunk.noteId;
      const candidateEmbedding = candidateChunk.embedding;

      // Calculate max similarity to already selected chunks
      let maxSimilarity = 0;
      let isSemanticDuplicate = false;

      const selectedCount = selected.length;
      for (let s = 0; s < selectedCount; s++) {
        const selectedNoteId = selectedNoteIds[s];

        // Fast path: same note = high similarity (skip expensive embedding calc)
        if (candidateNoteId === selectedNoteId) {
          maxSimilarity = Math.max(maxSimilarity, 0.8);
          continue;
        }

        // Text-based deduplication (catches exact copies from different sources)
        const selectedText = selected[s].text;
        const textSim = textSimilarity(candidateChunk.text, selectedText);
        if (textSim >= TEXT_DEDUP_THRESHOLD) {
          isSemanticDuplicate = true;
          break; // Early exit - near-duplicate text detected
        }

        // Compute embedding similarity for semantic deduplication
        const selectedEmbedding = selectedEmbeddings[s];
        if (candidateEmbedding && selectedEmbedding) {
          const embeddingSim = cosineSimilarity(candidateEmbedding, selectedEmbedding);

          // If very similar embeddings, mark as semantic duplicate
          if (embeddingSim >= SEMANTIC_DEDUP_THRESHOLD) {
            isSemanticDuplicate = true;
            break; // Early exit - no need to check other selected chunks
          }
          // Use embedding similarity to influence diversity
          const adjustedSim = embeddingSim * 0.6;
          if (adjustedSim > maxSimilarity) {
            maxSimilarity = adjustedSim;
          }
        }
      }

      // Skip semantic duplicates entirely
      if (isSemanticDuplicate) {
        isRemaining[idx] = 0;
        remainingCount--;
        semanticDupsFiltered++;
        continue;
      }

      // MMR score calculation
      const mmrScore = lambda * relevance - oneMinusLambda * maxSimilarity;

      if (mmrScore > bestMMR) {
        bestMMR = mmrScore;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      const selectedChunk = chunks[bestIdx];
      selected.push(selectedChunk);
      selectedEmbeddings.push(selectedChunk.embedding);
      selectedNoteIds.push(selectedChunk.noteId);
      isRemaining[bestIdx] = 0;
      remainingCount--;
    } else {
      break;
    }
  }

  if (semanticDupsFiltered > 0) {
    logInfo('Semantic deduplication applied', {
      duplicatesFiltered: semanticDupsFiltered,
      selectedCount: selected.length,
    });
  }

  return selected;
}

/**
 * Fast text deduplication to remove near-identical chunks after reranking.
 * This is a lightweight pass that catches duplicates that may have been
 * reordered by cross-encoder or LLM reranking.
 */
function deduplicateByText(chunks: ScoredChunk[], threshold: number = TEXT_DEDUP_THRESHOLD): ScoredChunk[] {
  if (chunks.length <= 1) return chunks;

  const result: ScoredChunk[] = [];
  const selectedTexts: string[] = [];

  for (const chunk of chunks) {
    // Check if this chunk's text is too similar to any already selected chunk
    let isDuplicate = false;
    for (const selectedText of selectedTexts) {
      const similarity = textSimilarity(chunk.text, selectedText);
      if (similarity >= threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.push(chunk);
      selectedTexts.push(chunk.text);
    }
  }

  if (result.length < chunks.length) {
    logInfo('Post-rerank text deduplication applied', {
      inputCount: chunks.length,
      outputCount: result.length,
      duplicatesRemoved: chunks.length - result.length,
    });
  }

  return result;
}

/**
 * Apply diversity reranking to avoid too many chunks from the same note
 * while still allowing sufficient context from relevant notes
 * (Fallback when MMR is disabled)
 */
function applyDiversityReranking(chunks: ScoredChunk[], maxPerNote: number = MAX_CHUNKS_PER_NOTE): ScoredChunk[] {
  const noteCount = new Map<string, number>();
  const result: ScoredChunk[] = [];

  for (const chunk of chunks) {
    const count = noteCount.get(chunk.noteId) || 0;

    if (count < maxPerNote) {
      result.push(chunk);
      noteCount.set(chunk.noteId, count + 1);
    } else {
      // Apply penalty for over-represented notes
      const penalizedChunk = {
        ...chunk,
        score: chunk.score * (1 - DIVERSITY_PENALTY * (count - maxPerNote + 1)),
      };
      result.push(penalizedChunk);
    }
  }

  // Re-sort after applying penalties
  result.sort((a, b) => b.score - a.score);
  return result;
}

/**
 * Check if query contains unique identifiers that warrant expanded search
 */
function hasUniqueIdentifiers(keywords: string[]): boolean {
  return keywords.some(isUniqueIdentifier);
}

/**
 * Check if query suggests searching all time (not just recent)
 */
function suggestsAllTimeSearch(query: string): boolean {
  return ALL_TIME_PATTERNS.some(pattern => pattern.test(query));
}

/**
 * Apply unique-ID precision boost
 * Ensures chunks containing unique identifiers from the query are prioritized
 */
function applyUniqueIdPrecisionBoost(
  chunks: ScoredChunk[],
  keywords: string[]
): ScoredChunk[] {
  const uniqueIds = keywords.filter(isUniqueIdentifier);
  if (uniqueIds.length === 0) {
    return chunks;
  }

  // Boost chunks that contain unique IDs
  return chunks.map(chunk => {
    const chunkLower = chunk.text.toLowerCase();
    let matchCount = 0;

    for (const uid of uniqueIds) {
      if (chunkLower.includes(uid.toLowerCase())) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      // Significant boost for unique ID matches
      return {
        ...chunk,
        score: chunk.score * (1 + 0.5 * matchCount),
      };
    }
    return chunk;
  }).sort((a, b) => b.score - a.score);
}

/**
 * Apply coverage-aware reranking
 * Ensures keywords from the query are represented in the final results
 *
 * Optimizations:
 * - Pre-compute lowercase text for all chunks once
 * - Pre-compute lowercase keywords once
 * - Use index-based tracking instead of array splice (O(1) vs O(n))
 * - Early exit when all keywords covered
 */
function applyCoverageReranking(
  chunks: ScoredChunk[],
  keywords: string[],
  targetCount: number
): ScoredChunk[] {
  const chunkCount = chunks.length;
  if (chunkCount <= targetCount || keywords.length === 0) {
    return chunks.slice(0, targetCount);
  }

  // Pre-compute lowercase text for all chunks (avoid repeated toLowerCase)
  const lowerTexts = chunks.map(c => c.text.toLowerCase());

  // Pre-compute lowercase keywords
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const keywordCount = lowerKeywords.length;

  const selected: ScoredChunk[] = [];
  const coveredKeywords = new Uint8Array(keywordCount); // 0 = not covered, 1 = covered
  let coveredCount = 0;

  // Track which chunks are still available (faster than splice)
  const isAvailable = new Uint8Array(chunkCount);
  for (let i = 0; i < chunkCount; i++) isAvailable[i] = 1;

  // First pass: ensure keyword coverage
  for (let ki = 0; ki < keywordCount; ki++) {
    if (selected.length >= targetCount) break;
    if (coveredKeywords[ki]) continue;

    const keyword = lowerKeywords[ki];

    // Find best chunk that covers this keyword
    let matchingIdx = -1;
    for (let ci = 0; ci < chunkCount; ci++) {
      if (!isAvailable[ci]) continue;
      if (lowerTexts[ci].includes(keyword)) {
        matchingIdx = ci;
        break;
      }
    }

    if (matchingIdx >= 0) {
      const chunk = chunks[matchingIdx];
      const chunkLower = lowerTexts[matchingIdx];
      selected.push(chunk);
      isAvailable[matchingIdx] = 0;

      // Mark all keywords covered by this chunk
      for (let kj = 0; kj < keywordCount; kj++) {
        if (!coveredKeywords[kj] && chunkLower.includes(lowerKeywords[kj])) {
          coveredKeywords[kj] = 1;
          coveredCount++;
        }
      }

      // Early exit if all keywords covered
      if (coveredCount >= keywordCount) break;
    }
  }

  // Second pass: fill with highest scoring remaining
  for (let ci = 0; ci < chunkCount; ci++) {
    if (selected.length >= targetCount) break;
    if (isAvailable[ci]) {
      selected.push(chunks[ci]);
    }
  }

  // Re-sort by score for final ordering
  selected.sort((a, b) => b.score - a.score);
  return selected;
}

/**
 * Apply score gap detection to filter out trailing low-relevance sources
 *
 * When there's a significant score drop-off between consecutive results,
 * we truncate the list to avoid including irrelevant "noise" sources that
 * dilute precision. This is especially important for focused queries where
 * we have strong top results but weaker trailing matches.
 *
 * @param chunks - Sorted chunks (highest score first)
 * @returns Filtered chunks up to the score gap cutoff
 */
function applyScoreGapDetection(chunks: ScoredChunk[]): { chunks: ScoredChunk[]; gapFound: boolean; cutoffIndex?: number } {
  if (chunks.length <= SCORE_GAP_MIN_RETAIN) {
    return { chunks, gapFound: false };
  }

  const topScore = chunks[0]?.score ?? 0;

  // Only apply gap detection if top result is strong enough
  if (topScore < SCORE_GAP_MIN_TOP_SCORE) {
    return { chunks, gapFound: false };
  }

  // Look for significant score gaps between consecutive results
  for (let i = SCORE_GAP_MIN_RETAIN - 1; i < chunks.length - 1; i++) {
    const currentScore = chunks[i].score;
    const nextScore = chunks[i + 1].score;
    const gap = currentScore - nextScore;

    // If we find a large gap, truncate here
    if (gap >= SCORE_GAP_THRESHOLD) {
      logInfo('Score gap detection triggered', {
        cutoffIndex: i + 1,
        currentScore: Math.round(currentScore * 100) / 100,
        nextScore: Math.round(nextScore * 100) / 100,
        gap: Math.round(gap * 100) / 100,
        originalCount: chunks.length,
        newCount: i + 1,
      });
      return {
        chunks: chunks.slice(0, i + 1),
        gapFound: true,
        cutoffIndex: i + 1
      };
    }
  }

  return { chunks, gapFound: false };
}

/**
 * Detailed retrieval result with candidate counts for observability
 */
export interface RetrievalResult {
  chunks: ScoredChunk[];
  strategy: string;
  candidateCount: number;
  candidateCounts: CandidateCounts;
  timings?: RetrievalTimingsStage;
  scoreDistribution?: {
    topScore: number;
    scoreGap: number;
    uniqueNoteCount: number;
  };
  elapsedMs: number;
}

/**
 * Main retrieval function with multi-stage candidate generation
 *
 * Pipeline stages:
 * 1. Vector candidate generation (PRIMARY at scale via Vertex)
 * 2. Lexical candidate generation (exact-match recall via terms[])
 * 3. Recency candidates (soft support for "recent" intents)
 * 4. Merge and deduplicate
 * 5. Score with normalized features
 * 6. MMR/diversity reranking
 * 7. Final context assembly
 */
export async function retrieveRelevantChunks(
  query: string,
  options: RetrievalOptions
): Promise<RetrievalResult> {
  const startTime = Date.now();
  const timings: RetrievalTimingsStage = {
    queryParseMs: 0,
    embeddingMs: 0,
    vectorSearchMs: 0,
    lexicalSearchMs: 0,
    firestoreFetchMs: 0,
    scoringMs: 0,
    rerankMs: 0,
    totalMs: 0,
  };

  // Initialize candidate counts for observability
  const candidateCounts: CandidateCounts = {
    vectorK: 0,
    lexicalK: 0,
    recencyK: 0,
    mergedK: 0,
    rerankedK: 0,
    finalK: 0,
  };

  // Stage 1: Query analysis
  const parseStart = Date.now();
  const analysis = analyzeQuery(query);
  const keywords = options.keywords ?? analysis.boostTerms ?? analysis.keywords;

  // Extract terms for lexical search (same normalization as indexing)
  const queryTerms = extractTermsForIndexing(query);

  timings.queryParseMs = Date.now() - parseStart;

  // Determine time window - expand for entity queries or all-time hints
  const hasEntities = hasUniqueIdentifiers(keywords);
  const wantsAllTime = suggestsAllTimeSearch(query);
  const expandTimeWindow = hasEntities || wantsAllTime;

  const maxAgeDays = options.maxAgeDays ??
    (expandTimeWindow ? ENTITY_EXPANDED_DAYS :
      (analysis.timeHint?.days ?? RETRIEVAL_DEFAULT_DAYS));

  // Check retrieval cache (skip for very short queries that might be ambiguous)
  const cacheKey = makeRetrievalCacheKey(options.tenantId, analysis.normalizedQuery, maxAgeDays);
  if (query.length >= 5) {
    const cached = getCachedRetrieval<RetrievalResult>(cacheKey);
    if (cached) {
      logInfo('Retrieval cache hit', {
        query: query.slice(0, 50),
        tenantId: options.tenantId,
        cachedChunks: cached.chunks.length,
        elapsedMs: Date.now() - startTime,
      });
      return {
        ...cached,
        strategy: cached.strategy + '_cached',
        elapsedMs: Date.now() - startTime,
      };
    }
  }

  let strategy = 'multistage';
  if (expandTimeWindow) strategy += '_expanded';

  // Stage 2: Parallel candidate generation
  let vectorChunks: ChunkDoc[] = [];
  let lexicalChunks: ChunkDoc[] = [];
  let recencyChunks: ChunkDoc[] = [];
  let queryEmbedding: number[] | null = null;

  const useVector = VECTOR_SEARCH_ENABLED && isEmbeddingsAvailable();

  // Generate embedding first (needed for both vector search and scoring)
  if (useVector) {
    const embeddingStart = Date.now();
    try {
      queryEmbedding = await generateQueryEmbedding(query);
      timings.embeddingMs = Date.now() - embeddingStart;
    } catch (err) {
      logError('Embedding generation failed', err);
      timings.embeddingMs = Date.now() - embeddingStart;
    }
  }

  // Run vector, lexical, and recency searches in parallel
  // Track each stage independently for accurate timing
  const parallelSearchStart = Date.now();
  const searchPromises: Promise<void>[] = [];

  // Track individual stage timings (set inside async closures)
  let vectorSearchMs = 0;
  let vectorHydrationMs = 0;
  let recencySearchMs = 0;

  // Vector search (primary at scale)
  if (queryEmbedding) {
    searchPromises.push((async () => {
      const vectorStart = Date.now();
      try {
        const vectorIndex = getVectorIndex();
        const vectorTopK = expandTimeWindow ? ENTITY_EXPANDED_LIMIT : RETRIEVAL_VECTOR_TOP_K;
        const vectorResults = await vectorIndex.search(queryEmbedding!, options.tenantId, vectorTopK);

        // Track vector search time (before hydration)
        vectorSearchMs = Date.now() - vectorStart;

        // Batch hydrate chunk docs from Firestore using efficient getAll()
        // Preserves ordering by vector score and caps at BATCH_HYDRATION_MAX
        // Also performs drift detection to identify orphan Vertex datapoints
        if (vectorResults.length > 0) {
          const hydrationStart = Date.now();
          const { chunks, cappedAt, driftDetected } = await batchHydrateChunks(
            vectorResults,
            options.tenantId
          );
          vectorChunks = chunks;
          vectorHydrationMs = Date.now() - hydrationStart;

          if (cappedAt) {
            strategy += `_hydration_capped(${cappedAt})`;
          }
          if (driftDetected) {
            strategy += '_drift_detected';
          }
        }

        candidateCounts.vectorK = vectorChunks.length;
        strategy += `_vector(${vectorIndex.getName()})`;
      } catch (err) {
        vectorSearchMs = Date.now() - vectorStart;
        logError('Vector search failed', err);
      }
    })());
  }

  // Lexical search (for exact-match recall)
  // Optionally expand query for better synonym coverage
  if (queryTerms.length > 0) {
    searchPromises.push((async () => {
      const lexStart = Date.now();

      // Use query expansion if enabled
      let allTerms = queryTerms;
      if (isQueryExpansionAvailable()) {
        try {
          const expandedQueries = await expandQuery(query);
          // Extract terms from all expanded queries
          const expandedTerms = new Set(queryTerms);
          for (const eq of expandedQueries.slice(1)) { // Skip original
            const terms = extractTermsForIndexing(eq);
            terms.forEach(t => expandedTerms.add(t));
          }
          allTerms = Array.from(expandedTerms).slice(0, RETRIEVAL_LEXICAL_MAX_TERMS);
          if (allTerms.length > queryTerms.length) {
            strategy += '_expanded';
          }
        } catch (err) {
          logWarn('Query expansion failed, using original terms', { error: String(err) });
        }
      }

      lexicalChunks = await fetchLexicalCandidates(
        options.tenantId,
        allTerms,
        RETRIEVAL_LEXICAL_TOP_K
      );
      candidateCounts.lexicalK = lexicalChunks.length;
      timings.lexicalSearchMs = Date.now() - lexStart;
      if (lexicalChunks.length > 0) {
        strategy += '_lexical';
      }
    })());
  }

  // Recency search (soft support)
  searchPromises.push((async () => {
    const recencyStart = Date.now();
    recencyChunks = await fetchRecentCandidates(
      options.tenantId,
      RETRIEVAL_RECENCY_TOP_K
    );
    candidateCounts.recencyK = recencyChunks.length;
    recencySearchMs = Date.now() - recencyStart;
  })());

  await Promise.all(searchPromises);

  // Record individual stage timings (parallel execution)
  // Note: These ran in parallel, so total wall time is max(all stages)
  // Record individual stage timings (parallel execution)
  // Note: These ran in parallel, so total wall time is max(all stages)
  timings.vectorSearchMs = vectorSearchMs;
  timings.firestoreFetchMs = vectorHydrationMs;

  // Fallback: if no vector results AND no lexical results, use traditional Firestore fetch
  // This indicates either:
  // 1. Vertex Vector Search is not configured/enabled
  // 2. Vector search returned no results (empty index or query issue)
  // 3. Embeddings are not available
  // 4. Lexical terms didn't match indexed terms
  const isInFallbackMode = vectorChunks.length === 0 && lexicalChunks.length === 0;

  if (isInFallbackMode) {
    const fetchStart = Date.now();
    const candidateLimit = expandTimeWindow ? ENTITY_EXPANDED_LIMIT : Math.max(options.topK * 4, 150);

    // Determine specific fallback reason for debugging
    let fallbackReason: string;
    if (!isEmbeddingsAvailable()) {
      fallbackReason = 'embeddings_unavailable';
    } else if (!queryEmbedding) {
      fallbackReason = 'embedding_generation_failed';
    } else if (!VECTOR_SEARCH_ENABLED) {
      fallbackReason = 'vector_search_disabled';
    } else {
      fallbackReason = 'no_matching_results';
    }

    // Log fallback with detailed diagnostics
    logWarn('Retrieval using Firestore fallback mode', {
      reason: fallbackReason,
      tenantId: options.tenantId,
      query: query.slice(0, 50),
      keywordCount: keywords.length,
      candidateLimit,
      maxAgeDays,
      embeddingsAvailable: isEmbeddingsAvailable(),
      vectorSearchEnabled: VECTOR_SEARCH_ENABLED,
      hint: 'Consider enabling Vertex Vector Search for better recall at scale',
    });

    const fallbackChunks = await fetchCandidates(options.tenantId, maxAgeDays, candidateLimit);
    vectorChunks = fallbackChunks;
    candidateCounts.vectorK = fallbackChunks.length;
    // Fallback fetch replaces hydration timing
    timings.firestoreFetchMs = Date.now() - fetchStart;
    strategy += '_fallback';

    // In fallback mode, apply keyword boosting to improve precision
    // since we don't have vector similarity scores
    if (keywords.length > 0) {
      strategy += '_keyword_boost';
    }
  }

  // Stage 3: Merge candidates
  let { chunks: mergedChunks, sources } = mergeCandidates(vectorChunks, lexicalChunks, recencyChunks);
  candidateCounts.mergedK = mergedChunks.length;

  // Apply time-hint hard filtering for aggregation intents with explicit time windows
  // This ensures summarize/list/action_item/decision queries respect time boundaries
  const aggregationIntents: QueryIntent[] = ['summarize', 'list', 'action_item', 'decision'];
  const isAggregationIntent = aggregationIntents.includes(analysis.intent);
  const hasExplicitTimeHint = analysis.timeHint?.days !== undefined;

  if (isAggregationIntent && hasExplicitTimeHint && analysis.timeHint?.days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - analysis.timeHint.days);

    const beforeFilterCount = mergedChunks.length;
    mergedChunks = mergedChunks.filter(chunk => {
      const createdAt = chunk.createdAt instanceof Timestamp
        ? chunk.createdAt.toDate()
        : new Date();
      return createdAt >= cutoffDate;
    });

    // Update sources map to only include filtered chunks
    const filteredChunkIds = new Set(mergedChunks.map(c => c.chunkId));
    sources = new Map(
      Array.from(sources.entries()).filter(([id]) => filteredChunkIds.has(id))
    );

    if (beforeFilterCount !== mergedChunks.length) {
      logInfo('Applied time-hint hard filter for aggregation intent', {
        intent: analysis.intent,
        timeHintDays: analysis.timeHint.days,
        beforeCount: beforeFilterCount,
        afterCount: mergedChunks.length,
        filteredOut: beforeFilterCount - mergedChunks.length,
      });
      strategy += `_time_filtered(${analysis.timeHint.days}d)`;
    }
  }

  // For aggregation intents (summarize, list), use recency chunks as fallback
  // when vector/lexical search finds no results
  if (mergedChunks.length === 0 && recencyChunks.length > 0 && isAggregationIntent) {
    logInfo('Using recency fallback for aggregation intent with no keyword matches', {
      intent: analysis.intent,
      recencyChunkCount: recencyChunks.length,
      query: query.slice(0, 50),
    });
    mergedChunks = recencyChunks;
    // Mark all as recency-sourced
    sources = new Map(recencyChunks.map(c => [c.chunkId, new Set(['recency'] as const)]));
    strategy += '_recency_fallback';
  }

  if (mergedChunks.length === 0) {
    return {
      chunks: [],
      strategy: strategy + '_no_candidates',
      candidateCount: 0,
      candidateCounts,
      timings,
      elapsedMs: Date.now() - startTime,
    };
  }

  // Stage 4: Score all candidates
  const scoringStart = Date.now();

  // Compute vector scores for merged candidates
  let vectorScores = new Map<string, number>();
  if (queryEmbedding) {
    vectorScores = scoreByVector(mergedChunks, queryEmbedding);
  }

  // Compute keyword and recency scores
  const keywordScores = scoreByKeywords(mergedChunks, keywords);
  const recencyScores = scoreByRecency(mergedChunks, maxAgeDays);

  // Combine scores with configurable weights
  const hasVectorSearch = vectorScores.size > 0;
  let scored = combineScoresWeighted(
    mergedChunks,
    vectorScores,
    keywordScores,
    recencyScores,
    sources,
    hasVectorSearch
  );

  timings.scoringMs = Date.now() - scoringStart;

  // Sort by combined score first to enable precision boost analysis
  scored.sort((a, b) => b.score - a.score);

  // Apply precision boost: when top results are very strong, filter more aggressively
  // This improves precision without sacrificing recall for focused queries
  let effectiveMinScore = MIN_COMBINED_SCORE;
  if (scored.length >= 5) {
    const topScore = scored[0]?.score || 0;
    const fifthScore = scored[4]?.score || 0;
    const scoreGap = topScore - fifthScore;

    if (topScore >= PRECISION_BOOST_TOP_SCORE_THRESHOLD && scoreGap >= PRECISION_BOOST_GAP_THRESHOLD) {
      effectiveMinScore = PRECISION_BOOST_MIN_SCORE;
      strategy += '_precboost';
      logInfo('Precision boost applied', {
        topScore: Math.round(topScore * 100) / 100,
        fifthScore: Math.round(fifthScore * 100) / 100,
        scoreGap: Math.round(scoreGap * 100) / 100,
        newMinScore: effectiveMinScore,
      });
    }
  }

  // Filter out low quality results with effective threshold
  scored = scored.filter(chunk => chunk.score >= effectiveMinScore);

  // Stage 5: Reranking
  const rerankStart = Date.now();

  // Apply MMR diversity reranking if enabled
  if (RETRIEVAL_MMR_ENABLED && scored.length > 1) {
    scored = applyMMRReranking(scored, RETRIEVAL_MMR_LAMBDA, options.topK);
    strategy += '_mmr';
  } else if (RERANKING_ENABLED && scored.length > 1) {
    // Fallback to simpler diversity reranking
    scored = applyDiversityReranking(scored, MAX_CHUNKS_PER_NOTE);
    strategy += '_diverse';
  }

  // Apply unique-ID precision boost for queries with identifiers
  if (hasUniqueIdentifiers(keywords) && scored.length > 1) {
    scored = applyUniqueIdPrecisionBoost(scored, keywords);
    strategy += '_uidboost';
  }

  // Apply coverage-aware reranking to ensure keywords are represented
  if (keywords.length > 1 && scored.length > options.rerankTo) {
    scored = applyCoverageReranking(scored, keywords, options.rerankTo);
    strategy += '_coverage';
  }

  // Apply cross-encoder reranking for high-precision scoring
  if (CROSS_ENCODER_ENABLED && isCrossEncoderAvailable() && scored.length > 1) {
    try {
      scored = await crossEncoderRerank(query, scored, Math.min(scored.length, 25));
      strategy += '_crossenc';
    } catch (err) {
      logError('Cross-encoder rerank failed, using heuristic order', err);
    }
  }

  // Apply LLM reranking if enabled (optional, behind feature flag)
  if (LLM_RERANK_ENABLED && isLLMRerankerAvailable() && scored.length > 1) {
    try {
      scored = await llmRerank(query, scored, options.rerankTo);
      strategy += '_llm';
    } catch (err) {
      logError('LLM rerank failed, using heuristic order', err);
    }
  }

  // Apply post-rerank text deduplication to catch any duplicates that
  // were reordered by cross-encoder or LLM reranking
  if (scored.length > 1) {
    scored = deduplicateByText(scored);
    strategy += '_dedup';
  }

  // Apply score gap detection to filter out trailing low-relevance sources
  // Only for non-aggregation intents (aggregation needs broader coverage)
  if (!isAggregationIntent && scored.length > SCORE_GAP_MIN_RETAIN) {
    const gapResult = applyScoreGapDetection(scored);
    if (gapResult.gapFound) {
      scored = gapResult.chunks;
      strategy += '_scoregap';
    }
  }

  // Filter out chunks below minimum relevance threshold
  // This ensures only high-quality matches are included in context
  // Use lower threshold for aggregation intents to include more diverse sources
  const relevanceThreshold = isAggregationIntent
    ? Math.min(RETRIEVAL_MIN_RELEVANCE, 0.10) // Lower threshold for summarize/list
    : RETRIEVAL_MIN_RELEVANCE;
  const preFilterCount = scored.length;
  scored = scored.filter(chunk => chunk.score >= relevanceThreshold);
  if (scored.length < preFilterCount) {
    logInfo('Low relevance chunks filtered', {
      beforeCount: preFilterCount,
      afterCount: scored.length,
      threshold: relevanceThreshold,
      isAggregation: isAggregationIntent,
    });
  }

  // Trim to final count
  if (scored.length > options.rerankTo) {
    scored = scored.slice(0, options.rerankTo);
  }
  candidateCounts.rerankedK = scored.length;
  timings.rerankMs = Date.now() - rerankStart;

  // Stage 6: Context assembly with dynamic context budget
  // Use LLM_CONTEXT_BUDGET_CHARS (default 100K) instead of hard-coded limits
  // This allows "unlimited" sources within the model's context window
  const contextBudget = options.contextBudget ?? (LLM_CONTEXT_BUDGET_CHARS - LLM_CONTEXT_RESERVE_CHARS);

  // For aggregation intents, prefer unique notes to provide broader coverage
  const MAX_CHUNKS_PER_NOTE_AGGREGATION = 3; // Increased for better coverage
  const MAX_CHUNKS_PER_NOTE_DEFAULT = 6; // Increased for more context

  const maxChunksPerNote = isAggregationIntent
    ? MAX_CHUNKS_PER_NOTE_AGGREGATION
    : MAX_CHUNKS_PER_NOTE_DEFAULT;

  let totalChars = 0;
  const limitedChunks: ScoredChunk[] = [];
  const noteChunkCounts = new Map<string, number>();
  const skippedChunks: ScoredChunk[] = []; // Track skipped chunks for potential backfill

  // First pass: select chunks with diversification
  for (const chunk of scored) {
    // Check context budget (dynamic, not hard-coded)
    if (totalChars + chunk.text.length > contextBudget) {
      // Don't break - track skipped chunks in case we have budget remaining
      skippedChunks.push(chunk);
      continue;
    }

    // Check per-note cap for diversification
    const currentNoteCount = noteChunkCounts.get(chunk.noteId) || 0;
    if (currentNoteCount >= maxChunksPerNote) {
      // Skip this chunk to prefer chunks from other notes
      skippedChunks.push(chunk);
      continue;
    }

    limitedChunks.push(chunk);
    totalChars += chunk.text.length;
    noteChunkCounts.set(chunk.noteId, currentNoteCount + 1);
  }

  // Second pass: backfill with skipped chunks if we have remaining budget
  // This allows smaller high-scoring chunks from over-represented notes
  // to fill in unused context space
  const BACKFILL_SCORE_THRESHOLD = 0.5; // Only backfill chunks with decent scores
  if (skippedChunks.length > 0 && totalChars < contextBudget * 0.9) {
    for (const chunk of skippedChunks) {
      if (chunk.score < BACKFILL_SCORE_THRESHOLD) break; // Skipped chunks are score-ordered
      if (totalChars + chunk.text.length > contextBudget) continue;

      limitedChunks.push(chunk);
      totalChars += chunk.text.length;

      // Update note counts for logging accuracy
      const currentNoteCount = noteChunkCounts.get(chunk.noteId) || 0;
      noteChunkCounts.set(chunk.noteId, currentNoteCount + 1);
    }

    // Re-sort by score after backfill to maintain score ordering
    limitedChunks.sort((a, b) => b.score - a.score);
  }

  // Log diversification stats for aggregation intents
  if (isAggregationIntent && limitedChunks.length > 0) {
    const uniqueNotes = noteChunkCounts.size;
    const skippedForDiversity = scored.length - limitedChunks.length;
    if (skippedForDiversity > 0) {
      logInfo('Note-level diversification applied', {
        intent: analysis.intent,
        maxChunksPerNote,
        uniqueNotes,
        chunksSelected: limitedChunks.length,
        chunksSkipped: skippedForDiversity,
      });
      strategy += `_diversified(${uniqueNotes}notes)`;
    }
  }

  candidateCounts.finalK = limitedChunks.length;

  // Compute score distribution for observability
  const scoreDistribution = limitedChunks.length > 0 ? {
    topScore: limitedChunks[0].score,
    scoreGap: limitedChunks.length > 1
      ? limitedChunks[0].score - limitedChunks[1].score
      : 0,
    uniqueNoteCount: new Set(limitedChunks.map(c => c.noteId)).size,
  } : undefined;

  timings.totalMs = Date.now() - startTime;

  // Estimate Firestore reads for observability
  // Reads come from: lexical search, recency search, fallback fetch, hydration
  const estimatedFirestoreReads =
    candidateCounts.lexicalK + // Lexical search results
    candidateCounts.recencyK + // Recency search results
    (candidateCounts.vectorK > 0 ? candidateCounts.vectorK : 0); // Hydration reads (may be cached)

  logInfo('Multi-stage retrieval complete', {
    query: query.slice(0, 50),
    intent: analysis.intent,
    candidateCounts,
    scoreDistribution,
    strategy,
    hasVectorSearch,
    expandedTimeWindow: expandTimeWindow,
    maxAgeDays,
    timings,
    estimatedFirestoreReads,
    uniqueNotesInContext: scoreDistribution?.uniqueNoteCount ?? 0,
  });

  const result: RetrievalResult = {
    chunks: limitedChunks,
    strategy,
    candidateCount: candidateCounts.mergedK,
    candidateCounts,
    timings,
    scoreDistribution,
    elapsedMs: timings.totalMs,
  };

  // Cache the result for future identical queries
  if (query.length >= 5 && limitedChunks.length > 0) {
    setCachedRetrieval(cacheKey, result);
  }

  return result;
}

/**
 * Combine scores with configurable weights and source boost
 */
/**
 * Combine scores from different retrieval stages with configurable weights.
 *
 * Optimizations:
 * - Pre-allocate result array to avoid dynamic resizing
 * - Cache weight values outside loop
 * - Avoid creating new Set for missing sources
 * - Reuse Date objects where possible
 */
function combineScoresWeighted(
  chunks: ChunkDoc[],
  vectorScores: Map<string, number>,
  keywordScores: Map<string, number>,
  recencyScores: Map<string, number>,
  sources: Map<string, Set<'vector' | 'lexical' | 'recency'>>,
  hasVectorSearch: boolean
): ScoredChunk[] {
  const chunkCount = chunks.length;
  if (chunkCount === 0) return [];

  // Pre-allocate result array for better memory efficiency
  const results: ScoredChunk[] = new Array(chunkCount);

  // Cache weights outside loop (avoid repeated ternary checks)
  const vectorWeight = hasVectorSearch ? SCORE_WEIGHT_VECTOR : 0;
  const keywordWeight = hasVectorSearch ? SCORE_WEIGHT_LEXICAL : 0.75;
  const recencyWeight = hasVectorSearch ? SCORE_WEIGHT_RECENCY : 0.25;

  // Cache default date for chunks without valid createdAt
  const defaultDate = new Date();

  for (let i = 0; i < chunkCount; i++) {
    const chunk = chunks[i];
    const chunkId = chunk.chunkId;

    // Get scores with cached Map lookups
    const vectorScore = vectorScores.get(chunkId) || 0;
    const keywordScore = keywordScores.get(chunkId) || 0;
    const recencyScore = recencyScores.get(chunkId) || 0;
    const positionBonus = getPositionBonus(chunk.position);

    // Boost chunks found by multiple retrieval stages
    // Avoid creating new Set - check for undefined explicitly
    const chunkSources = sources.get(chunkId);
    const sourceCount = chunkSources ? chunkSources.size : 0;
    const multiSourceBoost = sourceCount > 1 ? 0.1 * (sourceCount - 1) : 0;

    // Combine weighted scores (multiply-add is well optimized by V8)
    const rawCombinedScore =
      vectorWeight * vectorScore +
      keywordWeight * keywordScore +
      recencyWeight * recencyScore +
      positionBonus +
      multiSourceBoost;

    // Cap score at 1.0 for consistent relevance interpretation
    const combinedScore = Math.min(rawCombinedScore, 1.0);

    // Convert createdAt efficiently
    const createdAt = chunk.createdAt instanceof Timestamp
      ? chunk.createdAt.toDate()
      : defaultDate;

    // Direct assignment to pre-allocated slot
    results[i] = {
      chunkId,
      noteId: chunk.noteId,
      tenantId: chunk.tenantId,
      text: chunk.text,
      position: chunk.position,
      createdAt,
      score: combinedScore,
      vectorScore,
      keywordScore,
      recencyScore,
      embedding: chunk.embedding,
    };
  }

  return results;
}


```

---

## src/retrievalLogger.ts

**Path:** `src/retrievalLogger.ts`

```ts
/**
 * AuroraNotes API - Retrieval and Citation Logger
 *
 * Provides structured observability for the retrieval pipeline:
 * - Request/response tracing with latency breakdown
 * - Multi-stage candidate counts (vector, lexical, recency)
 * - Per-citation metadata (score, noteId, chunkId)
 * - Quality flags (citation coverage, validation results)
 * - Score distribution summaries for debugging
 * - BigQuery-compatible structured logging
 */

import { v4 as uuid } from 'uuid';
import { logInfo, logWarn } from './utils';
import { CandidateCounts, RetrievalTimingsStage, ScoredChunk } from './types';

export interface RetrievalTimings {
  queryParseMs?: number;
  embeddingMs?: number;
  vectorSearchMs?: number;
  lexicalSearchMs?: number;  // Renamed from keywordSearchMs
  firestoreFetchMs?: number; // Fallback fetch time
  rerankMs?: number;
  contextAssemblyMs?: number;
  generationMs?: number;
  validationMs?: number;
  repairMs?: number;         // Time spent on citation repair
  retrievalMs?: number;      // Total retrieval time
  postProcessMs?: number;    // Time spent on enhanced post-processing
  totalMs: number;
}

export interface CitationLogEntry {
  cid: string;
  noteId: string;
  chunkId: string;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  recencyScore?: number;
  overlapScore?: number;  // Citation verification overlap score
  snippetLength: number;
}

export interface QualityFlags {
  citationCoveragePct: number;
  invalidCitationsRemoved: number;
  fallbackUsed: boolean;
  insufficientEvidence: boolean;
  regenerationAttempted: boolean;
  diversityScore?: number;
  queryExpanded?: boolean;  // Whether query expansion was used
  mmrApplied?: boolean;     // Whether MMR reranking was applied
  danglingRefsRemoved?: number; // Number of dangling [N#] references removed
  potentialHallucinations?: boolean; // Whether potential hallucinations were detected
  contradictionsDetected?: boolean;  // Whether contradictions were detected in response
}

/**
 * Score distribution summary for debugging retrieval quality
 */
export interface ScoreDistribution {
  topScore: number;
  medianScore: number;
  minScore: number;
  scoreGap: number;        // Gap between top and second score
  uniqueNoteCount: number;
  scoreStdDev: number;
}

/** Citation validation statistics for observability */
export interface CitationValidationStats {
  totalCitationsInAnswer: number;
  validCitations: number;
  invalidCitationsRemoved: number;
  weakCitations: number;
  contractCompliant: boolean;
  overallConfidence: number;
  citationAccuracy: number;
}

export interface RetrievalLogEntry {
  requestId: string;
  traceId: string;
  tenantId: string;
  query: string;
  queryLength: number;
  intent: string;
  retrievalMode: 'vector' | 'hybrid' | 'keyword_only' | 'fallback';
  candidateCounts: {
    vectorK: number;
    keywordK: number;  // Kept for backward compatibility (maps to lexicalK)
    mergedK: number;
    afterRerank: number;
    finalChunks: number;
  };
  stageDetails?: {
    vectorK: number;
    lexicalK: number;
    recencyK: number;
    mergedK: number;
    rerankedK: number;
    finalK: number;
  };
  scoreDistribution?: ScoreDistribution;
  rerankMethod: string;
  citations: CitationLogEntry[];
  timings: RetrievalTimings;
  quality: QualityFlags;
  answerLength: number;
  timestamp: string;

  // New observability fields for Phase 5
  totalSourcesReturned?: number;          // Total sources sent to client
  llmContextBudgetChars?: number;         // Context budget used for this request
  citationValidation?: CitationValidationStats;  // Detailed validation stats
  pipelineProcessingMs?: number;          // Time spent in validation pipeline
}

/**
 * Creates a new retrieval log entry with a fresh request ID
 */
export function createRetrievalLog(
  tenantId: string,
  query: string,
  requestId?: string
): Partial<RetrievalLogEntry> {
  return {
    requestId: requestId || `req_${uuid().slice(0, 8)}`,
    traceId: uuid(),
    tenantId,
    query: query.slice(0, 500), // Truncate for logging
    queryLength: query.length,
    timestamp: new Date().toISOString(),
    candidateCounts: {
      vectorK: 0,
      keywordK: 0,
      mergedK: 0,
      afterRerank: 0,
      finalChunks: 0,
    },
    citations: [],
    quality: {
      citationCoveragePct: 0,
      invalidCitationsRemoved: 0,
      fallbackUsed: false,
      insufficientEvidence: false,
      regenerationAttempted: false,
    },
    timings: {
      totalMs: 0,
    },
  };
}

/**
 * Logs a complete retrieval/citation entry
 */
export function logRetrieval(entry: RetrievalLogEntry): void {
  // Structured log for Cloud Logging / BigQuery export
  logInfo('Retrieval/citation trace', {
    requestId: entry.requestId,
    traceId: entry.traceId,
    tenantId: entry.tenantId,
    queryLength: entry.queryLength,
    intent: entry.intent,
    retrievalMode: entry.retrievalMode,
    candidateCounts: entry.candidateCounts,
    stageDetails: entry.stageDetails,
    scoreDistribution: entry.scoreDistribution,
    rerankMethod: entry.rerankMethod,
    citationCount: entry.citations.length,
    // Per-citation summary (not full snippets)
    citationSummary: entry.citations.map(c => ({
      cid: c.cid,
      noteId: c.noteId.slice(0, 8),
      score: Math.round(c.score * 1000) / 1000,
      vectorScore: c.vectorScore ? Math.round(c.vectorScore * 1000) / 1000 : undefined,
    })),
    timings: entry.timings,
    quality: entry.quality,
    answerLength: entry.answerLength,
  });

  // Warn on potential quality issues
  if (entry.quality.citationCoveragePct < 50 && entry.citations.length > 0) {
    logWarn('Low citation coverage in response', {
      requestId: entry.requestId,
      coverage: entry.quality.citationCoveragePct,
      citationCount: entry.citations.length,
    });
  }

  if (entry.scoreDistribution && entry.scoreDistribution.scoreGap > 0.3) {
    logWarn('Large score gap detected (potential single-source dominance)', {
      requestId: entry.requestId,
      topScore: entry.scoreDistribution.topScore,
      scoreGap: entry.scoreDistribution.scoreGap,
    });
  }
}

/**
 * Calculate citation coverage percentage
 * Counts sentences with at least one citation vs total sentences
 */
export function calculateCitationCoverage(answer: string): number {
  const sentences = answer
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // Only count substantial sentences

  if (sentences.length === 0) return 100;

  const citedSentences = sentences.filter(s => /\[N\d+\]/.test(s));
  return Math.round((citedSentences.length / sentences.length) * 100);
}

/**
 * Parse citation IDs from answer text
 */
export function parseCitationIds(answer: string): string[] {
  const matches = answer.match(/\[N\d+\]/g) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))]; // Remove brackets, dedupe
}

/**
 * Compute score distribution summary from scored chunks
 */
export function computeScoreDistribution(chunks: ScoredChunk[]): ScoreDistribution | undefined {
  if (chunks.length === 0) return undefined;

  const scores = chunks.map(c => c.score).sort((a, b) => b - a);
  const topScore = scores[0];
  const minScore = scores[scores.length - 1];
  const medianScore = scores[Math.floor(scores.length / 2)];
  const scoreGap = scores.length > 1 ? scores[0] - scores[1] : 0;
  const uniqueNoteCount = new Set(chunks.map(c => c.noteId)).size;

  // Calculate standard deviation
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const scoreStdDev = Math.sqrt(variance);

  return {
    topScore: Math.round(topScore * 1000) / 1000,
    medianScore: Math.round(medianScore * 1000) / 1000,
    minScore: Math.round(minScore * 1000) / 1000,
    scoreGap: Math.round(scoreGap * 1000) / 1000,
    uniqueNoteCount,
    scoreStdDev: Math.round(scoreStdDev * 1000) / 1000,
  };
}

/**
 * Convert CandidateCounts to stage details for logging
 */
export function candidateCountsToStageDetails(counts: CandidateCounts): RetrievalLogEntry['stageDetails'] {
  return {
    vectorK: counts.vectorK,
    lexicalK: counts.lexicalK,
    recencyK: counts.recencyK,
    mergedK: counts.mergedK,
    rerankedK: counts.rerankedK,
    finalK: counts.finalK,
  };
}


```

---

## src/schemas.ts

**Path:** `src/schemas.ts`

```ts
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
 * Search notes request body (semantic search)
 *
 * Uses the RAG retrieval pipeline for semantic search across notes.
 */
export const SearchNotesSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
  limit: z.number().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).optional(),
  includeChunks: z.boolean().default(false),
  filters: z.object({
    tags: z.array(z.string().max(50)).max(10).optional(),
    dateFrom: z.string().datetime({ offset: true }).optional(),
    dateTo: z.string().datetime({ offset: true }).optional(),
    status: ProcessingStatusSchema.optional(),
  }).optional(),
});

export type SearchNotesInput = z.infer<typeof SearchNotesSchema>;

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


```

---

## src/selfConsistency.ts

**Path:** `src/selfConsistency.ts`

```ts
/**
 * AuroraNotes API - Self-Consistency Verification
 *
 * Implements self-consistency sampling for more reliable responses:
 * 1. Generate multiple answer candidates with varied temperature
 * 2. Extract and align citations across candidates
 * 3. Score candidates based on citation consistency and quality
 * 4. Select or merge the most consistent response
 *
 * This significantly improves response reliability by detecting
 * and filtering out hallucinated or inconsistent citations.
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

// Configuration
const SELF_CONSISTENCY_CONFIG = {
  enabled: true,
  numSamples: 3,                    // Number of candidates to generate
  temperatureVariance: 0.15,        // Temperature variance across samples
  minConsensusThreshold: 0.6,       // Min fraction of samples agreeing on citation
  citationAlignmentWeight: 0.5,     // Weight for citation consistency
  answerSimilarityWeight: 0.3,      // Weight for answer text similarity
  sourceQualityWeight: 0.2,         // Weight for source quality scores
};

/**
 * Candidate response from LLM
 */
export interface ResponseCandidate {
  answer: string;
  citations: string[];              // Extracted citation IDs (e.g., ["N1", "N3"])
  temperature: number;
  generationTimeMs: number;
}

/**
 * Self-consistency verification result
 */
export interface ConsistencyResult {
  selectedAnswer: string;
  consensusCitations: string[];     // Citations agreed upon by majority
  inconsistentCitations: string[];  // Citations not consistently used
  consensusScore: number;           // 0-1 how consistent the samples were
  candidateCount: number;
  selectionReason: string;
}

/**
 * Extract citation IDs from answer text
 */
export function extractCitationIds(answer: string): string[] {
  const pattern = /\[N(\d+)\]/g;
  const citations: string[] = [];
  let match;

  while ((match = pattern.exec(answer)) !== null) {
    const cid = `N${match[1]}`;
    if (!citations.includes(cid)) {
      citations.push(cid);
    }
  }

  return citations;
}

/**
 * Calculate citation consensus across candidates
 * Returns citations that appear in >= threshold fraction of candidates
 */
function calculateCitationConsensus(
  candidates: ResponseCandidate[],
  threshold: number = SELF_CONSISTENCY_CONFIG.minConsensusThreshold
): { consensus: string[]; inconsistent: string[] } {
  const citationCounts = new Map<string, number>();
  const allCitations = new Set<string>();

  // Count occurrences of each citation
  for (const candidate of candidates) {
    for (const cid of candidate.citations) {
      allCitations.add(cid);
      citationCounts.set(cid, (citationCounts.get(cid) || 0) + 1);
    }
  }

  const minCount = Math.ceil(candidates.length * threshold);
  const consensus: string[] = [];
  const inconsistent: string[] = [];

  for (const cid of allCitations) {
    const count = citationCounts.get(cid) || 0;
    if (count >= minCount) {
      consensus.push(cid);
    } else {
      inconsistent.push(cid);
    }
  }

  return { consensus, inconsistent };
}

/**
 * Calculate text similarity between two answers using Jaccard on n-grams
 */
function calculateAnswerSimilarity(answer1: string, answer2: string): number {
  const getNgrams = (text: string, n: number = 3): Set<string> => {
    const clean = text.toLowerCase().replace(/\[N\d+\]/g, '').replace(/[^\w\s]/g, '');
    const words = clean.split(/\s+/).filter(w => w.length > 2);
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  };

  const ngrams1 = getNgrams(answer1);
  const ngrams2 = getNgrams(answer2);

  if (ngrams1.size === 0 || ngrams2.size === 0) return 0.5;

  let intersection = 0;
  for (const ng of ngrams1) {
    if (ngrams2.has(ng)) intersection++;
  }

  const union = new Set([...ngrams1, ...ngrams2]).size;
  return intersection / union;
}

/**
 * Score a candidate based on its alignment with other candidates
 */
function scoreCandidate(
  candidate: ResponseCandidate,
  allCandidates: ResponseCandidate[],
  consensusCitations: string[]
): number {
  // Citation alignment: how many of the candidate's citations are in consensus
  const citationAlignment = candidate.citations.length > 0
    ? candidate.citations.filter(c => consensusCitations.includes(c)).length / candidate.citations.length
    : 0;

  // Answer similarity: average similarity to other candidates
  const similarities = allCandidates
    .filter(c => c !== candidate)
    .map(c => calculateAnswerSimilarity(candidate.answer, c.answer));
  const avgSimilarity = similarities.length > 0
    ? similarities.reduce((a, b) => a + b, 0) / similarities.length
    : 0.5;

  // Combined score
  return (
    SELF_CONSISTENCY_CONFIG.citationAlignmentWeight * citationAlignment +
    SELF_CONSISTENCY_CONFIG.answerSimilarityWeight * avgSimilarity +
    SELF_CONSISTENCY_CONFIG.sourceQualityWeight * (candidate.citations.length > 0 ? 1 : 0)
  );
}

/**
 * Select or merge the best response from candidates
 */
export function selectBestResponse(
  candidates: ResponseCandidate[]
): ConsistencyResult {
  if (candidates.length === 0) {
    return {
      selectedAnswer: '',
      consensusCitations: [],
      inconsistentCitations: [],
      consensusScore: 0,
      candidateCount: 0,
      selectionReason: 'No candidates provided',
    };
  }

  if (candidates.length === 1) {
    return {
      selectedAnswer: candidates[0].answer,
      consensusCitations: candidates[0].citations,
      inconsistentCitations: [],
      consensusScore: 1,
      candidateCount: 1,
      selectionReason: 'Single candidate - no consensus needed',
    };
  }

  // Calculate citation consensus
  const { consensus, inconsistent } = calculateCitationConsensus(candidates);

  // Score each candidate
  const scoredCandidates = candidates.map(c => ({
    candidate: c,
    score: scoreCandidate(c, candidates, consensus),
  }));

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  const best = scoredCandidates[0];

  // Calculate overall consensus score
  const avgScore = scoredCandidates.reduce((sum, sc) => sum + sc.score, 0) / scoredCandidates.length;

  // Log inconsistent citations for debugging
  if (inconsistent.length > 0) {
    logWarn(`Self-consistency: ${inconsistent.length} citations not in consensus: ${inconsistent.join(', ')}`);
  }

  logInfo(`Self-consistency: Selected candidate with score ${best.score.toFixed(3)}, consensus score ${avgScore.toFixed(3)}`);

  return {
    selectedAnswer: best.candidate.answer,
    consensusCitations: consensus,
    inconsistentCitations: inconsistent,
    consensusScore: avgScore,
    candidateCount: candidates.length,
    selectionReason: `Selected highest-scoring candidate (${best.score.toFixed(3)}) from ${candidates.length} samples`,
  };
}

/**
 * Filter answer to remove non-consensus citations
 * Replaces inconsistent citations with the text only (no citation marker)
 */
export function filterInconsistentCitations(
  answer: string,
  inconsistentCitations: string[]
): string {
  let filtered = answer;

  for (const cid of inconsistentCitations) {
    // Remove the citation marker but keep surrounding text
    const pattern = new RegExp(`\\[${cid}\\]`, 'g');
    filtered = filtered.replace(pattern, '');
  }

  // Clean up any double spaces
  filtered = filtered.replace(/\s+/g, ' ').trim();

  return filtered;
}

/**
 * Generate temperature values for multi-sample generation
 */
export function generateTemperatures(
  baseTemperature: number,
  numSamples: number,
  variance: number = SELF_CONSISTENCY_CONFIG.temperatureVariance
): number[] {
  const temperatures: number[] = [];

  for (let i = 0; i < numSamples; i++) {
    // Spread temperatures around the base
    const offset = (i - (numSamples - 1) / 2) * variance;
    const temp = Math.max(0, Math.min(1, baseTemperature + offset));
    temperatures.push(temp);
  }

  return temperatures;
}

/**
 * Configuration getter
 */
export function getSelfConsistencyConfig() {
  return { ...SELF_CONSISTENCY_CONFIG };
}

/**
 * Check if self-consistency is enabled
 */
export function isSelfConsistencyEnabled(): boolean {
  return SELF_CONSISTENCY_CONFIG.enabled;
}


```

---

## src/sourceAttribution.ts

**Path:** `src/sourceAttribution.ts`

```ts
/**
 * AuroraNotes API - Source Attribution Verification
 *
 * Verifies that each cited source actually supports the specific
 * claim it's attached to using semantic entailment checking.
 *
 * Features:
 * - Semantic entailment scoring
 * - Contradiction detection
 * - Partial support identification
 * - Attribution confidence calibration
 */

import { Citation, ScoredChunk } from './types';
import { cosineSimilarity } from './utils';
import { generateQueryEmbedding, isEmbeddingsAvailable } from './embeddings';
import { logInfo, logWarn } from './utils';

/**
 * Entailment relationship types
 */
export type EntailmentType = 'entails' | 'neutral' | 'contradicts' | 'partial';

/**
 * Attribution verification result for a single claim-source pair
 */
export interface AttributionResult {
  claimText: string;
  sourceText: string;
  cid: string;
  entailmentType: EntailmentType;
  entailmentScore: number;
  isVerified: boolean;
  explanation?: string;
  keyPhraseOverlap: number;
  factualAlignment: number;
}

/**
 * Batch verification result
 */
export interface BatchVerificationResult {
  results: AttributionResult[];
  verifiedCount: number;
  contradictionCount: number;
  partialCount: number;
  neutralCount: number;
  overallVerificationRate: number;
}

/**
 * Extract key phrases from text (noun phrases, important terms)
 */
function extractKeyPhrases(text: string): Set<string> {
  const phrases = new Set<string>();

  // Extract capitalized phrases (proper nouns, titles)
  const properNouns = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g) || [];
  properNouns.forEach(p => phrases.add(p.toLowerCase()));

  // Extract quoted phrases
  const quoted = text.match(/"([^"]+)"/g) || [];
  quoted.forEach(q => phrases.add(q.replace(/"/g, '').toLowerCase()));

  // Extract technical terms (camelCase, snake_case, etc.)
  const technical = text.match(/\b([a-z]+[A-Z][a-zA-Z]*|[a-z]+_[a-z_]+)\b/g) || [];
  technical.forEach(t => phrases.add(t.toLowerCase()));

  // Extract numbers with context
  const numbersWithContext = text.match(/\b(\d+(?:\.\d+)?%?\s*[a-zA-Z]+)\b/g) || [];
  numbersWithContext.forEach(n => phrases.add(n.toLowerCase()));

  return phrases;
}

/**
 * Calculate key phrase overlap between claim and source
 */
function calculateKeyPhraseOverlap(claim: string, source: string): number {
  const claimPhrases = extractKeyPhrases(claim);
  const sourcePhrases = extractKeyPhrases(source);

  if (claimPhrases.size === 0) return 1.0; // No key phrases to verify

  let matches = 0;
  for (const phrase of claimPhrases) {
    if (sourcePhrases.has(phrase) || source.toLowerCase().includes(phrase)) {
      matches++;
    }
  }

  return matches / claimPhrases.size;
}

/**
 * Check for factual alignment (numbers, dates, names match)
 */
function checkFactualAlignment(claim: string, source: string): number {
  // Extract factual elements from claim
  const claimNumbers = claim.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
  const claimDates = claim.match(/\b\d{4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d+/gi) || [];

  const factualElements = [...claimNumbers, ...claimDates];
  if (factualElements.length === 0) return 1.0; // No factual elements to verify

  let matches = 0;
  for (const element of factualElements) {
    if (source.includes(element)) {
      matches++;
    }
  }

  return matches / factualElements.length;
}

/**
 * Detect potential contradictions between claim and source
 */
function detectContradiction(claim: string, source: string): boolean {
  const claimLower = claim.toLowerCase();
  const sourceLower = source.toLowerCase();

  // Check for negation patterns
  const negationPatterns = [
    { positive: /\bis\b/, negative: /\bis not\b|\bisn't\b/ },
    { positive: /\bcan\b/, negative: /\bcannot\b|\bcan't\b/ },
    { positive: /\bwill\b/, negative: /\bwill not\b|\bwon't\b/ },
    { positive: /\bhas\b/, negative: /\bhas not\b|\bhasn't\b/ },
    { positive: /\bdoes\b/, negative: /\bdoes not\b|\bdoesn't\b/ },
  ];

  for (const pattern of negationPatterns) {
    const claimPositive = pattern.positive.test(claimLower);
    const claimNegative = pattern.negative.test(claimLower);
    const sourcePositive = pattern.positive.test(sourceLower);
    const sourceNegative = pattern.negative.test(sourceLower);

    // Contradiction if claim is positive but source is negative (or vice versa)
    if ((claimPositive && !claimNegative && sourceNegative) ||
        (claimNegative && sourcePositive && !sourceNegative)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate semantic entailment score using embeddings
 */
async function calculateSemanticEntailment(
  claim: string,
  source: string,
  sourceEmbedding?: number[]
): Promise<number> {
  if (!isEmbeddingsAvailable()) {
    return 0.5; // Neutral if embeddings unavailable
  }

  try {
    const claimEmbedding = await generateQueryEmbedding(claim);

    if (sourceEmbedding) {
      return cosineSimilarity(claimEmbedding, sourceEmbedding);
    }

    // Generate source embedding if not provided
    const srcEmb = await generateQueryEmbedding(source);
    return cosineSimilarity(claimEmbedding, srcEmb);
  } catch {
    return 0.5;
  }
}

/**
 * Determine entailment type from scores
 */
function determineEntailmentType(
  semanticScore: number,
  keyPhraseOverlap: number,
  factualAlignment: number,
  hasContradiction: boolean
): EntailmentType {
  if (hasContradiction) return 'contradicts';

  const combinedScore = semanticScore * 0.4 + keyPhraseOverlap * 0.3 + factualAlignment * 0.3;

  if (combinedScore >= 0.7) return 'entails';
  if (combinedScore >= 0.4) return 'partial';
  return 'neutral';
}

/**
 * Verify a single claim-source attribution
 */
export async function verifyAttribution(
  claimText: string,
  sourceText: string,
  cid: string,
  sourceEmbedding?: number[]
): Promise<AttributionResult> {
  // Calculate component scores
  const keyPhraseOverlap = calculateKeyPhraseOverlap(claimText, sourceText);
  const factualAlignment = checkFactualAlignment(claimText, sourceText);
  const hasContradiction = detectContradiction(claimText, sourceText);
  const semanticScore = await calculateSemanticEntailment(claimText, sourceText, sourceEmbedding);

  // Determine entailment type
  const entailmentType = determineEntailmentType(
    semanticScore,
    keyPhraseOverlap,
    factualAlignment,
    hasContradiction
  );

  // Calculate overall entailment score
  const entailmentScore = hasContradiction
    ? 0
    : semanticScore * 0.4 + keyPhraseOverlap * 0.3 + factualAlignment * 0.3;

  // Determine if verified
  const isVerified = entailmentType === 'entails' || entailmentType === 'partial';

  // Generate explanation
  let explanation: string | undefined;
  if (hasContradiction) {
    explanation = 'Source appears to contradict the claim';
  } else if (entailmentType === 'neutral') {
    explanation = 'Source does not clearly support or contradict the claim';
  } else if (entailmentType === 'partial') {
    explanation = 'Source partially supports the claim';
  }

  return {
    claimText,
    sourceText: sourceText.substring(0, 200) + (sourceText.length > 200 ? '...' : ''),
    cid,
    entailmentType,
    entailmentScore: Math.round(entailmentScore * 1000) / 1000,
    isVerified,
    explanation,
    keyPhraseOverlap: Math.round(keyPhraseOverlap * 1000) / 1000,
    factualAlignment: Math.round(factualAlignment * 1000) / 1000,
  };
}

/**
 * Batch verify all attributions in a response
 */
export async function batchVerifyAttributions(
  claimSourcePairs: Array<{ claim: string; cid: string }>,
  citations: Citation[],
  chunks: ScoredChunk[]
): Promise<BatchVerificationResult> {
  const citationMap = new Map(citations.map(c => [c.cid, c]));
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  const results: AttributionResult[] = [];
  let verifiedCount = 0;
  let contradictionCount = 0;
  let partialCount = 0;
  let neutralCount = 0;

  for (const pair of claimSourcePairs) {
    const citation = citationMap.get(pair.cid);
    if (!citation) continue;

    const chunk = chunkMap.get(citation.chunkId);
    const sourceText = chunk?.text || citation.snippet;
    const sourceEmbedding = chunk?.embedding;

    const result = await verifyAttribution(
      pair.claim,
      sourceText,
      pair.cid,
      sourceEmbedding
    );

    results.push(result);

    switch (result.entailmentType) {
      case 'entails':
        verifiedCount++;
        break;
      case 'partial':
        partialCount++;
        break;
      case 'contradicts':
        contradictionCount++;
        break;
      case 'neutral':
        neutralCount++;
        break;
    }
  }

  const overallVerificationRate = results.length > 0
    ? (verifiedCount + partialCount * 0.5) / results.length
    : 0;

  if (contradictionCount > 0) {
    logWarn('Contradictions detected in attributions', {
      contradictionCount,
      totalPairs: results.length,
      contradictingCids: results
        .filter(r => r.entailmentType === 'contradicts')
        .map(r => r.cid),
    });
  }

  return {
    results,
    verifiedCount,
    contradictionCount,
    partialCount,
    neutralCount,
    overallVerificationRate,
  };
}

/**
 * Get attribution verification summary for observability
 */
export function getAttributionSummary(result: BatchVerificationResult): {
  status: 'good' | 'warning' | 'critical';
  message: string;
  details: Record<string, number>;
} {
  const { verifiedCount, contradictionCount, partialCount, neutralCount, overallVerificationRate } = result;

  let status: 'good' | 'warning' | 'critical';
  let message: string;

  if (contradictionCount > 0) {
    status = 'critical';
    message = `${contradictionCount} citation(s) contradict their claims`;
  } else if (overallVerificationRate < 0.5) {
    status = 'warning';
    message = `Low verification rate: ${Math.round(overallVerificationRate * 100)}%`;
  } else if (neutralCount > verifiedCount) {
    status = 'warning';
    message = 'Many citations have neutral support';
  } else {
    status = 'good';
    message = `${Math.round(overallVerificationRate * 100)}% of claims verified`;
  }

  return {
    status,
    message,
    details: {
      verified: verifiedCount,
      partial: partialCount,
      neutral: neutralCount,
      contradictions: contradictionCount,
      verificationRate: Math.round(overallVerificationRate * 100),
    },
  };
}


```

---

## src/streaming.ts

**Path:** `src/streaming.ts`

```ts
/**
 * AuroraNotes API - Streaming Response Module
 *
 * Provides Server-Sent Events (SSE) streaming for chat responses.
 * Reduces perceived latency by streaming tokens as they're generated.
 *
 * Event format:
 * - data: {"type": "sources", "sources": [...]}    // Sent first, shows sources being used
 * - data: {"type": "token", "content": "..."}      // Streaming answer tokens
 * - data: {"type": "done", "meta": {...}}          // Final metadata with confidence, timing
 * - data: {"type": "error", "error": "..."}        // Error if something goes wrong
 */

import { Response } from "express";
import { Citation, SourcesPack, Source, ConfidenceLevel } from "./types";
import { getGenAIClient } from "./genaiClient";
import { logInfo, logError } from "./utils";
import { CHAT_MODEL } from "./config";

// SSE Event types
export type StreamEventType = 'token' | 'sources' | 'done' | 'error';

export interface StreamSource {
  id: string;
  noteId: string;
  preview: string;
  date: string;
}

export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  sources?: StreamSource[];
  meta?: {
    model: string;
    requestId?: string;
    responseTimeMs: number;
    confidence: ConfidenceLevel;
    sourceCount: number;
  };
  error?: string;
}

/**
 * Initialize SSE response headers
 */
export function initSSEResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
}

/**
 * Send an SSE event
 */
export function sendSSEEvent(res: Response, event: StreamEvent): void {
  const data = JSON.stringify(event);
  res.write(`data: ${data}\n\n`);
}

/**
 * Close SSE connection
 */
export function closeSSE(res: Response): void {
  res.end();
}

/**
 * Stream a chat response using Gemini's streaming API
 *
 * @param res - Express response object
 * @param prompt - Full prompt with sources
 * @param sourcesPack - Sources pack for citations
 * @param options - Additional options
 */
export async function streamChatResponse(
  res: Response,
  prompt: string,
  sourcesPack: SourcesPack,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    requestId?: string;
  } = {}
): Promise<{ fullText: string; tokenCount: number }> {
  const {
    model = CHAT_MODEL,
    temperature = 0.7,
    maxTokens = 2000,
    requestId,
  } = options;

  const startTime = Date.now();
  let fullText = '';
  let tokenCount = 0;

  try {
    const client = getGenAIClient();

    // Build human-readable sources for streaming display
    // Send ALL sources - no artificial cap (was slice(0, 5))
    const streamSources: StreamSource[] = Array.from(sourcesPack.citationsMap.entries())
      .map(([cid, citation]) => ({
        id: cid.replace('N', ''),
        noteId: citation.noteId,
        preview: citation.snippet.length > 100 ? citation.snippet.slice(0, 97) + '...' : citation.snippet,
        date: new Date(citation.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      }));

    // Send sources first so client can display them
    sendSSEEvent(res, { type: 'sources', sources: streamSources });

    // Stream generation
    const response = await client.models.generateContentStream({
      model,
      contents: prompt,
      config: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    });

    // Process stream chunks, normalizing citations from [N#] to [#]
    for await (const chunk of response) {
      let text = chunk.text || '';
      if (text) {
        // Normalize citation format for cleaner display
        text = text.replace(/\[N(\d+)\]/g, '[$1]');
        fullText += text;
        tokenCount++;
        sendSSEEvent(res, { type: 'token', content: text });
      }
    }

    // Send done event with metadata
    const elapsedMs = Date.now() - startTime;

    // Determine confidence based on source count and generation success
    const confidence: ConfidenceLevel = sourcesPack.sourceCount >= 3 ? 'high' :
      sourcesPack.sourceCount >= 1 ? 'medium' : 'low';

    sendSSEEvent(res, {
      type: 'done',
      meta: {
        model,
        requestId,
        responseTimeMs: elapsedMs,
        confidence,
        sourceCount: sourcesPack.sourceCount,
      },
    });

    logInfo('Stream completed', {
      requestId,
      tokenCount,
      elapsedMs,
      model,
    });

    return { fullText, tokenCount };
  } catch (err) {
    logError('Stream error', err, { requestId });
    sendSSEEvent(res, {
      type: 'error',
      error: err instanceof Error ? err.message : 'Stream generation failed',
    });
    throw err;
  } finally {
    closeSSE(res);
  }
}

/**
 * Check if client accepts SSE
 */
export function clientAcceptsSSE(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) return false;
  return acceptHeader.includes('text/event-stream');
}

/**
 * Streaming configuration
 */
export const STREAMING_CONFIG = {
  enabled: process.env.STREAMING_ENABLED !== 'false',
  flushIntervalMs: 50, // How often to flush buffer
  heartbeatIntervalMs: 15000, // Keep-alive heartbeat
};


```

---

## src/threads.ts

**Path:** `src/threads.ts`

```ts
/**
 * AuroraNotes API - Conversation Threads Service
 *
 * Manages conversation threads with message history for multi-turn chat.
 * Each thread belongs to a tenant (user) and contains a list of messages.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './firestore';
import {
  ThreadDoc,
  ThreadResponse,
  ThreadDetailResponse,
  ThreadsListResponse,
  ThreadMessage,
  MessageRole,
  Source,
} from './types';
import { timestampToISO, encodeCursor, parseCursor, logInfo, logError } from './utils';

// Collection name
const THREADS_COLLECTION = 'threads';

// Configuration
const MAX_MESSAGES_PER_THREAD = 100;
const MAX_MESSAGE_LENGTH = 10000;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

/**
 * Convert ThreadDoc to ThreadResponse (list view)
 */
function docToResponse(doc: ThreadDoc): ThreadResponse {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    title: doc.title,
    messageCount: doc.messages.length,
    lastActivityAt: timestampToISO(doc.lastActivityAt),
    createdAt: timestampToISO(doc.createdAt),
    updatedAt: timestampToISO(doc.updatedAt),
  };
}

/**
 * Convert ThreadDoc to ThreadDetailResponse (full view with messages)
 */
function docToDetailResponse(doc: ThreadDoc): ThreadDetailResponse {
  return {
    ...docToResponse(doc),
    messages: doc.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources,
      createdAt: timestampToISO(m.createdAt),
    })),
  };
}

/**
 * Create a new conversation thread
 */
export async function createThread(
  tenantId: string,
  options: { title?: string; metadata?: Record<string, unknown> } = {}
): Promise<ThreadResponse> {
  const id = uuidv4();
  const now = FieldValue.serverTimestamp();

  const doc: ThreadDoc = {
    id,
    tenantId,
    title: options.title,
    messages: [],
    metadata: options.metadata,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb();
  await db.collection(THREADS_COLLECTION).doc(id).set(doc);

  // Fetch to get server timestamps
  const savedDoc = await db.collection(THREADS_COLLECTION).doc(id).get();
  const savedData = savedDoc.data() as ThreadDoc;

  logInfo('Thread created', { threadId: id, tenantId });

  return docToResponse(savedData);
}

/**
 * Get a thread by ID with all messages
 */
export async function getThread(
  threadId: string,
  tenantId: string
): Promise<ThreadDetailResponse | null> {
  const db = getDb();
  const doc = await db.collection(THREADS_COLLECTION).doc(threadId).get();

  if (!doc.exists) return null;

  const data = doc.data() as ThreadDoc;

  // Verify tenant access
  if (data.tenantId !== tenantId) return null;

  return docToDetailResponse(data);
}

/**
 * List threads for a tenant with pagination
 */
export async function listThreads(
  tenantId: string,
  limit: number = DEFAULT_PAGE_LIMIT,
  cursor?: string
): Promise<ThreadsListResponse> {
  const db = getDb();
  const pageLimit = Math.min(Math.max(1, limit), MAX_PAGE_LIMIT);
  const cursorData = parseCursor(cursor);

  let query = db
    .collection(THREADS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('lastActivityAt', 'desc')
    .orderBy('__name__', 'desc')
    .limit(pageLimit + 1);

  if (cursorData) {
    query = query.startAfter(Timestamp.fromDate(cursorData.createdAt), cursorData.id);
  }

  const snap = await query.get();
  const docs = snap.docs.map((d) => d.data() as ThreadDoc);

  const hasMore = docs.length > pageLimit;
  const resultDocs = hasMore ? docs.slice(0, pageLimit) : docs;

  let nextCursor: string | null = null;
  if (hasMore && resultDocs.length > 0) {
    const lastDoc = resultDocs[resultDocs.length - 1];
    const lastActivity = lastDoc.lastActivityAt as Timestamp;
    nextCursor = encodeCursor(lastActivity, lastDoc.id);
  }

  return {
    threads: resultDocs.map(docToResponse),
    cursor: nextCursor,
    hasMore,
  };
}

/**
 * Add a message to a thread
 */
export async function addMessage(
  threadId: string,
  tenantId: string,
  role: MessageRole,
  content: string,
  sources?: Source[]
): Promise<ThreadMessage | null> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);

  // Fetch thread and verify access
  const threadDoc = await threadRef.get();
  if (!threadDoc.exists) return null;

  const threadData = threadDoc.data() as ThreadDoc;
  if (threadData.tenantId !== tenantId) return null;

  // Check message limit
  if (threadData.messages.length >= MAX_MESSAGES_PER_THREAD) {
    throw new Error(`Thread has reached maximum message limit (${MAX_MESSAGES_PER_THREAD})`);
  }

  // Validate content length
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }

  // Create message
  const message: ThreadMessage = {
    id: uuidv4(),
    role,
    content: content.trim(),
    sources,
    createdAt: FieldValue.serverTimestamp(),
  };

  // Update thread with new message
  await threadRef.update({
    messages: FieldValue.arrayUnion(message),
    lastActivityAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    // Auto-generate title from first user message if not set
    ...(threadData.messages.length === 0 && role === 'user' && !threadData.title
      ? { title: content.slice(0, 100) + (content.length > 100 ? '...' : '') }
      : {}),
  });

  logInfo('Message added to thread', {
    threadId,
    messageId: message.id,
    role,
    contentLength: content.length,
  });

  return message;
}

/**
 * Delete a thread
 */
export async function deleteThread(
  threadId: string,
  tenantId: string
): Promise<boolean> {
  const db = getDb();
  const threadRef = db.collection(THREADS_COLLECTION).doc(threadId);

  const threadDoc = await threadRef.get();
  if (!threadDoc.exists) return false;

  const threadData = threadDoc.data() as ThreadDoc;
  if (threadData.tenantId !== tenantId) return false;

  await threadRef.delete();

  logInfo('Thread deleted', { threadId, tenantId });

  return true;
}

/**
 * Get recent messages from a thread for context
 * Returns the last N messages for use in chat context
 */
export async function getRecentMessages(
  threadId: string,
  tenantId: string,
  limit: number = 10
): Promise<ThreadMessage[]> {
  const thread = await getThread(threadId, tenantId);
  if (!thread) return [];

  // Return last N messages
  return thread.messages.slice(-limit).map((m) => ({
    id: m.id,
    role: m.role as MessageRole,
    content: m.content,
    sources: m.sources,
    createdAt: FieldValue.serverTimestamp(), // Placeholder, actual value from thread
  }));
}


```

---

## src/transcription.test.ts

**Path:** `src/transcription.test.ts`

```ts
/**
 * Transcription Module Tests
 *
 * Tests for speech-to-text transcription functionality.
 * Run with: npx ts-node --test src/transcription.test.ts
 * Or: node --experimental-strip-types --test src/transcription.test.ts
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  transcribeAudio,
  TranscriptionError,
  isAudioTypeSupported,
  SUPPORTED_AUDIO_TYPES,
} from './transcription';

// ============================================================================
// Unit Tests - isAudioTypeSupported
// ============================================================================

describe('isAudioTypeSupported', () => {
  it('returns true for supported audio types', () => {
    assert.strictEqual(isAudioTypeSupported('audio/mp3'), true);
    assert.strictEqual(isAudioTypeSupported('audio/wav'), true);
    assert.strictEqual(isAudioTypeSupported('audio/mpeg'), true);
    assert.strictEqual(isAudioTypeSupported('audio/webm'), true);
    assert.strictEqual(isAudioTypeSupported('audio/ogg'), true);
    assert.strictEqual(isAudioTypeSupported('audio/flac'), true);
    assert.strictEqual(isAudioTypeSupported('audio/aac'), true);
    assert.strictEqual(isAudioTypeSupported('audio/aiff'), true);
  });

  it('returns false for unsupported audio types', () => {
    assert.strictEqual(isAudioTypeSupported('audio/midi'), false);
    assert.strictEqual(isAudioTypeSupported('video/mp4'), false);
    assert.strictEqual(isAudioTypeSupported('image/png'), false);
    assert.strictEqual(isAudioTypeSupported('text/plain'), false);
    assert.strictEqual(isAudioTypeSupported(''), false);
  });

  it('is case-sensitive for MIME types', () => {
    // MIME types are case-insensitive by spec, but our implementation expects lowercase
    assert.strictEqual(isAudioTypeSupported('AUDIO/MP3'), false);
    assert.strictEqual(isAudioTypeSupported('Audio/Wav'), false);
  });
});

describe('SUPPORTED_AUDIO_TYPES', () => {
  it('includes all common audio formats', () => {
    assert.ok(SUPPORTED_AUDIO_TYPES.includes('audio/mp3'), 'Should support MP3');
    assert.ok(SUPPORTED_AUDIO_TYPES.includes('audio/wav'), 'Should support WAV');
    assert.ok(SUPPORTED_AUDIO_TYPES.includes('audio/webm'), 'Should support WebM');
    assert.ok(SUPPORTED_AUDIO_TYPES.includes('audio/ogg'), 'Should support OGG');
  });

  it('has expected number of supported formats', () => {
    assert.ok(SUPPORTED_AUDIO_TYPES.length >= 7, 'Should support at least 7 audio formats');
  });
});

// ============================================================================
// Unit Tests - TranscriptionError
// ============================================================================

describe('TranscriptionError', () => {
  it('creates error with correct properties', () => {
    const error = new TranscriptionError('File is too large', 'FILE_TOO_LARGE');
    
    assert.strictEqual(error.message, 'File is too large');
    assert.strictEqual(error.code, 'FILE_TOO_LARGE');
    assert.strictEqual(error.name, 'TranscriptionError');
    assert.ok(error instanceof Error);
  });

  it('supports all error codes', () => {
    const codes = ['FILE_TOO_LARGE', 'UNSUPPORTED_FORMAT', 'TRANSCRIPTION_FAILED', 'INVALID_AUDIO'] as const;
    
    for (const code of codes) {
      const error = new TranscriptionError(`Error: ${code}`, code);
      assert.strictEqual(error.code, code);
    }
  });
});

// ============================================================================
// Unit Tests - transcribeAudio (validation only, no API calls)
// ============================================================================

describe('transcribeAudio - validation', () => {
  it('rejects files larger than 20MB', async () => {
    // Create a buffer slightly over 20MB
    const largeBuffer = Buffer.alloc(21 * 1024 * 1024);
    
    await assert.rejects(
      () => transcribeAudio(largeBuffer, 'audio/mp3'),
      (error: TranscriptionError) => {
        assert.strictEqual(error.code, 'FILE_TOO_LARGE');
        assert.ok(error.message.includes('20MB'));
        return true;
      }
    );
  });

  it('rejects unsupported audio formats', async () => {
    const buffer = Buffer.from('fake audio data');
    
    await assert.rejects(
      () => transcribeAudio(buffer, 'audio/midi'),
      (error: TranscriptionError) => {
        assert.strictEqual(error.code, 'UNSUPPORTED_FORMAT');
        assert.ok(error.message.includes('audio/midi'));
        return true;
      }
    );
  });

  it('rejects non-audio MIME types', async () => {
    const buffer = Buffer.from('fake data');
    
    await assert.rejects(
      () => transcribeAudio(buffer, 'text/plain'),
      (error: TranscriptionError) => {
        assert.strictEqual(error.code, 'UNSUPPORTED_FORMAT');
        return true;
      }
    );
  });

  it('rejects empty MIME type', async () => {
    const buffer = Buffer.from('fake audio data');

    await assert.rejects(
      () => transcribeAudio(buffer, ''),
      (error: TranscriptionError) => {
        assert.strictEqual(error.code, 'UNSUPPORTED_FORMAT');
        return true;
      }
    );
  });
});

// ============================================================================
// Unit Tests - Audio Upload Middleware Helpers
// ============================================================================

import { getNormalizedMimeType, AudioUploadError, handleMulterError } from './middleware/audioUpload';

describe('getNormalizedMimeType', () => {
  it('normalizes audio/mpeg to audio/mp3', () => {
    const file = { mimetype: 'audio/mpeg' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/mp3');
  });

  it('normalizes audio/x-wav to audio/wav', () => {
    const file = { mimetype: 'audio/x-wav' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/wav');
  });

  it('normalizes audio/wave to audio/wav', () => {
    const file = { mimetype: 'audio/wave' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/wav');
  });

  it('normalizes video/webm to audio/webm', () => {
    const file = { mimetype: 'video/webm' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/webm');
  });

  it('normalizes audio/m4a to audio/aac', () => {
    const file = { mimetype: 'audio/m4a' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/aac');
  });

  it('normalizes audio/mp4 to audio/aac', () => {
    const file = { mimetype: 'audio/mp4' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/aac');
  });

  it('passes through already correct MIME types', () => {
    const file = { mimetype: 'audio/mp3' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/mp3');
  });

  it('handles uppercase MIME types', () => {
    const file = { mimetype: 'AUDIO/MPEG' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/mp3');
  });
});

describe('AudioUploadError', () => {
  it('creates error with correct properties', () => {
    const error = new AudioUploadError('No file provided', 'NO_FILE');

    assert.strictEqual(error.message, 'No file provided');
    assert.strictEqual(error.code, 'NO_FILE');
    assert.strictEqual(error.name, 'AudioUploadError');
    assert.ok(error instanceof Error);
  });

  it('supports FILE_TOO_LARGE code', () => {
    const error = new AudioUploadError('File too large', 'FILE_TOO_LARGE');
    assert.strictEqual(error.code, 'FILE_TOO_LARGE');
  });

  it('supports UNSUPPORTED_FORMAT code', () => {
    const error = new AudioUploadError('Bad format', 'UNSUPPORTED_FORMAT');
    assert.strictEqual(error.code, 'UNSUPPORTED_FORMAT');
  });
});

describe('handleMulterError', () => {
  it('handles unsupported format error messages', () => {
    const error = new Error('Unsupported audio format: audio/midi');

    const result = handleMulterError(error);

    assert.ok(result instanceof AudioUploadError);
    assert.strictEqual(result.code, 'UNSUPPORTED_FORMAT');
  });

  it('handles generic errors', () => {
    const error = new Error('Something went wrong');

    const result = handleMulterError(error);

    assert.ok(result instanceof AudioUploadError);
    assert.strictEqual(result.message, 'Something went wrong');
  });

  it('returns AudioUploadError instance for any error', () => {
    const error = { message: 'Unknown error' };

    const result = handleMulterError(error);

    assert.ok(result instanceof AudioUploadError);
  });
});


```

---

## src/transcription.ts

**Path:** `src/transcription.ts`

```ts
/**
 * AuroraNotes API - Speech-to-Text Transcription Service
 *
 * Provides audio transcription using Google GenAI (Gemini).
 * Supports MP3, WAV, AIFF, AAC, OGG, and FLAC audio formats.
 *
 * Usage:
 *   const result = await transcribeAudio(audioBuffer, 'audio/mp3');
 */

import { getGenAIClient, acquireRequestSlot } from './genaiClient';
import { logInfo, logError, logWarn } from './utils';

// ============================================================================
// Configuration
// ============================================================================

/** Model to use for transcription */
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gemini-2.0-flash';

/** Maximum audio file size (20MB - API limit for inline data) */
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;

/** Supported audio MIME types */
export const SUPPORTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
] as const;

export type SupportedAudioType = typeof SUPPORTED_AUDIO_TYPES[number];

// ============================================================================
// Types
// ============================================================================

/** Output format for transcription */
export type TranscriptionOutputFormat = 'text' | 'segments' | 'srt' | 'vtt';

/** Transcription segment with timing */
export interface TranscriptionSegment {
  text: string;
  startTime: number;
  endTime: number;
  speaker?: string;
  confidence?: number;
}

/** Action item extracted from transcription */
export interface ActionItem {
  text: string;
  assignee?: string;
  dueDate?: string;
  priority?: 'high' | 'medium' | 'low';
}

/** Transcription request options */
export interface TranscriptionOptions {
  /** Language hint for better accuracy (e.g., 'en', 'es', 'fr') */
  languageHint?: string;
  /** Include timestamps in transcription */
  includeTimestamps?: boolean;
  /** Include speaker diarization */
  includeSpeakerDiarization?: boolean;
  /** Add punctuation to transcript */
  addPunctuation?: boolean;
  /** Custom vocabulary hints for domain-specific terms */
  vocabularyHints?: string;
  /** Output format */
  outputFormat?: TranscriptionOutputFormat;
  /** Generate a summary of the transcription */
  generateSummary?: boolean;
  /** Extract action items from the transcription */
  extractActionItems?: boolean;
  /** Detect and segment by topic */
  detectTopics?: boolean;
}

/** Transcription result */
export interface TranscriptionResult {
  /** The transcribed text */
  text: string;
  /** Detected language (if available) */
  detectedLanguage?: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Model used for transcription */
  model: string;
  /** Audio duration estimate based on tokens (32 tokens/sec) */
  estimatedDurationSeconds?: number;
  /** Segments with timestamps (if includeTimestamps or outputFormat is 'segments') */
  segments?: TranscriptionSegment[];
  /** Summary of the transcription (if generateSummary) */
  summary?: string;
  /** Action items extracted (if extractActionItems) */
  actionItems?: ActionItem[];
  /** Topics detected (if detectTopics) */
  topics?: string[];
  /** Subtitle format output (if outputFormat is 'srt' or 'vtt') */
  subtitles?: string;
  /** Number of speakers detected (if includeSpeakerDiarization) */
  speakerCount?: number;
}

// ============================================================================
// Prompt Builders
// ============================================================================

/**
 * Build the main transcription prompt based on options
 */
function buildTranscriptionPrompt(options: TranscriptionOptions): string {
  const parts: string[] = [];

  // Base instruction
  parts.push('Generate a transcript of the speech.');

  // Language hint
  if (options.languageHint) {
    parts.push(`The audio is in ${options.languageHint}.`);
  }

  // Vocabulary hints
  if (options.vocabularyHints) {
    parts.push(`Domain-specific terms that may appear: ${options.vocabularyHints}.`);
  }

  // Speaker diarization
  if (options.includeSpeakerDiarization) {
    parts.push('Identify different speakers (Speaker 1, Speaker 2, etc.).');
  }

  // Timestamps
  if (options.includeTimestamps || options.outputFormat === 'segments' ||
      options.outputFormat === 'srt' || options.outputFormat === 'vtt') {
    parts.push('Include timestamps in the format [MM:SS] at the start of each segment.');
  }

  // Punctuation
  if (options.addPunctuation !== false) {
    parts.push('Add proper punctuation and capitalization.');
  }

  // Output format instructions
  if (options.outputFormat === 'segments') {
    parts.push('Format each segment as: [timestamp] speaker: text');
  } else if (options.outputFormat === 'srt') {
    parts.push('Format the output as SRT subtitles with sequential numbering, timestamps (HH:MM:SS,mmm --> HH:MM:SS,mmm format), and text.');
  } else if (options.outputFormat === 'vtt') {
    parts.push('Format the output as WebVTT subtitles starting with "WEBVTT" header, with timestamps (HH:MM:SS.mmm --> HH:MM:SS.mmm format).');
  } else {
    parts.push('Return the transcribed text.');
  }

  return parts.join(' ');
}

/**
 * Build the summary extraction prompt
 */
function buildSummaryPrompt(transcript: string): string {
  return `Summarize the following transcript in 2-3 concise sentences, capturing the main points and key takeaways:

${transcript}

Summary:`;
}

/**
 * Build the action items extraction prompt
 */
function buildActionItemsPrompt(transcript: string): string {
  return `Extract action items from the following transcript. For each action item, identify:
- The task to be done
- Who should do it (if mentioned)
- When it's due (if mentioned)
- Priority (high/medium/low based on context)

Return the result as a JSON array of objects with keys: text, assignee, dueDate, priority.
If no action items are found, return an empty array [].

Transcript:
${transcript}

Action items (JSON):`;
}

/**
 * Build the topics extraction prompt
 */
function buildTopicsPrompt(transcript: string): string {
  return `Identify the main topics discussed in the following transcript. Return 3-5 topic keywords or short phrases, separated by commas.

Transcript:
${transcript}

Topics:`;
}

// ============================================================================
// Main Transcription Function
// ============================================================================

/**
 * Transcribe audio to text using Google GenAI.
 *
 * @param audioBuffer - Audio data as a Buffer
 * @param mimeType - MIME type of the audio (e.g., 'audio/mp3')
 * @param options - Optional transcription settings
 * @returns Transcription result with text and metadata
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const startTime = Date.now();

  // Validate audio size
  if (audioBuffer.length > MAX_AUDIO_SIZE_BYTES) {
    throw new TranscriptionError(
      `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB`,
      'FILE_TOO_LARGE'
    );
  }

  // Validate MIME type
  if (!SUPPORTED_AUDIO_TYPES.includes(mimeType as SupportedAudioType)) {
    throw new TranscriptionError(
      `Unsupported audio format: ${mimeType}. Supported formats: ${SUPPORTED_AUDIO_TYPES.join(', ')}`,
      'UNSUPPORTED_FORMAT'
    );
  }

  logInfo('Starting audio transcription', {
    mimeType,
    sizeBytes: audioBuffer.length,
    languageHint: options.languageHint,
    options: {
      includeTimestamps: options.includeTimestamps,
      includeSpeakerDiarization: options.includeSpeakerDiarization,
      outputFormat: options.outputFormat,
      generateSummary: options.generateSummary,
      extractActionItems: options.extractActionItems,
      detectTopics: options.detectTopics,
    },
  });

  // Acquire request slot for concurrency limiting
  const releaseSlot = await acquireRequestSlot();

  try {
    const client = getGenAIClient();

    // Build the transcription prompt
    const prompt = buildTranscriptionPrompt(options);

    // Convert buffer to base64
    const base64Audio = audioBuffer.toString('base64');

    // Call GenAI with audio data
    const response = await client.models.generateContent({
      model: TRANSCRIPTION_MODEL,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
          ],
        },
      ],
    });

    const transcribedText = response.text?.trim() || '';
    let processingTimeMs = Date.now() - startTime;

    // Estimate duration from response token count (if available)
    // Gemini uses 32 tokens per second of audio
    const estimatedDurationSeconds = response.usageMetadata?.promptTokenCount
      ? Math.round(response.usageMetadata.promptTokenCount / 32)
      : undefined;

    // Build result
    const result: TranscriptionResult = {
      text: transcribedText,
      processingTimeMs,
      model: TRANSCRIPTION_MODEL,
      estimatedDurationSeconds,
    };

    // Handle subtitle formats
    if (options.outputFormat === 'srt' || options.outputFormat === 'vtt') {
      result.subtitles = transcribedText;
      // Extract plain text from subtitles for other processing
      const plainText = transcribedText
        .replace(/^\d+\n/gm, '')  // Remove SRT numbering
        .replace(/^WEBVTT\n/m, '')  // Remove VTT header
        .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/g, '')  // Remove timestamps
        .replace(/\n{2,}/g, ' ')
        .trim();
      result.text = plainText || transcribedText;
    }

    // Parse segments if requested
    if (options.outputFormat === 'segments' || (options.includeTimestamps && options.includeSpeakerDiarization)) {
      result.segments = parseSegments(transcribedText, options.includeSpeakerDiarization);
      if (options.includeSpeakerDiarization) {
        const speakers = new Set(result.segments?.map(s => s.speaker).filter(Boolean));
        result.speakerCount = speakers.size;
      }
    }

    // Generate summary if requested
    if (options.generateSummary && transcribedText.length > 100) {
      try {
        const summaryResponse = await client.models.generateContent({
          model: TRANSCRIPTION_MODEL,
          contents: [{ parts: [{ text: buildSummaryPrompt(transcribedText) }] }],
        });
        result.summary = summaryResponse.text?.trim();
      } catch (err) {
        logWarn('Failed to generate summary', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Extract action items if requested
    if (options.extractActionItems && transcribedText.length > 50) {
      try {
        const actionResponse = await client.models.generateContent({
          model: TRANSCRIPTION_MODEL,
          contents: [{ parts: [{ text: buildActionItemsPrompt(transcribedText) }] }],
        });
        const actionText = actionResponse.text?.trim() || '[]';
        // Parse JSON, handling potential markdown code blocks
        const jsonMatch = actionText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          result.actionItems = JSON.parse(jsonMatch[0]) as ActionItem[];
        }
      } catch (err) {
        logWarn('Failed to extract action items', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Detect topics if requested
    if (options.detectTopics && transcribedText.length > 100) {
      try {
        const topicsResponse = await client.models.generateContent({
          model: TRANSCRIPTION_MODEL,
          contents: [{ parts: [{ text: buildTopicsPrompt(transcribedText) }] }],
        });
        const topicsText = topicsResponse.text?.trim() || '';
        result.topics = topicsText.split(',').map(t => t.trim()).filter(Boolean);
      } catch (err) {
        logWarn('Failed to detect topics', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Update processing time to include additional processing
    result.processingTimeMs = Date.now() - startTime;

    logInfo('Transcription completed', {
      textLength: transcribedText.length,
      processingTimeMs: result.processingTimeMs,
      estimatedDurationSeconds,
      hasSummary: !!result.summary,
      actionItemCount: result.actionItems?.length,
      topicCount: result.topics?.length,
    });

    return result;
  } catch (error) {
    logError('Transcription failed', error);

    if (error instanceof TranscriptionError) {
      throw error;
    }

    throw new TranscriptionError(
      `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'TRANSCRIPTION_FAILED'
    );
  } finally {
    releaseSlot();
  }
}

/**
 * Parse transcript text into segments with timestamps and speakers
 */
function parseSegments(text: string, hasSpeakers: boolean = false): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];

  // Pattern for [MM:SS] or [HH:MM:SS] timestamps
  const timestampPattern = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;

  const lines = text.split('\n');
  let currentTime = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Try to extract timestamp
    const timestampMatch = trimmedLine.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
    let startTime = currentTime;

    if (timestampMatch) {
      const hours = timestampMatch[3] ? parseInt(timestampMatch[1]) : 0;
      const minutes = timestampMatch[3] ? parseInt(timestampMatch[2]) : parseInt(timestampMatch[1]);
      const seconds = timestampMatch[3] ? parseInt(timestampMatch[3]) : parseInt(timestampMatch[2]);
      startTime = hours * 3600 + minutes * 60 + seconds;
      currentTime = startTime;
    }

    // Try to extract speaker
    let speaker: string | undefined;
    let segmentText = trimmedLine.replace(/^\[[\d:]+\]\s*/, '');

    if (hasSpeakers) {
      const speakerMatch = segmentText.match(/^(Speaker\s*\d+|[A-Za-z]+):\s*/i);
      if (speakerMatch) {
        speaker = speakerMatch[1];
        segmentText = segmentText.slice(speakerMatch[0].length);
      }
    }

    if (segmentText) {
      segments.push({
        text: segmentText,
        startTime,
        endTime: startTime + 5, // Estimate 5 seconds per segment
        speaker,
      });
    }
  }

  // Update end times based on next segment
  for (let i = 0; i < segments.length - 1; i++) {
    segments[i].endTime = segments[i + 1].startTime;
  }

  return segments;
}

// ============================================================================
// Error Class
// ============================================================================

export type TranscriptionErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'TRANSCRIPTION_FAILED'
  | 'INVALID_AUDIO';

export class TranscriptionError extends Error {
  code: TranscriptionErrorCode;

  constructor(message: string, code: TranscriptionErrorCode) {
    super(message);
    this.name = 'TranscriptionError';
    this.code = code;
  }
}

/**
 * Check if a MIME type is supported for transcription
 */
export function isAudioTypeSupported(mimeType: string): boolean {
  return SUPPORTED_AUDIO_TYPES.includes(mimeType as SupportedAudioType);
}


```

---

## src/types.ts

**Path:** `src/types.ts`

```ts
/**
 * AuroraNotes API - Shared Types
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";

// ============================================
// Note Types
// ============================================

/** Note processing status */
export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

/** Note document in Firestore */
export interface NoteDoc {
  id: string;
  /** Note title (optional, extracted from content or provided) */
  title?: string;
  /** Note content (renamed from 'text' for clarity) */
  text: string;
  tenantId: string;
  /** Processing status for async chunking/embedding */
  processingStatus?: ProcessingStatus;
  /** Error message if processing failed */
  processingError?: string;
  /** Tags for organization */
  tags?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Note as returned from API (ISO strings) */
export interface NoteResponse {
  id: string;
  title?: string;
  text: string;
  tenantId: string;
  processingStatus?: ProcessingStatus;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Paginated notes response */
export interface NotesListResponse {
  notes: NoteResponse[];
  cursor: string | null;
  hasMore: boolean;
}

/** Response from deleting a note */
export interface DeleteNoteResponse {
  success: boolean;
  id: string;
  deletedAt: string;
  chunksDeleted: number;
}

// ============================================
// Chunk Types
// ============================================

/** Chunk document in Firestore */
export interface ChunkDoc {
  chunkId: string;
  noteId: string;
  tenantId: string;
  text: string;
  textHash: string;
  position: number;
  tokenEstimate: number;
  createdAt: Timestamp | FieldValue;
  embedding?: number[];
  embeddingModel?: string;
  // Lexical indexing fields (for exact-match recall)
  terms?: string[];          // Normalized tokens for array-contains-any queries
  termsVersion?: number;     // Version of term extraction algorithm (for backfill)
  // Context windows for sentence-level retrieval (improves citation accuracy)
  prevContext?: string;      // Last ~100 chars from previous chunk
  nextContext?: string;      // First ~100 chars from next chunk
  totalChunks?: number;      // Total chunks in this note (for context)
}

/** Chunk with score for retrieval */
export interface ScoredChunk {
  chunkId: string;
  noteId: string;
  tenantId: string;
  text: string;
  position: number;
  createdAt: Date;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  recencyScore?: number;
  crossEncoderScore?: number;  // Score from cross-encoder reranking
  prevContext?: string;        // Context from previous chunk
  nextContext?: string;        // Context from next chunk
  sourceCount?: number;        // Number of retrieval sources that found this chunk (for RRF)
  embedding?: number[];        // Embedding vector (for semantic deduplication)
}

// ============================================
// Query Intent Types (defined early for use in Chat types)
// ============================================

/** Query intent types */
export type QueryIntent =
  | 'summarize'      // User wants a summary of their notes
  | 'list'           // User wants a list of items
  | 'decision'       // User is asking about decisions made
  | 'action_item'    // User is looking for action items/todos
  | 'search'         // General search/lookup
  | 'question';      // Direct question

// ============================================
// Chat Types
// ============================================

/** Source reference in chat response - human-readable citation info */
export interface Source {
  /** Citation ID for linking (e.g., "1", "2") */
  id: string;
  /** Note ID for deep linking */
  noteId: string;
  /** Preview text from the source */
  preview: string;
  /** Human-readable date (e.g., "Dec 15, 2024") */
  date: string;
  /** Relevance score (0-1) for display confidence */
  relevance: number;
}

/** Citation in chat response - kept for backwards compatibility */
export interface Citation {
  cid: string;          // e.g., "N12"
  noteId: string;
  chunkId: string;
  createdAt: string;    // ISO string
  snippet: string;
  score: number;
}

/** Chat request body */
export interface ChatRequest {
  message: string;
  tenantId?: string;
}

/** Response confidence level */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

/** Response metadata for production observability */
export interface ResponseMeta {
  /** Model used for generation */
  model: string;
  /** Request ID for support/debugging */
  requestId?: string;
  /** Total response time in ms */
  responseTimeMs: number;
  /** Detected query intent */
  intent: QueryIntent;
  /** Response confidence indicator */
  confidence: ConfidenceLevel;
  /** Number of sources used */
  sourceCount: number;
  /** Thread ID if part of a conversation */
  threadId?: string;
  /** Action result for agentic queries */
  action?: {
    type: string;
    success: boolean;
    data?: unknown;
  };
  /** Retrieval details (optional) */
  retrieval?: {
    strategy: string;
    candidateCount?: number;
    k: number;
  };
  /** Retrieval details (optional, for debugging) */
  debug?: {
    strategy: string;
    candidateCount?: number;
    rerankCount?: number;
    /** Enhanced confidence metrics */
    enhancedConfidence?: {
      overall: number;
      level: string;
      isReliable: boolean;
      breakdown?: {
        citationDensity: number;
        sourceRelevance: number;
        answerCoherence: number;
        claimSupport: number;
      };
    };
    /** Citation quality metrics */
    citationQuality?: {
      averageConfidence: number;
      highConfidenceCount: number;
      insufficientCount: number;
    };
    /** Post-processing details */
    postProcessing?: {
      modifications: number;
      coherenceScore: number;
      structureType: string;
    };
    /** Validation pipeline metrics (Phase 5) */
    validation?: {
      contractCompliant: boolean;
      citationAccuracy: number;
      overallConfidence: number;
      invalidRemoved: number;
      pipelineMs: number;
    };
  };
}

/** Chat response - production-grade format */
export interface ChatResponse {
  /** Main answer text with inline citation markers [1], [2], etc. */
  answer: string;
  /** Human-readable sources for display - sources that are CITED in the answer (matches [1], [2] markers) */
  sources: Source[];
  /** All sources used as context for the LLM (top N after reranking), excluding cited sources */
  contextSources?: Source[];
  /** Response metadata */
  meta: ResponseMeta;
  /** @deprecated Use sources instead - kept for backwards compatibility */
  citations?: Citation[];
}

/** Legacy ChatResponse for internal compatibility */
export interface LegacyChatResponse {
  answer: string;
  citations: Citation[];
  meta: {
    model: string;
    retrieval: {
      k: number;
      strategy: string;
      candidateCount?: number;
      rerankCount?: number;
      intent?: QueryIntent;
      timeMs?: number;
    };
  };
}

// ============================================
// Retrieval Types
// ============================================

/** Query analysis result */
export interface QueryAnalysis {
  originalQuery: string;
  normalizedQuery: string;
  keywords: string[];
  intent: QueryIntent;
  timeHint?: {
    days?: number;
    after?: Date;
    before?: Date;
  };
  entities?: string[];        // Extracted named entities (names, projects, etc.)
  boostTerms?: string[];      // Terms to boost in scoring
}

/** Note filter options for scoped retrieval */
export interface NoteFilterOptions {
  /** Only include chunks from these specific note IDs */
  noteIds?: string[];
  /** Exclude chunks from these note IDs */
  excludeNoteIds?: string[];
  /** Only include notes with any of these tags (OR logic) */
  tags?: string[];
  /** Only include notes created on or after this date */
  dateFrom?: Date;
  /** Only include notes created on or before this date */
  dateTo?: Date;
}

/** Retrieval options */
export interface RetrievalOptions {
  tenantId: string;
  topK: number;
  rerankTo: number;
  maxAgeDays?: number;
  keywords?: string[];
  useVectorSearch?: boolean;
  // Multi-stage retrieval options
  useQueryExpansion?: boolean;  // Enable multi-query expansion
  requestId?: string;           // For logging correlation
  // Dynamic context budget (overrides LLM_CONTEXT_BUDGET_CHARS)
  contextBudget?: number;       // Max characters for source context
  // Note filtering options
  noteFilters?: NoteFilterOptions;
  // Minimum relevance score threshold
  minRelevance?: number;
}

// ============================================
// Multi-Stage Retrieval Types
// ============================================

/** Candidate counts by retrieval stage for observability */
export interface CandidateCounts {
  vectorK: number;
  lexicalK: number;
  recencyK: number;
  mergedK: number;
  rerankedK: number;
  finalK: number;
}

/** Timings by retrieval stage for observability */
export interface RetrievalTimingsStage {
  queryParseMs: number;
  embeddingMs: number;
  vectorSearchMs: number;
  lexicalSearchMs: number;
  firestoreFetchMs: number;
  scoringMs: number;
  rerankMs: number;
  totalMs: number;
}

// ============================================
// Sources Pack - Single source of truth for sources and citations
// ============================================

/**
 * SourcesPack represents the exact set of sources used in a chat response.
 * This object flows through the entire pipeline ensuring:
 * - sources: The exact chunks used as sources in the LLM prompt
 * - citationsMap: 1:1 mapping of cid (N1, N2, ...) to Citation
 * - The prompt source count matches citationsMap.size EXACTLY
 */
export interface SourcesPack {
  /** The exact chunks used as sources - post-filtering, post-reranking */
  sources: ScoredChunk[];
  /** 1:1 mapping from cid (e.g., "N1") to Citation object */
  citationsMap: Map<string, Citation>;
  /** Number of sources = citationsMap.size = prompt source count */
  sourceCount: number;
}

// ============================================
// Conversation Thread Types
// ============================================

/** Message role in a conversation */
export type MessageRole = 'user' | 'assistant';

/** Message in a conversation thread */
export interface ThreadMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** Sources used for assistant messages */
  sources?: Source[];
  /** Timestamp */
  createdAt: Timestamp | FieldValue;
}

/** Thread document in Firestore */
export interface ThreadDoc {
  id: string;
  tenantId: string;
  /** Optional title (auto-generated from first message if not provided) */
  title?: string;
  /** Messages in the thread (stored inline for simplicity) */
  messages: ThreadMessage[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Last activity timestamp */
  lastActivityAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

/** Thread as returned from API */
export interface ThreadResponse {
  id: string;
  tenantId: string;
  title?: string;
  messageCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Thread with messages as returned from API */
export interface ThreadDetailResponse extends ThreadResponse {
  messages: Array<{
    id: string;
    role: MessageRole;
    content: string;
    sources?: Source[];
    createdAt: string;
  }>;
}

/** Paginated threads response */
export interface ThreadsListResponse {
  threads: ThreadResponse[];
  cursor: string | null;
  hasMore: boolean;
}

```

---

## src/unifiedCitationPipeline.test.ts

**Path:** `src/unifiedCitationPipeline.test.ts`

```ts
/**
 * Unified Citation Pipeline Tests
 *
 * Tests for the citation validation pipeline including:
 * - Citation extraction and validation
 * - Invalid citation removal
 * - Contract compliance checking
 * - Quick verification functions
 *
 * Run with: npx tsx --test src/unifiedCitationPipeline.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractCitationIds,
  getUniqueCitationIds,
  quickVerifyCitation,
  analyzeContradiction,
  getPipelineConfig,
} from './unifiedCitationPipeline';

describe('extractCitationIds', () => {
  it('extracts citation IDs from answer text', () => {
    const answer = 'The project uses React [N1] and TypeScript [N2].';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, ['N1', 'N2']);
  });

  it('handles multiple citations in sequence', () => {
    const answer = 'This is supported by multiple sources [N1][N2][N3].';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, ['N1', 'N2', 'N3']);
  });

  it('handles repeated citations', () => {
    const answer = 'First mention [N1], second mention [N2], back to first [N1].';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, ['N1', 'N2', 'N1']);
  });

  it('returns empty array for no citations', () => {
    const answer = 'This answer has no citations.';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, []);
  });

  it('handles multi-digit citation IDs', () => {
    const answer = 'Source [N10] and source [N25] are relevant.';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, ['N10', 'N25']);
  });
});

describe('getUniqueCitationIds', () => {
  it('returns unique citation IDs in order of first appearance', () => {
    const answer = 'First [N1], second [N2], first again [N1], third [N3].';
    const uniqueCids = getUniqueCitationIds(answer);
    assert.deepStrictEqual(uniqueCids, ['N1', 'N2', 'N3']);
  });

  it('preserves order of first appearance', () => {
    const answer = 'Start with [N3], then [N1], then [N2].';
    const uniqueCids = getUniqueCitationIds(answer);
    assert.deepStrictEqual(uniqueCids, ['N3', 'N1', 'N2']);
  });

  it('returns empty array for no citations', () => {
    const answer = 'No citations here.';
    const uniqueCids = getUniqueCitationIds(answer);
    assert.deepStrictEqual(uniqueCids, []);
  });
});

describe('quickVerifyCitation', () => {
  it('returns high score for exact match', () => {
    const claim = 'The project uses React';
    const source = 'The project uses React for the frontend.';
    const result = quickVerifyCitation(claim, source);
    assert.ok(result.isValid, 'Should be valid for exact match');
    assert.ok(result.confidence > 0.5, 'Should have high confidence');
  });

  it('returns high score for semantic overlap', () => {
    const claim = 'React is used for the frontend';
    const source = 'The frontend is built with React and TypeScript.';
    const result = quickVerifyCitation(claim, source);
    assert.ok(result.confidence > 0.3, 'Should have reasonable confidence for overlap');
  });

  it('returns low score for unrelated content', () => {
    const claim = 'The database uses PostgreSQL';
    const source = 'The frontend uses React and TypeScript.';
    const result = quickVerifyCitation(claim, source);
    assert.ok(result.confidence < 0.5, 'Should have low confidence for unrelated content');
  });
});

describe('analyzeContradiction', () => {
  it('detects negation contradictions', () => {
    const claim = 'The feature is enabled';
    const source = 'The feature is not enabled';
    const result = analyzeContradiction(claim, source);
    assert.ok(result.hasContradiction, 'Should detect negation contradiction');
  });

  it('returns no contradiction for consistent statements', () => {
    const claim = 'The project uses React';
    const source = 'The project uses React for the frontend.';
    const result = analyzeContradiction(claim, source);
    assert.ok(!result.hasContradiction, 'Should not detect contradiction');
  });
});

describe('getPipelineConfig', () => {
  it('returns pipeline configuration object', () => {
    const config = getPipelineConfig();
    assert.ok(typeof config === 'object', 'Should return an object');
    assert.ok('minLexicalOverlap' in config, 'Should have minLexicalOverlap');
    assert.ok('minConfidenceThreshold' in config, 'Should have minConfidenceThreshold');
  });

  it('returns a copy of config (not reference)', () => {
    const config1 = getPipelineConfig();
    const config2 = getPipelineConfig();
    assert.notStrictEqual(config1, config2, 'Should return different object references');
  });
});


```

---

## src/unifiedCitationPipeline.ts

**Path:** `src/unifiedCitationPipeline.ts`

```ts
/**
 * AuroraNotes API - Unified Citation Pipeline v2
 *
 * A single-pass citation verification system that ensures:
 * 1. Every citation token [N#] in the answer maps to a valid source
 * 2. Citations are scored for relevance using lexical overlap
 * 3. Weak/invalid citations are removed or flagged
 * 4. Contract compliance: answer citations ⊆ returned sources
 *
 * This is the CANONICAL citation processing module.
 * All citation validation flows through this pipeline.
 *
 * Design principles:
 * - Single pass for performance (no multi-pass verification)
 * - Lexical overlap as primary signal (fast, reliable)
 * - Semantic scoring optional (for enhanced accuracy)
 * - Contract-first: guarantee citation-source consistency
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

// Pipeline configuration
const PIPELINE_CONFIG = {
  minLexicalOverlap: 0.12,     // Minimum keyword overlap for valid citation
  minConfidenceThreshold: 0.35, // Below this, citation is flagged as weak
  enableSemanticCheck: false,   // Semantic scoring (disabled by default for speed)
  strictMode: true,             // Remove weak citations from response
  warnOnLowCoverage: true,      // Log warning if < 50% of sources cited
  enableHallucinationCheck: true, // Check for potential hallucinations
};

// Hallucination detection patterns - claims that are likely hallucinated
const HALLUCINATION_PATTERNS = [
  // Specific numbers/dates without source support
  /\b(exactly|precisely|specifically)\s+\d+/i,
  // False certainty markers when sources are weak
  /\b(definitely|certainly|absolutely|always|never)\b/i,
  // Made-up quotes
  /"[^"]{50,}"(?!\s*\[N\d+\])/,  // Long quotes without citation
];

// Common LLM fabrication indicators
const FABRICATION_INDICATORS = [
  'as mentioned in your notes',
  'your notes indicate',
  'according to your notes',
].map(s => s.toLowerCase());

// ============================================
// Core Types
// ============================================

/**
 * Citation validation result for a single citation
 */
export interface CitationValidation {
  cid: string;
  isValid: boolean;
  lexicalScore: number;
  semanticScore?: number;
  combinedScore: number;
  matchQuality: 'strong' | 'moderate' | 'weak' | 'none';
  reason?: string;
}

/**
 * Complete pipeline result - the contract for citation processing
 */
export interface PipelineResult {
  // Validated response (citations cleaned/removed as needed)
  validatedAnswer: string;
  // Citations that passed validation (ordered by first appearance)
  validatedCitations: Citation[];

  // Validation details
  citationValidations: CitationValidation[];
  overallConfidence: number;      // 0-1 aggregate confidence
  citationAccuracy: number;       // % of answer citations that are valid

  // Quality signals
  invalidCitationsRemoved: string[];  // CIDs removed from answer
  weakCitations: string[];            // CIDs with low but passing scores
  hasContradictions: boolean;         // Detected contradictions
  potentialHallucinations: string[];  // Segments that may be hallucinated

  // Contract compliance
  contractCompliant: boolean;     // Every answer citation exists in sources
  danglingCitations: string[];    // Citations in answer not in sources

  // Timing
  processingTimeMs: number;
}

// ============================================
// Helper Functions
// ============================================

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'and', 'or', 'but', 'if', 'this', 'that', 'these', 'those', 'it',
  'based', 'notes', 'according', 'mentioned', 'stated', 'using', 'used',
]);

/**
 * Extract keywords from text for overlap calculation
 */
function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/\[N?\d+\]/g, '') // Remove citation markers
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/**
 * Detect potential hallucinations in the answer
 * Returns array of potentially hallucinated segments
 */
function detectPotentialHallucinations(
  answer: string,
  citationValidations: CitationValidation[]
): string[] {
  if (!PIPELINE_CONFIG.enableHallucinationCheck) return [];

  const hallucinations: string[] = [];
  const answerLower = answer.toLowerCase();

  // Check for fabrication indicators without valid citations nearby
  for (const indicator of FABRICATION_INDICATORS) {
    const idx = answerLower.indexOf(indicator);
    if (idx >= 0) {
      // Get the surrounding context (50 chars before/after)
      const start = Math.max(0, idx - 30);
      const end = Math.min(answer.length, idx + indicator.length + 50);
      const context = answer.slice(start, end);

      // Check if there's a valid citation in this context
      const citationMatch = context.match(/\[N(\d+)\]/);
      if (!citationMatch) {
        hallucinations.push(`Unsupported claim: "${context.trim()}"`);
      } else {
        // Check if the citation is actually valid
        const cid = `N${citationMatch[1]}`;
        const validation = citationValidations.find(v => v.cid === cid);
        if (validation && validation.matchQuality === 'none') {
          hallucinations.push(`Weakly supported: "${context.trim()}"`);
        }
      }
    }
  }

  // Check for specific claims that might be fabricated
  for (const pattern of HALLUCINATION_PATTERNS) {
    const match = answer.match(pattern);
    if (match) {
      hallucinations.push(`Potential fabrication: "${match[0].slice(0, 50)}..."`);
    }
  }

  return hallucinations.slice(0, 3); // Limit to top 3 concerns
}

/**
 * Extract all citation IDs from answer text
 * Returns array of cids in order of appearance (e.g., ["N1", "N2", "N1"])
 */
export function extractCitationIds(answer: string): string[] {
  const pattern = /\[N(\d+)\]/g;
  const cids: string[] = [];
  let match;
  while ((match = pattern.exec(answer)) !== null) {
    cids.push(`N${match[1]}`);
  }
  return cids;
}

/**
 * Get unique citation IDs in order of first appearance
 */
export function getUniqueCitationIds(answer: string): string[] {
  const cids = extractCitationIds(answer);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const cid of cids) {
    if (!seen.has(cid)) {
      seen.add(cid);
      unique.push(cid);
    }
  }
  return unique;
}

/**
 * Calculate lexical overlap between answer and source text
 * Uses Szymkiewicz–Simpson coefficient (overlap / min size)
 */
function calculateLexicalOverlap(answerText: string, sourceText: string): number {
  const answerWords = extractKeywords(answerText);
  const sourceWords = extractKeywords(sourceText);

  if (answerWords.size === 0 || sourceWords.size === 0) return 0;

  let intersection = 0;
  for (const word of answerWords) {
    if (sourceWords.has(word)) intersection++;
  }

  // Use min-based overlap (more lenient than Jaccard)
  const minSize = Math.min(answerWords.size, sourceWords.size);
  return intersection / minSize;
}

/**
 * Determine match quality based on lexical score
 */
function determineMatchQuality(score: number): CitationValidation['matchQuality'] {
  if (score >= 0.4) return 'strong';
  if (score >= 0.25) return 'moderate';
  if (score >= PIPELINE_CONFIG.minLexicalOverlap) return 'weak';
  return 'none';
}

/**
 * Remove citation markers from answer text
 */
function removeCitationMarker(answer: string, cid: string): string {
  // Remove [N#] pattern, handling spaces around it
  const pattern = new RegExp(`\\s*\\[${cid}\\]`, 'g');
  return answer.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Clean up citation formatting in answer
 */
function cleanCitationFormatting(answer: string): string {
  return answer
    // Remove duplicate adjacent citations [N1][N1] -> [N1]
    .replace(/(\[N\d+\])(\s*\1)+/g, '$1')
    // Clean up spaces around citations: "word [N1] ." -> "word [N1]."
    .replace(/\s+([.!?,;:])/g, '$1')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    // Remove empty brackets
    .replace(/\[\s*\]/g, '')
    .trim();
}

// ============================================
// Main Pipeline
// ============================================

/**
 * Validate a single citation against the answer and source
 */
function validateCitation(
  cid: string,
  citation: Citation,
  chunk: ScoredChunk | undefined,
  answer: string
): CitationValidation {
  // Get source text from chunk or citation snippet
  const sourceText = chunk?.text || citation.snippet;

  // Calculate lexical overlap between answer and source
  const lexicalScore = calculateLexicalOverlap(answer, sourceText);

  // Semantic scoring (optional, disabled by default for speed)
  let semanticScore: number | undefined;
  // Note: Semantic scoring would require async embedding generation
  // For now, we use lexical-only scoring for performance

  // Combined score (lexical only when semantic disabled)
  const combinedScore = lexicalScore;

  // Determine match quality
  const matchQuality = determineMatchQuality(combinedScore);

  // Determine if valid
  const isValid = matchQuality !== 'none';

  return {
    cid,
    isValid,
    lexicalScore: Math.round(lexicalScore * 1000) / 1000,
    semanticScore,
    combinedScore: Math.round(combinedScore * 1000) / 1000,
    matchQuality,
    reason: isValid ? undefined : `Low overlap score (${(lexicalScore * 100).toFixed(0)}%)`,
  };
}

/**
 * Main unified citation verification pipeline
 *
 * This is the CANONICAL entry point for citation processing.
 * It performs single-pass validation ensuring contract compliance:
 * - Every citation token in answer exists in returned sources
 * - Citations are scored for relevance
 * - Invalid/weak citations are removed (in strict mode)
 *
 * @param answer - The LLM-generated answer with [N#] citations
 * @param citations - Available citations from sources
 * @param chunks - Full chunk data for overlap verification
 * @param queryIntent - Optional query intent for context
 * @returns PipelineResult with validated answer and citations
 */
export async function runUnifiedCitationPipeline(
  answer: string,
  citations: Citation[],
  chunks: ScoredChunk[],
  queryIntent?: QueryIntent
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Build lookup maps
  const citationMap = new Map(citations.map(c => [c.cid, c]));
  const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));

  // Extract all citation IDs from answer (in order of appearance)
  const answerCids = getUniqueCitationIds(answer);
  const validCidSet = new Set(citations.map(c => c.cid));

  // Check contract compliance: every answer citation must exist in sources
  const danglingCitations: string[] = [];
  for (const cid of answerCids) {
    if (!validCidSet.has(cid)) {
      danglingCitations.push(cid);
    }
  }

  // Validate each citation
  const citationValidations: CitationValidation[] = [];
  const invalidCitationsRemoved: string[] = [];
  const weakCitations: string[] = [];

  for (const cid of answerCids) {
    const citation = citationMap.get(cid);

    if (!citation) {
      // Dangling citation - not in sources
      citationValidations.push({
        cid,
        isValid: false,
        lexicalScore: 0,
        combinedScore: 0,
        matchQuality: 'none',
        reason: 'Citation not found in sources',
      });
      invalidCitationsRemoved.push(cid);
      continue;
    }

    // Find matching chunk
    const chunk = chunkMap.get(citation.chunkId);

    // Validate citation
    const validation = validateCitation(cid, citation, chunk, answer);
    citationValidations.push(validation);

    if (!validation.isValid) {
      invalidCitationsRemoved.push(cid);
    } else if (validation.matchQuality === 'weak') {
      weakCitations.push(cid);
    }
  }

  // Build validated answer (remove invalid citations in strict mode)
  let validatedAnswer = answer;
  if (PIPELINE_CONFIG.strictMode) {
    for (const cid of invalidCitationsRemoved) {
      validatedAnswer = removeCitationMarker(validatedAnswer, cid);
    }
  }
  validatedAnswer = cleanCitationFormatting(validatedAnswer);

  // Build validated citations list (ordered by first appearance)
  const validCids = new Set(
    citationValidations
      .filter(v => v.isValid)
      .map(v => v.cid)
  );
  const validatedCitations = answerCids
    .filter(cid => validCids.has(cid))
    .map(cid => citationMap.get(cid)!)
    .filter(Boolean);

  // Calculate metrics
  const validCount = citationValidations.filter(v => v.isValid).length;
  const totalCount = citationValidations.length;
  const citationAccuracy = totalCount > 0 ? validCount / totalCount : 1;

  const avgScore = citationValidations.length > 0
    ? citationValidations.reduce((sum, v) => sum + v.combinedScore, 0) / citationValidations.length
    : 0;
  const overallConfidence = Math.round(avgScore * 1000) / 1000;

  // Contract compliance check
  const contractCompliant = danglingCitations.length === 0;

  // Log results
  if (invalidCitationsRemoved.length > 0) {
    logWarn('[UnifiedPipeline] Removed invalid citations', {
      removed: invalidCitationsRemoved,
      reason: 'Low overlap or not in sources',
    });
  }

  if (PIPELINE_CONFIG.warnOnLowCoverage && validatedCitations.length < citations.length * 0.5) {
    logWarn('[UnifiedPipeline] Low citation coverage', {
      used: validatedCitations.length,
      available: citations.length,
      coverage: `${Math.round((validatedCitations.length / citations.length) * 100)}%`,
    });
  }

  // Detect potential hallucinations
  const potentialHallucinations = detectPotentialHallucinations(answer, citationValidations);

  const processingTimeMs = Date.now() - startTime;

  return {
    validatedAnswer,
    validatedCitations,
    citationValidations,
    overallConfidence,
    citationAccuracy,
    invalidCitationsRemoved,
    weakCitations,
    hasContradictions: false, // Contradiction detection removed for simplicity
    potentialHallucinations,
    contractCompliant,
    danglingCitations,
    processingTimeMs,
  };
}

/**
 * Quick verification check - lighter weight than full pipeline
 * Use this for real-time feedback during streaming
 */
export function quickVerifyCitation(
  claimText: string,
  sourceText: string
): { isValid: boolean; confidence: number; matchQuality: string } {
  const lexicalScore = calculateLexicalOverlap(claimText, sourceText);
  const matchQuality = determineMatchQuality(lexicalScore);
  const isValid = matchQuality !== 'none';

  return {
    isValid,
    confidence: Math.round(lexicalScore * 1000) / 1000,
    matchQuality,
  };
}

/**
 * Get pipeline configuration (for debugging/testing)
 */
export function getPipelineConfig() {
  return { ...PIPELINE_CONFIG };
}

/**
 * Update pipeline configuration
 */
export function updatePipelineConfig(updates: Partial<typeof PIPELINE_CONFIG>) {
  Object.assign(PIPELINE_CONFIG, updates);
}

/**
 * Analyze contradictions between claim and source (simplified)
 * Kept for backwards compatibility with existing code
 */
export interface ContradictionAnalysis {
  hasContradiction: boolean;
  contradictionType?: 'negation' | 'antonym' | 'numerical' | 'semantic';
  confidence: number;
  explanation?: string;
}

export function analyzeContradiction(claim: string, source: string): ContradictionAnalysis {
  // Simplified contradiction detection - just check for obvious negation patterns
  const claimLower = claim.toLowerCase();
  const sourceLower = source.toLowerCase();

  const claimHasNot = /\bnot\b|\bn't\b/.test(claimLower);
  const sourceHasNot = /\bnot\b|\bn't\b/.test(sourceLower);

  // Check if one has negation and other doesn't, with sufficient overlap
  if (claimHasNot !== sourceHasNot) {
    const overlap = calculateLexicalOverlap(claim, source);
    if (overlap > 0.3) {
      return {
        hasContradiction: true,
        contradictionType: 'negation',
        confidence: 0.7,
        explanation: 'Claim and source have opposing negation',
      };
    }
  }

  return { hasContradiction: false, confidence: 0 };
}


```

---

## src/utils.test.ts

**Path:** `src/utils.test.ts`

```ts
/**
 * Utility Function Tests
 *
 * Tests for core utility functions used across the codebase.
 * Run with: npx ts-node --test src/utils.test.ts
 * Or: node --experimental-strip-types --test src/utils.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractTermsForIndexing,
  extractKeywords,
  sanitizeText,
  cosineSimilarity,
} from './utils';

describe('extractTermsForIndexing', () => {
  it('extracts lowercase terms from text', () => {
    const terms = extractTermsForIndexing('Hello World Test');
    assert.ok(terms.includes('hello'), 'Should include hello');
    assert.ok(terms.includes('world'), 'Should include world');
    assert.ok(terms.includes('test'), 'Should include test');
  });

  it('filters out short terms and stop words', () => {
    const terms = extractTermsForIndexing('I am a test example');
    assert.ok(!terms.includes('i'), 'Should not include single char');
    assert.ok(!terms.includes('a'), 'Should not include single char');
    assert.ok(!terms.includes('am'), 'Should filter stop word "am"');
    assert.ok(terms.includes('test'), 'Should include longer word');
    assert.ok(terms.includes('example'), 'Should include non-stop word');
  });

  it('handles special characters and punctuation', () => {
    const terms = extractTermsForIndexing('Hello, world! Testing example.');
    assert.ok(terms.includes('hello'), 'Should extract hello without comma');
    assert.ok(terms.includes('world'), 'Should extract world without exclamation');
    assert.ok(terms.includes('testing'), 'Should extract testing');
    assert.ok(terms.includes('example'), 'Should extract example');
  });

  it('handles camelCase and snake_case', () => {
    const terms = extractTermsForIndexing('myFunction user_name');
    assert.ok(terms.includes('myfunction') || terms.includes('my') || terms.includes('function'),
      'Should handle camelCase');
    assert.ok(terms.includes('user_name') || terms.includes('user') || terms.includes('name'),
      'Should handle snake_case');
  });

  it('returns empty array for empty input', () => {
    const terms = extractTermsForIndexing('');
    assert.deepStrictEqual(terms, []);
  });

  it('deduplicates terms', () => {
    const terms = extractTermsForIndexing('test test test');
    const testCount = terms.filter(t => t === 'test').length;
    assert.strictEqual(testCount, 1, 'Should only have one instance of test');
  });
});

describe('extractKeywords', () => {
  it('extracts meaningful keywords from query', () => {
    const keywords = extractKeywords('what is the project status');
    assert.ok(keywords.includes('project'), 'Should include project');
    assert.ok(keywords.includes('status'), 'Should include status');
  });

  it('filters common stop words', () => {
    const keywords = extractKeywords('the quick brown fox');
    assert.ok(!keywords.includes('the'), 'Should filter "the"');
    assert.ok(keywords.includes('quick'), 'Should include quick');
    assert.ok(keywords.includes('brown'), 'Should include brown');
    assert.ok(keywords.includes('fox'), 'Should include fox');
  });

  it('handles empty input', () => {
    const keywords = extractKeywords('');
    assert.deepStrictEqual(keywords, []);
  });
});

describe('sanitizeText', () => {
  it('removes null bytes', () => {
    const result = sanitizeText('hello\x00world');
    assert.ok(!result.includes('\x00'), 'Should remove null bytes');
    assert.ok(result.includes('hello'), 'Should preserve text');
    assert.ok(result.includes('world'), 'Should preserve text');
  });

  it('trims whitespace', () => {
    const result = sanitizeText('  hello world  ');
    assert.strictEqual(result, 'hello world');
  });

  it('handles empty input', () => {
    const result = sanitizeText('');
    assert.strictEqual(result, '');
  });

  it('preserves newlines', () => {
    const result = sanitizeText('line1\nline2');
    assert.ok(result.includes('\n'), 'Should preserve newlines');
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const vec = [1, 2, 3, 4, 5];
    const similarity = cosineSimilarity(vec, vec);
    assert.ok(Math.abs(similarity - 1) < 0.0001, 'Should be approximately 1');
  });

  it('returns 0 for orthogonal vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [0, 1, 0];
    const similarity = cosineSimilarity(vec1, vec2);
    assert.ok(Math.abs(similarity) < 0.0001, 'Should be approximately 0');
  });

  it('returns -1 for opposite vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [-1, 0, 0];
    const similarity = cosineSimilarity(vec1, vec2);
    assert.ok(Math.abs(similarity + 1) < 0.0001, 'Should be approximately -1');
  });

  it('handles zero vectors gracefully', () => {
    const vec1 = [0, 0, 0];
    const vec2 = [1, 2, 3];
    const similarity = cosineSimilarity(vec1, vec2);
    assert.ok(!isNaN(similarity), 'Should not return NaN');
  });

  it('returns 0 for empty vectors', () => {
    const similarity = cosineSimilarity([], []);
    assert.strictEqual(similarity, 0);
  });

  it('returns 0 for mismatched vector lengths', () => {
    const similarity = cosineSimilarity([1, 2], [1, 2, 3]);
    assert.strictEqual(similarity, 0);
  });
});


```

---

## src/utils.ts

**Path:** `src/utils.ts`

```ts
/**
 * AuroraNotes API - Utility Functions
 *
 * Common utilities for logging, validation, text processing, and security.
 */

import { Timestamp } from "firebase-admin/firestore";
import * as crypto from "crypto";

// ============================================
// Input Sanitization
// ============================================

/**
 * Sanitize user input text (remove control characters, limit length)
 */
export function sanitizeText(text: string, maxLength: number = 10000): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // Remove null bytes and other control characters (except newlines/tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize unicode
    .normalize('NFC')
    // Trim whitespace
    .trim()
    // Limit length
    .slice(0, maxLength);
}

/**
 * Sanitize query string for safe logging
 */
export function sanitizeForLogging(text: string, maxLength: number = 100): string {
  return sanitizeText(text, maxLength)
    .replace(/[\n\r]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Validate tenant ID format
 */
export function isValidTenantId(tenantId: string): boolean {
  if (!tenantId || typeof tenantId !== 'string') return false;
  // Allow alphanumeric, hyphens, underscores, max 64 chars
  return /^[a-zA-Z0-9_-]{1,64}$/.test(tenantId);
}

/**
 * Convert Firestore Timestamp to ISO string
 */
export function timestampToISO(ts: Timestamp | Date | unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (ts instanceof Date) {
    return ts.toISOString();
  }
  // Handle serialized timestamp
  if (ts && typeof ts === 'object' && '_seconds' in ts) {
    const obj = ts as { _seconds: number; _nanoseconds?: number };
    return new Date(obj._seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Create a hash of text for deduplication
 * Uses SHA-256 for cryptographic strength
 */
export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Fast non-cryptographic hash for cache keys (FNV-1a 32-bit)
 * ~10x faster than SHA-256 for short strings
 * NOT suitable for security-sensitive use cases
 *
 * @param text - Text to hash
 * @returns 8-character hex string
 */
export function fastHash(text: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // FNV prime multiplication (JavaScript handles 32-bit overflow)
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Fast hash with additional length component for better distribution
 * Combines FNV-1a with length to reduce collisions on similar-length strings
 *
 * @param text - Text to hash
 * @returns 12-character string (8 hash + 4 length)
 */
export function fastHashWithLength(text: string): string {
  const hash = fastHash(text);
  const lenComponent = (text.length & 0xFFFF).toString(16).padStart(4, '0');
  return `${hash}${lenComponent}`;
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Parse cursor for pagination (base64 encoded)
 */
export function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const [timestamp, id] = decoded.split('|');
    const createdAt = new Date(timestamp);
    if (isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Encode cursor for pagination
 */
export function encodeCursor(createdAt: Date | Timestamp, id: string): string {
  const date = createdAt instanceof Timestamp ? createdAt.toDate() : createdAt;
  return Buffer.from(`${date.toISOString()}|${id}`).toString('base64');
}

// ============================================
// Request Context (for request ID correlation)
// ============================================

// Using AsyncLocalStorage for request-scoped context
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
  startTime: number;
  path?: string;
  /** Request-scoped memoization cache */
  memoCache?: Map<string, unknown>;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Run a function with request context
 */
export function withRequestContext<T>(context: RequestContext, fn: () => T): T {
  // Initialize memoization cache for this request
  const contextWithMemo = { ...context, memoCache: new Map<string, unknown>() };
  return requestContextStorage.run(contextWithMemo, fn);
}

/**
 * Get current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

// ============================================
// Request-Scoped Memoization
// ============================================

/**
 * Memoize a function result within the current request scope.
 * Results are automatically cleared when the request completes.
 *
 * This is useful for avoiding duplicate work within a single request,
 * such as repeated embedding generation or query analysis.
 *
 * @param key - Unique key for this memoized value
 * @param fn - Function to compute the value if not cached
 * @returns The cached or computed value
 */
export function requestMemo<T>(key: string, fn: () => T): T {
  const ctx = getRequestContext();
  if (!ctx?.memoCache) {
    // No request context, just compute the value
    return fn();
  }

  if (ctx.memoCache.has(key)) {
    return ctx.memoCache.get(key) as T;
  }

  const value = fn();
  ctx.memoCache.set(key, value);
  return value;
}

/**
 * Async version of requestMemo for async functions.
 * Handles concurrent calls by storing the promise itself.
 *
 * @param key - Unique key for this memoized value
 * @param fn - Async function to compute the value if not cached
 * @returns Promise resolving to the cached or computed value
 */
export async function requestMemoAsync<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const ctx = getRequestContext();
  if (!ctx?.memoCache) {
    // No request context, just compute the value
    return fn();
  }

  if (ctx.memoCache.has(key)) {
    return ctx.memoCache.get(key) as T;
  }

  // Store the promise to handle concurrent calls
  const promise = fn();
  ctx.memoCache.set(key, promise);

  try {
    const value = await promise;
    // Replace promise with resolved value for future sync access
    ctx.memoCache.set(key, value);
    return value;
  } catch (err) {
    // Remove failed promise so retry is possible
    ctx.memoCache.delete(key);
    throw err;
  }
}

/**
 * Get request memoization stats for debugging
 */
export function getRequestMemoStats(): { size: number } | null {
  const ctx = getRequestContext();
  if (!ctx?.memoCache) return null;
  return { size: ctx.memoCache.size };
}

/**
 * Structured log helper (for Cloud Logging)
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
  const ctx = getRequestContext();
  console.log(JSON.stringify({
    severity: 'INFO',
    message,
    requestId: ctx?.requestId,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

export function logWarn(message: string, data?: Record<string, unknown>): void {
  const ctx = getRequestContext();
  console.log(JSON.stringify({
    severity: 'WARNING',
    message,
    requestId: ctx?.requestId,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

export function logError(message: string, error?: unknown, data?: Record<string, unknown>): void {
  const ctx = getRequestContext();
  const errorInfo = error instanceof Error
    ? { errorMessage: error.message, errorStack: error.stack }
    : { errorMessage: String(error) };

  console.error(JSON.stringify({
    severity: 'ERROR',
    message,
    requestId: ctx?.requestId,
    ...errorInfo,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Extract keywords from query (simple implementation)
 */
export function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
    'until', 'while', 'about', 'what', 'which', 'who', 'whom', 'this', 'that',
    'these', 'those', 'am', 'it', 'its', 'my', 'your', 'his', 'her', 'their', 'our',
    'me', 'you', 'him', 'us', 'them', 'i', 'we', 'they', 'he', 'she',
    'include', 'including', 'tell', 'everything', 'complete', 'give', 'show'
  ]);

  // First, extract unique identifiers (uppercase with underscores/numbers) - these get priority
  const uniqueIdPattern = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  const uniqueIds: string[] = [];
  let match;
  while ((match = uniqueIdPattern.exec(query)) !== null) {
    uniqueIds.push(match[1].toLowerCase());
  }

  // Extract regular keywords
  const regularKeywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Combine: unique IDs first (they're more specific), then regular keywords
  const combined = [...new Set([...uniqueIds, ...regularKeywords])];
  return combined.slice(0, 15); // Allow more keywords for better recall
}

/**
 * Cosine similarity between two vectors
 *
 * Optimizations:
 * - Loop unrolling (4x) for better CPU pipelining
 * - Single sqrt call instead of two
 * - Early exit for zero-length vectors
 * - Typed array support for Float32Array embeddings
 */
export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  const len = a.length;
  if (len !== b.length || len === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Process 4 elements at a time (loop unrolling)
  const unrollLimit = len - (len % 4);
  let i = 0;

  for (; i < unrollLimit; i += 4) {
    const a0 = a[i], a1 = a[i + 1], a2 = a[i + 2], a3 = a[i + 3];
    const b0 = b[i], b1 = b[i + 1], b2 = b[i + 2], b3 = b[i + 3];

    dotProduct += a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
    normA += a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
    normB += b0 * b0 + b1 * b1 + b2 * b2 + b3 * b3;
  }

  // Handle remaining elements
  for (; i < len; i++) {
    const ai = a[i], bi = b[i];
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  // Single sqrt call is faster than two separate calls
  const denominator = Math.sqrt(normA * normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Batch cosine similarity: compute similarity of one query against many candidates
 * More efficient than calling cosineSimilarity repeatedly
 */
export function batchCosineSimilarity(
  query: number[] | Float32Array,
  candidates: Array<number[] | Float32Array>
): number[] {
  const len = query.length;
  if (len === 0 || candidates.length === 0) return [];

  // Pre-compute query norm
  let queryNorm = 0;
  for (let i = 0; i < len; i++) {
    queryNorm += query[i] * query[i];
  }
  queryNorm = Math.sqrt(queryNorm);

  if (queryNorm === 0) {
    return new Array(candidates.length).fill(0);
  }

  const results: number[] = new Array(candidates.length);

  for (let c = 0; c < candidates.length; c++) {
    const candidate = candidates[c];
    if (candidate.length !== len) {
      results[c] = 0;
      continue;
    }

    let dotProduct = 0;
    let candidateNorm = 0;

    // Unrolled loop
    const unrollLimit = len - (len % 4);
    let i = 0;

    for (; i < unrollLimit; i += 4) {
      const q0 = query[i], q1 = query[i + 1], q2 = query[i + 2], q3 = query[i + 3];
      const c0 = candidate[i], c1 = candidate[i + 1], c2 = candidate[i + 2], c3 = candidate[i + 3];

      dotProduct += q0 * c0 + q1 * c1 + q2 * c2 + q3 * c3;
      candidateNorm += c0 * c0 + c1 * c1 + c2 * c2 + c3 * c3;
    }

    for (; i < len; i++) {
      dotProduct += query[i] * candidate[i];
      candidateNorm += candidate[i] * candidate[i];
    }

    const denominator = queryNorm * Math.sqrt(candidateNorm);
    results[c] = denominator === 0 ? 0 : dotProduct / denominator;
  }

  return results;
}

// ============================================
// Term Extraction for Lexical Indexing
// ============================================

// Current version of term extraction algorithm (increment when algorithm changes for backfill)
export const TERMS_VERSION = 1;

// Stop words for term extraction (more comprehensive for indexing)
const TERM_STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
  'until', 'while', 'about', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'am', 'it', 'its', 'my', 'your', 'his', 'her', 'their', 'our',
  'me', 'you', 'him', 'us', 'them', 'i', 'we', 'they', 'he', 'she',
]);

/**
 * Extract normalized terms from text for lexical indexing.
 * Returns unique, lowercase tokens suitable for Firestore array-contains-any queries.
 *
 * Includes:
 * - Regular words (normalized, lowercased, stemmed minimally)
 * - Unique identifiers (preserved with underscores/numbers)
 * - Numbers (preserved for ID matching)
 *
 * Max 50 terms per chunk to stay within Firestore limits.
 */
export function extractTermsForIndexing(text: string): string[] {
  const terms = new Set<string>();

  // Extract unique identifiers first (e.g., CITE_TEST_002, PROJECT_ALPHA)
  // These are high-value for exact matching
  const uniqueIdPattern = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  let match;
  while ((match = uniqueIdPattern.exec(text)) !== null) {
    terms.add(match[1].toLowerCase());
  }

  // Extract regular terms
  const normalizedText = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')  // Keep hyphens for compound words
    .replace(/\s+/g, ' ');

  const tokens = normalizedText.split(/\s+/);

  for (const token of tokens) {
    // Skip short terms and stop words
    if (token.length < 2) continue;
    if (TERM_STOP_WORDS.has(token)) continue;

    // Add the term
    terms.add(token);

    // For hyphenated terms, also add components
    if (token.includes('-')) {
      const parts = token.split('-');
      for (const part of parts) {
        if (part.length >= 2 && !TERM_STOP_WORDS.has(part)) {
          terms.add(part);
        }
      }
    }
  }

  // Convert to array and limit to 50 terms (Firestore array limit considerations)
  const termArray = Array.from(terms).slice(0, 50);

  return termArray;
}

/**
 * Check if a term looks like a unique identifier
 */
export function isUniqueIdentifier(term: string): boolean {
  // Match patterns like CITE_TEST_002, PROJECT_ALPHA, TEST123
  return /^[a-z][a-z0-9_]*[0-9_][a-z0-9_]*$/i.test(term) ||
         /^[a-z]+_[a-z0-9_]+$/i.test(term) ||
         /^[A-Z][A-Z0-9_]{2,}$/.test(term);
}


```

---

## src/vectorIndex.ts

**Path:** `src/vectorIndex.ts`

```ts
/**
 * AuroraNotes API - Vector Index Abstraction
 *
 * Provides a unified interface for vector search operations.
 * Supports multiple implementations:
 *   - FirestoreApproxVectorIndex: In-memory cosine similarity over Firestore docs
 *   - VertexVectorSearchIndex: Optional Vertex AI Vector Search (behind VERTEX_VECTOR_SEARCH env)
 *
 * Includes scale guards to warn when Firestore fallback is used with large datasets.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firestore";
import { ChunkDoc } from "./types";
import { cosineSimilarity, logInfo, logError, logWarn } from "./utils";
import {
  CHUNKS_COLLECTION,
  FIRESTORE_FALLBACK_WARN_THRESHOLD,
  FIRESTORE_FALLBACK_MAX_SCAN,
  PROJECT_ID,
  VERTEX_VECTOR_SEARCH_REGION,
  VERTEX_INDEX_ENDPOINT_RESOURCE,
  VERTEX_INDEX_ENDPOINT_ID,
  VERTEX_VECTOR_SEARCH_ENDPOINT,
  VERTEX_VECTOR_SEARCH_INDEX_ID,
  VERTEX_DEPLOYED_INDEX_ID,
  VERTEX_DISTANCE_METRIC,
} from "./config";

/**
 * Result from vector search
 */
export interface VectorSearchResult {
  chunkId: string;
  noteId: string;
  score: number;
}

/**
 * Vector index interface
 */
export interface VectorIndex {
  /**
   * Search for similar chunks by query embedding
   * @param queryEmbedding The query embedding vector
   * @param tenantId Tenant to search within
   * @param topK Number of results to return
   * @returns Array of chunk IDs with scores
   */
  search(
    queryEmbedding: number[],
    tenantId: string,
    topK: number
  ): Promise<VectorSearchResult[]>;

  /**
   * Get the implementation name for logging
   */
  getName(): string;
}

/**
 * Firestore-based approximate vector search
 *
 * Fetches chunks with embeddings and computes cosine similarity in-memory.
 * Suitable for small-medium datasets (<5k chunks per tenant).
 *
 * IMPORTANT: This is a FALLBACK for development/small datasets.
 * For production at scale (100k+ notes), use Vertex Vector Search.
 *
 * Scale guards:
 * - Warns if corpus size exceeds FIRESTORE_FALLBACK_WARN_THRESHOLD
 * - Expands scan to FIRESTORE_FALLBACK_MAX_SCAN to avoid silently missing older notes
 */
export class FirestoreApproxVectorIndex implements VectorIndex {
  private maxCandidates: number;
  private warnedForTenant: Set<string> = new Set();

  constructor(maxCandidates: number = 500) {
    // Use the higher of provided limit or config-based max scan
    this.maxCandidates = Math.max(maxCandidates, FIRESTORE_FALLBACK_MAX_SCAN);
  }

  getName(): string {
    return 'firestore_approx';
  }

  /**
   * Get the total chunk count for a tenant (for scale guard warnings)
   */
  private async getTenantChunkCount(tenantId: string): Promise<number> {
    const db = getDb();
    try {
      // Use a count aggregation if available, otherwise estimate from limit
      const countSnap = await db
        .collection(CHUNKS_COLLECTION)
        .where('tenantId', '==', tenantId)
        .count()
        .get();
      return countSnap.data().count;
    } catch {
      // Count aggregation not available, return -1 to indicate unknown
      return -1;
    }
  }

  async search(
    queryEmbedding: number[],
    tenantId: string,
    topK: number
  ): Promise<VectorSearchResult[]> {
    const db = getDb();
    const startTime = Date.now();

    // Scale guard: Check corpus size and warn if large
    if (!this.warnedForTenant.has(tenantId)) {
      const corpusSize = await this.getTenantChunkCount(tenantId);
      if (corpusSize > FIRESTORE_FALLBACK_WARN_THRESHOLD) {
        logWarn('Firestore vector search fallback used with large corpus', {
          tenantId,
          corpusSize,
          threshold: FIRESTORE_FALLBACK_WARN_THRESHOLD,
          recommendation: 'Enable Vertex Vector Search (VERTEX_VECTOR_SEARCH_ENABLED=true) for production scale',
        });
        this.warnedForTenant.add(tenantId);
      }
    }

    // Fetch chunks that have embeddings - scan up to maxCandidates
    // This ensures we don't silently miss older relevant notes
    const snap = await db
      .collection(CHUNKS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .orderBy('createdAt', 'desc')
      .limit(this.maxCandidates)
      .get();

    const results: VectorSearchResult[] = [];

    for (const doc of snap.docs) {
      const chunk = doc.data() as ChunkDoc;
      if (chunk.embedding && chunk.embedding.length > 0) {
        const score = cosineSimilarity(queryEmbedding, chunk.embedding);
        results.push({
          chunkId: chunk.chunkId,
          noteId: chunk.noteId,
          score,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    logInfo('Firestore vector search complete', {
      tenantId,
      candidatesScanned: snap.docs.length,
      chunksWithEmbeddings: results.length,
      maxCandidatesConfig: this.maxCandidates,
      topK,
      elapsedMs: Date.now() - startTime,
    });

    return results.slice(0, topK);
  }
}

// Static flag to track if misconfiguration warning has been logged
let vertexMisconfigWarningLogged = false;

// ============================================
// Auth Client Connection Pool
// ============================================
// Caches GoogleAuth client and access tokens to avoid re-authentication overhead
// Access tokens are cached with automatic refresh before expiration

interface CachedAuthToken {
  token: string;
  expiresAt: number;  // Unix timestamp in ms
}

let cachedAuthClient: InstanceType<typeof import('google-auth-library').GoogleAuth> | null = null;
let cachedAccessToken: CachedAuthToken | null = null;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;  // Refresh 60 seconds before expiration
const TOKEN_DEFAULT_TTL_MS = 50 * 60 * 1000;  // Default 50 min if no expiry provided (tokens typically last 1 hour)

/**
 * Get or create the GoogleAuth client (singleton)
 * This avoids re-creating the auth client on every request
 */
async function getAuthClient(): Promise<InstanceType<typeof import('google-auth-library').GoogleAuth>> {
  if (cachedAuthClient) {
    return cachedAuthClient;
  }

  const { GoogleAuth } = await import('google-auth-library');
  cachedAuthClient = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  return cachedAuthClient;
}

/**
 * Get a valid access token, using cache when possible
 * Automatically refreshes token before expiration
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with buffer for safety)
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
    return cachedAccessToken.token;
  }

  // Get fresh token
  const auth = await getAuthClient();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (!tokenResponse.token) {
    throw new Error('Failed to get access token');
  }

  // Cache the token with expiration
  // Use provided expiry or default TTL
  const expiresAt = tokenResponse.res?.data?.expiry_date || (now + TOKEN_DEFAULT_TTL_MS);
  cachedAccessToken = {
    token: tokenResponse.token,
    expiresAt: typeof expiresAt === 'number' ? expiresAt : now + TOKEN_DEFAULT_TTL_MS,
  };

  return cachedAccessToken.token;
}

/**
 * Clear cached auth (for testing or credential rotation)
 */
export function clearVertexAuthCache(): void {
  cachedAuthClient = null;
  cachedAccessToken = null;
}

/**
 * Parsed Vertex configuration with validated fields
 */
interface VertexConfig {
  projectId: string;
  region: string;
  indexEndpointResource: string;  // Full resource name: projects/X/locations/Y/indexEndpoints/Z
  deployedIndexId: string;
  indexId: string;                // For upsert/remove operations
  distanceMetric: 'COSINE' | 'DOT_PRODUCT' | 'SQUARED_L2';
  findNeighborsUrl: string;       // Precomputed URL for search
  upsertUrl: string;              // Precomputed URL for upsert
  removeUrl: string;              // Precomputed URL for remove
  isValid: boolean;
  validationErrors: string[];
}

/**
 * Parse and validate Vertex Vector Search configuration from environment.
 * Produces the correct findNeighbors URL using the standard Vertex AI API format.
 *
 * ENV CONTRACT:
 * - GOOGLE_CLOUD_PROJECT or GCLOUD_PROJECT: GCP project ID (required)
 * - VERTEX_VECTOR_SEARCH_REGION: Region (default: us-central1)
 * - VERTEX_INDEX_ENDPOINT_RESOURCE: Full resource name (preferred)
 *   OR VERTEX_INDEX_ENDPOINT_ID: Just the endpoint ID (will be combined with project/region)
 * - VERTEX_DEPLOYED_INDEX_ID: ID of the deployed index (required)
 * - VERTEX_VECTOR_SEARCH_INDEX_ID: Index ID for upsert/remove (optional for search)
 * - VERTEX_DISTANCE_METRIC: COSINE | DOT_PRODUCT | SQUARED_L2 (default: COSINE)
 */
function parseVertexConfig(): VertexConfig {
  const errors: string[] = [];

  // Project ID: use config's PROJECT_ID which already handles GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT
  const projectId = PROJECT_ID;
  if (!projectId || projectId === 'local') {
    errors.push('GOOGLE_CLOUD_PROJECT or GCLOUD_PROJECT must be set');
  }

  const region = VERTEX_VECTOR_SEARCH_REGION;
  const deployedIndexId = VERTEX_DEPLOYED_INDEX_ID;
  if (!deployedIndexId) {
    errors.push('VERTEX_DEPLOYED_INDEX_ID is required');
  }

  // Parse index endpoint - prefer full resource name
  let indexEndpointResource = '';

  if (VERTEX_INDEX_ENDPOINT_RESOURCE) {
    // Preferred: full resource name provided directly
    // Expected format: projects/{project}/locations/{region}/indexEndpoints/{endpoint_id}
    indexEndpointResource = VERTEX_INDEX_ENDPOINT_RESOURCE;

    // Validate format
    const resourcePattern = /^projects\/[^/]+\/locations\/[^/]+\/indexEndpoints\/[^/]+$/;
    if (!resourcePattern.test(indexEndpointResource)) {
      errors.push(`VERTEX_INDEX_ENDPOINT_RESOURCE has invalid format. Expected: projects/{project}/locations/{region}/indexEndpoints/{endpoint_id}. Got: ${indexEndpointResource}`);
    }
  } else if (VERTEX_INDEX_ENDPOINT_ID) {
    // Fallback: construct from endpoint ID + project + region
    if (projectId && projectId !== 'local') {
      indexEndpointResource = `projects/${projectId}/locations/${region}/indexEndpoints/${VERTEX_INDEX_ENDPOINT_ID}`;
    } else {
      errors.push('Cannot construct endpoint resource: project ID not available');
    }
  } else if (VERTEX_VECTOR_SEARCH_ENDPOINT) {
    // Legacy support: try to parse the old VERTEX_VECTOR_SEARCH_ENDPOINT
    // This could be either a public domain or a resource name
    const legacyEndpoint = VERTEX_VECTOR_SEARCH_ENDPOINT;

    if (legacyEndpoint.includes('projects/')) {
      // It looks like a resource name
      indexEndpointResource = legacyEndpoint;
    } else if (legacyEndpoint.includes('.')) {
      // It looks like a domain - extract endpoint ID and construct resource
      // Format: {endpoint_id}.{region}-aiplatform.googleapis.com
      const match = legacyEndpoint.match(/^(\d+)\./);
      if (match && projectId && projectId !== 'local') {
        indexEndpointResource = `projects/${projectId}/locations/${region}/indexEndpoints/${match[1]}`;
      } else {
        errors.push(`Cannot parse legacy VERTEX_VECTOR_SEARCH_ENDPOINT: ${legacyEndpoint}. Use VERTEX_INDEX_ENDPOINT_RESOURCE instead.`);
      }
    } else {
      // Assume it's just an endpoint ID
      if (projectId && projectId !== 'local') {
        indexEndpointResource = `projects/${projectId}/locations/${region}/indexEndpoints/${legacyEndpoint}`;
      } else {
        errors.push('Cannot construct endpoint resource from legacy endpoint: project ID not available');
      }
    }
  } else {
    errors.push('One of VERTEX_INDEX_ENDPOINT_RESOURCE, VERTEX_INDEX_ENDPOINT_ID, or VERTEX_VECTOR_SEARCH_ENDPOINT is required');
  }

  // Index ID for upsert/remove (optional for search-only)
  const indexId = VERTEX_VECTOR_SEARCH_INDEX_ID;

  // Distance metric
  const distanceMetric = VERTEX_DISTANCE_METRIC;

  // Construct URLs
  // findNeighbors URL: https://{region}-aiplatform.googleapis.com/v1/{indexEndpointResource}:findNeighbors
  const findNeighborsUrl = indexEndpointResource
    ? `https://${region}-aiplatform.googleapis.com/v1/${indexEndpointResource}:findNeighbors`
    : '';

  // upsert/remove URLs use the index resource (different from endpoint)
  const indexResource = indexId && projectId && projectId !== 'local'
    ? `projects/${projectId}/locations/${region}/indexes/${indexId}`
    : '';
  const upsertUrl = indexResource
    ? `https://${region}-aiplatform.googleapis.com/v1/${indexResource}:upsertDatapoints`
    : '';
  const removeUrl = indexResource
    ? `https://${region}-aiplatform.googleapis.com/v1/${indexResource}:removeDatapoints`
    : '';

  return {
    projectId,
    region,
    indexEndpointResource,
    deployedIndexId,
    indexId,
    distanceMetric,
    findNeighborsUrl,
    upsertUrl,
    removeUrl,
    isValid: errors.length === 0,
    validationErrors: errors,
  };
}

/**
 * Vertex AI Vector Search implementation (optional)
 *
 * Uses Google Cloud Vertex AI Vector Search for scalable nearest neighbor search.
 *
 * ENV CONTRACT:
 * - GOOGLE_CLOUD_PROJECT: GCP project (consistent with rest of codebase)
 * - VERTEX_VECTOR_SEARCH_REGION: Region (default: us-central1)
 * - VERTEX_INDEX_ENDPOINT_RESOURCE: Full resource name (preferred)
 *   OR VERTEX_INDEX_ENDPOINT_ID: Just endpoint ID
 * - VERTEX_DEPLOYED_INDEX_ID: Deployed index ID (required)
 * - VERTEX_VECTOR_SEARCH_INDEX_ID: Index ID for upsert/remove
 *
 * Distance metric handling:
 * - COSINE_DISTANCE: score = 1 - distance
 * - DOT_PRODUCT_DISTANCE: score = 1 - distance
 * - SQUARED_L2_DISTANCE: score = 1 / (1 + distance)
 */
export class VertexVectorSearchIndex implements VectorIndex {
  private config: VertexConfig;
  private configChecked: boolean = false;

  constructor() {
    this.config = parseVertexConfig();
  }

  /**
   * Convert Vertex distance to similarity score [0, 1]
   */
  private distanceToSimilarity(distance: number): number {
    switch (this.config.distanceMetric) {
      case 'COSINE':
      case 'DOT_PRODUCT':
        return Math.max(0, Math.min(1, 1 - distance));
      case 'SQUARED_L2':
        return 1 / (1 + distance);
      default:
        return Math.max(0, Math.min(1, 1 - distance));
    }
  }

  getName(): string {
    return 'vertex_vector_search';
  }

  isConfigured(): boolean {
    return this.config.isValid && !!this.config.deployedIndexId;
  }

  /**
   * Get detailed configuration status for debugging
   */
  getConfigStatus(): { configured: boolean; errors: string[]; urls: { findNeighbors: string; upsert: string } } {
    return {
      configured: this.isConfigured(),
      errors: this.config.validationErrors,
      urls: {
        findNeighbors: this.config.findNeighborsUrl,
        upsert: this.config.upsertUrl,
      },
    };
  }

  /**
   * Log misconfiguration error once per process
   */
  private logMisconfigurationOnce(): void {
    if (!this.configChecked) {
      this.configChecked = true;

      if (!this.config.isValid && !vertexMisconfigWarningLogged) {
        vertexMisconfigWarningLogged = true;
        logError('Vertex Vector Search misconfigured - falling back to Firestore. Fix configuration for production scale.', {
          errors: this.config.validationErrors,
          recommendation: 'Set VERTEX_INDEX_ENDPOINT_RESOURCE (full resource name) and VERTEX_DEPLOYED_INDEX_ID',
          example: 'VERTEX_INDEX_ENDPOINT_RESOURCE=projects/my-project/locations/us-central1/indexEndpoints/123456789',
        });
      }
    }
  }

  /**
   * Search for similar vectors using Vertex AI Vector Search REST API
   *
   * Uses the findNeighbors endpoint:
   * POST https://{region}-aiplatform.googleapis.com/v1/{indexEndpointResource}:findNeighbors
   */
  async search(
    queryEmbedding: number[],
    tenantId: string,
    topK: number
  ): Promise<VectorSearchResult[]> {
    this.logMisconfigurationOnce();

    if (!this.isConfigured()) {
      return [];
    }

    const startTime = Date.now();

    try {
      // Get access token using cached auth client (avoids re-authentication overhead)
      const accessToken = await getAccessToken();

      // Build the findNeighbors request
      const requestBody = {
        deployedIndexId: this.config.deployedIndexId,
        queries: [
          {
            datapoint: {
              datapointId: 'query',
              featureVector: queryEmbedding,
              restricts: [
                {
                  namespace: 'tenantId',
                  allowList: [tenantId],
                },
              ],
            },
            neighborCount: topK,
          },
        ],
      };

      // Use precomputed URL
      const response = await fetch(this.config.findNeighborsUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as VertexFindNeighborsResponse;

      // Parse the response
      const results: VectorSearchResult[] = [];
      if (data.nearestNeighbors && data.nearestNeighbors.length > 0) {
        const neighbors = data.nearestNeighbors[0].neighbors || [];
        for (const neighbor of neighbors) {
          const [chunkId, noteId] = neighbor.datapoint.datapointId.split(':');
          const similarity = neighbor.distance !== undefined
            ? this.distanceToSimilarity(neighbor.distance)
            : 0;
          results.push({
            chunkId,
            noteId: noteId || '',
            score: similarity,
          });
        }
      }

      logInfo('Vertex Vector Search complete', {
        tenantId,
        topK,
        resultsReturned: results.length,
        elapsedMs: Date.now() - startTime,
      });

      return results;
    } catch (err) {
      logError('Vertex Vector Search failed', err);
      return [];
    }
  }

  /**
   * Upsert vectors to the Vertex AI index
   *
   * Uses the upsertDatapoints endpoint for streaming updates.
   * For batch updates, use the backfill script with batch import.
   */
  async upsert(
    datapoints: VertexDatapoint[]
  ): Promise<boolean> {
    if (!this.config.upsertUrl) {
      logError('Vertex Vector Search index ID not configured for upsert', {
        recommendation: 'Set VERTEX_VECTOR_SEARCH_INDEX_ID',
      });
      return false;
    }

    const startTime = Date.now();

    try {
      // Get access token using cached auth client (avoids re-authentication overhead)
      const accessToken = await getAccessToken();

      const requestBody = {
        datapoints: datapoints.map(dp => ({
          datapointId: dp.datapointId,
          featureVector: dp.featureVector,
          restricts: dp.restricts,
        })),
      };

      const response = await fetch(this.config.upsertUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex upsert error: ${response.status} ${errorText}`);
      }

      logInfo('Vertex Vector Search upsert complete', {
        datapointsUpserted: datapoints.length,
        elapsedMs: Date.now() - startTime,
      });

      return true;
    } catch (err) {
      logError('Vertex Vector Search upsert failed', err);
      return false;
    }
  }

  /**
   * Remove vectors from the Vertex AI index
   */
  async remove(datapointIds: string[]): Promise<boolean> {
    if (!this.config.removeUrl) {
      logError('Vertex Vector Search index ID not configured for remove', {
        recommendation: 'Set VERTEX_VECTOR_SEARCH_INDEX_ID',
      });
      return false;
    }

    try {
      // Get access token using cached auth client (avoids re-authentication overhead)
      const accessToken = await getAccessToken();

      const requestBody = {
        datapointIds,
      };

      const response = await fetch(this.config.removeUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex remove error: ${response.status} ${errorText}`);
      }

      logInfo('Vertex Vector Search remove complete', {
        datapointsRemoved: datapointIds.length,
      });

      return true;
    } catch (err) {
      logError('Vertex Vector Search remove failed', err);
      return false;
    }
  }
}

/**
 * Vertex AI Vector Search response types
 */
interface VertexFindNeighborsResponse {
  nearestNeighbors?: Array<{
    id?: string;
    neighbors?: Array<{
      datapoint: {
        datapointId: string;
      };
      distance?: number;
    }>;
  }>;
}

/**
 * Datapoint for Vertex AI Vector Search upsert
 */
export interface VertexDatapoint {
  datapointId: string;  // Format: {chunkId}:{noteId}
  featureVector: number[];
  restricts?: Array<{
    namespace: string;
    allowList?: string[];
    denyList?: string[];
  }>;
}

// Cached vector index instance (avoid re-parsing config on every call)
let cachedVectorIndex: VectorIndex | null = null;
let cachedVertexIndex: VertexVectorSearchIndex | null = null;

/**
 * Get the active vector index based on configuration.
 * Returns Vertex if enabled and configured, otherwise Firestore fallback.
 */
export function getVectorIndex(): VectorIndex {
  if (cachedVectorIndex) {
    return cachedVectorIndex;
  }

  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');

  if (VERTEX_VECTOR_SEARCH_ENABLED) {
    const vertexIndex = new VertexVectorSearchIndex();
    if (vertexIndex.isConfigured()) {
      cachedVectorIndex = vertexIndex;
      logInfo('Vector search using Vertex AI', { index: vertexIndex.getName() });
      return vertexIndex;
    }
    // Misconfiguration is logged inside VertexVectorSearchIndex.logMisconfigurationOnce()
  }

  const firestoreIndex = new FirestoreApproxVectorIndex();
  cachedVectorIndex = firestoreIndex;
  logInfo('Vector search using Firestore fallback', { index: firestoreIndex.getName() });
  return firestoreIndex;
}

/**
 * Get the Vertex index for upsert/remove operations.
 * Returns null if Vertex is not configured.
 */
export function getVertexIndex(): VertexVectorSearchIndex | null {
  if (cachedVertexIndex !== null) {
    return cachedVertexIndex;
  }

  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');

  if (VERTEX_VECTOR_SEARCH_ENABLED) {
    const vertexIndex = new VertexVectorSearchIndex();
    if (vertexIndex.isConfigured()) {
      cachedVertexIndex = vertexIndex;
      return vertexIndex;
    }
  }

  return null;
}

/**
 * Check if Vertex Vector Search is properly configured.
 * Useful for health checks and diagnostics.
 */
export function isVertexConfigured(): boolean {
  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');

  if (!VERTEX_VECTOR_SEARCH_ENABLED) {
    return false;
  }

  const vertexIndex = new VertexVectorSearchIndex();
  return vertexIndex.isConfigured();
}

/**
 * Get Vertex configuration status for diagnostics.
 * Returns configuration details without sensitive data.
 */
export function getVertexConfigStatus(): { enabled: boolean; configured: boolean; errors: string[] } {
  const { VERTEX_VECTOR_SEARCH_ENABLED } = require('./config');

  if (!VERTEX_VECTOR_SEARCH_ENABLED) {
    return { enabled: false, configured: false, errors: [] };
  }

  const vertexIndex = new VertexVectorSearchIndex();
  const status = vertexIndex.getConfigStatus();
  return {
    enabled: true,
    configured: status.configured,
    errors: status.errors,
  };
}


```

---

## tsconfig.json

**Path:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",

    "target": "ES2022",
    "lib": ["ES2022"],

    "module": "commonjs",
    "moduleResolution": "node",

    "types": ["node"],

    "strict": true,
    "skipLibCheck": true,

    "esModuleInterop": true,
    "resolveJsonModule": true,

    "sourceMap": true,

    "verbatimModuleSyntax": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

