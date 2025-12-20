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

