/** Unified Citation Pipeline Tests - Run: npx tsx --test src/unifiedCitationPipeline.test.ts */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractCitationIds, getUniqueCitationIds, quickVerifyCitation, analyzeContradiction, getPipelineConfig } from './unifiedCitationPipeline';

describe('extractCitationIds', () => {
  it('extracts citation IDs from text', () => {
    assert.deepStrictEqual(extractCitationIds('Uses React [N1] and TypeScript [N2].'), ['N1', 'N2']);
    assert.deepStrictEqual(extractCitationIds('Multiple sources [N1][N2][N3].'), ['N1', 'N2', 'N3']);
    assert.deepStrictEqual(extractCitationIds('First [N1], second [N2], first [N1].'), ['N1', 'N2', 'N1']);
    assert.deepStrictEqual(extractCitationIds('No citations here.'), []);
    assert.deepStrictEqual(extractCitationIds('Source [N10] and [N25].'), ['N10', 'N25']);
  });
});

describe('getUniqueCitationIds', () => {
  it('returns unique IDs in order of first appearance', () => {
    assert.deepStrictEqual(getUniqueCitationIds('First [N1], second [N2], first [N1], third [N3].'), ['N1', 'N2', 'N3']);
    assert.deepStrictEqual(getUniqueCitationIds('Start [N3], then [N1], then [N2].'), ['N3', 'N1', 'N2']);
    assert.deepStrictEqual(getUniqueCitationIds('No citations.'), []);
  });
});

describe('quickVerifyCitation', () => {
  it('returns appropriate scores for match quality', () => {
    const exact = quickVerifyCitation('The project uses React', 'The project uses React for the frontend.');
    assert.ok(exact.isValid && exact.confidence > 0.5);

    const overlap = quickVerifyCitation('React is used for the frontend', 'The frontend is built with React and TypeScript.');
    assert.ok(overlap.confidence > 0.3);

    const unrelated = quickVerifyCitation('The database uses PostgreSQL', 'The frontend uses React and TypeScript.');
    assert.ok(unrelated.confidence < 0.5);
  });
});

describe('analyzeContradiction', () => {
  it('detects contradictions correctly', () => {
    assert.ok(analyzeContradiction('The feature is enabled', 'The feature is not enabled').hasContradiction);
    assert.ok(!analyzeContradiction('The project uses React', 'The project uses React for the frontend.').hasContradiction);
  });
});

describe('getPipelineConfig', () => {
  it('returns valid config object', () => {
    const config = getPipelineConfig();
    assert.ok(typeof config === 'object' && 'minLexicalOverlap' in config && 'minConfidenceThreshold' in config);
  });

  it('returns copies not references', () => {
    assert.notStrictEqual(getPipelineConfig(), getPipelineConfig());
  });
});
