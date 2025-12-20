/**
 * Citation Validator Tests
 * 
 * Tests for citation formatting preservation and validation.
 * Run with: npx ts-node --test src/citationValidator.test.ts
 * Or: node --experimental-strip-types --test src/citationValidator.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  cleanCitationFormatting,
  removeInvalidCitations,
  parseCitationTokens,
  getOrderedUniqueCitations,
} from './citationValidator';

describe('cleanCitationFormatting', () => {
  it('preserves newlines in multi-line answers', () => {
    const input = `Here are the key points:\n\n• Point one [N1]\n• Point two [N2]\n• Point three [N3]`;
    const result = cleanCitationFormatting(input);
    
    assert.ok(result.includes('\n'), 'Should preserve newlines');
    assert.ok(result.includes('• Point one'), 'Should preserve bullet points');
    assert.ok(result.includes('• Point two'), 'Should preserve second bullet');
  });

  it('preserves bulleted list formatting', () => {
    const input = `Summary:\n\n- Item A [N1]\n- Item B [N2]\n- Item C [N3]`;
    const result = cleanCitationFormatting(input);
    
    const lines = result.split('\n');
    assert.ok(lines.length >= 4, `Should have multiple lines, got ${lines.length}`);
    assert.ok(result.includes('- Item A'), 'Should preserve first list item');
    assert.ok(result.includes('- Item B'), 'Should preserve second list item');
  });

  it('removes duplicate adjacent citations', () => {
    const input = `The project uses React [N1][N1] and Node [N2].`;
    const result = cleanCitationFormatting(input);
    
    assert.strictEqual(result, 'The project uses React [N1] and Node [N2].');
  });

  it('fixes citation spacing before punctuation', () => {
    const input = `The budget is $50,000 [N1] .`;
    const result = cleanCitationFormatting(input);
    
    assert.ok(!result.includes('[N1] .'), 'Should not have space before period');
    assert.ok(result.includes('[N1].'), 'Should have citation immediately before period');
  });

  it('collapses multiple spaces without affecting newlines', () => {
    const input = `First  paragraph [N1].\n\nSecond   paragraph [N2].`;
    const result = cleanCitationFormatting(input);
    
    assert.ok(!result.includes('  '), 'Should not have double spaces');
    assert.ok(result.includes('\n\n'), 'Should preserve paragraph break');
  });

  it('removes empty brackets', () => {
    const input = `Some text [] and more [  ] text [N1].`;
    const result = cleanCitationFormatting(input);
    
    assert.ok(!result.includes('[]'), 'Should remove empty brackets');
    assert.ok(!result.includes('[  ]'), 'Should remove brackets with spaces');
  });
});

describe('removeInvalidCitations', () => {
  it('preserves newlines when removing invalid citations', () => {
    const input = `First point [N1]\n\nSecond point [N99]\n\nThird point [N2]`;
    const validCids = new Set(['N1', 'N2']);
    
    const { cleaned, removed } = removeInvalidCitations(input, validCids);
    
    assert.ok(cleaned.includes('\n'), 'Should preserve newlines');
    assert.deepStrictEqual(removed, ['N99']);
  });

  it('preserves list structure when removing citations', () => {
    const input = `• Item one [N1]\n• Item two [N99]\n• Item three [N2]`;
    const validCids = new Set(['N1', 'N2']);
    
    const { cleaned, removed } = removeInvalidCitations(input, validCids);
    
    assert.ok(cleaned.includes('• Item one'), 'Should preserve first bullet');
    assert.ok(cleaned.includes('• Item two'), 'Should preserve second bullet');
    assert.ok(cleaned.includes('• Item three'), 'Should preserve third bullet');
    assert.ok(cleaned.includes('\n'), 'Should preserve newlines between items');
  });

  it('removes invalid citations and tracks them', () => {
    const input = `Text [N1] more [N5] and [N2] final [N99].`;
    const validCids = new Set(['N1', 'N2']);
    
    const { cleaned, removed } = removeInvalidCitations(input, validCids);
    
    assert.ok(cleaned.includes('[N1]'), 'Should keep valid N1');
    assert.ok(cleaned.includes('[N2]'), 'Should keep valid N2');
    assert.ok(!cleaned.includes('[N5]'), 'Should remove invalid N5');
    assert.ok(!cleaned.includes('[N99]'), 'Should remove invalid N99');
    assert.deepStrictEqual(removed.sort(), ['N5', 'N99'].sort());
  });

  it('does not add extra punctuation when removing citations', () => {
    const input = `- First item [N1]\n- Second item [N99]`;
    const validCids = new Set(['N1']);
    
    const { cleaned } = removeInvalidCitations(input, validCids);
    
    // Should not have doubled dashes or other punctuation artifacts
    assert.ok(!cleaned.includes('--'), 'Should not have doubled dashes');
    assert.ok(cleaned.includes('- Second item'), 'Should preserve list marker');
  });
});

describe('parseCitationTokens', () => {
  it('extracts all citation tokens in order', () => {
    const input = `Text [N1] and [N2] with [N1] again and [N3].`;
    const tokens = parseCitationTokens(input);
    
    assert.deepStrictEqual(tokens, ['N1', 'N2', 'N1', 'N3']);
  });

  it('handles multi-line text', () => {
    const input = `First [N1]\nSecond [N2]\nThird [N3]`;
    const tokens = parseCitationTokens(input);
    
    assert.deepStrictEqual(tokens, ['N1', 'N2', 'N3']);
  });
});

describe('getOrderedUniqueCitations', () => {
  it('returns unique citations in order of first appearance', () => {
    const input = `Text [N2] then [N1] then [N2] then [N3] then [N1].`;
    const unique = getOrderedUniqueCitations(input);
    
    assert.deepStrictEqual(unique, ['N2', 'N1', 'N3']);
  });
});

