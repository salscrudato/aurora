/**
 * AuroraNotes API - Retrieval Evaluation Harness
 *
 * Measures:
 * - Citation validity rate (all citations reference real notes)
 * - Multi-source coverage for multi-note queries
 * - Retrieval recall (relevant chunks found)
 * - Response latency breakdown
 * - Answer quality metrics
 *
 * Usage: npx ts-node scripts/eval-retrieval.ts [API_URL]
 *
 * Additional commands:
 *   npx ts-node scripts/eval-retrieval.ts --seed 10000  # Generate large dataset
 */

const API_URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : process.env.API_URL || 'https://auroranotes-api-884985856308.us-central1.run.app';

interface EvalTestCase {
  name: string;
  query: string;
  expectedTopics: string[];     // Topics that SHOULD appear in response
  forbiddenTopics?: string[];   // Topics that should NOT appear
  requireCitations: boolean;    // Whether citations are required
  requireMultiSource?: boolean; // Whether multiple notes should be cited
  expectedMinSources?: number;  // Minimum number of unique notes expected
}

interface EvalResult {
  testName: string;
  query: string;
  passed: boolean;
  latencyMs: number;
  citationCount: number;
  uniqueNotesCited: number;
  invalidCitations: string[];
  topicsFound: string[];
  topicsMissing: string[];
  forbiddenFound: string[];
  answer: string;
  citationValidityRate: number;
  error?: string;
}

const TEST_CASES: EvalTestCase[] = [
  {
    name: 'Cloud Run decision',
    query: 'What did we decide about Cloud Run?',
    expectedTopics: ['cloud run', 'scaling', 'docker'],
    requireCitations: true,
  },
  {
    name: 'Chunking specification',
    query: 'What is the chunk size?',
    expectedTopics: ['400', '800', 'character'],
    requireCitations: true,
  },
  {
    name: 'RAG pipeline architecture',
    query: 'How does the retrieval work?',
    expectedTopics: ['hybrid', 'vector', 'keyword'],
    requireCitations: true,
  },
  {
    name: 'Summarization request',
    query: 'Summarize my notes about architecture',
    expectedTopics: [],  // Any answer is fine for summarization
    requireCitations: true,
  },
  {
    name: 'Unknown topic handling',
    query: 'What about quantum computing integration?',
    expectedTopics: [],
    forbiddenTopics: ['quantum', 'qubit'],  // Should not hallucinate
    requireCitations: false,  // May not have citations for unknown topic
  },
  // Multi-source coverage tests
  {
    name: 'Multi-note summary',
    query: 'Give me an overview of all the technical decisions we made',
    expectedTopics: [],
    requireCitations: true,
    requireMultiSource: true,
    expectedMinSources: 2,
  },
  {
    name: 'Cross-topic synthesis',
    query: 'How do the different parts of the system work together?',
    expectedTopics: [],
    requireCitations: true,
    requireMultiSource: true,
    expectedMinSources: 2,
  },
  // Entity/unique-ID queries (tests expanded time window)
  {
    name: 'Historical entity query',
    query: 'What were all the notes ever written about deployment?',
    expectedTopics: [],
    requireCitations: true,
  },
  {
    name: 'Synonym/paraphrase test',
    query: 'How do we handle dividing documents into smaller pieces?',  // Synonym for "chunking"
    expectedTopics: ['chunk', 'split'],
    requireCitations: true,
  },
];

interface ChatResponseData {
  answer?: string;
  citations?: Array<{ cid: string; noteId: string; snippet: string; score: number }>;
}

async function runEvaluation(testCase: EvalTestCase): Promise<EvalResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: testCase.query }),
    });

    const latencyMs = Date.now() - startTime;
    const data = await response.json() as ChatResponseData;

    if (!response.ok) {
      return {
        testName: testCase.name,
        query: testCase.query,
        passed: false,
        latencyMs,
        citationCount: 0,
        uniqueNotesCited: 0,
        invalidCitations: [],
        topicsFound: [],
        topicsMissing: testCase.expectedTopics,
        forbiddenFound: [],
        answer: '',
        citationValidityRate: 0,
        error: `HTTP ${response.status}: ${JSON.stringify(data)}`,
      };
    }

    const answer = (data.answer || '').toLowerCase();
    const citations = data.citations || [];

    // Check for topics
    const topicsFound = testCase.expectedTopics.filter(topic =>
      answer.includes(topic.toLowerCase())
    );
    const topicsMissing = testCase.expectedTopics.filter(topic =>
      !answer.includes(topic.toLowerCase())
    );

    // Check for forbidden topics
    const forbiddenFound = (testCase.forbiddenTopics || []).filter(topic =>
      answer.includes(topic.toLowerCase())
    );

    // Validate citations
    const citationPattern = /\[N\d+\]/g;
    const foundCitationRefs = answer.match(citationPattern) || [];
    const validCitationIds = new Set(citations.map((c) => `[${c.cid}]`));
    const invalidCitations = foundCitationRefs.filter((ref: string) => !validCitationIds.has(ref));

    // Calculate citation validity rate
    const citationValidityRate = foundCitationRefs.length > 0
      ? (foundCitationRefs.length - invalidCitations.length) / foundCitationRefs.length
      : 1.0;

    // Count unique notes cited (for multi-source coverage)
    const uniqueNoteIds = new Set(citations.map(c => c.noteId));
    const uniqueNotesCited = uniqueNoteIds.size;

    // Determine pass/fail
    const citationCheck = !testCase.requireCitations || citations.length > 0;
    const topicCheck = testCase.expectedTopics.length === 0 || topicsFound.length > 0;
    const forbiddenCheck = forbiddenFound.length === 0;
    const invalidCheck = invalidCitations.length === 0;

    // Multi-source check
    const multiSourceCheck = !testCase.requireMultiSource ||
      uniqueNotesCited >= (testCase.expectedMinSources || 2);

    return {
      testName: testCase.name,
      query: testCase.query,
      passed: citationCheck && topicCheck && forbiddenCheck && invalidCheck && multiSourceCheck,
      latencyMs,
      citationCount: citations.length,
      uniqueNotesCited,
      invalidCitations,
      topicsFound,
      citationValidityRate,
      topicsMissing,
      forbiddenFound,
      answer: data.answer?.slice(0, 200) || '',
    };
  } catch (err) {
    return {
      testName: testCase.name,
      query: testCase.query,
      passed: false,
      latencyMs: Date.now() - startTime,
      citationCount: 0,
      uniqueNotesCited: 0,
      invalidCitations: [],
      topicsFound: [],
      topicsMissing: testCase.expectedTopics,
      forbiddenFound: [],
      answer: '',
      citationValidityRate: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  // Check for seed command
  const seedIdx = process.argv.indexOf('--seed');
  if (seedIdx !== -1) {
    const count = parseInt(process.argv[seedIdx + 1] || '10000');
    await seedLargeDataset(count);
    return;
  }

  console.log('🧪 AuroraNotes Retrieval Evaluation\n');
  console.log(`API: ${API_URL}\n`);
  console.log('─'.repeat(80));

  const results: EvalResult[] = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n📝 ${testCase.name}`);
    console.log(`   Query: "${testCase.query}"`);

    const result = await runEvaluation(testCase);
    results.push(result);

    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const multiNote = result.uniqueNotesCited > 1 ? ` [${result.uniqueNotesCited} notes]` : '';
    console.log(`   ${status} (${result.latencyMs}ms, ${result.citationCount} citations${multiNote})`);

    if (!result.passed) {
      if (result.error) console.log(`   Error: ${result.error}`);
      if (result.topicsMissing.length > 0) console.log(`   Missing: ${result.topicsMissing.join(', ')}`);
      if (result.forbiddenFound.length > 0) console.log(`   Forbidden found: ${result.forbiddenFound.join(', ')}`);
      if (result.invalidCitations.length > 0) console.log(`   Invalid citations: ${result.invalidCitations.join(', ')}`);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('📊 EVALUATION SUMMARY\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const avgLatency = Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / total);
  const totalCitations = results.reduce((sum, r) => sum + r.citationCount, 0);
  const totalInvalidCitations = results.reduce((sum, r) => sum + r.invalidCitations.length, 0);
  const avgValidityRate = results.reduce((sum, r) => sum + r.citationValidityRate, 0) / total;
  const avgUniqueNotes = results.reduce((sum, r) => sum + r.uniqueNotesCited, 0) / total;

  console.log(`Tests Passed:           ${passed}/${total} (${Math.round(passed/total*100)}%)`);
  console.log(`Avg Latency:            ${avgLatency}ms`);
  console.log(`Total Citations:        ${totalCitations}`);
  console.log(`Invalid Citations:      ${totalInvalidCitations}`);
  console.log(`Avg Citation Validity:  ${Math.round(avgValidityRate * 100)}%`);
  console.log(`Avg Unique Notes/Query: ${avgUniqueNotes.toFixed(1)}`);

  // Multi-source coverage for multi-note tests
  const multiSourceTests = results.filter(r => {
    const tc = TEST_CASES.find(t => t.name === r.testName);
    return tc?.requireMultiSource;
  });
  if (multiSourceTests.length > 0) {
    const multiSourcePass = multiSourceTests.filter(r => r.uniqueNotesCited >= 2).length;
    console.log(`Multi-Source Coverage:  ${multiSourcePass}/${multiSourceTests.length} tests cite 2+ notes`);
  }

  // Output JSON report
  const report = {
    timestamp: new Date().toISOString(),
    apiUrl: API_URL,
    summary: {
      passed,
      total,
      passRate: Math.round(passed/total*100),
      avgLatencyMs: avgLatency,
      totalCitations,
      invalidCitations: totalInvalidCitations,
      avgCitationValidityRate: Math.round(avgValidityRate * 100),
      avgUniqueNotesPerQuery: Math.round(avgUniqueNotes * 10) / 10,
    },
    results,
  };

  const reportPath = `eval-report-${Date.now()}.json`;
  require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved: ${reportPath}`);

  // Exit with error code if tests failed
  process.exit(passed === total ? 0 : 1);
}

/**
 * Generate a large dataset for scale testing
 * Creates notes with diverse topics for testing retrieval at scale
 */
async function seedLargeDataset(chunkCount: number): Promise<void> {
  console.log(`🌱 Generating ${chunkCount} chunk dataset seed...\n`);

  const topics = [
    'project management', 'software architecture', 'database design',
    'api development', 'cloud infrastructure', 'security practices',
    'performance optimization', 'testing strategies', 'deployment pipelines',
    'monitoring', 'logging', 'error handling', 'user authentication',
    'data modeling', 'caching strategies', 'microservices', 'containers'
  ];

  const notes: { text: string; topic: string }[] = [];
  const notesPerTopic = Math.ceil(chunkCount / topics.length / 3); // ~3 chunks per note

  for (const topic of topics) {
    for (let i = 0; i < notesPerTopic; i++) {
      const paragraphs = 3 + Math.floor(Math.random() * 3);
      const text = Array.from({ length: paragraphs }, (_, j) =>
        `Paragraph ${j + 1} about ${topic}: ` +
        `This is detailed content about ${topic} implementation note ${i + 1}. ` +
        `We discuss various aspects of ${topic} including best practices and considerations. ` +
        `The ${topic} approach we're taking involves multiple steps and careful planning. ` +
        `Key considerations for ${topic} include scalability, maintainability, and performance.`
      ).join('\n\n');

      notes.push({ text, topic });
    }
  }

  console.log(`Generated ${notes.length} notes covering ${topics.length} topics`);
  console.log(`Estimated chunks: ~${notes.length * 3}`);

  // Write seed data to file
  const seedPath = `seed-data-${chunkCount}.json`;
  require('fs').writeFileSync(seedPath, JSON.stringify(notes, null, 2));
  console.log(`\n📄 Seed data saved: ${seedPath}`);
  console.log('\nTo load into API, POST each note to /notes endpoint:');
  console.log(`  cat ${seedPath} | jq -c '.[]' | while read note; do curl -X POST -H 'Content-Type: application/json' -d "\$note" ${API_URL}/notes; done`);
}

main().catch(console.error);

