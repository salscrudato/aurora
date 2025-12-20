/**
 * AuroraNotes API - Query Understanding Module
 *
 * Analyzes user queries to extract intent, time hints, keywords, and entities.
 * Improves retrieval quality by understanding what the user is looking for.
 *
 * Optimizations:
 * - Request-scoped memoization to avoid re-analyzing the same query
 */

import { QueryAnalysis, QueryIntent } from "./types";
import { extractKeywords, requestMemo } from "./utils";

// Intent detection patterns - ordered by specificity (most specific first)
const INTENT_PATTERNS: { pattern: RegExp; intent: QueryIntent }[] = [
  // Summarize patterns
  { pattern: /\b(summarize|summary|overview|recap|brief|tldr|tl;dr)\b/i, intent: 'summarize' },
  { pattern: /\bwhat (are|were) (my|the|our) (key|main|important)\b/i, intent: 'summarize' },
  { pattern: /\bgive me (a|the) (summary|overview|recap)\b/i, intent: 'summarize' },
  { pattern: /\bhighlight(s)?\b/i, intent: 'summarize' },

  // Decision patterns - check before general question patterns
  { pattern: /\b(decision|decide|chose|chosen|selected|picked|went with)\b/i, intent: 'decision' },
  { pattern: /\bwhy did (I|we) (choose|pick|select|go with|decide)\b/i, intent: 'decision' },
  { pattern: /\bwhat did (I|we) decide\b/i, intent: 'decision' },
  { pattern: /\b(reasoning|rationale) (behind|for)\b/i, intent: 'decision' },

  // Action item patterns
  { pattern: /\b(todo|to-do|action item|task|next step|follow[- ]?up)\b/i, intent: 'action_item' },
  { pattern: /\bwhat (do I|should I|need to|must I) (do|complete|finish|work on)\b/i, intent: 'action_item' },
  { pattern: /\bpending (task|item|work)\b/i, intent: 'action_item' },
  { pattern: /\bremind(er)?\b/i, intent: 'action_item' },

  // List patterns
  { pattern: /\b(list|show me|give me|enumerate|all the)\b/i, intent: 'list' },
  { pattern: /\bhow many\b/i, intent: 'list' },
  { pattern: /\bwhat are (all|the)\b/i, intent: 'list' },

  // Question patterns (generic - lowest priority)
  { pattern: /^(what|who|when|where|why|how|which|is|are|was|were|do|does|did|can|could|will|would)\b/i, intent: 'question' },
];

// Time hint patterns with more granularity
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
  { pattern: /\b(last|past) (\d+) days?\b/i, days: -1 }, // Special: extract number
  { pattern: /\b(last|past) (\d+) weeks?\b/i, days: -2 }, // Special: extract weeks
  { pattern: /\b(last|past) (\d+) months?\b/i, days: -3 }, // Special: extract months
  { pattern: /\ball (time|notes|history|ever)\b/i, days: 365 },
  { pattern: /\b(older|old|earlier)\b/i, days: 180 },
];

// Entity extraction patterns (projects, names, etc.)
const ENTITY_PATTERNS: RegExp[] = [
  // Capitalized words that might be names/projects (2+ chars)
  /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b/g,
  // Quoted terms
  /"([^"]+)"/g,
  /'([^']+)'/g,
];

/**
 * Normalize query for consistent processing
 */
function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s?!.,'"()-]/g, '') // Remove unusual chars
    .slice(0, 2000); // Limit length
}

/**
 * Detect query intent
 */
function detectIntent(query: string): QueryIntent {
  const lowerQuery = query.toLowerCase();
  
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(lowerQuery)) {
      return intent;
    }
  }
  
  // Default to search if no specific intent detected
  return 'search';
}

/**
 * Extract time hints from query with support for various time units
 */
function extractTimeHint(query: string): QueryAnalysis['timeHint'] | undefined {
  const lowerQuery = query.toLowerCase();

  for (const { pattern, days } of TIME_PATTERNS) {
    const match = lowerQuery.match(pattern);
    if (match) {
      // Handle "last N days" pattern
      if (days === -1 && match[2]) {
        const numDays = parseInt(match[2], 10);
        if (!isNaN(numDays) && numDays > 0 && numDays <= 365) {
          return { days: numDays };
        }
      }
      // Handle "last N weeks" pattern
      if (days === -2 && match[2]) {
        const numWeeks = parseInt(match[2], 10);
        if (!isNaN(numWeeks) && numWeeks > 0 && numWeeks <= 52) {
          return { days: numWeeks * 7 };
        }
      }
      // Handle "last N months" pattern
      if (days === -3 && match[2]) {
        const numMonths = parseInt(match[2], 10);
        if (!isNaN(numMonths) && numMonths > 0 && numMonths <= 12) {
          return { days: numMonths * 30 };
        }
      }
      if (days > 0) {
        return { days };
      }
    }
  }

  return undefined;
}

/**
 * Extract named entities from query
 */
function extractEntities(query: string): string[] {
  const entities = new Set<string>();
  
  for (const pattern of ENTITY_PATTERNS) {
    let match;
    // Reset regex state
    pattern.lastIndex = 0;
    while ((match = pattern.exec(query)) !== null) {
      const entity = match[1].trim();
      // Filter out common words that might be capitalized
      const commonWords = ['I', 'My', 'The', 'What', 'When', 'Where', 'Why', 'How', 'Which', 'Who'];
      if (entity.length > 1 && !commonWords.includes(entity)) {
        entities.add(entity);
      }
    }
  }
  
  return Array.from(entities).slice(0, 5);
}

/**
 * Generate boost terms based on intent and keywords
 */
function generateBoostTerms(keywords: string[], intent: QueryIntent): string[] {
  const boostTerms = [...keywords];
  
  // Add intent-specific boost terms
  switch (intent) {
    case 'decision':
      boostTerms.push('decided', 'chose', 'selected', 'because', 'reason');
      break;
    case 'action_item':
      boostTerms.push('todo', 'need', 'must', 'should', 'action', 'next');
      break;
    case 'summarize':
      boostTerms.push('key', 'main', 'important', 'summary');
      break;
  }
  
  return [...new Set(boostTerms)].slice(0, 15);
}

/**
 * Internal query analysis implementation
 */
function analyzeQueryInternal(query: string): QueryAnalysis {
  const normalizedQuery = normalizeQuery(query);
  const intent = detectIntent(normalizedQuery);
  const keywords = extractKeywords(normalizedQuery);
  const timeHint = extractTimeHint(normalizedQuery);
  const entities = extractEntities(query); // Use original for entity extraction
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
}

/**
 * Main query analysis function with request-scoped memoization.
 * Avoids re-analyzing the same query multiple times within a single request.
 */
export function analyzeQuery(query: string): QueryAnalysis {
  return requestMemo(`query_analysis:${query}`, () => analyzeQueryInternal(query));
}

