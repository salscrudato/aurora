/** Utility Function Tests - Run: npx tsx --test src/utils.test.ts */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractTermsForIndexing, extractKeywords, sanitizeText, cosineSimilarity } from './utils';

describe('extractTermsForIndexing', () => {
  it('extracts lowercase terms', () => {
    const terms = extractTermsForIndexing('Hello World Test');
    assert.ok(terms.includes('hello') && terms.includes('world') && terms.includes('test'));
  });

  it('filters short terms and stop words', () => {
    const terms = extractTermsForIndexing('I am a test example');
    assert.ok(!terms.includes('i') && !terms.includes('a') && !terms.includes('am'));
    assert.ok(terms.includes('test') && terms.includes('example'));
  });

  it('handles special characters', () => {
    const terms = extractTermsForIndexing('Hello, world! Testing example.');
    assert.ok(['hello', 'world', 'testing', 'example'].every(t => terms.includes(t)));
  });

  it('handles camelCase and snake_case', () => {
    const terms = extractTermsForIndexing('myFunction user_name');
    assert.ok(terms.includes('myfunction') || terms.includes('my') || terms.includes('function'));
    assert.ok(terms.includes('user_name') || terms.includes('user') || terms.includes('name'));
  });

  it('handles edge cases', () => {
    assert.deepStrictEqual(extractTermsForIndexing(''), []);
    assert.strictEqual(extractTermsForIndexing('test test test').filter(t => t === 'test').length, 1);
  });
});

describe('extractKeywords', () => {
  it('extracts meaningful keywords', () => {
    const kw = extractKeywords('what is the project status');
    assert.ok(kw.includes('project') && kw.includes('status'));
  });

  it('filters stop words', () => {
    const kw = extractKeywords('the quick brown fox');
    assert.ok(!kw.includes('the') && ['quick', 'brown', 'fox'].every(w => kw.includes(w)));
  });

  it('handles empty input', () => { assert.deepStrictEqual(extractKeywords(''), []); });
});

describe('sanitizeText', () => {
  it('removes null bytes and trims', () => {
    const r = sanitizeText('hello\x00world');
    assert.ok(!r.includes('\x00') && r.includes('hello') && r.includes('world'));
    assert.strictEqual(sanitizeText('  hello world  '), 'hello world');
  });

  it('handles edge cases', () => {
    assert.strictEqual(sanitizeText(''), '');
    assert.ok(sanitizeText('line1\nline2').includes('\n'));
  });
});

describe('cosineSimilarity', () => {
  it('calculates correct similarity values', () => {
    assert.ok(Math.abs(cosineSimilarity([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]) - 1) < 0.0001); // identical
    assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [0, 1, 0])) < 0.0001); // orthogonal
    assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [-1, 0, 0]) + 1) < 0.0001); // opposite
  });

  it('handles edge cases', () => {
    assert.ok(!isNaN(cosineSimilarity([0, 0, 0], [1, 2, 3]))); // zero vector
    assert.strictEqual(cosineSimilarity([], []), 0); // empty
    assert.strictEqual(cosineSimilarity([1, 2], [1, 2, 3]), 0); // mismatched
  });
});
