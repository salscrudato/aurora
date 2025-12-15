# RAG Implementation Guide

This document explains the Retrieval-Augmented Generation (RAG) pipeline used in AuroraNotes for chat with inline citations.

## Architecture Overview

```
User Query
    ↓
┌─────────────────┐
│ Query Analysis  │ → Extract keywords, time hints
└────────┬────────┘
         ↓
┌─────────────────┐
│   Retrieval     │ → Vector + Keyword + Recency hybrid
└────────┬────────┘
         ↓
┌─────────────────┐
│   Reranking     │ → Score-based top-K selection
└────────┬────────┘
         ↓
┌─────────────────┐
│   Generation    │ → LLM with citation-enforced prompt
└────────┬────────┘
         ↓
┌─────────────────┐
│   Validation    │ → Verify all citations exist
└────────┬────────┘
         ↓
Response with [N1], [N2] inline citations
```

## Chat Response Contract

### Request
```json
POST /chat
{
  "message": "What decisions did I make about X?",
  "tenantId": "optional-tenant-id"
}
```

### Response
```json
{
  "answer": "Based on your notes, you decided to use Cloud Run [N1] and Firestore [N2] for the backend...",
  "citations": [
    {
      "cid": "N1",
      "noteId": "abc123",
      "chunkId": "abc123_001",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "snippet": "Decided to use Cloud Run for the API because...",
      "score": 0.87
    },
    {
      "cid": "N2",
      "noteId": "def456",
      "chunkId": "def456_000",
      "createdAt": "2024-01-14T09:00:00.000Z",
      "snippet": "After evaluating options, Firestore is the best choice...",
      "score": 0.82
    }
  ],
  "meta": {
    "model": "gemini-2.0-flash",
    "retrieval": {
      "k": 8,
      "strategy": "hybrid_reranked",
      "candidateCount": 45,
      "rerankCount": 8,
      "timeMs": 1250
    }
  }
}
```

## Retrieval Pipeline

### 1. Query Analysis

```typescript
analyzeQuery("What did I decide last week about the API?")
// Returns:
{
  originalQuery: "What did I decide last week about the API?",
  keywords: ["decide", "week", "api"],
  timeHint: { days: 14 }  // "last week" detected
}
```

### 2. Candidate Retrieval

Fetch chunks from Firestore with filters:
- `tenantId` matches user
- `createdAt` within time window (default: 90 days)
- Limit to `topK * 3` candidates

### 3. Hybrid Scoring

Each chunk receives a combined score:

```
score = 0.6 * vectorScore + 0.25 * keywordScore + 0.15 * recencyScore
```

| Component | Weight | Description |
|-----------|--------|-------------|
| Vector | 0.60 | Cosine similarity with query embedding |
| Keyword | 0.25 | Keyword overlap ratio |
| Recency | 0.15 | Decay based on age |

### 4. Reranking

Select top-K chunks (default: 8) sorted by combined score.

## Prompting Strategy

The LLM prompt enforces citations:

```
You are a helpful AI assistant that answers questions based ONLY on the user's notes.

IMPORTANT RULES:
1. Use ONLY information from the provided sources
2. For EVERY factual claim, include at least one citation [N1], [N2]
3. Place citations inline immediately after the relevant statement
4. If you cannot answer, say "I don't have enough information..."
5. Never invent information not in the sources

USER'S NOTES:
[N1]: Decided to use Cloud Run for...
[N2]: Firestore provides...

USER QUESTION: What decisions did I make about the backend?
```

## Citation Validation

After LLM response, we validate citations:

1. Parse `[N\d+]` patterns from answer
2. Verify each matches a citation in the provided sources
3. If invalid citations found:
   - Remove them from the answer
   - Log warning for monitoring
4. If no valid citations and answer doesn't acknowledge uncertainty:
   - Return fallback "I don't have enough information..."

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAT_MODEL` | gemini-2.0-flash | LLM model |
| `CHAT_TEMPERATURE` | 0.3 | Lower = more focused |
| `CHAT_TIMEOUT_MS` | 30000 | Request timeout |
| `CHAT_MAX_QUERY_LENGTH` | 2000 | Input limit |
| `RETRIEVAL_TOP_K` | 30 | Initial candidates |
| `RETRIEVAL_RERANK_TO` | 8 | Final context size |
| `EMBEDDING_MODEL` | text-embedding-004 | Embeddings model |

## Fallback Modes

When embeddings are unavailable:

1. **Keyword + Recency**: Fall back to keyword matching and recency scoring
2. **Recent Notes**: If no matches, show recent notes as context
3. **No Results**: Return "I don't have any notes to search"

## Cost Optimization

- **Limit context**: Max 12 chunks, 12000 chars
- **Fast model**: Use gemini-2.0-flash (lower cost than pro)
- **Cache embeddings**: Generated once per chunk
- **Batch requests**: Process embeddings in batches of 10

