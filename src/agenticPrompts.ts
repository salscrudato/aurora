/**
 * Agentic Prompt Framework
 *
 * Intelligent prompt system that adapts response generation based on:
 * - Query intent and complexity
 * - Source quality and relevance
 * - Optimal response formatting
 */

import { QueryIntent, ScoredChunk } from './types';
import { logInfo } from './utils';

// =============================================================================
// Types
// =============================================================================

/** Response format types matched to query intents */
export type ResponseFormat =
  | 'direct_answer'    // Factual questions
  | 'structured_list'  // List/enumeration queries
  | 'narrative'        // Summaries and context-heavy queries
  | 'decision_brief'   // Decision-related queries
  | 'action_plan';     // Action items and todos

/** Response style options */
export type ResponseStyle = 'concise' | 'detailed' | 'conversational';

/** Agentic prompt configuration */
export interface AgenticPromptConfig {
  /** Include thinking guidance for the LLM */
  enableStructuredThinking: boolean;
  /** Optimize format based on intent */
  formatOptimization: boolean;
  /** Show relevance indicators on sources */
  qualityHints: boolean;
  /** Maximum sources to include in prompt */
  maxSourcesInPrompt: number;
  /** Response tone/style */
  responseStyle: ResponseStyle;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG: AgenticPromptConfig = {
  enableStructuredThinking: true,
  formatOptimization: true,
  qualityHints: true,
  maxSourcesInPrompt: 15,
  responseStyle: 'conversational',
};

/** Relevance score thresholds */
const RELEVANCE_THRESHOLDS = {
  high: 0.75,
  medium: 0.55,
} as const;

// =============================================================================
// Intent to Format Mapping
// =============================================================================

/** Map query intent to optimal response format */
const INTENT_FORMAT_MAP: Record<QueryIntent, ResponseFormat> = {
  question: 'direct_answer',
  search: 'direct_answer',
  summarize: 'narrative',
  list: 'structured_list',
  action_item: 'action_plan',
  decision: 'decision_brief',
};

function getResponseFormat(intent: QueryIntent): ResponseFormat {
  return INTENT_FORMAT_MAP[intent] ?? 'direct_answer';
}

// =============================================================================
// Format Instructions
// =============================================================================

const FORMAT_INSTRUCTIONS: Record<ResponseFormat, string> = {
  direct_answer: `**Format:** Start with a clear, direct answer in 1-2 sentences. Follow with supporting details if needed. Be concise.`,

  structured_list: `**Format:** Use a clean bulleted or numbered list. Each item should be clear and complete. Group related items together.`,

  narrative: `**Format:** Write a cohesive summary with logical flow. Use paragraphs for different topics. Highlight key takeaways.`,

  decision_brief: `**Format:** State the decision clearly first. Explain the reasoning. Note any alternatives considered or caveats.`,

  action_plan: `**Format:** List action items with:
• Clear, actionable descriptions
• Owner/assignee if mentioned
• Deadline if specified
• Status if known`,
};

// =============================================================================
// Thinking Guidance
// =============================================================================

const THINKING_GUIDANCE: Record<ResponseFormat, string> = {
  direct_answer: `Before answering, identify which sources directly address the question. Lead with the most relevant information.`,

  structured_list: `Before listing, scan all sources for relevant items. Group related items and order them logically.`,

  narrative: `Before summarizing, identify the main themes across sources. Create a coherent narrative that connects key points.`,

  decision_brief: `Identify the decision and its rationale from the sources. Present it clearly with context.`,

  action_plan: `Extract all action items, noting owners and deadlines where mentioned. Prioritize by urgency if indicated.`,
};

// =============================================================================
// Style Guidance
// =============================================================================

const STYLE_GUIDANCE: Record<ResponseStyle, string> = {
  concise: `**Style:** Be brief and to the point. No filler words.`,
  detailed: `**Style:** Provide comprehensive answers with context and examples where helpful.`,
  conversational: `**Style:** Be warm and helpful. Use phrases like "your notes mention..." or "based on what you wrote..."`,
};

// =============================================================================
// Prompt Section Builders
// =============================================================================

/** Build the core identity and role instruction */
function buildIdentitySection(sourceCount: number): string {
  return `You are the user's personal notes assistant. Your role is to help them find and understand information from their own notes.

You have access to ${sourceCount} excerpts from their notes. Answer ONLY using information from these sources.`;
}

/** Build citation rules */
function buildCitationRules(sourceCount: number): string {
  return `**Citation Rules:**
• Cite sources using [N1], [N2], etc. up to [N${sourceCount}]
• Place citations at the end of sentences or paragraphs
• Every factual claim should have a citation
• If sources don't answer the question, say so honestly
• Never invent or guess citations`;
}

/** Get human-readable relevance label based on score */
function getRelevanceLabel(score: number): string {
  if (score >= RELEVANCE_THRESHOLDS.high) return '⬆ High relevance';
  if (score >= RELEVANCE_THRESHOLDS.medium) return '→ Relevant';
  return '';
}

/** Build quality-aware source presentation */
function buildSourcesSection(chunks: ScoredChunk[]): string {
  const sources = chunks
    .map((chunk, i) => {
      const label = getRelevanceLabel(chunk.score);
      const prefix = label ? `[${label}] ` : '';
      return `[N${i + 1}]: ${prefix}${chunk.text}`;
    })
    .join('\n\n');

  return `## Your Notes (${chunks.length} excerpts)\n\n${sources}`;
}

/** Build structured thinking guidance */
function buildThinkingGuidance(format: ResponseFormat): string {
  return `**Approach:** ${THINKING_GUIDANCE[format]}`;
}

/** Build edge case handling instructions */
function buildEdgeCaseHandling(): string {
  return `**When Sources Don't Fully Answer:**
• Partial info: Share what's relevant, note what's missing
• No match: "I couldn't find this in your notes."
• Conflicting info: Present both perspectives with citations`;
}

/** Build markdown formatting rules */
function buildFormattingRules(): string {
  return `**Formatting:**
• Use **bold** for key terms and emphasis
• Use bullet points for lists (not hyphens)
• Use headings (##) sparingly for long responses
• Keep paragraphs short and scannable`;
}

// =============================================================================
// Public API - Prompt Builders
// =============================================================================

/** Merge partial config with defaults */
function mergeConfig(config: Partial<AgenticPromptConfig>): AgenticPromptConfig {
  return { ...DEFAULT_CONFIG, ...config };
}

/** Calculate average relevance score */
function calculateAvgRelevance(chunks: ScoredChunk[]): number {
  if (chunks.length === 0) return 0;
  const sum = chunks.reduce((acc, c) => acc + (c.score || 0), 0);
  return Math.round((sum / chunks.length) * 100) / 100;
}

/** Build the complete agentic system prompt */
export function buildAgenticSystemPrompt(
  sourceCount: number,
  intent: QueryIntent,
  config: Partial<AgenticPromptConfig> = {}
): string {
  const cfg = mergeConfig(config);
  const format = getResponseFormat(intent);

  const sections: string[] = [
    buildIdentitySection(sourceCount),
    '',
    buildCitationRules(sourceCount),
  ];

  if (cfg.formatOptimization) {
    sections.push('', FORMAT_INSTRUCTIONS[format]);
  }

  if (cfg.enableStructuredThinking) {
    sections.push('', buildThinkingGuidance(format));
  }

  sections.push('', buildEdgeCaseHandling());
  sections.push('', STYLE_GUIDANCE[cfg.responseStyle]);
  sections.push('', buildFormattingRules());

  return sections.join('\n');
}

/** Build the agentic user prompt with sources and query */
export function buildAgenticUserPrompt(
  query: string,
  chunks: ScoredChunk[],
  config: Partial<AgenticPromptConfig> = {}
): string {
  const cfg = mergeConfig(config);
  const limitedChunks = chunks.slice(0, cfg.maxSourcesInPrompt);

  return `${buildSourcesSection(limitedChunks)}

---

**Question:** ${query}`;
}

/** Build complete agentic prompt (system + user) */
export function buildCompleteAgenticPrompt(
  query: string,
  chunks: ScoredChunk[],
  intent: QueryIntent,
  config: Partial<AgenticPromptConfig> = {}
): { systemPrompt: string; userPrompt: string; format: ResponseFormat } {
  const cfg = mergeConfig(config);
  const format = getResponseFormat(intent);

  const systemPrompt = buildAgenticSystemPrompt(chunks.length, intent, cfg);
  const userPrompt = buildAgenticUserPrompt(query, chunks, cfg);

  logInfo('Built agentic prompt', {
    sourceCount: chunks.length,
    intent,
    format,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
    avgRelevance: calculateAvgRelevance(chunks),
  });

  return { systemPrompt, userPrompt, format };
}

/** Get the default agentic config (for observability/testing) */
export function getAgenticPromptConfig(): AgenticPromptConfig {
  return { ...DEFAULT_CONFIG };
}
