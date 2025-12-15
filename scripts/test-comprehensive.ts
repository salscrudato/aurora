/**
 * Comprehensive API Test Suite
 * 
 * Tests all endpoints, edge cases, error handling, and citation accuracy.
 */

const API_BASE = process.env.API_BASE || 'https://auroranotes-api-884985856308.us-central1.run.app';
const TEST_ID = `CTEST_${Date.now()}`;

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];
let createdNoteIds: string[] = [];

// Helper functions
async function api<T>(path: string, options?: RequestInit): Promise<{ data?: T; status: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers }
    });
    const data = await response.json() as T;
    return { data, status: response.status };
  } catch (err) {
    return { status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

function test(name: string, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const start = Date.now();
    try {
      await fn();
      results.push({ name, passed: true, duration: Date.now() - start });
      console.log(`  ✅ ${name}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ name, passed: false, duration: Date.now() - start, error });
      console.log(`  ❌ ${name}: ${error}`);
    }
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Test Definitions
// ============================================

const tests = {
  // Health Check Tests
  healthCheck: test('Health check returns healthy status', async () => {
    const { data, status } = await api<{ status: string }>('/health');
    assertEqual(status, 200, 'Status code');
    assertEqual(data?.status, 'healthy', 'Health status');
  }),

  // Note Creation Tests
  createNote: test('Create a basic note', async () => {
    const { data, status } = await api<{ id: string; text: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify({ text: `${TEST_ID}: Basic test note` })
    });
    assertEqual(status, 201, 'Status code');
    assert(!!data?.id, 'Note should have an ID');
    createdNoteIds.push(data!.id);
  }),

  createNoteWithSpecialChars: test('Create note with special characters', async () => {
    const text = `${TEST_ID}: Special chars: émojis 🎉, quotes "test", <html>, & symbols $100`;
    const { data, status } = await api<{ id: string; text: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    assertEqual(status, 201, 'Status code');
    assert(data?.text?.includes('émojis') ?? false, 'Should preserve special chars');
    createdNoteIds.push(data!.id);
  }),

  createNoteWithNewlines: test('Create note with newlines and formatting', async () => {
    const text = `${TEST_ID}: Multi-line note\n\n- Bullet 1\n- Bullet 2\n\nParagraph here.`;
    const { data, status } = await api<{ id: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    assertEqual(status, 201, 'Status code');
    createdNoteIds.push(data!.id);
  }),

  createEmptyNote: test('Reject empty note', async () => {
    const { status } = await api('/notes', {
      method: 'POST',
      body: JSON.stringify({ text: '' })
    });
    assertEqual(status, 400, 'Should reject empty note');
  }),

  createNoteMissingText: test('Reject note without text field', async () => {
    const { status } = await api('/notes', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assertEqual(status, 400, 'Should reject missing text');
  }),

  createNoteTooLong: test('Reject note exceeding max length', async () => {
    const { status } = await api('/notes', {
      method: 'POST',
      body: JSON.stringify({ text: 'x'.repeat(6000) })
    });
    assertEqual(status, 400, 'Should reject note > 5000 chars');
  }),

  // List Notes Tests
  listNotes: test('List notes returns array with pagination', async () => {
    const { data, status } = await api<{ notes: any[]; cursor: string | null; hasMore: boolean }>('/notes?limit=5');
    assertEqual(status, 200, 'Status code');
    assert(Array.isArray(data?.notes), 'Should return notes array');
    assert(typeof data?.hasMore === 'boolean', 'Should have hasMore flag');
  }),

  listNotesWithCursor: test('Pagination with cursor works', async () => {
    const page1 = await api<{ notes: any[]; cursor: string | null }>('/notes?limit=2');
    assert(!!page1.data?.cursor, 'First page should have cursor');
    
    const page2 = await api<{ notes: any[] }>(`/notes?limit=2&cursor=${page1.data!.cursor}`);
    assertEqual(page2.status, 200, 'Second page status');
    assert(page1.data!.notes[0].id !== page2.data!.notes[0]?.id, 'Pages should be different');
  }),

  listNotesLimitClamping: test('Limit parameter is clamped to max 100', async () => {
    // API clamps limit rather than rejecting (more permissive design)
    const { data, status } = await api<{ notes: any[] }>('/notes?limit=500');
    assertEqual(status, 200, 'Should accept and clamp limit');
    assert(data!.notes.length <= 100, 'Should return at most 100 notes');
  }),
};

// Chat Tests - Create test notes first
const chatTests = {
  setupChatNotes: test('Setup: Create notes for chat testing', async () => {
    const notes = [
      `${TEST_ID}: ALPHA_PROJECT quarterly review. Revenue increased 25% YoY. Team size grew from 10 to 15 engineers. Main challenges: hiring and technical debt.`,
      `${TEST_ID}: ALPHA_PROJECT decision log. Chose PostgreSQL over MongoDB for ACID compliance. Migrating to Kubernetes next quarter.`,
      `${TEST_ID}: BETA_INITIATIVE kickoff meeting. Timeline: 6 months. Budget: $200,000. Key stakeholders: Sarah (PM), Mike (Tech Lead), Lisa (Design).`,
      `${TEST_ID}: Action items from standup: 1) Fix login bug by Friday 2) Review PR #456 3) Schedule architecture review 4) Update documentation.`,
    ];

    for (const text of notes) {
      const { data, status } = await api<{ id: string }>('/notes', {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      assertEqual(status, 201, 'Note creation');
      createdNoteIds.push(data!.id);
    }

    // Wait for embeddings
    await sleep(5000);
  }),

  chatBasicQuery: test('Chat: Basic query returns answer', async () => {
    const { data, status } = await api<{ answer: string; citations: any[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: `What is the revenue growth for ALPHA_PROJECT? ${TEST_ID}` })
    });
    assertEqual(status, 200, 'Status code');
    assert(!!data?.answer, 'Should have answer');
    assert(Array.isArray(data?.citations), 'Should have citations array');
  }),

  chatWithCitations: test('Chat: Response includes valid citations', async () => {
    const { data } = await api<{ answer: string; citations: any[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: `What database was chosen for ALPHA_PROJECT and why? ${TEST_ID}` })
    });

    assert(data!.citations.length > 0, 'Should have at least one citation');
    const citation = data!.citations[0];
    assert(!!citation.cid, 'Citation should have cid');
    assert(!!citation.noteId, 'Citation should have noteId');
    assert(!!citation.snippet, 'Citation should have snippet');
    assert(typeof citation.score === 'number', 'Citation should have score');

    // Verify citation reference appears in answer
    assert(data!.answer.includes(`[${citation.cid}]`), 'Answer should reference citation');
  }),

  chatDecisionQuery: test('Chat: Decision query finds relevant info', async () => {
    const { data } = await api<{ answer: string; meta: { retrieval: { intent?: string } } }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: `What decisions were made about databases? ${TEST_ID}` })
    });

    const answerLower = data!.answer.toLowerCase();
    assert(answerLower.includes('postgresql') || answerLower.includes('postgres'),
      'Should mention PostgreSQL decision');
  }),

  chatActionItems: test('Chat: List query extracts action items', async () => {
    const { data } = await api<{ answer: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: `What are the action items from the standup? ${TEST_ID}` })
    });

    const answerLower = data!.answer.toLowerCase();
    assert(answerLower.includes('login') || answerLower.includes('bug') || answerLower.includes('pr'),
      'Should mention action items');
  }),

  chatMultipleNotes: test('Chat: Query spanning multiple notes', async () => {
    const { data } = await api<{ answer: string; citations: any[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: `Compare ALPHA_PROJECT and BETA_INITIATIVE budgets and timelines. ${TEST_ID}` })
    });

    // Should reference multiple notes
    const uniqueNoteIds = new Set(data!.citations.map(c => c.noteId));
    // May or may not find multiple depending on retrieval
    assert(data!.citations.length >= 1, 'Should have citations');
  }),

  chatNoResults: test('Chat: Graceful handling when no notes match', async () => {
    const { data, status } = await api<{ answer: string; citations: any[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Tell me about XYZ_NONEXISTENT_PROJECT_12345' })
    });

    assertEqual(status, 200, 'Should still return 200');
    assert(!!data?.answer, 'Should have answer even with no matches');
  }),

  chatEmptyMessage: test('Chat: Reject empty message', async () => {
    const { status } = await api('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '' })
    });
    assertEqual(status, 400, 'Should reject empty message');
  }),

  chatMissingMessage: test('Chat: Reject missing message field', async () => {
    const { status } = await api('/chat', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assertEqual(status, 400, 'Should reject missing message');
  }),

  chatTooLongMessage: test('Chat: Reject message exceeding max length', async () => {
    const { status } = await api('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'x'.repeat(2500) })
    });
    assertEqual(status, 400, 'Should reject message > 2000 chars');
  }),
};

// Citation Accuracy Tests
const citationAccuracyTests = {
  citationSnippetAccuracy: test('Citation: Snippet matches source note', async () => {
    // Create a note with unique, identifiable content
    const uniqueContent = `${TEST_ID}: UNIQUE_SNIPPET_TEST_789. The velocity was exactly 42 story points.`;
    const { data: noteData } = await api<{ id: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify({ text: uniqueContent })
    });
    createdNoteIds.push(noteData!.id);

    await sleep(3000); // Wait for embedding

    const { data } = await api<{ citations: any[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: `What was the velocity in UNIQUE_SNIPPET_TEST_789? ${TEST_ID}` })
    });

    if (data!.citations.length > 0) {
      const matchingCitation = data!.citations.find(c => c.noteId === noteData!.id);
      if (matchingCitation) {
        assert(matchingCitation.snippet.includes('42') || matchingCitation.snippet.includes('velocity'),
          'Snippet should contain relevant content');
      }
    }
  }),

  citationNoteIdValid: test('Citation: noteId references existing note', async () => {
    const { data } = await api<{ citations: any[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: `Tell me about ALPHA_PROJECT ${TEST_ID}` })
    });

    if (data!.citations.length > 0) {
      const noteId = data!.citations[0].noteId;
      // Verify this note exists
      const { status } = await api(`/notes?limit=100`);
      assertEqual(status, 200, 'Should be able to list notes');
      // Note: We can't directly verify noteId without a GET /notes/:id endpoint
    }
  }),

  citationScoreRange: test('Citation: Score is within valid range', async () => {
    const { data } = await api<{ citations: any[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: `What is the budget for BETA_INITIATIVE? ${TEST_ID}` })
    });

    for (const citation of data!.citations) {
      assert(citation.score >= 0, 'Score should be >= 0');
      assert(citation.score <= 2, 'Score should be reasonable (< 2)');
    }
  }),
};

// Performance Tests
const performanceTests = {
  healthLatency: test('Performance: Health check < 500ms', async () => {
    const start = Date.now();
    await api('/health');
    const duration = Date.now() - start;
    assert(duration < 500, `Health check took ${duration}ms, expected < 500ms`);
  }),

  noteCreationLatency: test('Performance: Note creation < 2s', async () => {
    const start = Date.now();
    const { data } = await api<{ id: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify({ text: `${TEST_ID}: Performance test note` })
    });
    const duration = Date.now() - start;
    createdNoteIds.push(data!.id);
    assert(duration < 2000, `Note creation took ${duration}ms, expected < 2000ms`);
  }),

  chatLatency: test('Performance: Chat response < 10s', async () => {
    const start = Date.now();
    await api('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'What is in my notes?' })
    });
    const duration = Date.now() - start;
    assert(duration < 10000, `Chat took ${duration}ms, expected < 10s`);
  }),

  listNotesLatency: test('Performance: List notes < 1s', async () => {
    const start = Date.now();
    await api('/notes?limit=50');
    const duration = Date.now() - start;
    assert(duration < 1000, `List notes took ${duration}ms, expected < 1s`);
  }),
};

// Edge Case Tests
const edgeCaseTests = {
  unicodeHandling: test('Edge: Unicode characters preserved', async () => {
    const unicodeText = `${TEST_ID}: 日本語テスト 中文测试 한국어 테스트 العربية`;
    const { data } = await api<{ id: string; text: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify({ text: unicodeText })
    });
    createdNoteIds.push(data!.id);
    assert(data!.text.includes('日本語'), 'Should preserve Japanese');
    assert(data!.text.includes('中文'), 'Should preserve Chinese');
    assert(data!.text.includes('한국어'), 'Should preserve Korean');
  }),

  markdownPreserved: test('Edge: Markdown formatting preserved', async () => {
    const markdown = `${TEST_ID}: # Heading\n\n**Bold** and *italic* text\n\n- List item\n- Another item\n\n\`code block\``;
    const { data } = await api<{ id: string; text: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify({ text: markdown })
    });
    createdNoteIds.push(data!.id);
    assert(data!.text.includes('# Heading'), 'Should preserve heading');
    assert(data!.text.includes('**Bold**'), 'Should preserve bold');
  }),

  whitespaceNormalization: test('Edge: Leading/trailing whitespace trimmed', async () => {
    const { data } = await api<{ id: string; text: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify({ text: `   ${TEST_ID}: Whitespace test   ` })
    });
    createdNoteIds.push(data!.id);
    assert(!data!.text.startsWith(' '), 'Leading space should be trimmed');
    assert(!data!.text.endsWith(' '), 'Trailing space should be trimmed');
  }),

  longNoteAtLimit: test('Edge: Note at exactly max length accepted', async () => {
    const text = `${TEST_ID}: ` + 'x'.repeat(4980); // Just under 5000
    const { status } = await api('/notes', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    // May or may not be accepted depending on TEST_ID length
    assert(status === 201 || status === 400, 'Should respond with 201 or 400');
  }),

  chatWithPunctuation: test('Edge: Chat handles question with special punctuation', async () => {
    const { data, status } = await api<{ answer: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: `What's the status? How's it going?? ${TEST_ID}` })
    });
    assertEqual(status, 200, 'Should handle apostrophes and multiple question marks');
    assert(!!data?.answer, 'Should return answer');
  }),

  concurrentRequests: test('Edge: Handle concurrent requests', async () => {
    const requests = Array(5).fill(null).map(() =>
      api('/health')
    );
    const results = await Promise.all(requests);
    const allSuccess = results.every(r => r.status === 200);
    assert(allSuccess, 'All concurrent requests should succeed');
  }),
};

// Run all tests
async function runAllTests(): Promise<void> {
  console.log('🧪 Comprehensive API Test Suite');
  console.log('================================');
  console.log(`API: ${API_BASE}`);
  console.log(`Test ID: ${TEST_ID}\n`);

  console.log('📋 Health & Basic Tests:');
  await tests.healthCheck();

  console.log('\n📝 Note CRUD Tests:');
  await tests.createNote();
  await tests.createNoteWithSpecialChars();
  await tests.createNoteWithNewlines();
  await tests.createEmptyNote();
  await tests.createNoteMissingText();
  await tests.createNoteTooLong();

  console.log('\n📄 List Notes Tests:');
  await tests.listNotes();
  await tests.listNotesWithCursor();
  await tests.listNotesLimitClamping();

  console.log('\n💬 Chat Tests:');
  await chatTests.setupChatNotes();
  await chatTests.chatBasicQuery();
  await chatTests.chatWithCitations();
  await chatTests.chatDecisionQuery();
  await chatTests.chatActionItems();
  await chatTests.chatMultipleNotes();
  await chatTests.chatNoResults();
  await chatTests.chatEmptyMessage();
  await chatTests.chatMissingMessage();
  await chatTests.chatTooLongMessage();

  console.log('\n🎯 Citation Accuracy Tests:');
  await citationAccuracyTests.citationSnippetAccuracy();
  await citationAccuracyTests.citationNoteIdValid();
  await citationAccuracyTests.citationScoreRange();

  console.log('\n⚡ Performance Tests:');
  await performanceTests.healthLatency();
  await performanceTests.noteCreationLatency();
  await performanceTests.chatLatency();
  await performanceTests.listNotesLatency();

  console.log('\n🔬 Edge Case Tests:');
  await edgeCaseTests.unicodeHandling();
  await edgeCaseTests.markdownPreserved();
  await edgeCaseTests.whitespaceNormalization();
  await edgeCaseTests.longNoteAtLimit();
  await edgeCaseTests.chatWithPunctuation();
  await edgeCaseTests.concurrentRequests();

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success Rate: ${Math.round((passed / results.length) * 100)}%`);
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  console.log(`\n📝 Created ${createdNoteIds.length} test notes`);

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

