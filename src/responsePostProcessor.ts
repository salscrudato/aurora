/**
 * Response Post-Processor - Citation normalization, formatting, and validation
 */

import { Citation, QueryIntent } from './types';
import { logInfo, logWarn } from './utils';

export interface PostProcessorConfig {
  normalizeCitations: boolean;
  enforceStructure: boolean;
  deduplicateCitations: boolean;
  validateCoherence: boolean;
  maxCitationsPerSentence: number;
  preferredFormat: 'paragraph' | 'list' | 'structured' | 'auto';
}

const DEFAULT_CONFIG: PostProcessorConfig = {
  normalizeCitations: true,
  enforceStructure: true,
  deduplicateCitations: true,
  validateCoherence: true,
  maxCitationsPerSentence: 3,
  preferredFormat: 'auto',
};

export interface PostProcessedResponse {
  originalAnswer: string;
  processedAnswer: string;
  citations: Citation[];
  modifications: string[];
  coherenceScore: number;
  structureType: 'paragraph' | 'list' | 'structured' | 'mixed';
}

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const splitSentences = (text: string) => text.split(/(?<=[.!?])\s+/);

function normalizeCitationFormat(text: string): { text: string; mapping: Map<string, string> } {
  const mapping = new Map<string, string>();
  const seen = new Set<string>();
  let counter = 1;

  for (const match of text.matchAll(/\[(?:N)?(\d+)\]/g)) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      mapping.set(match[0], `[N${counter++}]`);
    }
  }

  let result = text;
  for (const [orig, norm] of mapping) result = result.split(orig).join(norm);
  return { text: result, mapping };
}

const dedupeAdjacent = (text: string) => text.replace(/(\[N\d+\])(\s*\1)+/g, '$1');

function limitCitationsPerSentence(text: string, max: number): string {
  return splitSentences(text).map(s => {
    const cites = s.match(/\[N\d+\]/g) || [];
    if (cites.length <= max) return s;
    let count = 0;
    return s.replace(/\[N\d+\]/g, m => ++count <= max ? m : '').replace(/\s+/g, ' ').trim();
  }).join(' ');
}

function detectStructure(text: string): PostProcessedResponse['structureType'] {
  const lines = text.split('\n').filter(l => l.trim());
  const listLines = lines.filter(l => /^[\s]*[-*•]\s|^[\s]*\d+[.)]\s/i.test(l)).length;
  const headerLines = lines.filter(l => /^#+\s|^[A-Z][^.!?]*:$/.test(l)).length;
  if (headerLines && listLines) return 'structured';
  if (listLines > lines.length * 0.5) return 'list';
  if (headerLines) return 'structured';
  return lines.length <= 3 ? 'paragraph' : 'mixed';
}

const INTENT_FORMAT: Record<QueryIntent, PostProcessorConfig['preferredFormat']> = {
  question: 'paragraph', list: 'list', action_item: 'list',
  decision: 'structured', summarize: 'structured', search: 'auto',
};

function calcCoherence(text: string): number {
  let score = 1.0;
  score -= ((text.match(/^\s*\[N\d+\]\s*$/gm) || []).length) * 0.1;  // orphaned
  score -= ((text.match(/(\[N\d+\]\s*){4,}/g) || []).length) * 0.15; // clusters
  const sentences = splitSentences(text);
  const cited = sentences.filter(s => /\[N\d+\]/.test(s)).length;
  const dist = sentences.length ? cited / sentences.length : 0;
  if (dist > 0.3 && dist < 0.8) score += 0.1;
  return clamp(score);
}

function remapCitations(citations: Citation[], mapping: Map<string, string>): Citation[] {
  const remap = new Map<string, string>();
  for (const [orig, norm] of mapping) {
    const oNum = orig.match(/\d+/)?.[0], nNum = norm.match(/\d+/)?.[0];
    if (oNum && nNum) remap.set(`N${oNum}`, `N${nNum}`);
  }
  return citations.map(c => remap.has(c.cid) ? { ...c, cid: remap.get(c.cid)! } : c);
}

export function postProcessResponse(
  answer: string, citations: Citation[], queryIntent: QueryIntent,
  config: Partial<PostProcessorConfig> = {}
): PostProcessedResponse {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const mods: string[] = [];
  let text = answer, cites = [...citations];

  if (cfg.normalizeCitations) {
    const { text: t, mapping } = normalizeCitationFormat(text);
    if (mapping.size) { text = t; cites = remapCitations(cites, mapping); mods.push(`Normalized ${mapping.size} citations`); }
  }

  if (cfg.deduplicateCitations) {
    const before = text; text = dedupeAdjacent(text);
    if (text !== before) mods.push('Removed duplicate citations');
  }

  if (cfg.maxCitationsPerSentence > 0) {
    const before = text; text = limitCitationsPerSentence(text, cfg.maxCitationsPerSentence);
    if (text !== before) mods.push(`Limited to ${cfg.maxCitationsPerSentence} citations/sentence`);
  }

  const structureType = detectStructure(text);
  const preferred = cfg.preferredFormat === 'auto' ? INTENT_FORMAT[queryIntent] : cfg.preferredFormat;
  if (cfg.enforceStructure && preferred !== 'auto' && structureType !== preferred) {
    logInfo('Structure mismatch', { detected: structureType, preferred });
  }

  const coherenceScore = cfg.validateCoherence ? calcCoherence(text) : 1.0;
  if (coherenceScore < 0.7) logWarn('Low coherence', { coherenceScore });

  return { originalAnswer: answer, processedAnswer: text, citations: cites, modifications: mods, coherenceScore, structureType };
}

export function validateResponseQuality(answer: string, citations: Citation[]) {
  const issues: string[] = [], suggestions: string[] = [];

  if (answer.trim().length < 20) issues.push('Answer too short');

  const sentences = splitSentences(answer);
  const uncited = sentences.filter(s => s.length > 30 && !/\[N?\d+\]/.test(s));
  if (uncited.length > sentences.length * 0.5) {
    issues.push('Most sentences lack citations');
    suggestions.push('Add citations to support claims');
  }

  if (/^[\s\[N\d\]]+$/.test(answer)) issues.push('Only citations, no content');

  const cited = new Set([...(answer.match(/\[N?(\d+)\]/g) || [])].map(c => c.match(/\d+/)?.[0]));
  const available = new Set(citations.map(c => c.cid.replace('N', '')));
  for (const n of cited) if (n && !available.has(n)) issues.push(`[N${n}] references missing source`);

  return { isValid: !issues.length, issues, suggestions };
}

export interface ConsistencyResult {
  isConsistent: boolean;
  toneConsistency: number;
  formatConsistency: number;
  citationConsistency: number;
  issues: string[];
  corrections: string[];
}

function calcTone(text: string): number {
  if (splitSentences(text).filter(s => s.length > 10).length < 2) return 1.0;
  let issues = 0;
  if (/\b(therefore|furthermore|moreover|consequently|thus)\b/i.test(text) &&
      /\b(basically|kind of|sort of|pretty much|gonna|wanna)\b/i.test(text)) issues++;
  const persons = [/\b(I|my|mine)\b/, /\b(you|your|yours)\b/, /\b(it|they|the user)\b/].filter(p => p.test(text)).length;
  if (persons > 1) issues += 0.5;
  return Math.max(0, 1 - issues * 0.2);
}

function calcCitationConsistency(text: string): number {
  const sentences = splitSentences(text).filter(s => s.length > 20);
  if (!sentences.length) return 1.0;
  let score = 1.0;
  const cited = sentences.filter(s => /\[N\d+\]/.test(s));
  const atEnd = cited.filter(s => /\[N\d+\]\s*[.!?]?\s*$/.test(s));
  const mid = cited.filter(s => /\[N\d+\](?!\s*[.!?]?\s*$)/.test(s));
  if (atEnd.length && mid.length && Math.min(atEnd.length, mid.length) / Math.max(atEnd.length, mid.length) > 0.5) score -= 0.15;
  score -= ((text.match(/(\[N\d+\]\s*){4,}/g) || []).length) * 0.1;
  return Math.max(0, score);
}

export function enforceResponseConsistency(answer: string, _intent: QueryIntent): { correctedAnswer: string; result: ConsistencyResult } {
  const issues: string[] = [], corrections: string[] = [];
  let text = answer;

  // Normalize whitespace
  const ws = text; text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  if (text !== ws) corrections.push('Normalized whitespace');

  // Unify list formats
  const hasNum = /^\s*\d+[.)]\s/m.test(text), hasBullet = /^\s*[-*•]\s/m.test(text);
  if (hasNum && hasBullet) {
    issues.push('Mixed list formats');
    const nCount = (text.match(/^\s*\d+[.)]\s/gm) || []).length;
    const bCount = (text.match(/^\s*[-*•]\s/gm) || []).length;
    if (nCount >= bCount) {
      let c = nCount + 1; text = text.replace(/^\s*[-*•]\s/gm, () => `${c++}. `);
      corrections.push('Unified to numbered list');
    } else {
      text = text.replace(/^\s*\d+[.)]\s/gm, '- ');
      corrections.push('Unified to bullet list');
    }
  }

  // Normalize citations
  const cite = text; text = text.replace(/\[\s*N\s*(\d+)\s*\]/g, '[N$1]').replace(/\[(\d+)\]/g, '[N$1]');
  if (text !== cite) corrections.push('Normalized citations');

  // Remove trailing citations
  const trail = text; text = text.replace(/\.\s*(\[N\d+\]\s*)+$/g, '.');
  if (text !== trail) corrections.push('Removed trailing citations');

  const toneConsistency = calcTone(text);
  const formatConsistency = issues.length ? Math.max(0.5, 1 - issues.length * 0.15) : 1.0;
  const citationConsistency = calcCitationConsistency(text);

  return {
    correctedAnswer: text,
    result: {
      isConsistent: toneConsistency > 0.7 && formatConsistency > 0.7 && citationConsistency > 0.7,
      toneConsistency, formatConsistency, citationConsistency, issues, corrections,
    },
  };
}
