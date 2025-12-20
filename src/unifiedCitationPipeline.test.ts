/**
 * Unified Citation Pipeline Tests
 *
 * Tests for the citation validation pipeline including:
 * - Citation extraction and validation
 * - Invalid citation removal
 * - Contract compliance checking
 * - Quick verification functions
 *
 * Run with: npx tsx --test src/unifiedCitationPipeline.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractCitationIds,
  getUniqueCitationIds,
  quickVerifyCitation,
  analyzeContradiction,
  getPipelineConfig,
} from './unifiedCitationPipeline';

describe('extractCitationIds', () => {
  it('extracts citation IDs from answer text', () => {
    const answer = 'The project uses React [N1] and TypeScript [N2].';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, ['1', '2']);
  });

  it('handles multiple citations in sequence', () => {
    const answer = 'This is supported by multiple sources [N1][N2][N3].';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, ['1', '2', '3']);
  });

  it('handles repeated citations', () => {
    const answer = 'First mention [N1], second mention [N2], back to first [N1].';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, ['1', '2', '1']);
  });

  it('returns empty array for no citations', () => {
    const answer = 'This answer has no citations.';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, []);
  });

  it('handles multi-digit citation IDs', () => {
    const answer = 'Source [N10] and source [N25] are relevant.';
    const cids = extractCitationIds(answer);
    assert.deepStrictEqual(cids, ['10', '25']);
  });
});

describe('getUniqueCitationIds', () => {
  it('returns unique citation IDs in order of first appearance', () => {
    const answer = 'First [N1], second [N2], first again [N1], third [N3].';
    const uniqueCids = getUniqueCitationIds(answer);
    assert.deepStrictEqual(uniqueCids, ['1', '2', '3']);
  });

  it('preserves order of first appearance', () => {
    const answer = 'Start with [N3], then [N1], then [N2].';
    const uniqueCids = getUniqueCitationIds(answer);
    assert.deepStrictEqual(uniqueCids, ['3', '1', '2']);
  });

  it('returns empty array for no citations', () => {
    const answer = 'No citations here.';
    const uniqueCids = getUniqueCitationIds(answer);
    assert.deepStrictEqual(uniqueCids, []);
  });
});

describe('quickVerifyCitation', () => {
  it('returns high score for exact match', () => {
    const claim = 'The project uses React';
    const source = 'The project uses React for the frontend.';
    const result = quickVerifyCitation(claim, source);
    assert.ok(result.isValid, 'Should be valid for exact match');
    assert.ok(result.confidence > 0.5, 'Should have high confidence');
  });

  it('returns high score for semantic overlap', () => {
    const claim = 'React is used for the frontend';
    const source = 'The frontend is built with React and TypeScript.';
    const result = quickVerifyCitation(claim, source);
    assert.ok(result.confidence > 0.3, 'Should have reasonable confidence for overlap');
  });

  it('returns low score for unrelated content', () => {
    const claim = 'The database uses PostgreSQL';
    const source = 'The frontend uses React and TypeScript.';
    const result = quickVerifyCitation(claim, source);
    assert.ok(result.confidence < 0.5, 'Should have low confidence for unrelated content');
  });
});

describe('analyzeContradiction', () => {
  it('detects negation contradictions', () => {
    const claim = 'The feature is enabled';
    const source = 'The feature is not enabled';
    const result = analyzeContradiction(claim, source);
    assert.ok(result.hasContradiction, 'Should detect negation contradiction');
  });

  it('returns no contradiction for consistent statements', () => {
    const claim = 'The project uses React';
    const source = 'The project uses React for the frontend.';
    const result = analyzeContradiction(claim, source);
    assert.ok(!result.hasContradiction, 'Should not detect contradiction');
  });
});

describe('getPipelineConfig', () => {
  it('returns pipeline configuration object', () => {
    const config = getPipelineConfig();
    assert.ok(typeof config === 'object', 'Should return an object');
    assert.ok('minOverlapScore' in config, 'Should have minOverlapScore');
    assert.ok('minConfidence' in config, 'Should have minConfidence');
  });

  it('returns a copy of config (not reference)', () => {
    const config1 = getPipelineConfig();
    const config2 = getPipelineConfig();
    assert.notStrictEqual(config1, config2, 'Should return different object references');
  });
});

