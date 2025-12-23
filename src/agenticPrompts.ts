/**
 * AuroraNotes API - Agentic Prompt Framework
 *
 * An intelligent prompt system that adapts response generation based on:
 * - Query intent and complexity
 * - Source quality and relevance
 * - Optimal response formatting
 *
 * Design Principles:
 * 1. Structured Thinking: Guide LLM through logical response construction
 * 2. Format Optimization: Match output format to query type
 * 3. Quality Signals: Provide relevance hints to prioritize sources
 * 4. Graceful Handling: Handle edge cases naturally
 * 5. Consistent Formatting: Enforce clean, readable markdown
 */

import { QueryIntent, ScoredChunk } from './types';
import { logInfo } from './utils';

/**
 * Response format types matched to query intents
 */
export type ResponseFormat = 
  | 'direct_answer'    // For factual questions
  | 'structured_list'  // For list/enumeration queries
  | 'narrative'        // For summaries and context-heavy queries
  | 'decision_brief'   // For decision-related queries
  | 'action_plan';     // For action items and todos

/**
 * Agentic prompt configuration
 */
export interface AgenticPromptConfig {
  enableStructuredThinking: boolean;  // Include thinking guidance
  formatOptimization: boolean;        // Optimize format for intent
  qualityHints: boolean;              // Show relevance indicators
  maxSourcesInPrompt: number;         // Limit sources to prevent overload
  responseStyle: 'concise' | 'detailed' | 'conversational';
}

const DEFAULT_AGENTIC_CONFIG: AgenticPromptConfig = {
  enableStructuredThinking: true,
  formatOptimization: true,
  qualityHints: true,
  maxSourcesInPrompt: 15,
  responseStyle: 'conversational',
};

/**
 * Map query intent to optimal response format
 */
function getResponseFormat(intent: QueryIntent): ResponseFormat {
  const formatMap: Record<QueryIntent, ResponseFormat> = {
    question: 'direct_answer',
    search: 'direct_answer',
    summarize: 'narrative',
    list: 'structured_list',
    action_item: 'action_plan',
    decision: 'decision_brief',
  };
  return formatMap[intent] || 'direct_answer';
}

/**
 * Get format-specific instructions
 */
function getFormatInstructions(format: ResponseFormat): string {
  const instructions: Record<ResponseFormat, string> = {
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
  return instructions[format];
}

/**
 * Build the core identity and role instruction
 */
function buildIdentitySection(sourceCount: number): string {
  return `You are the user's personal notes assistant. Your role is to help them find and understand information from their own notes.

You have access to ${sourceCount} excerpts from their notes. Answer ONLY using information from these sources.`;
}

/**
 * Build citation rules (simplified and clear)
 */
function buildCitationRules(sourceCount: number): string {
  return `**Citation Rules:**
• Cite sources using [N1], [N2], etc. up to [N${sourceCount}]
• Place citations at the end of sentences or paragraphs
• Every factual claim should have a citation
• If sources don't answer the question, say so honestly
• Never invent or guess citations`;
}

/**
 * Build quality-aware source presentation
 */
function buildSourcesSection(chunks: ScoredChunk[]): string {
  const sources = chunks.map((chunk, i) => {
    const relevance = getRelevanceLabel(chunk.score);
    const prefix = relevance ? `[${relevance}] ` : '';
    return `[N${i + 1}]: ${prefix}${chunk.text}`;
  }).join('\n\n');

  return `## Your Notes (${chunks.length} excerpts)

${sources}`;
}

/**
 * Get human-readable relevance label
 */
function getRelevanceLabel(score: number): string {
  if (score >= 0.75) return '⬆ High relevance';
  if (score >= 0.55) return '→ Relevant';
  return '';
}

/**
 * Build structured thinking guidance
 */
function buildThinkingGuidance(format: ResponseFormat): string {
  const guidance: Record<ResponseFormat, string> = {
    direct_answer: `Before answering, identify which sources directly address the question. Lead with the most relevant information.`,
    
    structured_list: `Before listing, scan all sources for relevant items. Group related items and order them logically.`,
    
    narrative: `Before summarizing, identify the main themes across sources. Create a coherent narrative that connects key points.`,
    
    decision_brief: `Identify the decision and its rationale from the sources. Present it clearly with context.`,
    
    action_plan: `Extract all action items, noting owners and deadlines where mentioned. Prioritize by urgency if indicated.`,
  };
  return `**Approach:** ${guidance[format]}`;
}

/**
 * Build edge case handling instructions
 */
function buildEdgeCaseHandling(): string {
  return `**When Sources Don't Fully Answer:**
• Partial info: Share what's relevant, note what's missing
• No match: "I couldn't find this in your notes."
• Conflicting info: Present both perspectives with citations`;
}

/**
 * Build tone and style guidance
 */
function buildToneGuidance(style: 'concise' | 'detailed' | 'conversational'): string {
  const tones: Record<typeof style, string> = {
    concise: `**Style:** Be brief and to the point. No filler words.`,
    detailed: `**Style:** Provide comprehensive answers with context and examples where helpful.`,
    conversational: `**Style:** Be warm and helpful. Use phrases like "your notes mention..." or "based on what you wrote..."`,
  };
  return tones[style];
}

/**
 * Build markdown formatting rules
 */
function buildFormattingRules(): string {
  return `**Formatting:**
• Use **bold** for key terms and emphasis
• Use bullet points for lists (not hyphens)
• Use headings (##) sparingly for long responses
• Keep paragraphs short and scannable`;
}

/**
 * Build the complete agentic system prompt
 */
export function buildAgenticSystemPrompt(
  sourceCount: number,
  intent: QueryIntent,
  config: Partial<AgenticPromptConfig> = {}
): string {
  const fullConfig = { ...DEFAULT_AGENTIC_CONFIG, ...config };
  const format = getResponseFormat(intent);

  const sections: string[] = [
    buildIdentitySection(sourceCount),
    '',
    buildCitationRules(sourceCount),
  ];

  // Add format-specific instructions
  if (fullConfig.formatOptimization) {
    sections.push('', getFormatInstructions(format));
  }

  // Add structured thinking guidance
  if (fullConfig.enableStructuredThinking) {
    sections.push('', buildThinkingGuidance(format));
  }

  // Add edge case handling
  sections.push('', buildEdgeCaseHandling());

  // Add tone guidance
  sections.push('', buildToneGuidance(fullConfig.responseStyle));

  // Add formatting rules
  sections.push('', buildFormattingRules());

  return sections.join('\n');
}

/**
 * Build the agentic user prompt with sources and query
 */
export function buildAgenticUserPrompt(
  query: string,
  chunks: ScoredChunk[],
  config: Partial<AgenticPromptConfig> = {}
): string {
  const fullConfig = { ...DEFAULT_AGENTIC_CONFIG, ...config };

  // Limit sources if needed
  const limitedChunks = chunks.slice(0, fullConfig.maxSourcesInPrompt);

  const sourcesSection = buildSourcesSection(limitedChunks);

  return `${sourcesSection}

---

**Question:** ${query}`;
}

/**
 * Build complete agentic prompt (system + user)
 */
export function buildCompleteAgenticPrompt(
  query: string,
  chunks: ScoredChunk[],
  intent: QueryIntent,
  config: Partial<AgenticPromptConfig> = {}
): { systemPrompt: string; userPrompt: string; format: ResponseFormat } {
  const fullConfig = { ...DEFAULT_AGENTIC_CONFIG, ...config };
  const format = getResponseFormat(intent);

  const systemPrompt = buildAgenticSystemPrompt(chunks.length, intent, fullConfig);
  const userPrompt = buildAgenticUserPrompt(query, chunks, fullConfig);

  logInfo('Built agentic prompt', {
    sourceCount: chunks.length,
    intent,
    format,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
    avgRelevance: chunks.length > 0
      ? Math.round(chunks.reduce((sum, c) => sum + (c.score || 0), 0) / chunks.length * 100) / 100
      : 0,
  });

  return { systemPrompt, userPrompt, format };
}

/**
 * Get the agentic config for observability
 */
export function getAgenticPromptConfig(): AgenticPromptConfig {
  return { ...DEFAULT_AGENTIC_CONFIG };
}

