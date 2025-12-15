# AuroraNotes Frontend Integration Specification

## API Base URL
**Production:** `https://auroranotes-api-884985856308.us-central1.run.app`

## Authentication
Currently the API is public (no authentication required). All endpoints accept requests without auth headers.

---

## Endpoints

### 1. Health Check
**GET /health**

Check API availability before making other requests.

```bash
curl https://auroranotes-api-884985856308.us-central1.run.app/health
```

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-15T15:32:50.300Z",
  "service": "auroranotes-api",
  "project": "auroranotes-ai",
  "version": "2.0.0"
}
```

---

### 2. Create Note
**POST /notes**

Create a new note. The API automatically chunks the text and generates embeddings for AI search.

**Request:**
```json
{
  "text": "Your note content here...",
  "tenantId": "public"  // Optional, defaults to "public"
}
```

**Response (201):**
```json
{
  "id": "uuid-here",
  "text": "Your note content here...",
  "tenantId": "public",
  "createdAt": "2025-12-15T15:32:50.300Z",
  "updatedAt": "2025-12-15T15:32:50.300Z"
}
```

**Errors:**
- 400: `{ "error": "text is required" }` - Empty text
- 400: `{ "error": "text too long (max 5000 chars)" }` - Text exceeds limit

---

### 3. List Notes
**GET /notes**

List notes with cursor-based pagination. Notes are returned in reverse chronological order (newest first).

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | number | 50 | Results per page (max 100) |
| cursor | string | - | Pagination cursor from previous response |
| tenantId | string | "public" | Filter by tenant |

**Example:**
```bash
curl "https://auroranotes-api-884985856308.us-central1.run.app/notes?limit=10"
```

**Response (200):**
```json
{
  "notes": [
    {
      "id": "uuid-1",
      "text": "First note text...",
      "tenantId": "public",
      "createdAt": "2025-12-15T15:32:50.300Z",
      "updatedAt": "2025-12-15T15:32:50.300Z"
    }
  ],
  "cursor": "base64-encoded-cursor-string",
  "hasMore": true
}
```

**Pagination:** Pass the `cursor` value to the next request to get the next page. When `hasMore` is false, there are no more results.

---

### 4. AI Chat
**POST /chat**

Ask questions about your notes. Uses RAG (Retrieval Augmented Generation) with hybrid vector + keyword search.

**Request:**
```json
{
  "message": "What did we decide about the database?",
  "tenantId": "public"  // Optional
}
```

**Response (200):**


**Citation Format:** The `answer` contains inline citations like `[N1]`, `[N2]` that reference items in the `citations` array. Build clickable citation badges that expand to show the source snippet.

**Errors:**
- 400: `{ "error": "message is required" }`
- 400: `{ "error": "message too long (max 2000 chars)" }`
- 429: `{ "error": "Too many requests. Please try again later.", "code": "RATE_LIMITED", "retryAfterMs": 5000 }`
- 503: `{ "error": "Chat service is not configured.", "code": "SERVICE_UNAVAILABLE" }`

---

## Frontend Implementation Guidelines

### Citation Rendering
1. Parse the answer text for `[N\d+]` patterns using regex: `/\[N(\d+)\]/g`
2. Replace each match with a clickable badge/chip component
3. On click, show a popover or sidebar with the full snippet from that citation
4. Style citations distinctly (e.g., colored badges) so users can see sources at a glance

### Example React Component Pattern
```typescript
interface Citation {
  cid: string;
  noteId: string;
  chunkId: string;
  createdAt: string;
  snippet: string;
  score: number;
}

interface ChatResponse {
  answer: string;
  citations: Citation[];
  meta: { model: string; retrieval: object };
}

function renderAnswerWithCitations(response: ChatResponse) {
  const { answer, citations } = response;
  const citationMap = Object.fromEntries(citations.map(c => [c.cid, c]));

  // Split answer on citation patterns
  const parts = answer.split(/(\[N\d+\])/g);

  return parts.map((part, i) => {
    const match = part.match(/\[N(\d+)\]/);
    if (match) {
      const cid = `N${match[1]}`;
      const citation = citationMap[cid];
      return <CitationBadge key={i} citation={citation} />;
    }
    return <span key={i}>{part}</span>;
  });
}
```

### Error Handling
```typescript
async function chat(message: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });

  if (!res.ok) {
    const err = await res.json();
    if (res.status === 429) {
      // Rate limited - show retry timer
      throw new RateLimitError(err.retryAfterMs);
    }
    if (res.status === 503) {
      // Service unavailable
      throw new ServiceError('Chat temporarily unavailable');
    }
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}
```

### Pagination Pattern
```typescript
async function loadAllNotes(tenantId = 'public') {
  const notes = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ limit: '50', tenantId });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${API_BASE}/notes?${params}`);
    const data = await res.json();

    notes.push(...data.notes);
    cursor = data.hasMore ? data.cursor : null;
  } while (cursor);

  return notes;
}
```

---

## TypeScript Interfaces

```typescript
// Note Types
interface NoteResponse {
  id: string;
  text: string;
  tenantId: string;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}

interface NotesListResponse {
  notes: NoteResponse[];
  cursor: string | null;
  hasMore: boolean;
}

// Chat Types
interface Citation {
  cid: string;
  noteId: string;
  chunkId: string;
  createdAt: string;
  snippet: string;
  score: number;
}

interface ChatResponse {
  answer: string;
  citations: Citation[];
  meta: {
    model: string;
    retrieval: {
      k: number;
      strategy: string;
      candidateCount?: number;
      rerankCount?: number;
      intent?: 'summarize' | 'list' | 'decision' | 'action_item' | 'search' | 'question';
      timeMs?: number;
    };
  };
}

// Health Check
interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
  project: string;
  version: string;
}
```

---

## Rate Limiting
- Requests are rate-limited per IP address
- On 429 response, wait for `retryAfterMs` before retrying
- Implement exponential backoff for robustness

## CORS
- All origins are allowed (Access-Control-Allow-Origin: *)
- No preflight restrictions on standard JSON requests

## Best Practices
1. **Health check on app load:** Call `/health` to verify API is reachable
2. **Debounce chat input:** Wait for user to stop typing before sending
3. **Show loading states:** Chat responses can take 1-3 seconds
4. **Cache notes list:** Refresh on user action, not on every render
5. **Handle empty states:** Guide users to create their first note

