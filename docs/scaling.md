# Scaling AuroraNotes to 100k+ Notes

This document explains the architecture decisions for scaling AuroraNotes to handle 100,000+ notes per user while maintaining performance and controlling costs.

## Overview

The scalability strategy is built on three pillars:
1. **Cursor-based pagination** - Never load all notes at once
2. **Derived collections** - Pre-compute chunks for fast retrieval
3. **Tenant isolation** - Ready for multi-user/multi-tenant

## Notes Collection Schema

```typescript
// notes/{noteId}
{
  id: string;           // Document ID
  text: string;         // Note content (max 5000 chars)
  tenantId: string;     // Tenant/user ID (default: 'public')
  createdAt: Timestamp; // Server timestamp
  updatedAt: Timestamp; // Server timestamp
}
```

### Firestore Indexes

Required composite indexes for efficient queries:

1. `notes` collection:
   - `tenantId ASC, createdAt DESC, id DESC` - For paginated listing

2. `noteChunks` collection:
   - `tenantId ASC, createdAt DESC` - For retrieval candidates

## Pagination Strategy

### Cursor-Based Pagination

We use cursor-based pagination instead of offset-based for several reasons:

| Feature | Cursor-Based | Offset-Based |
|---------|-------------|--------------|
| Performance at depth | O(1) | O(offset) |
| Stable with inserts | ✅ Yes | ❌ No |
| Firestore cost | Efficient | Wasteful |

### API Contract

```http
GET /notes?limit=50&cursor=BASE64_CURSOR&tenantId=public
```

Response:
```json
{
  "notes": [...],
  "cursor": "eyJjcmVhdGVkQXQiOiIyMDI0...",
  "hasMore": true
}
```

The cursor encodes `createdAt|id` for stable `startAfter()` queries.

## Chunking Pipeline

When a note is created or updated:

1. **Split into chunks** (~400-800 characters, sentence-aware)
2. **Generate embeddings** via Vertex AI text-embedding-004
3. **Store in `noteChunks`** collection

```typescript
// noteChunks/{chunkId}
{
  chunkId: string;      // noteId_XXX
  noteId: string;       // Parent note
  tenantId: string;     // For isolation
  text: string;         // Chunk content
  textHash: string;     // For deduplication
  position: number;     // Order in note
  tokenEstimate: number;
  embedding?: number[]; // 768-dim vector
  embeddingModel?: string;
  createdAt: Timestamp;
}
```

### Chunking Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `CHUNK_TARGET_SIZE` | 500 | Target chars per chunk |
| `CHUNK_MIN_SIZE` | 100 | Minimum before merging |
| `CHUNK_MAX_SIZE` | 800 | Maximum allowed |
| `CHUNK_OVERLAP` | 50 | Overlap for context |

## Cost Controls

### Hard Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| `MAX_NOTE_LENGTH` | 5000 chars | Limit storage/embedding cost |
| `MAX_NOTES_PAGE_LIMIT` | 100 | Prevent expensive queries |
| `MAX_CHUNKS_IN_CONTEXT` | 12 | Limit LLM context size |
| `RETRIEVAL_MAX_CONTEXT_CHARS` | 12000 | Token budget |
| `MAX_EMBEDDING_BATCH_SIZE` | 10 | Rate limit embeddings |

### Cloud Run Configuration

Recommended settings for cost control:

```yaml
# Concurrency tuning
concurrency: 80
max-instances: 10
min-instances: 0
memory: 512Mi
cpu: 1

# Request limits
timeout: 30s
```

### Firestore Reads Optimization

- Use composite indexes to avoid scans
- Limit result sets with `limit()`
- Use `startAfter()` instead of `offset()`
- Cache frequently accessed data (future)

## Future Enhancements

1. **Async Embeddings**: Queue large notes for background processing
2. **Vector Index**: Use Vertex AI Vector Search for O(log n) retrieval
3. **Caching Layer**: Redis/Memorystore for hot data
4. **Sharding**: Partition by tenant for massive scale

## Monitoring

Key metrics to track:

- Notes per query (should be ≤ page limit)
- Chunks per retrieval (should be ≤ K)
- Embedding generation latency
- LLM response time
- Firestore read/write counts

