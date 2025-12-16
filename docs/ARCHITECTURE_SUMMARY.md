# AuroraNotes API - Architecture Summary

================================================================================
                              WHAT IS THIS?
================================================================================

A RAG-powered note-taking backend. Users save notes, then ask questions.
The system finds relevant notes and generates answers with citations.

    User: "Why did we choose Firestore?"
    System: "We chose Firestore for real-time sync and serverless scaling [N1][N2]"


================================================================================
                           HIGH-LEVEL ARCHITECTURE
================================================================================

    ┌─────────────────────────────────────────────────────────────────────┐
    │                         CLIENT APPS                                  │
    │                   (iOS / Web / Browser Extension)                    │
    └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                      CLOUD RUN (Express.js)                         │
    │                                                                      │
    │         POST /notes              POST /chat                          │
    │         (save notes)             (ask questions)                     │
    └─────────────────────────────────────────────────────────────────────┘
                │                              │
                ▼                              ▼
    ┌───────────────────┐          ┌─────────────────────────────────────┐
    │    FIRESTORE      │          │         RAG PIPELINE                │
    │                   │          │                                      │
    │  notes collection │◄────────►│  1. Embed query (Vertex AI)         │
    │  chunks collection│          │  2. Search vectors + keywords        │
    │                   │          │  3. Rerank results                   │
    │  (documents +     │          │  4. Generate answer (Gemini)         │
    │   embeddings)     │          │  5. Validate citations               │
    └───────────────────┘          └─────────────────────────────────────┘


================================================================================
                      KEY ARCHITECTURAL PATTERNS
================================================================================

    ┌──────────────────────────────────────────────────────────────────┐
    │                                                                   │
    │   1. RAG (Retrieval-Augmented Generation)                        │
    │      - Don't just ask the LLM - first retrieve relevant context  │
    │      - Ground answers in actual user data                         │
    │      - Enables citations back to source notes                     │
    │                                                                   │
    │   2. VECTOR EMBEDDINGS                                           │
    │      - Convert text → 768-dimensional vectors                    │
    │      - Similar meaning = similar vectors                          │
    │      - Enables semantic search ("car" finds "automobile")         │
    │                                                                   │
    │   3. HYBRID SEARCH                                               │
    │      - Vector search (semantic similarity)                        │
    │      - Keyword search (exact matches)                             │
    │      - Recency search (newer = more relevant)                    │
    │      - Combine all three for best results                         │
    │                                                                   │
    │   4. CHUNKING                                                    │
    │      - Long notes split into ~450 char pieces                    │
    │      - Each chunk gets its own embedding                          │
    │      - Enables precise retrieval of relevant sections            │
    │                                                                   │
    └──────────────────────────────────────────────────────────────────┘


================================================================================
                        WRITE PATH: SAVING A NOTE
================================================================================

    User creates note: "We chose Firestore because..."
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │  1. SAVE NOTE                                                       │
    │     Store in Firestore 'notes' collection                           │
    │     { id, text, tenantId, createdAt }                              │
    └─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │  2. CHUNK                                                           │
    │     Split into ~450 char pieces (sentence-aware)                    │
    │     Overlap 75 chars between chunks                                 │
    │                                                                      │
    │     "We chose Firestore because it offers real-time sync..."       │
    │                              │                                       │
    │              ┌───────────────┼───────────────┐                      │
    │              ▼               ▼               ▼                      │
    │         [Chunk 0]       [Chunk 1]       [Chunk 2]                  │
    └─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │  3. EMBED                                                           │
    │     Each chunk → Vertex AI text-embedding-004                      │
    │     Returns 768-dimensional vector                                  │
    │                                                                      │
    │     "We chose Firestore..." → [0.12, -0.45, 0.78, ..., 0.33]       │
    └─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │  4. INDEX                                                           │
    │     Store in 'noteChunks' collection:                              │
    │     { chunkId, text, embedding[], terms[], position }              │
    │                                                                      │
    │     terms[] = ["chose", "firestore", "realtime", "sync"]           │
    │               (for keyword search)                                  │
    └─────────────────────────────────────────────────────────────────────┘


================================================================================
                      READ PATH: ANSWERING A QUESTION
================================================================================

    User asks: "Why did we choose Firestore?"
                              │
                              ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  STAGE 1: UNDERSTAND QUERY                                          ┃
    ┃                                                                      ┃
    ┃  • Detect intent: decision question                                  ┃
    ┃  • Extract keywords: ["firestore", "chose", "why"]                  ┃
    ┃  • Embed query → [0.11, -0.42, 0.81, ...]                          ┃
    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                              │
                              ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  STAGE 2: RETRIEVE CANDIDATES (parallel)                            ┃
    ┃                                                                      ┃
    ┃  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         ┃
    ┃  │ VECTOR SEARCH  │  │ KEYWORD SEARCH │  │ RECENCY SEARCH │         ┃
    ┃  │                │  │                │  │                │         ┃
    ┃  │ Compare query  │  │ Match terms[]  │  │ Most recent    │         ┃
    ┃  │ embedding to   │  │ array against  │  │ 50 chunks      │         ┃
    ┃  │ all chunk      │  │ query keywords │  │                │         ┃
    ┃  │ embeddings     │  │                │  │                │         ┃
    ┃  │                │  │ "firestore"    │  │                │         ┃
    ┃  │ cosine         │  │ "chose"        │  │                │         ┃
    ┃  │ similarity     │  │                │  │                │         ┃
    ┃  │                │  │                │  │                │         ┃
    ┃  │ → 300 chunks   │  │ → 100 chunks   │  │ → 50 chunks    │         ┃
    ┃  └────────────────┘  └────────────────┘  └────────────────┘         ┃
    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                              │
                              ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  STAGE 3: SCORE & MERGE                                             ┃
    ┃                                                                      ┃
    ┃  Weighted scoring formula:                                          ┃
    ┃                                                                      ┃
    ┃     FINAL = (0.45 × vector) + (0.35 × keyword) + (0.12 × recency)  ┃
    ┃                                                                      ┃
    ┃  Bonuses:                                                            ┃
    ┃     +10% if chunk is from note intro/conclusion                     ┃
    ┃     +15% if chunk found by multiple search types                    ┃
    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                              │
                              ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  STAGE 4: RERANK (MMR - Maximal Marginal Relevance)                 ┃
    ┃                                                                      ┃
    ┃  Problem: Top 8 chunks might all be from same note                  ┃
    ┃  Solution: Balance relevance vs. diversity                          ┃
    ┃                                                                      ┃
    ┃     MMR = λ(relevance) - (1-λ)(similarity to already selected)     ┃
    ┃                                                                      ┃
    ┃     λ = 0.7 (favor relevance, but ensure diversity)                ┃
    ┃                                                                      ┃
    ┃  Output: 8 diverse, high-quality chunks                             ┃
    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                              │
                              ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  STAGE 5: GENERATE ANSWER                                           ┃
    ┃                                                                      ┃
    ┃  Prompt to Gemini 2.0 Flash:                                        ┃
    ┃  ┌────────────────────────────────────────────────────────────────┐ ┃
    ┃  │ You are a helpful assistant. Answer based on these sources:    │ ┃
    ┃  │                                                                 │ ┃
    ┃  │ [N1] We chose Firestore because it offers real-time sync...    │ ┃
    ┃  │ [N2] Firestore's serverless model means no capacity planning...│ ┃
    ┃  │ [N3] The decision came down to Firestore vs DynamoDB...        │ ┃
    ┃  │                                                                 │ ┃
    ┃  │ Question: Why did we choose Firestore?                         │ ┃
    ┃  │ Cite sources using [N1], [N2], etc.                            │ ┃
    ┃  └────────────────────────────────────────────────────────────────┘ ┃
    ┃                                                                      ┃
    ┃  LLM Response:                                                      ┃
    ┃  "We chose Firestore for its real-time sync capabilities [N1]      ┃
    ┃   and serverless scaling model [N2]. It was selected over          ┃
    ┃   DynamoDB due to better GCP integration [N3]."                    ┃
    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                              │
                              ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  STAGE 6: VALIDATE CITATIONS                                        ┃
    ┃                                                                      ┃
    ┃  For each [N#] in response:                                         ┃
    ┃    • Is it a valid source ID? (remove [N99] if only 8 sources)     ┃
    ┃    • Does the claim match the source? (lexical overlap check)       ┃
    ┃    • Remove citations with <15% word overlap                        ┃
    ┃                                                                      ┃
    ┃  If too many removed → regenerate with stricter prompt             ┃
    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │  FINAL RESPONSE                                                     │
    │                                                                      │
    │  {                                                                   │
    │    "answer": "We chose Firestore for its real-time... [N1][N2]",   │
    │    "citations": [                                                   │
    │      { "id": "N1", "noteId": "abc123", "snippet": "..." },          │
    │      { "id": "N2", "noteId": "def456", "snippet": "..." }           │
    │    ]                                                                 │
    │  }                                                                   │
    └─────────────────────────────────────────────────────────────────────┘


================================================================================
                           DATA MODEL
================================================================================

    FIRESTORE
    │
    ├── notes (collection)
    │   │
    │   └── {noteId}
    │       ├── id: "abc-123-def"
    │       ├── text: "We chose Firestore because..."
    │       ├── tenantId: "user-456"
    │       ├── createdAt: Timestamp
    │       └── updatedAt: Timestamp
    │
    └── noteChunks (collection)
        │
        └── {chunkId}
            ├── chunkId: "abc-123-def_000"
            ├── noteId: "abc-123-def"          ← links to parent note
            ├── text: "We chose Firestore..."
            ├── position: 0                     ← order in note
            ├── embedding: [0.12, -0.45, ...]  ← 768 floats
            ├── terms: ["chose", "firestore"]  ← for keyword search
            └── tenantId: "user-456"            ← for isolation


================================================================================
                          TECH STACK
================================================================================

    ┌────────────────┬──────────────────────────────────────────────────┐
    │ Layer          │ Technology                                       │
    ├────────────────┼──────────────────────────────────────────────────┤
    │ Hosting        │ Cloud Run (serverless containers)               │
    │ API Server     │ Express.js 5.x / TypeScript                     │
    │ Database       │ Cloud Firestore (NoSQL document store)          │
    │ Embeddings     │ Vertex AI text-embedding-004 (768 dimensions)   │
    │ LLM            │ Gemini 2.0 Flash (answer generation)            │
    │ Container      │ Docker                                           │
    └────────────────┴──────────────────────────────────────────────────┘


================================================================================
                         PERFORMANCE
================================================================================

    Latency (16 test queries):

    ┌─────────┬─────────┐
    │ P50     │ 2.2 sec │
    │ P90     │ 3.8 sec │
    │ P99     │ 4.0 sec │
    └─────────┴─────────┘

    Quality: 100% pass rate on test suite (factual, decision, list, summary)


================================================================================
                      SCALING NOTES
================================================================================

    Current: In-memory vector search (scan all chunks in Firestore)
             Good for: < 100k chunks

    Future:  Vertex AI Vector Search
             - Pre-built vector index
             - Sub-100ms vector queries
             - Millions of vectors

             Enable with: VERTEX_VECTOR_SEARCH_ENABLED=true


================================================================================
                         API REFERENCE
================================================================================

    POST /notes
    ─────────────────────────────────────────
    Body:     { "text": "...", "tenantId": "..." }
    Response: { "id": "...", "text": "...", "createdAt": "..." }


    GET /notes?tenantId=...&limit=20&cursor=...
    ─────────────────────────────────────────
    Response: { "notes": [...], "cursor": "...", "hasMore": true }


    POST /chat
    ─────────────────────────────────────────
    Body:     { "message": "Why did we choose X?", "tenantId": "..." }
    Response: {
                "answer": "We chose X because... [N1][N2]",
                "citations": [
                  { "id": "N1", "noteId": "...", "snippet": "..." }
                ]
              }

