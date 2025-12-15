/**
 * Citation Integration Test
 * 
 * Creates stubbed notes, queries the chat endpoint, and verifies
 * that responses correctly cite the newly created notes.
 */

const API_BASE = process.env.API_BASE || 'https://auroranotes-api-884985856308.us-central1.run.app';

interface NoteResponse {
  id: string;
  text: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

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
      intent?: string;
      timeMs?: number;
    };
  };
}

// Unique test identifier to avoid collisions
const TEST_ID = `TEST_${Date.now()}`;

// Stubbed notes with specific, unique content for testing
const STUB_NOTES = [
  {
    text: `${TEST_ID}: Project Aurora uses React Native for mobile development. The team decided on TypeScript for type safety. Launch date is set for Q2 2025.`,
    expectedKeywords: ['Aurora', 'React Native', 'TypeScript', 'Q2 2025']
  },
  {
    text: `${TEST_ID}: Budget meeting outcome - allocated $50,000 for cloud infrastructure. AWS was chosen over GCP due to existing expertise. Monthly spend cap is $4,000.`,
    expectedKeywords: ['$50,000', 'AWS', 'cloud', 'budget']
  },
  {
    text: `${TEST_ID}: Customer feedback session notes - users requested dark mode (85% approval), offline sync (72% approval), and faster search (91% approval). Priority: search > dark mode > offline.`,
    expectedKeywords: ['dark mode', 'offline', 'search', 'customer feedback']
  },
  {
    text: `${TEST_ID}: Security audit completed on Dec 14. Found 3 critical issues: SQL injection in search, missing rate limiting, exposed API keys. All issues must be fixed before launch.`,
    expectedKeywords: ['security', 'SQL injection', 'rate limiting', 'critical']
  },
  // Additional notes for multi-source citation testing
  {
    text: `${TEST_ID}: Project Aurora architecture - using PostgreSQL for database, Redis for caching, and Docker for containerization. The API is built with Node.js and Express.`,
    expectedKeywords: ['PostgreSQL', 'Redis', 'Docker', 'Node.js']
  },
  {
    text: `${TEST_ID}: Project Aurora performance targets - API response time under 200ms, 99.9% uptime SLA, support for 10,000 concurrent users.`,
    expectedKeywords: ['200ms', '99.9%', '10,000', 'performance']
  }
];

// Test queries that should match our stub notes
const TEST_QUERIES = [
  {
    message: `What technology stack is being used for Project Aurora? ${TEST_ID}`,
    shouldMatch: ['React Native', 'TypeScript'],
    noteIndex: 0,
    testType: 'single-source'
  },
  {
    message: `What was the budget decision for cloud infrastructure? ${TEST_ID}`,
    shouldMatch: ['$50,000', 'AWS'],
    noteIndex: 1,
    testType: 'single-source'
  },
  {
    message: `What features did customers request? ${TEST_ID}`,
    shouldMatch: ['dark mode', 'search', 'offline'],
    noteIndex: 2,
    testType: 'single-source'
  },
  {
    message: `What security issues were found in the audit? ${TEST_ID}`,
    shouldMatch: ['SQL injection', 'rate limiting'],
    noteIndex: 3,
    testType: 'single-source'
  },
  // Multi-source citation tests
  {
    message: `Tell me everything about Project Aurora including technology, architecture, and performance. ${TEST_ID}`,
    shouldMatch: ['React Native', 'PostgreSQL', '200ms'],
    noteIndex: -1, // Multiple notes expected
    testType: 'multi-source',
    minCitations: 3
  },
  {
    message: `Summarize all the technical decisions made for Project Aurora. ${TEST_ID}`,
    shouldMatch: ['TypeScript', 'AWS', 'Docker'],
    noteIndex: -1,
    testType: 'multi-source',
    minCitations: 2
  }
];

async function createNote(text: string): Promise<NoteResponse> {
  const response = await fetch(`${API_BASE}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error(`Failed to create note: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<NoteResponse>;
}

async function chat(message: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });

  if (!response.ok) {
    throw new Error(`Chat failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<ChatResponse>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests(): Promise<void> {
  console.log('🧪 Citation Integration Test');
  console.log('============================');
  console.log(`API: ${API_BASE}`);
  console.log(`Test ID: ${TEST_ID}\n`);

  // Step 1: Create stub notes
  console.log('📝 Step 1: Creating stub notes...\n');
  const createdNotes: NoteResponse[] = [];
  
  for (let i = 0; i < STUB_NOTES.length; i++) {
    const stub = STUB_NOTES[i];
    console.log(`  Creating note ${i + 1}/${STUB_NOTES.length}...`);
    const note = await createNote(stub.text);
    createdNotes.push(note);
    console.log(`  ✅ Created: ${note.id}`);
    console.log(`     Preview: "${stub.text.slice(0, 60)}..."\n`);
  }

  // Step 2: Wait for embeddings to be generated
  console.log('⏳ Step 2: Waiting for embeddings to be generated (5s)...\n');
  await sleep(5000);

  // Step 3: Test queries and verify citations
  console.log('🔍 Step 3: Testing chat queries and citations...\n');
  
  let passed = 0;
  let failed = 0;
  const results: { query: string; passed: boolean; details: string }[] = [];

  for (const test of TEST_QUERIES) {
    const testType = (test as any).testType || 'single-source';
    console.log(`  Query [${testType}]: "${test.message.slice(0, 50)}..."`);

    try {
      const response = await chat(test.message);

      // Check if expected keywords appear in answer or citations
      const answerLower = response.answer.toLowerCase();
      const snippetsLower = response.citations.map(c => c.snippet.toLowerCase()).join(' ');
      const combinedText = answerLower + ' ' + snippetsLower;

      const foundKeywords = test.shouldMatch.filter(kw =>
        combinedText.includes(kw.toLowerCase())
      );
      const keywordsFound = foundKeywords.length >= Math.ceil(test.shouldMatch.length / 2);

      // Check if citations are properly formatted in answer
      const hasCitationRefs = /\[N\d+\]/.test(response.answer);

      let testPassed: boolean;
      let noteCheckDetails: string;

      if (testType === 'multi-source') {
        // For multi-source tests, check citation count and keyword coverage
        const minCitations = (test as any).minCitations || 2;
        const hasSufficientCitations = response.citations.length >= minCitations;
        testPassed = hasSufficientCitations && keywordsFound && hasCitationRefs;
        noteCheckDetails = `Citations: ${response.citations.length} (min: ${minCitations})`;
      } else {
        // For single-source tests, check specific note was cited
        const expectedNoteId = createdNotes[test.noteIndex].id;
        const citedNoteIds = response.citations.map(c => c.noteId);
        const noteWasCited = citedNoteIds.includes(expectedNoteId);
        testPassed = noteWasCited && keywordsFound && (response.citations.length === 0 || hasCitationRefs);
        noteCheckDetails = `Note cited: ${noteWasCited ? 'Yes' : 'No'}`;
      }

      if (testPassed) {
        passed++;
        console.log(`  ✅ PASSED`);
        console.log(`     - ${noteCheckDetails}`);
        console.log(`     - Keywords found: ${foundKeywords.join(', ')}`);
        console.log(`     - Citations in answer: ${hasCitationRefs ? 'Yes' : 'No'} (${response.citations.length} total)`);
      } else {
        failed++;
        console.log(`  ❌ FAILED`);
        console.log(`     - ${noteCheckDetails}`);
        console.log(`     - Keywords found: ${foundKeywords.length}/${test.shouldMatch.length}`);
        console.log(`     - Citations: ${response.citations.length}`);
        console.log(`     - Answer: "${response.answer.slice(0, 100)}..."`);
      }

      console.log(`     - Retrieval time: ${response.meta.retrieval.timeMs}ms`);
      console.log(`     - Intent: ${response.meta.retrieval.intent || 'unknown'}\n`);
      
      results.push({
        query: test.message,
        passed: testPassed,
        details: `Note cited: ${noteWasCited}, Keywords: ${foundKeywords.length}/${test.shouldMatch.length}`
      });
      
    } catch (err) {
      failed++;
      console.log(`  ❌ ERROR: ${err instanceof Error ? err.message : err}\n`);
      results.push({
        query: test.message,
        passed: false,
        details: `Error: ${err instanceof Error ? err.message : err}`
      });
    }
    
    // Small delay between requests
    await sleep(500);
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('===============');
  console.log(`Total: ${TEST_QUERIES.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success Rate: ${Math.round((passed / TEST_QUERIES.length) * 100)}%`);
  
  console.log('\n📝 Created Note IDs (for cleanup):');
  createdNotes.forEach(n => console.log(`  - ${n.id}`));
  
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. This may indicate:');
    console.log('   - Embeddings not yet generated (try increasing wait time)');
    console.log('   - Retrieval scoring not matching expected notes');
    console.log('   - Citation extraction issues');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! Citations are working correctly.');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

