/**
 * Query Understanding - Extracts intent, time hints, keywords, and entities
 */

import { QueryAnalysis, QueryIntent } from "./types";
import { extractKeywords, requestMemo } from "./utils";

// =============================================================================
// Pattern Definitions
// =============================================================================

const INTENT_PATTERNS: { pattern: RegExp; intent: QueryIntent }[] = [
  // Summarize
  { pattern: /\b(summarize|summary|overview|recap|brief|tldr|tl;dr)\b/i, intent: 'summarize' },
  { pattern: /\bwhat (are|were) (my|the|our) (key|main|important)\b/i, intent: 'summarize' },
  { pattern: /\bgive me (a|the) (summary|overview|recap)\b/i, intent: 'summarize' },
  { pattern: /\bhighlight(s)?\b/i, intent: 'summarize' },
  // Decision
  { pattern: /\b(decision|decide|chose|chosen|selected|picked|went with)\b/i, intent: 'decision' },
  { pattern: /\bwhy did (I|we) (choose|pick|select|go with|decide)\b/i, intent: 'decision' },
  { pattern: /\bwhat did (I|we) decide\b/i, intent: 'decision' },
  { pattern: /\b(reasoning|rationale) (behind|for)\b/i, intent: 'decision' },
  // Action items
  { pattern: /\b(todos?|to-dos?|action items?|tasks?|next steps?|follow[- ]?ups?)\b/i, intent: 'action_item' },
  { pattern: /\bwhat (do I|should I|need to|must I) (do|complete|finish|work on)\b/i, intent: 'action_item' },
  { pattern: /\bpending (tasks?|items?|work)\b/i, intent: 'action_item' },
  { pattern: /\bremind(er)?s?\b/i, intent: 'action_item' },
  { pattern: /\b(outstanding|incomplete|open) (items?|tasks?)\b/i, intent: 'action_item' },
  // List
  { pattern: /\b(list|show me|give me|enumerate|all the)\b/i, intent: 'list' },
  { pattern: /\bhow many\b/i, intent: 'list' },
  { pattern: /\bwhat are (all|the) (?!.*\b(todos?|action items?|tasks?)\b)/i, intent: 'list' },
  // Question (lowest priority)
  { pattern: /^(what|who|when|where|why|how|which|is|are|was|were|do|does|did|can|could|will|would)\b/i, intent: 'question' },
];

const TIME_PATTERNS: { pattern: RegExp; days: number }[] = [
  { pattern: /\b(today|now|current|just now)\b/i, days: 1 },
  { pattern: /\byesterday\b/i, days: 2 },
  { pattern: /\b(this week|past week|current week)\b/i, days: 7 },
  { pattern: /\blast week\b/i, days: 14 },
  { pattern: /\bpast (few|couple) days\b/i, days: 5 },
  { pattern: /\b(this month|past month|current month)\b/i, days: 30 },
  { pattern: /\blast month\b/i, days: 60 },
  { pattern: /\b(this year|past year)\b/i, days: 365 },
  { pattern: /\b(recent(ly)?|latest|newest|new)\b/i, days: 14 },
  { pattern: /\b(last|past) (\d+) days?\b/i, days: -1 },
  { pattern: /\b(last|past) (\d+) weeks?\b/i, days: -2 },
  { pattern: /\b(last|past) (\d+) months?\b/i, days: -3 },
  { pattern: /\ball (time|notes|history|ever)\b/i, days: 365 },
  { pattern: /\b(older|old|earlier)\b/i, days: 180 },
];

const ENTITY_PATTERNS: RegExp[] = [
  /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b/g,
  /"([^"]+)"/g,
  /'([^']+)'/g,
];

const INTENT_BOOST_TERMS: Record<QueryIntent, string[]> = {
  decision: ['decided', 'chose', 'chosen', 'selected', 'decision', 'picked', 'went', 'because', 'reason', 'why', 'rationale', 'conclusion', 'option', 'alternative'],
  action_item: ['todo', 'task', 'action', 'item', 'pending', 'follow', 'followup', 'need', 'must', 'should', 'complete', 'finish', 'do', 'next', 'step', 'due', 'assigned', 'owner', 'deadline', 'priority', 'urgent'],
  summarize: ['summary', 'key', 'main', 'overview', 'highlight', 'important', 'point', 'conclusion', 'takeaway', 'finding', 'result', 'outcome'],
  list: ['list', 'items', 'all', 'every', 'each', 'mentioned', 'include', 'contain', 'enumerate', 'names', 'people', 'things'],
  question: [],
  search: [],
};

const COMMON_WORDS = new Set(['I', 'My', 'The', 'What', 'When', 'Where', 'Why', 'How', 'Which', 'Who']);

// =============================================================================
// Helper Functions
// =============================================================================

const normalizeQuery = (query: string): string =>
  query.trim().replace(/\s+/g, ' ').replace(/[^\w\s?!.,'"()-]/g, '').slice(0, 2000);

const detectIntent = (query: string): QueryIntent => {
  const lower = query.toLowerCase();
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(lower)) return intent;
  }
  return 'search';
};

function extractTimeHint(query: string): { days: number } | undefined {
  const lower = query.toLowerCase();
  for (const { pattern, days } of TIME_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      if (days === -1 && match[2]) {
        const n = parseInt(match[2], 10);
        if (n > 0 && n <= 365) return { days: n };
      } else if (days === -2 && match[2]) {
        const n = parseInt(match[2], 10);
        if (n > 0 && n <= 52) return { days: n * 7 };
      } else if (days === -3 && match[2]) {
        const n = parseInt(match[2], 10);
        if (n > 0 && n <= 12) return { days: n * 30 };
      } else if (days > 0) {
        return { days };
      }
    }
  }
  return undefined;
}

function extractEntities(query: string): string[] {
  const entities = new Set<string>();
  for (const pattern of ENTITY_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(query)) !== null) {
      const entity = match[1].trim();
      if (entity.length > 1 && !COMMON_WORDS.has(entity)) entities.add(entity);
    }
  }
  return Array.from(entities).slice(0, 5);
}

function generateBoostTerms(keywords: string[], intent: QueryIntent): string[] {
  const terms = [...keywords, ...(INTENT_BOOST_TERMS[intent] || [])];
  return [...new Set(terms)].slice(0, 20);
}

// =============================================================================
// Main Export
// =============================================================================

export function analyzeQuery(query: string): QueryAnalysis {
  return requestMemo(`query_analysis:${query}`, () => {
    const normalizedQuery = normalizeQuery(query);
    const intent = detectIntent(normalizedQuery);
    const keywords = extractKeywords(normalizedQuery);
    const timeHint = extractTimeHint(normalizedQuery);
    const entities = extractEntities(query);
    const boostTerms = generateBoostTerms(keywords, intent);

    return {
      originalQuery: query,
      normalizedQuery,
      keywords,
      intent,
      timeHint,
      entities: entities.length > 0 ? entities : undefined,
      boostTerms: boostTerms.length > keywords.length ? boostTerms : undefined,
    };
  });
}
