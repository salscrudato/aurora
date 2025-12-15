/**
 * Test script to evaluate RAG retrieval quality
 *
 * Tests synonym handling, paraphrasing, and semantic similarity
 */

const API_URL = process.env.API_URL || 'https://auroranotes-api-884985856308.us-central1.run.app';

interface TestCase {
  name: string;
  query: string;
  expectedTopics: string[];  // Topics that should be in the response
  shouldFail?: boolean;      // Expected to fail (no relevant content)
}

// Test cases based on existing notes content
const testCases: TestCase[] = [
  // Direct matches (baseline)
  { name: 'Direct: scaling', query: 'What is the scaling strategy?', expectedTopics: ['pagination', 'cursor', 'scaling'] },
  { name: 'Direct: RAG', query: 'How does the RAG pipeline work?', expectedTopics: ['vector', 'keyword', 'hybrid'] },
  { name: 'Direct: Cloud Run', query: 'Why did we choose Cloud Run?', expectedTopics: ['Cloud Run', 'scaling', 'pricing'] },
  { name: 'Direct: chunking', query: 'What is the chunking strategy?', expectedTopics: ['chunk', 'characters', 'sentence'] },
  
  // Synonyms - these should work but may fail
  { name: 'Synonym: growth → scaling', query: 'What is the growth strategy?', expectedTopics: ['pagination', 'scaling'] },
  { name: 'Synonym: retrieval → search', query: 'How does the search system work?', expectedTopics: ['vector', 'keyword', 'hybrid'] },
  { name: 'Synonym: hosting → deployment', query: 'What hosting platform are we using?', expectedTopics: ['Cloud Run'] },
  { name: 'Synonym: splitting → chunking', query: 'How are notes split into pieces?', expectedTopics: ['chunk', 'characters'] },
  { name: 'Synonym: AI chat → RAG', query: 'How does the AI answering system work?', expectedTopics: ['vector', 'sources'] },
  
  // Paraphrases - semantic equivalents
  { name: 'Paraphrase: handle many notes', query: 'How can the system handle millions of notes?', expectedTopics: ['pagination', 'cursor'] },
  { name: 'Paraphrase: find relevant info', query: 'How do you find the right information?', expectedTopics: ['vector', 'retrieval', 'hybrid'] },
  { name: 'Paraphrase: break down text', query: 'How is text broken into smaller parts?', expectedTopics: ['chunk', 'overlap'] },
  
  // Conceptual questions
  { name: 'Concept: architecture', query: 'Describe the system architecture', expectedTopics: ['RAG', 'Cloud Run', 'Firestore'] },
  { name: 'Concept: decisions', query: 'What key decisions were made?', expectedTopics: ['Cloud Run', 'pagination', 'chunk'] },
  
  // Should fail (no relevant content)
  { name: 'No match: voice notes', query: 'Tell me about voice notes', expectedTopics: [], shouldFail: true },
  { name: 'No match: weather', query: 'What is the weather today?', expectedTopics: [], shouldFail: true },
];

interface ChatResponse {
  answer: string;
  citations: Array<{ cid: string; snippet: string; score: number }>;
  meta: { retrieval: { k: number; strategy: string; candidateCount: number } };
}

async function runTest(testCase: TestCase): Promise<{ passed: boolean; details: string }> {
  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: testCase.query }),
    });

    const data = await response.json() as ChatResponse;
    
    const hasNoInfo = data.answer.toLowerCase().includes("don't have") ||
                      data.answer.toLowerCase().includes("don't see") ||
                      data.answer.toLowerCase().includes("no notes about") ||
                      data.answer.toLowerCase().includes("couldn't find notes") ||
                      data.answer.toLowerCase().includes("no information") ||
                      data.citations.length === 0;

    if (testCase.shouldFail) {
      // Expected to fail - should NOT find relevant content
      const passed = hasNoInfo;
      return { 
        passed, 
        details: passed ? 'Correctly found no relevant content' : `Incorrectly found content: ${data.answer.slice(0, 100)}` 
      };
    }

    // Expected to succeed - check if topics are covered
    const answerLower = data.answer.toLowerCase();
    const foundTopics = testCase.expectedTopics.filter(topic =>
      answerLower.includes(topic.toLowerCase())
    );

    // Pass if: found at least one topic OR got citations with helpful response
    const hasCitations = data.citations && data.citations.length > 0;
    const isHelpfulNoMatch = answerLower.includes("don't see") && hasCitations;
    const passed = (foundTopics.length > 0 && !hasNoInfo) || isHelpfulNoMatch;
    const coverage = `${foundTopics.length}/${testCase.expectedTopics.length} topics`;

    return {
      passed,
      details: passed
        ? isHelpfulNoMatch
          ? `Helpful response with ${data.citations.length} citations (acknowledged topic not found)`
          : `Found: ${foundTopics.join(', ')} (${coverage})`
        : `Missing topics. Citations: ${data.citations.length}, Strategy: ${data.meta?.retrieval?.strategy || 'unknown'}`,
    };
  } catch (error) {
    return { passed: false, details: `Error: ${error}` };
  }
}

async function main() {
  console.log('🧪 RAG Retrieval Quality Test\n');
  console.log(`API: ${API_URL}\n`);
  console.log('─'.repeat(80));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = await runTest(testCase);
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${testCase.name}`);
    console.log(`   Query: "${testCase.query}"`);
    console.log(`   Result: ${result.details}`);
    console.log('');

    if (result.passed) passed++;
    else failed++;
  }

  console.log('─'.repeat(80));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${Math.round(passed / testCases.length * 100)}%)\n`);

  // Categorize failures
  const synonymTests = testCases.filter(t => t.name.startsWith('Synonym:'));
  const paraphraseTests = testCases.filter(t => t.name.startsWith('Paraphrase:'));
  
  console.log('Category breakdown:');
  console.log(`  Direct matches: should be ~100%`);
  console.log(`  Synonyms: ${synonymTests.length} tests`);
  console.log(`  Paraphrases: ${paraphraseTests.length} tests`);
}

main().catch(console.error);

