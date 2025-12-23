/** Unified Citation Pipeline - Single-pass citation verification ensuring contract compliance */

import { Citation, ScoredChunk, QueryIntent } from './types';
import { logWarn } from './utils';

const PIPELINE_CONFIG = {
  minLexicalOverlap: 0.12, minConfidenceThreshold: 0.35, enableSemanticCheck: false,
  strictMode: true, warnOnLowCoverage: true, enableHallucinationCheck: true,
};

const HALLUCINATION_PATTERNS = [/\b(exactly|precisely|specifically)\s+\d+/i, /\b(definitely|certainly|absolutely|always|never)\b/i, /"[^"]{50,}"(?!\s*\[N\d+\])/];
const FABRICATION_INDICATORS = ['as mentioned in your notes', 'your notes indicate', 'according to your notes'].map(s => s.toLowerCase());

export interface CitationValidation {
  cid: string; isValid: boolean; lexicalScore: number; semanticScore?: number;
  combinedScore: number; matchQuality: 'strong' | 'moderate' | 'weak' | 'none'; reason?: string;
}

export interface PipelineResult {
  validatedAnswer: string; validatedCitations: Citation[]; citationValidations: CitationValidation[];
  overallConfidence: number; citationAccuracy: number; invalidCitationsRemoved: string[];
  weakCitations: string[]; hasContradictions: boolean; potentialHallucinations: string[];
  contractCompliant: boolean; danglingCitations: string[]; processingTimeMs: number;
}

const STOP_WORDS = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'and', 'or', 'but', 'if', 'this', 'that', 'these', 'those', 'it', 'based', 'notes', 'according', 'mentioned', 'stated', 'using', 'used']);

function extractKeywords(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/\[N?\d+\]/g, '').replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w)));
}

function detectPotentialHallucinations(answer: string, validations: CitationValidation[]): string[] {
  if (!PIPELINE_CONFIG.enableHallucinationCheck) return [];
  const hallucinations: string[] = [], answerLower = answer.toLowerCase();
  for (const indicator of FABRICATION_INDICATORS) {
    const idx = answerLower.indexOf(indicator);
    if (idx >= 0) {
      const context = answer.slice(Math.max(0, idx - 30), Math.min(answer.length, idx + indicator.length + 50));
      const citMatch = context.match(/\[N(\d+)\]/);
      if (!citMatch) hallucinations.push(`Unsupported claim: "${context.trim()}"`);
      else { const v = validations.find(v => v.cid === `N${citMatch[1]}`); if (v?.matchQuality === 'none') hallucinations.push(`Weakly supported: "${context.trim()}"`); }
    }
  }
  for (const pattern of HALLUCINATION_PATTERNS) { const m = answer.match(pattern); if (m) hallucinations.push(`Potential fabrication: "${m[0].slice(0, 50)}..."`); }
  return hallucinations.slice(0, 3);
}

export function extractCitationIds(answer: string): string[] {
  const cids: string[] = []; let m; const p = /\[N(\d+)\]/g;
  while ((m = p.exec(answer)) !== null) cids.push(`N${m[1]}`);
  return cids;
}

export function getUniqueCitationIds(answer: string): string[] {
  const seen = new Set<string>(), unique: string[] = [];
  for (const cid of extractCitationIds(answer)) { if (!seen.has(cid)) { seen.add(cid); unique.push(cid); } }
  return unique;
}

function calculateLexicalOverlap(answerText: string, sourceText: string): number {
  const a = extractKeywords(answerText), s = extractKeywords(sourceText);
  if (!a.size || !s.size) return 0;
  let inter = 0; for (const w of a) if (s.has(w)) inter++;
  return inter / Math.min(a.size, s.size);
}

function determineMatchQuality(score: number): CitationValidation['matchQuality'] {
  if (score >= 0.4) return 'strong'; if (score >= 0.25) return 'moderate';
  if (score >= PIPELINE_CONFIG.minLexicalOverlap) return 'weak'; return 'none';
}

function removeCitationMarker(answer: string, cid: string): string {
  return answer.replace(new RegExp(`\\s*\\[${cid}\\]`, 'g'), '').replace(/\s{2,}/g, ' ').trim();
}

function cleanCitationFormatting(answer: string): string {
  return answer.replace(/(\[N\d+\])(\s*\1)+/g, '$1').replace(/\s+([.!?,;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/\[\s*\]/g, '').trim();
}

function validateCitation(cid: string, citation: Citation, chunk: ScoredChunk | undefined, answer: string): CitationValidation {
  const sourceText = chunk?.text || citation.snippet;
  const lexicalScore = calculateLexicalOverlap(answer, sourceText);
  const matchQuality = determineMatchQuality(lexicalScore), isValid = matchQuality !== 'none';
  return { cid, isValid, lexicalScore: Math.round(lexicalScore * 1000) / 1000, combinedScore: Math.round(lexicalScore * 1000) / 1000, matchQuality, reason: isValid ? undefined : `Low overlap score (${(lexicalScore * 100).toFixed(0)}%)` };
}

/** Main unified citation verification pipeline - canonical entry point for citation processing */
export async function runUnifiedCitationPipeline(answer: string, citations: Citation[], chunks: ScoredChunk[], _queryIntent?: QueryIntent): Promise<PipelineResult> {
  const startTime = Date.now();
  const citationMap = new Map(citations.map(c => [c.cid, c])), chunkMap = new Map(chunks.map(c => [c.chunkId, c]));
  const answerCids = getUniqueCitationIds(answer), validCidSet = new Set(citations.map(c => c.cid));
  const danglingCitations = answerCids.filter(cid => !validCidSet.has(cid));

  const citationValidations: CitationValidation[] = [], invalidCitationsRemoved: string[] = [], weakCitations: string[] = [];

  for (const cid of answerCids) {
    const citation = citationMap.get(cid);
    if (!citation) {
      citationValidations.push({ cid, isValid: false, lexicalScore: 0, combinedScore: 0, matchQuality: 'none', reason: 'Citation not found in sources' });
      invalidCitationsRemoved.push(cid); continue;
    }
    const validation = validateCitation(cid, citation, chunkMap.get(citation.chunkId), answer);
    citationValidations.push(validation);
    if (!validation.isValid) invalidCitationsRemoved.push(cid);
    else if (validation.matchQuality === 'weak') weakCitations.push(cid);
  }

  let validatedAnswer = answer;
  if (PIPELINE_CONFIG.strictMode) for (const cid of invalidCitationsRemoved) validatedAnswer = removeCitationMarker(validatedAnswer, cid);
  validatedAnswer = cleanCitationFormatting(validatedAnswer);

  const validCids = new Set(citationValidations.filter(v => v.isValid).map(v => v.cid));
  const validatedCitations = answerCids.filter(cid => validCids.has(cid)).map(cid => citationMap.get(cid)!).filter(Boolean);

  const validCount = citationValidations.filter(v => v.isValid).length, totalCount = citationValidations.length;
  const citationAccuracy = totalCount > 0 ? validCount / totalCount : 1;
  const avgScore = citationValidations.length > 0 ? citationValidations.reduce((sum, v) => sum + v.combinedScore, 0) / citationValidations.length : 0;
  const overallConfidence = Math.round(avgScore * 1000) / 1000, contractCompliant = danglingCitations.length === 0;

  if (invalidCitationsRemoved.length > 0) logWarn('[UnifiedPipeline] Removed invalid citations', { removed: invalidCitationsRemoved, reason: 'Low overlap or not in sources' });
  if (PIPELINE_CONFIG.warnOnLowCoverage && validatedCitations.length < citations.length * 0.5) logWarn('[UnifiedPipeline] Low citation coverage', { used: validatedCitations.length, available: citations.length, coverage: `${Math.round((validatedCitations.length / citations.length) * 100)}%` });

  return { validatedAnswer, validatedCitations, citationValidations, overallConfidence, citationAccuracy, invalidCitationsRemoved, weakCitations, hasContradictions: false, potentialHallucinations: detectPotentialHallucinations(answer, citationValidations), contractCompliant, danglingCitations, processingTimeMs: Date.now() - startTime };
}

/** Quick verification - lightweight alternative for streaming */
export function quickVerifyCitation(claimText: string, sourceText: string): { isValid: boolean; confidence: number; matchQuality: string } {
  const lexicalScore = calculateLexicalOverlap(claimText, sourceText), matchQuality = determineMatchQuality(lexicalScore);
  return { isValid: matchQuality !== 'none', confidence: Math.round(lexicalScore * 1000) / 1000, matchQuality };
}

export function getPipelineConfig() { return { ...PIPELINE_CONFIG }; }
export function updatePipelineConfig(updates: Partial<typeof PIPELINE_CONFIG>) { Object.assign(PIPELINE_CONFIG, updates); }

export interface ContradictionAnalysis { hasContradiction: boolean; contradictionType?: 'negation' | 'antonym' | 'numerical' | 'semantic'; confidence: number; explanation?: string; }

export function analyzeContradiction(claim: string, source: string): ContradictionAnalysis {
  const claimHasNot = /\bnot\b|\bn't\b/.test(claim.toLowerCase()), sourceHasNot = /\bnot\b|\bn't\b/.test(source.toLowerCase());
  if (claimHasNot !== sourceHasNot && calculateLexicalOverlap(claim, source) > 0.3) return { hasContradiction: true, contradictionType: 'negation', confidence: 0.7, explanation: 'Claim and source have opposing negation' };
  return { hasContradiction: false, confidence: 0 };
}
