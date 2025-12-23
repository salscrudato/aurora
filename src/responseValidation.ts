/**
 * Response Validation - Citation validation and automatic repair
 */

import { QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

const CONFIG = {
  minCitationCoverage: 0.5,
  repairEnabled: true,
  strictMode: false,
};

export type ValidationIssueType =
  | 'invalid_citation_format' | 'citation_out_of_range' | 'uncited_claim'
  | 'citation_clustering' | 'empty_response' | 'no_citations';

export interface ValidationIssue {
  type: ValidationIssueType;
  severity: 'error' | 'warning';
  message: string;
  autoRepairable: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  citationStats: { total: number; unique: number; validRange: number; invalidRange: number };
}

export interface RepairResult {
  originalResponse: string;
  repairedResponse: string;
  repairsApplied: string[];
  issuesFixed: number;
  issuesRemaining: number;
}

const MALFORMED_PATTERNS: [RegExp, string][] = [
  [/\[N\s+\d+\]/g, 'Space in citation'],
  [/\[\d+\]/g, 'Missing N prefix'],
  [/\[N\d+\s*,\s*N\d+\]/g, 'Combined citations'],
];

function findFormatIssues(text: string): ValidationIssue[] {
  return MALFORMED_PATTERNS.flatMap(([pattern, msg]) =>
    [...text.matchAll(pattern)].map(() => ({
      type: 'invalid_citation_format' as const,
      severity: 'warning' as const,
      message: msg,
      autoRepairable: true,
    }))
  );
}

function findRangeIssues(text: string, max: number): ValidationIssue[] {
  return [...text.matchAll(/\[N(\d+)\]/g)]
    .map(m => parseInt(m[1], 10))
    .filter(n => n < 1 || n > max)
    .map(n => ({
      type: 'citation_out_of_range' as const,
      severity: 'error' as const,
      message: `[N${n}] out of range (1-${max})`,
      autoRepairable: true,
    }));
}

function findClusterIssues(text: string): ValidationIssue[] {
  return [...text.matchAll(/(\[N\d+\]\s*){4,}/g)].map(() => ({
    type: 'citation_clustering' as const,
    severity: 'warning' as const,
    message: 'Citations clustered',
    autoRepairable: false,
  }));
}

function findUncitedIssues(text: string): ValidationIssue[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const factual = sentences.filter(s => s.length >= 20 && !s.endsWith('?') &&
    /\b(is|are|was|were|has|have|had|uses|requires|provides)\b/i.test(s));
  const cited = factual.filter(s => /\[N\d+\]/.test(s)).length;
  const coverage = factual.length ? cited / factual.length : 1;

  if (coverage < CONFIG.minCitationCoverage) {
    return [{ type: 'uncited_claim', severity: 'warning', message: `Low citation coverage: ${Math.round(coverage * 100)}%`, autoRepairable: false }];
  }
  return [];
}

function getCitationStats(text: string, max: number) {
  const nums = [...text.matchAll(/\[N(\d+)\]/g)].map(m => parseInt(m[1], 10));
  const valid = nums.filter(n => n >= 1 && n <= max).length;
  return { total: nums.length, unique: new Set(nums).size, validRange: valid, invalidRange: nums.length - valid };
}

function validateResponse(response: string, max: number): ValidationResult {
  if (!response?.trim()) {
    return {
      isValid: false,
      issues: [{ type: 'empty_response', severity: 'error', message: 'Empty response', autoRepairable: false }],
      errorCount: 1, warningCount: 0,
      citationStats: { total: 0, unique: 0, validRange: 0, invalidRange: 0 },
    };
  }

  const issues: ValidationIssue[] = [];
  if (!/\[N\d+\]/.test(response)) {
    issues.push({ type: 'no_citations', severity: 'warning', message: 'No citations', autoRepairable: false });
  }

  issues.push(...findFormatIssues(response), ...findRangeIssues(response, max),
              ...findClusterIssues(response), ...findUncitedIssues(response));

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const isValid = CONFIG.strictMode ? !issues.length : !errorCount;

  if (issues.length) logWarn('Validation issues', { errorCount, warningCount });

  return { isValid, issues, errorCount, warningCount, citationStats: getCitationStats(response, max) };
}

function repairResponse(response: string, max: number): RepairResult {
  let text = response;
  const repairs: string[] = [];

  // Fix formats: [1] -> [N1], [N 1] -> [N1], [N1, N2] -> [N1][N2]
  const fixes: [RegExp, string, string][] = [
    [/\[(\d+)\]/g, '[N$1]', 'Added N prefix'],
    [/\[N\s+(\d+)\]/g, '[N$1]', 'Removed spaces'],
    [/\[N(\d+)\s*,\s*N(\d+)\]/g, '[N$1][N$2]', 'Split citations'],
  ];

  for (const [pattern, replacement, msg] of fixes) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      repairs.push(msg);
    }
  }

  // Remove out-of-range
  text = text.replace(/\[N(\d+)\]/g, (m, n) => {
    const num = parseInt(n, 10);
    if (num < 1 || num > max) { repairs.push(`Removed [N${num}]`); return ''; }
    return m;
  }).replace(/\s+/g, ' ').trim();

  const validation = validateResponse(text, max);
  logInfo('Repair done', { fixed: repairs.length, remaining: validation.issues.length });

  return { originalResponse: response, repairedResponse: text, repairsApplied: repairs,
           issuesFixed: repairs.length, issuesRemaining: validation.issues.length };
}

export function validateAndRepair(response: string, max: number, _intent?: QueryIntent): {
  validation: ValidationResult; repair?: RepairResult; finalResponse: string;
} {
  const validation = validateResponse(response, max);
  if (validation.isValid || !CONFIG.repairEnabled) return { validation, finalResponse: response };
  const repair = repairResponse(response, max);
  return { validation, repair, finalResponse: repair.repairedResponse };
}
