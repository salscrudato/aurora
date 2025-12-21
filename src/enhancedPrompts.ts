/**
 * AuroraNotes API - Enhanced Prompt Engineering
 *
 * Optimized RAG prompts balancing citation accuracy with natural conversation.
 *
 * Design Principles:
 * - Concise instructions (reduce cognitive overload)
 * - Warm, conversational tone (personal notes = personal assistant)
 * - Graceful degradation (handle missing/partial info naturally)
 * - Intent-adaptive structure (match response to question type)
 * - Consistent citation patterns (group facts, cite at section end)
 *
 * v2.0 - Optimized for clarity and reduced token usage (~70% smaller prompts)
 */

import { QueryIntent, ScoredChunk } from './types';
import { logInfo } from './utils';

/**
 * Compact few-shot examples for citation patterns
 */
const CITATION_EXAMPLES = {
  grouped: `✓ "PostgreSQL is the primary database, with Redis for caching. [N1][N2]"
✗ "PostgreSQL is used. [N1] Redis caches data. [N2]" (choppy)`,

  procedural: `✓ "To deploy: run \`npm build\`, push to main, and CI/CD handles the rest. [N1] Requires team lead approval. [N2]"
✗ "Run build [N1], push [N1], get approval [N2]." (fragmented)`,
};

/**
 * Grounding instruction levels
 */
export type GroundingLevel = 'strict' | 'balanced' | 'flexible';

/**
 * Enhanced prompt configuration
 */
export interface EnhancedPromptConfig {
  groundingLevel: GroundingLevel;
  requireClaimCitations: boolean;
  maxCitationsPerClaim: number;
  enforceStructure: boolean;
  includeExamples: boolean;
}

const DEFAULT_CONFIG: EnhancedPromptConfig = {
  groundingLevel: 'strict',  // Changed from 'balanced' for stronger citation enforcement
  requireClaimCitations: true,
  maxCitationsPerClaim: 3,
  enforceStructure: true,
  includeExamples: true,
};

/**
 * Get grounding instructions based on level (optimized for clarity)
 */
function getGroundingInstructions(level: GroundingLevel, sourceCount: number): string {
  switch (level) {
    case 'strict':
      return `## Grounding Rules
• Every factual claim needs a citation [N1]-[N${sourceCount}]
• Only cite information actually present in the source
• If sources don't answer the question, say so honestly
• Never invent citations or cite non-existent sources`;

    case 'balanced':
      return `## Grounding Rules
• Cite facts with [N#] format
• Synthesize related info from multiple sources
• Present conflicting info with both citations`;

    case 'flexible':
      return `## Grounding Rules
• Cite key claims with [N#]
• Focus on being helpful
• Draw reasonable inferences from sources`;
  }
}

/**
 * Graceful degradation guidance for edge cases
 */
function getGracefulDegradation(): string {
  return `## When Sources Don't Fully Answer
• Partial match: "Your notes touch on this..." + share what's relevant with citations
• No match: "I couldn't find this in your notes."
• Sources conflict: Present both views with their citations`;
}

/**
 * Compact structure templates by intent
 */
function getCompactStructure(intent: QueryIntent): string {
  const structures: Record<QueryIntent, string> = {
    summarize: 'Brief overview → bullet points for key details → cite each point',
    list: 'Short intro → bulleted/numbered items → cite sources',
    decision: 'State the decision [N#] → explain reasoning → note alternatives',
    action_item: 'Action items with owners/deadlines → cite each',
    question: 'Direct answer [N#] → supporting details → caveats if any',
    search: 'Direct answer [N#] → relevant context',
  };
  return `## Response Format\n${structures[intent] || structures.search}`;
}

/**
 * Get compact citation example based on intent
 */
function getCitationExample(intent: QueryIntent): string {
  if (intent === 'list' || intent === 'action_item') {
    return `## Citation Style\n${CITATION_EXAMPLES.procedural}`;
  }
  return `## Citation Style\n${CITATION_EXAMPLES.grouped}`;
}

/**
 * Build the enhanced system prompt (v2 - optimized)
 *
 * ~70% smaller than v1 while maintaining citation accuracy.
 * Focuses on clear, non-conflicting instructions.
 */
export function buildEnhancedSystemPrompt(
  sourceCount: number,
  intent: QueryIntent,
  config: Partial<EnhancedPromptConfig> = {}
): string {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Core identity with warmth
  const identity = `You're the user's personal notes assistant. Help them find answers from their own thoughts and captured information.

Answer using ONLY the ${sourceCount} note excerpts provided below.`;

  // Build prompt sections (much more concise than v1)
  const sections: string[] = [
    identity,
    '',
    getGroundingInstructions(fullConfig.groundingLevel, sourceCount),
  ];

  // Add citation guidance
  sections.push('', `## How to Cite
• Group related facts, cite at section end: "X relates to Y. Z is important. [N1][N2]"
• Don't over-cite — one citation per paragraph is usually enough
• Only cite sources N1-N${sourceCount}. Never invent citations.`);

  // Add structure template if enabled
  if (fullConfig.enforceStructure) {
    sections.push('', getCompactStructure(intent));
  }

  // Add example if enabled
  if (fullConfig.includeExamples) {
    sections.push('', getCitationExample(intent));
  }

  // Always add graceful degradation
  sections.push('', getGracefulDegradation());

  // Tone guidance
  sections.push('', `## Tone
Be conversational and helpful, not robotic. Use phrases like "your notes mention..." or "based on what you wrote..."`);

  return sections.join('\n');
}

/**
 * Build enhanced user prompt with sources (v2 - friendlier formatting)
 */
export function buildEnhancedUserPrompt(
  query: string,
  sources: Array<{ cid: string; text: string; noteTitle?: string }>,
  topicsHint?: string
): string {
  const sourcesText = sources
    .map(s => {
      const titlePrefix = s.noteTitle ? `(from "${s.noteTitle}") ` : '';
      return `[${s.cid}]: ${titlePrefix}${s.text}`;
    })
    .join('\n\n');

  const topicsSection = topicsHint
    ? `\nTopics: ${topicsHint}\n`
    : '';

  return `${topicsSection}
## Your Notes (${sources.length} excerpts)

${sourcesText}

---

**Question:** ${query}`;
}

/**
 * Build a complete enhanced prompt
 */
export function buildCompleteEnhancedPrompt(
  query: string,
  chunks: ScoredChunk[],
  intent: QueryIntent,
  config: Partial<EnhancedPromptConfig> = {}
): { systemPrompt: string; userPrompt: string } {
  // Build sources from chunks
  const sources = chunks.map((chunk, index) => ({
    cid: `N${index + 1}`,
    text: chunk.text,
    // noteTitle is not available on ScoredChunk, omit it
  }));

  const systemPrompt = buildEnhancedSystemPrompt(sources.length, intent, config);
  const userPrompt = buildEnhancedUserPrompt(query, sources);

  logInfo('Built enhanced prompt', {
    sourceCount: sources.length,
    intent,
    groundingLevel: config.groundingLevel || DEFAULT_CONFIG.groundingLevel,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
  });

  return { systemPrompt, userPrompt };
}

/**
 * Get prompt configuration for observability
 */
export function getEnhancedPromptConfig(): EnhancedPromptConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Validate that a response follows the expected structure
 */
export function validateResponseStructure(
  response: string,
  intent: QueryIntent
): {
  followsStructure: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for citation presence
  const hasCitations = /\[N\d+\]/.test(response);
  if (!hasCitations) {
    issues.push('Response contains no citations');
    suggestions.push('Add citations to support factual claims');
  }

  // Check for citation clustering (bad pattern)
  const clusterPattern = /(\[N\d+\]\s*){4,}/;
  if (clusterPattern.test(response)) {
    issues.push('Citations are clustered together');
    suggestions.push('Distribute citations throughout the response');
  }

  // Intent-specific checks
  if (intent === 'list' || intent === 'action_item') {
    const hasListFormat = /^\s*[-*•]\s|^\s*\d+[.)]\s/m.test(response);
    if (!hasListFormat) {
      issues.push('List response lacks list formatting');
      suggestions.push('Use numbered or bulleted list format');
    }
  }

  if (intent === 'decision') {
    const hasDecisionLanguage = /\b(decided|decision|chose|selected|agreed)\b/i.test(response);
    if (!hasDecisionLanguage) {
      issues.push('Decision response lacks decision language');
    }
  }

  return {
    followsStructure: issues.length === 0,
    issues,
    suggestions,
  };
}

