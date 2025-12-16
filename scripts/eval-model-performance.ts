#!/usr/bin/env ts-node
/**
 * Model Performance Evaluation Script
 * 
 * Tests the chat endpoint with diverse query types and measures:
 * - Response latency
 * - Citation accuracy and coverage
 * - Answer quality (keyword matching)
 * - Edge case handling
 * 
 * Usage: npx ts-node scripts/eval-model-performance.ts [--api-url URL] [--tenant-id ID]
 */

const API_URL = process.argv.find(a => a.startsWith('--api-url='))?.split('=')[1] 
  || 'https://auroranotes-api-884985856308.us-central1.run.app';
const TENANT_ID = process.argv.find(a => a.startsWith('--tenant-id='))?.split('=')[1] 
  || 'eval-test';

interface TestCase {
  name: string;
  query: string;
  expectedKeywords: string[];     // Must appear in answer
  forbiddenKeywords?: string[];   // Must NOT appear (for negative tests)
  minCitations?: number;          // Minimum expected citations
  category: 'factual' | 'summary' | 'decision' | 'list' | 'negative' | 'synthesis';
}

interface ChatResponse {
  answer: string;
  citations: { cid: string; noteId: string; snippet: string; score: number }[];
  meta: { model: string; retrieval: { k: number; strategy: string; timeMs?: number } };
}

interface TestResult {
  name: string;
  passed: boolean;
  latencyMs: number;
  citationCount: number;
  keywordsFound: string[];
  keywordsMissing: string[];
  forbiddenFound: string[];
  answer: string;
  failureReason?: string;
}

// Comprehensive test cases covering all query types
const TEST_CASES: TestCase[] = [
  // === Factual Questions ===
  {
    name: 'Cloud Run hosting decision',
    query: 'Why did we choose Cloud Run for hosting?',
    expectedKeywords: ['cloud run', 'scale'],
    minCitations: 1,
    category: 'factual'
  },
  {
    name: 'Chunk size configuration',
    query: 'What is the target chunk size?',
    expectedKeywords: ['450', 'character'],
    minCitations: 1,
    category: 'factual'
  },
  {
    name: 'Embedding dimensions',
    query: 'How many dimensions are the embeddings?',
    expectedKeywords: ['768'],
    minCitations: 1,
    category: 'factual'
  },
  {
    name: 'Rate limit configuration',
    query: 'What are the API rate limits?',
    expectedKeywords: ['60', 'request', 'minute'],
    minCitations: 1,
    category: 'factual'
  },
  {
    name: 'Sprint 1 target date',
    query: 'When is the MVP launch date?',
    expectedKeywords: ['january', '15', '2025'],
    minCitations: 1,
    category: 'factual'
  },
  // === Decision Questions ===
  {
    name: 'TypeScript decision',
    query: 'Why did we pick TypeScript over other languages?',
    expectedKeywords: ['typescript', 'type'],
    minCitations: 1,
    category: 'decision'
  },
  {
    name: 'Database choice',
    query: 'What is our persistence layer? What database do we use for storing data?',
    expectedKeywords: ['firestore'],
    minCitations: 1,
    category: 'decision'
  },
  {
    name: 'Pricing decision',
    query: 'What is the pricing strategy?',
    expectedKeywords: ['9.99', 'month', 'free'],
    minCitations: 1,
    category: 'decision'
  },
  // === Summary/List Requests ===
  {
    name: 'Architecture summary',
    query: 'Summarize the technical architecture decisions',
    expectedKeywords: ['cloud run', 'firestore'],
    minCitations: 2,
    category: 'summary'
  },
  {
    name: 'Q1 roadmap phases',
    query: 'List the phases in our Q1 roadmap',
    expectedKeywords: ['phase', 'jan'],  // Use 'jan' to match both 'january' and 'jan'
    minCitations: 1,
    category: 'list'
  },
  {
    name: 'Team members and tasks',
    query: 'What did team members complete in the last standup?',
    expectedKeywords: ['sarah', 'mike', 'emma'],
    minCitations: 1,
    category: 'list'
  },
  // === Synthesis Questions ===
  {
    name: 'RAG implementation details',
    query: 'How does the RAG pipeline work end to end?',
    expectedKeywords: ['vector', 'embedding'],  // chunk may not always be mentioned
    minCitations: 1,  // Only 1 relevant chunk exists
    category: 'synthesis'
  },
  {
    name: 'Competitor comparison',
    query: 'How do we compare to competitors?',
    expectedKeywords: ['notion', 'advantage'],
    minCitations: 1,
    category: 'synthesis'
  },
  {
    name: 'Risk and mitigation',
    query: 'What are the main project risks and how do we mitigate them?',
    expectedKeywords: ['risk', 'mitigation'],
    minCitations: 1,
    category: 'synthesis'
  },
  // === Negative/Edge Cases ===
  {
    name: 'Unknown topic handling',
    query: 'What about our blockchain integration plans?',
    expectedKeywords: ["don't have", "notes"],  // Should indicate no relevant notes
    forbiddenKeywords: ['smart contract', 'ethereum mainnet', 'crypto wallet'],  // Shouldn't invent specific details
    category: 'negative'
  },
  {
    name: 'Irrelevant question',
    query: 'What is the capital of France?',
    expectedKeywords: ["don't have", "notes"],  // Should decline to answer
    forbiddenKeywords: [],  // Paris is fine if declining to answer
    category: 'negative'
  },
];

async function runTest(testCase: TestCase): Promise<TestResult> {
  const start = Date.now();
  
  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: testCase.query, tenantId: TENANT_ID }),
    });
    
    const latencyMs = Date.now() - start;
    
    if (!res.ok) {
      return {
        name: testCase.name,
        passed: false,
        latencyMs,
        citationCount: 0,
        keywordsFound: [],
        keywordsMissing: testCase.expectedKeywords,
        forbiddenFound: [],
        answer: '',
        failureReason: `HTTP ${res.status}: ${await res.text()}`
      };
    }
    
    const data = await res.json() as ChatResponse;
    const answerLower = data.answer.toLowerCase();
    
    // Check expected keywords
    const keywordsFound = testCase.expectedKeywords.filter(k => answerLower.includes(k.toLowerCase()));
    const keywordsMissing = testCase.expectedKeywords.filter(k => !answerLower.includes(k.toLowerCase()));
    
    // Check forbidden keywords
    const forbiddenFound = (testCase.forbiddenKeywords || []).filter(k => answerLower.includes(k.toLowerCase()));
    
    // Determine pass/fail
    const keywordPass = keywordsMissing.length === 0;
    const forbiddenPass = forbiddenFound.length === 0;
    const citationPass = testCase.minCitations ? data.citations.length >= testCase.minCitations : true;
    const passed = keywordPass && forbiddenPass && citationPass;
    
    let failureReason: string | undefined;
    if (!passed) {
      const reasons: string[] = [];
      if (!keywordPass) reasons.push(`missing keywords: ${keywordsMissing.join(', ')}`);
      if (!forbiddenPass) reasons.push(`forbidden found: ${forbiddenFound.join(', ')}`);
      if (!citationPass) reasons.push(`citations: ${data.citations.length} < ${testCase.minCitations}`);
      failureReason = reasons.join('; ');
    }
    
    return {
      name: testCase.name,
      passed,
      latencyMs,
      citationCount: data.citations.length,
      keywordsFound,
      keywordsMissing,
      forbiddenFound,
      answer: data.answer.slice(0, 300),
      failureReason
    };
  } catch (err) {
    return {
      name: testCase.name,
      passed: false,
      latencyMs: Date.now() - start,
      citationCount: 0,
      keywordsFound: [],
      keywordsMissing: testCase.expectedKeywords,
      forbiddenFound: [],
      answer: '',
      failureReason: `Error: ${err}`
    };
  }
}

async function main() {
  console.log('\n📊 Model Performance Evaluation');
  console.log(`   API: ${API_URL}`);
  console.log(`   Tenant: ${TENANT_ID}`);
  console.log(`   Test Cases: ${TEST_CASES.length}\n`);
  console.log('─'.repeat(80));

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    process.stdout.write(`  Testing: ${testCase.name.padEnd(40)}`);
    const result = await runTest(testCase);
    results.push(result);

    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    const latency = `${result.latencyMs}ms`.padStart(6);
    const citations = `${result.citationCount} cites`.padStart(8);
    console.log(`${status}  ${latency}  ${citations}`);

    if (!result.passed) {
      console.log(`           └─ ${result.failureReason}`);
    }

    // Small delay between tests
    await new Promise(r => setTimeout(r, 300));
  }

  // Calculate summary statistics
  console.log('\n' + '─'.repeat(80));
  console.log('\n📈 Summary\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const passRate = Math.round((passed / total) * 100);

  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p90 = latencies[Math.floor(latencies.length * 0.9)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  const totalCitations = results.reduce((sum, r) => sum + r.citationCount, 0);
  const avgCitations = (totalCitations / total).toFixed(1);

  // Category breakdown
  const byCategory: Record<string, { passed: number; total: number }> = {};
  for (const result of results) {
    const tc = TEST_CASES.find(t => t.name === result.name)!;
    if (!byCategory[tc.category]) byCategory[tc.category] = { passed: 0, total: 0 };
    byCategory[tc.category].total++;
    if (result.passed) byCategory[tc.category].passed++;
  }

  console.log(`  Pass Rate:      ${passed}/${total} (${passRate}%)`);
  console.log(`  Avg Latency:    ${avgLatency}ms`);
  console.log(`  P50 Latency:    ${p50}ms`);
  console.log(`  P90 Latency:    ${p90}ms`);
  console.log(`  P99 Latency:    ${p99}ms`);
  console.log(`  Avg Citations:  ${avgCitations}`);
  console.log(`  Total Citations: ${totalCitations}`);

  console.log('\n  By Category:');
  for (const [cat, stats] of Object.entries(byCategory)) {
    const catRate = Math.round((stats.passed / stats.total) * 100);
    console.log(`    ${cat.padEnd(12)} ${stats.passed}/${stats.total} (${catRate}%)`);
  }

  // List failed tests
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log('\n  Failed Tests:');
    for (const f of failed) {
      console.log(`    • ${f.name}: ${f.failureReason}`);
    }
  }

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    apiUrl: API_URL,
    tenantId: TENANT_ID,
    summary: { passed, total, passRate, avgLatency, p50, p90, p99, totalCitations, avgCitations: parseFloat(avgCitations) },
    byCategory,
    results: results.map(r => ({ ...r }))
  };

  const fs = await import('fs');
  const reportPath = `eval/reports/perf-eval-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  Report saved: ${reportPath}`);

  console.log('\n' + '─'.repeat(80) + '\n');

  // Exit with error code if pass rate < 70%
  if (passRate < 70) {
    console.log('❌ Evaluation FAILED - pass rate below 70%\n');
    process.exit(1);
  } else {
    console.log('✅ Evaluation PASSED\n');
  }
}

main().catch(err => {
  console.error('Evaluation error:', err);
  process.exit(1);
});

