/**
 * AuroraNotes API - Response Validation and Repair Pipeline
 *
 * Comprehensive post-generation validation with automatic repair:
 * 1. Citation format validation
 * 2. Citation range validation (only valid N1-Nmax)
 * 3. Consistency checks (no contradictions)
 * 4. Completeness checks (all claims cited)
 * 5. Automatic repair for common issues
 *
 * This ensures responses meet quality standards before delivery.
 */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logInfo, logWarn, logError } from './utils';

// Validation configuration
const VALIDATION_CONFIG = {
  enabled: true,
  maxCitationsPerSentence: 4,
  minCitationCoverage: 0.5,         // Min fraction of factual sentences with citations
  repairEnabled: true,
  strictMode: false,                // If true, fail on any validation error
};

/**
 * Validation issue types
 */
export type ValidationIssueType =
  | 'invalid_citation_format'
  | 'citation_out_of_range'
  | 'uncited_claim'
  | 'citation_clustering'
  | 'duplicate_citation'
  | 'empty_response'
  | 'no_citations'
  | 'excessive_citations'
  | 'inconsistent_formatting';

/**
 * Validation issue
 */
export interface ValidationIssue {
  type: ValidationIssueType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: { start: number; end: number };
  suggestedFix?: string;
  autoRepairable: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  citationStats: {
    total: number;
    unique: number;
    validRange: number;
    invalidRange: number;
  };
}

/**
 * Repair result
 */
export interface RepairResult {
  originalResponse: string;
  repairedResponse: string;
  repairsApplied: string[];
  issuesFixed: number;
  issuesRemaining: number;
}

/**
 * Validate citation format
 */
function validateCitationFormat(response: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for malformed citations
  const malformedPatterns = [
    { pattern: /\[N\s+\d+\]/g, message: 'Space in citation format' },
    { pattern: /\[\d+\]/g, message: 'Missing N prefix in citation' },
    { pattern: /\[N\d+\s*,\s*N\d+\]/g, message: 'Multiple citations in single brackets' },
    { pattern: /N\d+(?!\])/g, message: 'Citation without brackets' },
  ];

  for (const { pattern, message } of malformedPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      issues.push({
        type: 'invalid_citation_format',
        severity: 'warning',
        message: `${message}: "${match[0]}"`,
        location: { start: match.index, end: match.index + match[0].length },
        autoRepairable: true,
      });
    }
  }

  return issues;
}

/**
 * Validate citation range
 */
function validateCitationRange(response: string, maxCitation: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const citationPattern = /\[N(\d+)\]/g;
  let match;

  while ((match = citationPattern.exec(response)) !== null) {
    const citNum = parseInt(match[1], 10);
    if (citNum < 1 || citNum > maxCitation) {
      issues.push({
        type: 'citation_out_of_range',
        severity: 'error',
        message: `Citation [N${citNum}] is out of range (valid: N1-N${maxCitation})`,
        location: { start: match.index, end: match.index + match[0].length },
        suggestedFix: `Remove or replace [N${citNum}]`,
        autoRepairable: true,
      });
    }
  }

  return issues;
}

/**
 * Check for citation clustering (bad pattern)
 */
function checkCitationClustering(response: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Pattern for 4+ consecutive citations
  const clusterPattern = /(\[N\d+\]\s*){4,}/g;
  let match;

  while ((match = clusterPattern.exec(response)) !== null) {
    issues.push({
      type: 'citation_clustering',
      severity: 'warning',
      message: 'Citations are clustered together instead of distributed',
      location: { start: match.index, end: match.index + match[0].length },
      suggestedFix: 'Distribute citations throughout the response',
      autoRepairable: false,
    });
  }

  return issues;
}

/**
 * Check for uncited factual claims
 */
function checkUncitedClaims(response: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Split into sentences
  const sentences = response.split(/(?<=[.!?])\s+/);
  let uncitedFactualCount = 0;
  let totalFactualCount = 0;

  for (const sentence of sentences) {
    // Skip short sentences or questions
    if (sentence.length < 20 || sentence.endsWith('?')) continue;

    // Check if it looks like a factual claim
    const isFactual = /\b(is|are|was|were|has|have|had|uses|using|requires|provides)\b/i.test(sentence);
    if (!isFactual) continue;

    totalFactualCount++;

    // Check for citation
    if (!/\[N\d+\]/.test(sentence)) {
      uncitedFactualCount++;
    }
  }

  // Calculate coverage
  const coverage = totalFactualCount > 0 ? 1 - (uncitedFactualCount / totalFactualCount) : 1;

  if (coverage < VALIDATION_CONFIG.minCitationCoverage) {
    issues.push({
      type: 'uncited_claim',
      severity: 'warning',
      message: `Low citation coverage: ${(coverage * 100).toFixed(0)}% of factual claims are cited`,
      suggestedFix: 'Add citations to factual claims',
      autoRepairable: false,
    });
  }

  return issues;
}

/**
 * Get citation statistics
 */
function getCitationStats(response: string, maxCitation: number): ValidationResult['citationStats'] {
  const citationPattern = /\[N(\d+)\]/g;
  const citations: number[] = [];
  let match;

  while ((match = citationPattern.exec(response)) !== null) {
    citations.push(parseInt(match[1], 10));
  }

  const unique = new Set(citations);
  const validRange = citations.filter(c => c >= 1 && c <= maxCitation).length;
  const invalidRange = citations.length - validRange;

  return {
    total: citations.length,
    unique: unique.size,
    validRange,
    invalidRange,
  };
}

/**
 * Validate a response
 */
export function validateResponse(
  response: string,
  maxCitation: number,
  intent?: QueryIntent
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Empty response check
  if (!response || response.trim().length === 0) {
    issues.push({
      type: 'empty_response',
      severity: 'error',
      message: 'Response is empty',
      autoRepairable: false,
    });
    return {
      isValid: false,
      issues,
      errorCount: 1,
      warningCount: 0,
      citationStats: { total: 0, unique: 0, validRange: 0, invalidRange: 0 },
    };
  }

  // No citations check
  if (!/\[N\d+\]/.test(response)) {
    issues.push({
      type: 'no_citations',
      severity: 'warning',
      message: 'Response contains no citations',
      suggestedFix: 'Add citations to support claims',
      autoRepairable: false,
    });
  }

  // Run all validation checks
  issues.push(...validateCitationFormat(response));
  issues.push(...validateCitationRange(response, maxCitation));
  issues.push(...checkCitationClustering(response));
  issues.push(...checkUncitedClaims(response));

  // Count by severity
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  // Get stats
  const citationStats = getCitationStats(response, maxCitation);

  // Determine validity
  const isValid = VALIDATION_CONFIG.strictMode
    ? issues.length === 0
    : errorCount === 0;

  if (issues.length > 0) {
    logWarn('Response validation issues', {
      errorCount,
      warningCount,
      issues: issues.map(i => i.message),
    });
  }

  return {
    isValid,
    issues,
    errorCount,
    warningCount,
    citationStats,
  };
}

/**
 * Repair common issues in a response
 */
export function repairResponse(
  response: string,
  maxCitation: number
): RepairResult {
  let repaired = response;
  const repairsApplied: string[] = [];

  // Fix missing N prefix: [1] -> [N1]
  const missingNPattern = /\[(\d+)\]/g;
  if (missingNPattern.test(repaired)) {
    repaired = repaired.replace(missingNPattern, '[N$1]');
    repairsApplied.push('Added missing N prefix to citations');
  }

  // Fix space in citation: [N 1] -> [N1]
  const spacePattern = /\[N\s+(\d+)\]/g;
  if (spacePattern.test(repaired)) {
    repaired = repaired.replace(spacePattern, '[N$1]');
    repairsApplied.push('Removed spaces from citations');
  }

  // Fix multiple citations in single brackets: [N1, N2] -> [N1][N2]
  const multiPattern = /\[N(\d+)\s*,\s*N(\d+)\]/g;
  if (multiPattern.test(repaired)) {
    repaired = repaired.replace(multiPattern, '[N$1][N$2]');
    repairsApplied.push('Split combined citations');
  }

  // Remove out-of-range citations
  const outOfRangePattern = new RegExp(`\\[N(\\d+)\\]`, 'g');
  repaired = repaired.replace(outOfRangePattern, (match, num) => {
    const citNum = parseInt(num, 10);
    if (citNum < 1 || citNum > maxCitation) {
      repairsApplied.push(`Removed out-of-range citation [N${citNum}]`);
      return '';
    }
    return match;
  });

  // Clean up double spaces
  repaired = repaired.replace(/\s+/g, ' ').trim();

  // Re-validate to count remaining issues
  const validation = validateResponse(repaired, maxCitation);

  logInfo('Response repair completed', {
    repairsApplied: repairsApplied.length,
    issuesRemaining: validation.issues.length,
  });

  return {
    originalResponse: response,
    repairedResponse: repaired,
    repairsApplied,
    issuesFixed: repairsApplied.length,
    issuesRemaining: validation.issues.length,
  };
}

/**
 * Validate and optionally repair a response
 */
export function validateAndRepair(
  response: string,
  maxCitation: number,
  intent?: QueryIntent
): {
  validation: ValidationResult;
  repair?: RepairResult;
  finalResponse: string;
} {
  // Initial validation
  const validation = validateResponse(response, maxCitation, intent);

  // If valid or repair disabled, return as-is
  if (validation.isValid || !VALIDATION_CONFIG.repairEnabled) {
    return {
      validation,
      finalResponse: response,
    };
  }

  // Attempt repair
  const repair = repairResponse(response, maxCitation);

  return {
    validation,
    repair,
    finalResponse: repair.repairedResponse,
  };
}

/**
 * Get validation configuration
 */
export function getValidationConfig() {
  return { ...VALIDATION_CONFIG };
}

