/**
 * API Contract Regression Tests
 * 
 * Verifies that all API endpoints return responses matching their documented schemas.
 * Run this before and after any changes to ensure API contracts are preserved.
 */

const API_URL = process.env.API_URL || 'http://localhost:8080';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  responseTime: number;
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

  // Test 4: POST /chat
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

