/**
 * Utility Function Tests
 *
 * Tests for core utility functions used across the codebase.
 * Run with: npx ts-node --test src/utils.test.ts
 * Or: node --experimental-strip-types --test src/utils.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractTermsForIndexing,
  extractKeywords,
  sanitizeText,
  cosineSimilarity,
} from './utils';

describe('extractTermsForIndexing', () => {
  it('extracts lowercase terms from text', () => {
    const terms = extractTermsForIndexing('Hello World Test');
    assert.ok(terms.includes('hello'), 'Should include hello');
    assert.ok(terms.includes('world'), 'Should include world');
    assert.ok(terms.includes('test'), 'Should include test');
  });

  it('filters out short terms and stop words', () => {
    const terms = extractTermsForIndexing('I am a test example');
    assert.ok(!terms.includes('i'), 'Should not include single char');
    assert.ok(!terms.includes('a'), 'Should not include single char');
    assert.ok(!terms.includes('am'), 'Should filter stop word "am"');
    assert.ok(terms.includes('test'), 'Should include longer word');
    assert.ok(terms.includes('example'), 'Should include non-stop word');
  });

  it('handles special characters and punctuation', () => {
    const terms = extractTermsForIndexing('Hello, world! Testing example.');
    assert.ok(terms.includes('hello'), 'Should extract hello without comma');
    assert.ok(terms.includes('world'), 'Should extract world without exclamation');
    assert.ok(terms.includes('testing'), 'Should extract testing');
    assert.ok(terms.includes('example'), 'Should extract example');
  });

  it('handles camelCase and snake_case', () => {
    const terms = extractTermsForIndexing('myFunction user_name');
    assert.ok(terms.includes('myfunction') || terms.includes('my') || terms.includes('function'),
      'Should handle camelCase');
    assert.ok(terms.includes('user_name') || terms.includes('user') || terms.includes('name'),
      'Should handle snake_case');
  });

  it('returns empty array for empty input', () => {
    const terms = extractTermsForIndexing('');
    assert.deepStrictEqual(terms, []);
  });

  it('deduplicates terms', () => {
    const terms = extractTermsForIndexing('test test test');
    const testCount = terms.filter(t => t === 'test').length;
    assert.strictEqual(testCount, 1, 'Should only have one instance of test');
  });
});

describe('extractKeywords', () => {
  it('extracts meaningful keywords from query', () => {
    const keywords = extractKeywords('what is the project status');
    assert.ok(keywords.includes('project'), 'Should include project');
    assert.ok(keywords.includes('status'), 'Should include status');
  });

  it('filters common stop words', () => {
    const keywords = extractKeywords('the quick brown fox');
    assert.ok(!keywords.includes('the'), 'Should filter "the"');
    assert.ok(keywords.includes('quick'), 'Should include quick');
    assert.ok(keywords.includes('brown'), 'Should include brown');
    assert.ok(keywords.includes('fox'), 'Should include fox');
  });

  it('handles empty input', () => {
    const keywords = extractKeywords('');
    assert.deepStrictEqual(keywords, []);
  });
});

describe('sanitizeText', () => {
  it('removes null bytes', () => {
    const result = sanitizeText('hello\x00world');
    assert.ok(!result.includes('\x00'), 'Should remove null bytes');
    assert.ok(result.includes('hello'), 'Should preserve text');
    assert.ok(result.includes('world'), 'Should preserve text');
  });

  it('trims whitespace', () => {
    const result = sanitizeText('  hello world  ');
    assert.strictEqual(result, 'hello world');
  });

  it('handles empty input', () => {
    const result = sanitizeText('');
    assert.strictEqual(result, '');
  });

  it('preserves newlines', () => {
    const result = sanitizeText('line1\nline2');
    assert.ok(result.includes('\n'), 'Should preserve newlines');
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const vec = [1, 2, 3, 4, 5];
    const similarity = cosineSimilarity(vec, vec);
    assert.ok(Math.abs(similarity - 1) < 0.0001, 'Should be approximately 1');
  });

  it('returns 0 for orthogonal vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [0, 1, 0];
    const similarity = cosineSimilarity(vec1, vec2);
    assert.ok(Math.abs(similarity) < 0.0001, 'Should be approximately 0');
  });

  it('returns -1 for opposite vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [-1, 0, 0];
    const similarity = cosineSimilarity(vec1, vec2);
    assert.ok(Math.abs(similarity + 1) < 0.0001, 'Should be approximately -1');
  });

  it('handles zero vectors gracefully', () => {
    const vec1 = [0, 0, 0];
    const vec2 = [1, 2, 3];
    const similarity = cosineSimilarity(vec1, vec2);
    assert.ok(!isNaN(similarity), 'Should not return NaN');
  });

  it('returns 0 for empty vectors', () => {
    const similarity = cosineSimilarity([], []);
    assert.strictEqual(similarity, 0);
  });

  it('returns 0 for mismatched vector lengths', () => {
    const similarity = cosineSimilarity([1, 2], [1, 2, 3]);
    assert.strictEqual(similarity, 0);
  });
});

