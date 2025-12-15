/**
 * AuroraNotes API - Retrieval Evaluation Harness
 * 
 * Measures:
 * - Citation validity (all citations reference real notes)
 * - Retrieval recall (relevant chunks found)
 * - Response latency
 * - Answer quality metrics
 * 
 * Usage: npx ts-node scripts/eval-retrieval.ts [API_URL]
 */

const API_URL = process.argv[2] || process.env.API_URL || 'https://auroranotes-api-884985856308.us-central1.run.app';

interface EvalTestCase {
  name: string;
  query: string;
  expectedTopics: string[];     // Topics that SHOULD appear in response
  forbiddenTopics?: string[];   // Topics that should NOT appear
  requireCitations: boolean;    // Whether citations are required
}

interface EvalResult {
  testName: string;
  query: string;
  passed: boolean;
  latencyMs: number;
  citationCount: number;
  invalidCitations: string[];
  topicsFound: string[];
  topicsMissing: string[];
  forbiddenFound: string[];
  answer: string;
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
];

async function runEvaluation(testCase: EvalTestCase): Promise<EvalResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: testCase.query }),
    });

    const latencyMs = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok) {
      return {
        testName: testCase.name,
        query: testCase.query,
        passed: false,
        latencyMs,
        citationCount: 0,
        invalidCitations: [],
        topicsFound: [],
        topicsMissing: testCase.expectedTopics,
        forbiddenFound: [],
        answer: '',
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
    const validCitationIds = new Set(citations.map((c: { cid: string }) => `[${c.cid}]`));
    const invalidCitations = foundCitationRefs.filter(ref => !validCitationIds.has(ref));

    // Determine pass/fail
    const citationCheck = !testCase.requireCitations || citations.length > 0;
    const topicCheck = testCase.expectedTopics.length === 0 || topicsFound.length > 0;
    const forbiddenCheck = forbiddenFound.length === 0;
    const invalidCheck = invalidCitations.length === 0;

    return {
      testName: testCase.name,
      query: testCase.query,
      passed: citationCheck && topicCheck && forbiddenCheck && invalidCheck,
      latencyMs,
      citationCount: citations.length,
      invalidCitations,
      topicsFound,
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
      invalidCitations: [],
      topicsFound: [],
      topicsMissing: testCase.expectedTopics,
      forbiddenFound: [],
      answer: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
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
    console.log(`   ${status} (${result.latencyMs}ms, ${result.citationCount} citations)`);

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

  console.log(`Tests Passed: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
  console.log(`Avg Latency:  ${avgLatency}ms`);
  console.log(`Total Citations: ${totalCitations}`);

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
    },
    results,
  };

  const reportPath = `eval-report-${Date.now()}.json`;
  require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved: ${reportPath}`);

  // Exit with error code if tests failed
  process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);

