# AuroraNotes API - Frontend Integration Guide

## Overview

AuroraNotes provides a RAG-powered (Retrieval Augmented Generation) notes API with intelligent search and inline citations. This guide covers everything needed to integrate the API into a frontend application.

**Base URL:** `https://auroranotes-api-884985856308.us-central1.run.app`

---

## Endpoints

### 1. Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-15T01:30:00.000Z",
  "service": "auroranotes-api",
  "project": "auroranotes-ai",
  "version": "2.0.0"
}
```

---

### 2. Create Note

```
POST /notes
Content-Type: application/json
```

**Request Body:**
```json
{
  "text": "Your note content here",
  "tenantId": "user123"  // Optional, defaults to 'public'
}
```

**Response (201 Created):**
```json
{
  "id": "uuid-here",
  "text": "Your note content here",
  "tenantId": "user123",
  "createdAt": "2025-12-15T01:30:00.000Z",
  "updatedAt": "2025-12-15T01:30:00.000Z"
}
```

**Validation:**
- `text` is required, max 5000 characters
- `tenantId` must be alphanumeric with hyphens/underscores, max 64 chars

**Error Responses:**
- `400` - Invalid input (`text is required`, `text too long`, `invalid tenantId format`)
- `500` - Server error

---

### 3. List Notes (Paginated)

```
GET /notes?limit=50&cursor=xxx&tenantId=user123
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Results per page (max 100) |
| `cursor` | string | - | Pagination cursor from previous response |
| `tenantId` | string | 'public' | Filter by tenant |

**Response:**
```json
{
  "notes": [
    {
      "id": "uuid-1",
      "text": "Note content...",
      "tenantId": "user123",
      "createdAt": "2025-12-15T01:30:00.000Z",
      "updatedAt": "2025-12-15T01:30:00.000Z"
    }
  ],
  "cursor": "base64-encoded-cursor",
  "hasMore": true
}
```

**Pagination Pattern:**
```typescript
async function fetchAllNotes(tenantId: string) {
  let cursor: string | null = null;
  const allNotes = [];
  
  do {
    const url = new URL('/notes', BASE_URL);
    url.searchParams.set('tenantId', tenantId);
    url.searchParams.set('limit', '50');
    if (cursor) url.searchParams.set('cursor', cursor);
    
    const res = await fetch(url);
    const data = await res.json();
    
    allNotes.push(...data.notes);
    cursor = data.hasMore ? data.cursor : null;
  } while (cursor);
  
  return allNotes;
}
```

---

### 4. Chat with RAG (Main Feature)

```
POST /chat
Content-Type: application/json
```

**Request Body:**
```json
{
  "message": "What decisions have I made about the architecture?",
  "tenantId": "user123"  // Optional
}
```

**Response (200 OK):**
```json
{
  "answer": "Based on your notes, you decided to use Cloud Run [N1] for the API...",
  "citations": [
    {
      "cid": "N1",
      "noteId": "abc123",
      "chunkId": "abc123_000",
      "createdAt": "2025-12-15T01:00:00.000Z",
      "snippet": "Decision: We chose Cloud Run for the API because...",
      "score": 0.87
    }
  ],
  "meta": {
    "model": "gemini-2.0-flash",
    "retrieval": {
      "k": 5,
      "strategy": "hybrid_diverse",
      "candidateCount": 45,
      "rerankCount": 5,
      "timeMs": 1250
    }
  }
}
```

**Error Responses:**
- `400` - Invalid input (`message is required`, `message too long`)
- `429` - Rate limited (includes `retryAfterMs`)
- `503` - Service unavailable (API key not configured)
- `500` - Server error

---

## Rendering Inline Citations

### Citation Format
Citations appear as `[N1]`, `[N2]`, etc. in the answer text. Each corresponds to an entry in the `citations` array.

### React Implementation Example

```tsx
interface Citation {
  cid: string;
  noteId: string;
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

  // Create a map for quick lookup
  const citationMap = new Map(citations.map(c => [c.cid, c]));

  // Split answer by citation markers
  const parts = answer.split(/(\[N\d+\])/g);

  return parts.map((part, idx) => {
    const match = part.match(/^\[N(\d+)\]$/);
    if (match) {
      const cid = `N${match[1]}`;
      const citation = citationMap.get(cid);
      if (citation) {
        return (
          <Tooltip key={idx} content={citation.snippet}>
            <CitationBadge
              cid={cid}
              onClick={() => scrollToNote(citation.noteId)}
            />
          </Tooltip>
        );
      }
    }
    return <span key={idx}>{part}</span>;
  });
}

// Citation badge component
function CitationBadge({ cid, onClick }: { cid: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center px-1.5 py-0.5 rounded-full
                 text-xs font-medium bg-blue-100 text-blue-800
                 hover:bg-blue-200 cursor-pointer mx-0.5"
    >
      {cid}
    </button>
  );
}
```

### Citation Tooltip with Source Preview

```tsx
function CitationTooltip({ citation }: { citation: Citation }) {
  return (
    <div className="p-3 max-w-sm bg-white shadow-lg rounded-lg border">
      <p className="text-sm text-gray-700">{citation.snippet}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>{formatDate(citation.createdAt)}</span>
        <span>Relevance: {Math.round(citation.score * 100)}%</span>
      </div>
    </div>
  );
}
```

---

## Best Practices

### 1. Loading States
The chat endpoint typically takes 1-3 seconds. Show a typing indicator:

```tsx
const [isLoading, setIsLoading] = useState(false);

async function sendMessage(message: string) {
  setIsLoading(true);
  try {
    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tenantId }),
    });
    return await response.json();
  } finally {
    setIsLoading(false);
  }
}
```

### 2. Error Handling

```tsx
async function sendMessage(message: string) {
  const response = await fetch(`${BASE_URL}/chat`, { ... });

  if (!response.ok) {
    const error = await response.json();

    if (response.status === 429) {
      // Rate limited - retry after delay
      await delay(error.retryAfterMs || 5000);
      return sendMessage(message);
    }

    if (response.status === 400) {
      throw new Error(error.error); // Show to user
    }

    throw new Error('Something went wrong. Please try again.');
  }

  return response.json();
}
```

### 3. Handling "No Results" Gracefully
When citations array is empty, the answer will be helpful:
- "I don't have any notes to search through. Try creating some notes first!"
- "I couldn't find notes about that topic..."

### 4. Multi-Tenant Support
Always pass `tenantId` for user-specific notes:

```tsx
const tenantId = user.id; // or user.email, org.id, etc.

// All API calls should include tenantId
const notes = await fetch(`${BASE_URL}/notes?tenantId=${tenantId}`);
const chat = await fetch(`${BASE_URL}/chat`, {
  body: JSON.stringify({ message, tenantId })
});
```

---

## TypeScript Types

```typescript
// Request/Response types
interface NoteResponse {
  id: string;
  text: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

interface NotesListResponse {
  notes: NoteResponse[];
  cursor: string | null;
  hasMore: boolean;
}

interface ChatRequest {
  message: string;
  tenantId?: string;
}

interface Citation {
  cid: string;           // "N1", "N2", etc.
  noteId: string;
  chunkId: string;
  createdAt: string;
  snippet: string;        // First 200 chars of chunk
  score: number;          // 0-1 relevance score
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
      timeMs?: number;
    };
  };
}
```

---

## Testing Checklist

1. **Basic Flow**
   - [ ] Can create a note
   - [ ] Can list notes with pagination
   - [ ] Can send chat message and receive response

2. **Citation Rendering**
   - [ ] Citations render as clickable badges
   - [ ] Clicking citation shows note preview
   - [ ] Multiple citations in same answer work

3. **Error Handling**
   - [ ] Empty message shows validation error
   - [ ] Rate limiting is handled gracefully
   - [ ] Network errors show retry option

4. **Edge Cases**
   - [ ] Empty notes state handled
   - [ ] No matching notes handled (graceful fallback)
   - [ ] Very long responses render correctly

---

## Support

API Issues: Check Cloud Run logs in Google Cloud Console
Service URL: https://auroranotes-api-884985856308.us-central1.run.app
```

