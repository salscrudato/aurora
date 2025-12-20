/**
 * AuroraNotes API - Enhanced Prompt Engineering
 *
 * Improved RAG prompts for more consistent and accurately-cited responses.
 *
 * Features:
 * - Explicit grounding instructions
 * - Citation placement guidance
 * - Claim-level citation requirements
 * - Response structure templates
 * - Consistency enforcement rules
 * - Step-by-step citation protocol
 * - Few-shot examples for proper citation
 * - Intent-specific prompt optimization
 */

import { QueryIntent, ScoredChunk } from './types';
import { logInfo } from './utils';

/**
 * Step-by-step citation protocol for maximum accuracy
 */
const CITATION_PROTOCOL = `
## Citation Protocol (CRITICAL - Follow Exactly)

When answering, you MUST follow this citation process:

### Step 1: Identify Claims
For each sentence you write, determine if it contains:
- A factual statement (requires citation)
- A definition or explanation (requires citation)
- A procedural step from the notes (requires citation)
- Your own synthesis or opinion (no citation needed, but state clearly)

### Step 2: Match to Sources
For each claim requiring citation:
- Find the EXACT source chunk that supports it
- Verify the source actually says what you're claiming
- If no source supports the claim, DO NOT make it

### Step 3: Apply Citations
- Place [N#] IMMEDIATELY after the claim it supports
- Use the LOWEST numbered source that supports the claim
- Multiple claims from same source: cite each occurrence
- Never cite a source for information it doesn't contain

### Step 4: Verify
Before finalizing, check each citation:
- Does source N# actually contain this information?
- Is the claim accurately representing the source?
- Would removing this citation leave an unsupported claim?
`;

/**
 * Few-shot examples demonstrating proper citation usage
 */
const FEW_SHOT_EXAMPLES = {
  factual: `
### Example: Factual Question
Question: "What database does the project use?"
Sources:
[N1] The project uses PostgreSQL 14 as the primary database.
[N2] Redis is used for caching frequently accessed data.

Good Answer: "The project uses PostgreSQL 14 as its primary database, with Redis handling caching for frequently accessed data. [N1][N2]"

Bad Answer: "The project uses PostgreSQL 14 [N1]. Redis is used for caching [N2]." (Choppy, cites after every sentence)
`,

  procedural: `
### Example: How-To Question
Question: "How do I deploy the application?"
Sources:
[N1] To deploy: 1) Run npm run build 2) Push to main branch 3) CI/CD handles the rest
[N2] Deployments require approval from a team lead.

Good Answer: "To deploy the application:
• Run \`npm run build\`
• Push your changes to the main branch
• The CI/CD pipeline handles the rest automatically [N1]

Note: Deployments require approval from a team lead. [N2]"

Bad Answer: "Run build [N1], push to main [N1], and get approval [N2]." (Too terse, citations after every phrase)
`,

  conceptual: `
### Example: Conceptual Question
Question: "What is the authentication strategy?"
Sources:
[N1] Authentication uses JWT tokens with 24-hour expiration.
[N2] Refresh tokens are stored in HTTP-only cookies for security.

Good Answer: "The authentication strategy uses JWT tokens that expire after 24 hours. Refresh tokens are stored in HTTP-only cookies, which prevents XSS attacks from accessing them. [N1][N2]"

Bad Answer: "JWT tokens are used [N1]. Refresh tokens use cookies [N2]." (Choppy, loses the security context)
`,
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
 * Get grounding instructions based on level
 */
function getGroundingInstructions(level: GroundingLevel): string {
  switch (level) {
    case 'strict':
      return `STRICT GROUNDING RULES (MANDATORY):
• EVERY sentence containing a fact MUST have at least one citation [N#]
• Do NOT make any claims not directly stated in the sources
• If information is ambiguous, quote the source directly
• If you cannot find supporting evidence, explicitly state "The sources do not contain..."
• Prefer direct quotes with citations over paraphrasing

FORBIDDEN (will cause rejection):
• Making factual claims without citations
• Citing a source for information it doesn't contain
• Adding information from your general knowledge not in the sources
• Using citation IDs that don't exist (only N1 through N${'{sourceCount}'} are valid)`;

    case 'balanced':
      return `GROUNDING RULES:
• Each factual claim should have a citation [N#]
• You may synthesize information from multiple sources
• Clearly distinguish between what sources say vs. your interpretation
• If sources conflict, present both views with their citations`;

    case 'flexible':
      return `GROUNDING GUIDELINES:
• Cite sources for key claims [N#]
• You may draw reasonable inferences from the sources
• Focus on answering the question helpfully
• Cite when making specific factual claims`;
  }
}

/**
 * Get citation placement instructions
 */
function getCitationPlacementInstructions(maxPerClaim: number): string {
  return `CITATION PLACEMENT:
• Place citations at the END of each paragraph or logical section
• Group related facts together, then cite: "React uses hooks for state. useState handles local state, useEffect handles side effects. [N1]"
• Maximum ${maxPerClaim} citations per section - choose the most relevant
• Avoid citing after every single sentence - this clutters the response
• Only cite when introducing NEW information from a different source`;
}

/**
 * Get response structure template based on intent
 */
function getStructureTemplate(intent: QueryIntent): string {
  switch (intent) {
    case 'summarize':
      return `RESPONSE STRUCTURE:
1. Brief overview with citation [N#]
2. Key points as bullet list, each cited
3. Keep it concise, focus on most important information`;

    case 'list':
      return `RESPONSE STRUCTURE:
1. Brief overview of the process
2. Numbered or bulleted items, each with citation [N#]
3. Group related items if applicable`;

    case 'decision':
      return `RESPONSE STRUCTURE:
1. State what was decided with citation [N#]
2. Key reasons/rationale with citations
3. Any trade-offs or alternatives mentioned`;

    case 'action_item':
      return `RESPONSE STRUCTURE:
1. Clear list of action items/todos
2. Include any deadlines, owners, or priorities mentioned
3. Cite the source for each item [N#]`;

    case 'question':
      return `RESPONSE STRUCTURE:
1. Direct answer to the question with citation [N#]
2. Supporting details with their citations
3. Any relevant caveats or limitations`;

    case 'search':
    default:
      return `RESPONSE STRUCTURE:
1. Direct answer with citation [N#]
2. Supporting information with citations
3. Keep response focused and concise`;
  }
}

/**
 * Get example of good citation usage
 */
function getCitationExample(): string {
  return `CITATION EXAMPLE:
Good: "The API uses REST architecture with JSON responses. Authentication is handled via JWT tokens. [N1][N2]"
Bad: "The API uses REST architecture [N1]. It uses JSON responses [N1]. Authentication is handled via JWT tokens [N2]."

The good example groups related facts and cites at the end. The bad example is choppy with redundant citations.`;
}

/**
 * Get Chain-of-Citation reasoning instructions
 * This enforces a cite-as-you-write approach with explicit reasoning steps
 */
function getChainOfCitationInstructions(): string {
  return `CHAIN-OF-CITATION REASONING:
Before writing your response, mentally follow these steps:
1. IDENTIFY: Which sources are relevant to this question?
2. EXTRACT: What specific facts from each source answer the question?
3. PLAN: Which fact from which source should I mention first?
4. WRITE: As you write each sentence, immediately add the citation

For each fact you write:
- Think: "Where did I learn this?" → That's your citation
- Add the [N#] citation IMMEDIATELY after the fact
- If you can't identify a source, don't include the fact`;
}

/**
 * Build consistency enforcement rules
 */
function getConsistencyRules(): string {
  return `CONSISTENCY RULES:
• Use consistent citation format: [N1], [N2], etc.
• Maintain consistent tone throughout the response
• If listing items, use consistent formatting (all bullets or all numbers)
• Keep similar claims at similar detail levels
• Don't repeat the same information with different citations`;
}

/**
 * Get intent-specific few-shot example
 */
function getFewShotExample(intent: QueryIntent): string {
  switch (intent) {
    case 'list':
    case 'action_item':
      return FEW_SHOT_EXAMPLES.procedural;
    case 'summarize':
    case 'decision':
      return FEW_SHOT_EXAMPLES.conceptual;
    case 'question':
    case 'search':
    default:
      return FEW_SHOT_EXAMPLES.factual;
  }
}

/**
 * Build the enhanced system prompt
 */
export function buildEnhancedSystemPrompt(
  sourceCount: number,
  intent: QueryIntent,
  config: Partial<EnhancedPromptConfig> = {}
): string {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  const sections: string[] = [
    `You are an intelligent assistant helping the user with their personal notes. Answer questions using ONLY the provided note excerpts.`,
    '',
    getGroundingInstructions(fullConfig.groundingLevel),
    '',
    getCitationPlacementInstructions(fullConfig.maxCitationsPerClaim),
    '',
    `AVAILABLE SOURCES: You have exactly ${sourceCount} sources numbered N1 through N${sourceCount}. Only use these citation IDs.`,
  ];

  // Add the structured citation protocol for strict grounding
  if (fullConfig.groundingLevel === 'strict') {
    sections.push('', CITATION_PROTOCOL);
  }

  if (fullConfig.enforceStructure) {
    sections.push('', getStructureTemplate(intent));
  }

  if (fullConfig.includeExamples) {
    sections.push('', getCitationExample());
    // Add intent-specific few-shot example
    sections.push('', getFewShotExample(intent));
  }

  // Always include Chain-of-Citation reasoning for better grounding
  sections.push('', getChainOfCitationInstructions());

  sections.push('', getConsistencyRules());

  return sections.join('\n');
}

/**
 * Build enhanced user prompt with sources
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
    ? `\nTOPICS DETECTED: ${topicsHint}\n`
    : '';

  return `${topicsSection}
=== USER'S NOTE EXCERPTS (${sources.length} sources) ===
${sourcesText}
=== END OF NOTES ===

Question: ${query}

Answer based on the notes above. Remember: every factual claim needs a citation [N#].`;
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

