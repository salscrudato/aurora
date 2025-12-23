/**
 * AuroraNotes API - Enhanced Prompt Engineering
 *
 * Optimized RAG prompts balancing citation accuracy with natural conversation.
 */

import { QueryIntent, ScoredChunk } from './types';
import { logInfo } from './utils';

// =============================================================================
// Types
// =============================================================================

type GroundingLevel = 'strict' | 'balanced' | 'flexible';

interface Source {
  cid: string;
  text: string;
  relevanceScore?: number;
}

// =============================================================================
// Constants
// =============================================================================

const CITATION_EXAMPLES = {
  grouped: `✓ "PostgreSQL is the primary database, with Redis for caching. [N1][N2]"
✗ "PostgreSQL is used. [N1] Redis caches data. [N2]" (choppy)`,
  procedural: `✓ "To deploy: run \`npm build\`, push to main, and CI/CD handles the rest. [N1] Requires team lead approval. [N2]"
✗ "Run build [N1], push [N1], get approval [N2]." (fragmented)`,
};

const STRUCTURE_BY_INTENT: Record<QueryIntent, string> = {
  summarize: 'Brief overview → bullet points for key details → cite each point',
  list: 'Short intro → bulleted/numbered items → cite sources',
  decision: 'State the decision [N#] → explain reasoning → note alternatives',
  action_item: 'Action items with owners/deadlines → cite each',
  question: 'Direct answer [N#] → supporting details → caveats if any',
  search: 'Direct answer [N#] → relevant context',
};

// =============================================================================
// Prompt Building Helpers
// =============================================================================

function getGroundingInstructions(sourceCount: number): string {
  return `## Grounding Rules
• Every factual claim needs a citation [N1]-[N${sourceCount}]
• Only cite information actually present in the source
• If sources don't answer the question, say so honestly
• Never invent citations or cite non-existent sources`;
}

function getCitationExample(intent: QueryIntent): string {
  const example = (intent === 'list' || intent === 'action_item')
    ? CITATION_EXAMPLES.procedural
    : CITATION_EXAMPLES.grouped;
  return `## Citation Style\n${example}`;
}

function getRelevanceIndicator(score: number | undefined): string {
  if (score === undefined) return '';
  if (score >= 0.80) return '★★★ ';
  if (score >= 0.60) return '★★ ';
  if (score >= 0.40) return '★ ';
  return '';
}

// =============================================================================
// System Prompt
// =============================================================================

function buildSystemPrompt(sourceCount: number, intent: QueryIntent): string {
  return `You're the user's personal notes assistant. Help them find answers from their own thoughts and captured information.

Answer using ONLY the ${sourceCount} note excerpts provided below.

${getGroundingInstructions(sourceCount)}

## How to Cite
• Group related facts, cite at section end: "X relates to Y. Z is important. [N1][N2]"
• Don't over-cite — one citation per paragraph is usually enough
• Only cite sources N1-N${sourceCount}. Never invent citations.

## Response Format
${STRUCTURE_BY_INTENT[intent] || STRUCTURE_BY_INTENT.search}

${getCitationExample(intent)}

## When Sources Don't Fully Answer
• Partial match: "Your notes touch on this..." + share what's relevant with citations
• No match: "I couldn't find this in your notes."
• Sources conflict: Present both views with their citations

## Tone
Be conversational and helpful, not robotic. Use phrases like "your notes mention..." or "based on what you wrote..."`;
}

// =============================================================================
// User Prompt
// =============================================================================

function buildUserPrompt(query: string, sources: Source[]): string {
  const hasScores = sources.some(s => s.relevanceScore !== undefined);

  const sourcesText = sources
    .map(s => `[${s.cid}]: ${hasScores ? getRelevanceIndicator(s.relevanceScore) : ''}${s.text}`)
    .join('\n\n');

  const relevanceNote = hasScores ? '\n(★ indicates higher relevance to your question)\n' : '';

  return `## Your Notes (${sources.length} excerpts)
${relevanceNote}
${sourcesText}

---

**Question:** ${query}`;
}

// =============================================================================
// Public API
// =============================================================================

export function buildCompleteEnhancedPrompt(
  query: string,
  chunks: ScoredChunk[],
  intent: QueryIntent
): { systemPrompt: string; userPrompt: string } {
  const sources: Source[] = chunks.map((chunk, index) => ({
    cid: `N${index + 1}`,
    text: chunk.text,
    relevanceScore: chunk.score,
  }));

  const systemPrompt = buildSystemPrompt(sources.length, intent);
  const userPrompt = buildUserPrompt(query, sources);

  logInfo('Built enhanced prompt', {
    sourceCount: sources.length,
    intent,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
  });

  return { systemPrompt, userPrompt };
}
