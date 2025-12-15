/**
 * API Contract Regression Tests
 *
 * Verifies that all API endpoints return responses matching their documented schemas.
 * Run this before and after any changes to ensure API contracts are preserved.
 *
 * CRITICAL: These tests MUST pass before and after ANY code changes.
 * They validate:
 * - Response schema compliance
 * - Citation validity (all inline citations exist in citations array)
 * - Citation format consistency (N\d+ pattern, unique cids)
 * - Meta fields unchanged
 */

const API_URL = process.env.API_URL || 'http://localhost:8080';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  responseTime: number;
}

interface Citation {
  cid: string;
  noteId: string;
  chunkId: string;
  createdAt: string;
  snippet: string;
  score: number;
}

interface ChatResponseData {
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

// Schema validators
function validateHealthResponse(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'Response is not an object';
  const d = data as Record<string, unknown>;
  
  if (typeof d.status !== 'string') return 'Missing or invalid status field';
  if (typeof d.timestamp !== 'string') return 'Missing or invalid timestamp field';
  if (typeof d.service !== 'string') return 'Missing or invalid service field';
  if (typeof d.project !== 'string') return 'Missing or invalid project field';
  if (typeof d.version !== 'string') return 'Missing or invalid version field';
  
  return null;
}

function validateNoteResponse(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'Response is not an object';
  const d = data as Record<string, unknown>;
  
  if (typeof d.id !== 'string') return 'Missing or invalid id field';
  if (typeof d.text !== 'string') return 'Missing or invalid text field';
  if (typeof d.tenantId !== 'string') return 'Missing or invalid tenantId field';
  if (typeof d.createdAt !== 'string') return 'Missing or invalid createdAt field';
  if (typeof d.updatedAt !== 'string') return 'Missing or invalid updatedAt field';
  
  return null;
}

function validateNotesListResponse(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'Response is not an object';
  const d = data as Record<string, unknown>;
  
  if (!Array.isArray(d.notes)) return 'Missing or invalid notes array';
  if (d.cursor !== null && typeof d.cursor !== 'string') return 'Invalid cursor field';
  if (typeof d.hasMore !== 'boolean') return 'Missing or invalid hasMore field';
  
  // Validate each note in the array
  for (let i = 0; i < Math.min(d.notes.length, 3); i++) {
    const noteError = validateNoteResponse(d.notes[i]);
    if (noteError) return `notes[${i}]: ${noteError}`;
  }
  
  return null;
}

function validateCitation(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'Citation is not an object';
  const d = data as Record<string, unknown>;
  
  if (typeof d.cid !== 'string') return 'Missing or invalid cid';
  if (typeof d.noteId !== 'string') return 'Missing or invalid noteId';
  if (typeof d.chunkId !== 'string') return 'Missing or invalid chunkId';
  if (typeof d.createdAt !== 'string') return 'Missing or invalid createdAt';
  if (typeof d.snippet !== 'string') return 'Missing or invalid snippet';
  if (typeof d.score !== 'number') return 'Missing or invalid score';
  
  return null;
}

function validateChatResponse(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'Response is not an object';
  const d = data as Record<string, unknown>;

  if (typeof d.answer !== 'string') return 'Missing or invalid answer field';
  if (!Array.isArray(d.citations)) return 'Missing or invalid citations array';
  if (typeof d.meta !== 'object' || d.meta === null) return 'Missing or invalid meta object';

  const meta = d.meta as Record<string, unknown>;
  if (typeof meta.model !== 'string') return 'Missing or invalid meta.model';
  if (typeof meta.retrieval !== 'object' || meta.retrieval === null) return 'Missing meta.retrieval';

  const retrieval = meta.retrieval as Record<string, unknown>;
  if (typeof retrieval.k !== 'number') return 'Missing or invalid meta.retrieval.k';
  if (typeof retrieval.strategy !== 'string') return 'Missing or invalid meta.retrieval.strategy';

  // Validate citations if present
  for (let i = 0; i < Math.min((d.citations as unknown[]).length, 3); i++) {
    const citationError = validateCitation((d.citations as unknown[])[i]);
    if (citationError) return `citations[${i}]: ${citationError}`;
  }

  return null;
}

/**
 * Validate that all inline citations [N#] in answer text exist in citations array
 * This is a CRITICAL contract: no hallucinated citation IDs allowed
 */
function validateCitationIntegrity(data: ChatResponseData): string | null {
  const { answer, citations } = data;

  // Extract all [N#] patterns from answer
  const citationPattern = /\[N(\d+)\]/g;
  const foundCitations = answer.match(citationPattern) || [];

  // Build set of valid citation IDs from citations array
  const validCids = new Set(citations.map(c => c.cid));

  // Check that every citation in answer exists in citations array
  const invalidCitations: string[] = [];
  for (const match of foundCitations) {
    const cid = match.slice(1, -1); // Remove brackets to get "N1", "N2", etc.
    if (!validCids.has(cid)) {
      invalidCitations.push(cid);
    }
  }

  if (invalidCitations.length > 0) {
    return `Invalid citations in answer: ${invalidCitations.join(', ')}. These IDs do not exist in citations array.`;
  }

  return null;
}

/**
 * Validate citation ID format and uniqueness
 * All cids must match N\d+ pattern and be unique
 */
function validateCitationFormat(data: ChatResponseData): string | null {
  const { citations } = data;

  const cidPattern = /^N\d+$/;
  const seenCids = new Set<string>();

  for (const citation of citations) {
    // Check format
    if (!cidPattern.test(citation.cid)) {
      return `Citation cid "${citation.cid}" does not match required format N\\d+ (e.g., N1, N2)`;
    }

    // Check uniqueness
    if (seenCids.has(citation.cid)) {
      return `Duplicate citation cid: ${citation.cid}`;
    }
    seenCids.add(citation.cid);
  }

  return null;
}

/**
 * Validate meta fields are present and have expected structure
 */
function validateMetaFields(data: ChatResponseData): string | null {
  const { meta } = data;

  // model must be a non-empty string
  if (!meta.model || typeof meta.model !== 'string') {
    return 'meta.model must be a non-empty string';
  }

  // retrieval must have required fields
  const { retrieval } = meta;
  if (typeof retrieval.k !== 'number' || retrieval.k < 0) {
    return 'meta.retrieval.k must be a non-negative number';
  }

  if (!retrieval.strategy || typeof retrieval.strategy !== 'string') {
    return 'meta.retrieval.strategy must be a non-empty string';
  }

  // Optional fields should be correct type if present
  if (retrieval.candidateCount !== undefined && typeof retrieval.candidateCount !== 'number') {
    return 'meta.retrieval.candidateCount must be a number if present';
  }

  if (retrieval.rerankCount !== undefined && typeof retrieval.rerankCount !== 'number') {
    return 'meta.retrieval.rerankCount must be a number if present';
  }

  if (retrieval.timeMs !== undefined && typeof retrieval.timeMs !== 'number') {
    return 'meta.retrieval.timeMs must be a number if present';
  }

  return null;
}

async function runTest(
  name: string,
  fn: () => Promise<{ data: unknown; status: number }>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const { data, status } = await fn();
    const responseTime = Date.now() - start;
    return { name, passed: true, details: `Status ${status}`, responseTime };
  } catch (err) {
    const responseTime = Date.now() - start;
    return { name, passed: false, details: String(err), responseTime };
  }
}

async function main() {
  console.log('🧪 API Contract Regression Tests\n');
  console.log(`API: ${API_URL}\n`);
  console.log('─'.repeat(80));

  const results: TestResult[] = [];

  // Test 1: GET /health
  results.push(await runTest('GET /health schema', async () => {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    const error = validateHealthResponse(data);
    if (error) throw new Error(error);
    return { data, status: res.status };
  }));

  // Test 2: GET /notes
  results.push(await runTest('GET /notes schema', async () => {
    const res = await fetch(`${API_URL}/notes?limit=5`);
    const data = await res.json();
    const error = validateNotesListResponse(data);
    if (error) throw new Error(error);
    return { data, status: res.status };
  }));

  // Test 3: POST /notes
  results.push(await runTest('POST /notes schema', async () => {
    const res = await fetch(`${API_URL}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `Contract test note ${Date.now()}` }),
    });
    const data = await res.json();
    const error = validateNoteResponse(data);
    if (error) throw new Error(error);
    return { data, status: res.status };
  }));

  // Test 4: POST /chat schema validation
  results.push(await runTest('POST /chat schema', async () => {
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What are my notes about?' }),
    });
    const data = await res.json();
    const error = validateChatResponse(data);
    if (error) throw new Error(error);
    return { data, status: res.status };
  }));

  // Test 5: POST /chat citation integrity - all inline citations must exist in citations array
  results.push(await runTest('POST /chat citation integrity', async () => {
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Summarize my notes' }),
    });
    const data = await res.json() as ChatResponseData;

    // First validate basic schema
    const schemaError = validateChatResponse(data);
    if (schemaError) throw new Error(schemaError);

    // Then validate citation integrity
    const integrityError = validateCitationIntegrity(data);
    if (integrityError) throw new Error(integrityError);

    return { data, status: res.status };
  }));

  // Test 6: POST /chat citation format - cids must be unique and match N\d+
  results.push(await runTest('POST /chat citation format (unique N\\d+ cids)', async () => {
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What topics are in my notes?' }),
    });
    const data = await res.json() as ChatResponseData;

    // Validate format and uniqueness
    const formatError = validateCitationFormat(data);
    if (formatError) throw new Error(formatError);

    return { data, status: res.status };
  }));

  // Test 7: POST /chat meta fields unchanged
  results.push(await runTest('POST /chat meta fields structure', async () => {
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Tell me about my recent notes' }),
    });
    const data = await res.json() as ChatResponseData;

    // Validate meta field structure
    const metaError = validateMetaFields(data);
    if (metaError) throw new Error(metaError);

    return { data, status: res.status };
  }));

  // Test 8: GET /notes pagination cursor stability
  results.push(await runTest('GET /notes pagination cursor stability', async () => {
    interface NotesPage {
      notes: Array<{id: string}>;
      cursor: string | null;
      hasMore: boolean;
    }

    // Get first page
    const res1 = await fetch(`${API_URL}/notes?limit=2`);
    const page1 = await res1.json() as NotesPage;

    const schemaError1 = validateNotesListResponse(page1);
    if (schemaError1) throw new Error(`Page 1: ${schemaError1}`);

    if (!page1.cursor && page1.hasMore) {
      throw new Error('hasMore=true but cursor is null');
    }

    if (page1.cursor) {
      // Get second page using cursor
      const res2 = await fetch(`${API_URL}/notes?limit=2&cursor=${encodeURIComponent(page1.cursor)}`);
      const page2 = await res2.json() as NotesPage;

      const schemaError2 = validateNotesListResponse(page2);
      if (schemaError2) throw new Error(`Page 2: ${schemaError2}`);

      // Verify no duplicates between pages
      const page1Ids = new Set(page1.notes.map((n) => n.id));
      const duplicates = page2.notes.filter((n) => page1Ids.has(n.id));

      if (duplicates.length > 0) {
        throw new Error(`Duplicate notes across pages: ${duplicates.map(n => n.id).join(', ')}`);
      }
    }

    return { data: { page1Notes: page1.notes.length, hasMore: page1.hasMore }, status: res1.status };
  }));

  // Print results
  console.log('\nResults:\n');
  let passed = 0;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name} (${r.responseTime}ms)`);
    if (!r.passed) console.log(`   Error: ${r.details}`);
    if (r.passed) passed++;
  }

  console.log('\n' + '─'.repeat(80));
  console.log(`\n📊 ${passed}/${results.length} tests passed\n`);
  
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(console.error);

