/**
 * AuroraNotes API - Query Expansion Module
 * 
 * Uses Gemini to generate multiple query variations for improved recall.
 * This is an optional feature behind the QUERY_EXPANSION_ENABLED flag.
 * 
 * Multi-query expansion helps with:
 * - Synonym coverage (e.g., "meeting" → "call", "discussion", "sync")
 * - Phrasing variations (e.g., "how to X" → "steps for X", "X tutorial")
 * - Entity normalization (e.g., "AWS" → "Amazon Web Services")
 */

import { getGenAIClient, isGenAIAvailable } from "./genaiClient";
import { logInfo, logError, logWarn } from "./utils";
import { QUERY_EXPANSION_ENABLED, QUERY_EXPANSION_REWRITES, QUERY_EXPANSION_TTL_MS, QUERY_EXPANSION_MODEL } from "./config";

// Cache for expanded queries to avoid repeated LLM calls
const expansionCache = new Map<string, { variants: string[]; timestamp: number }>();
const MAX_CACHE_SIZE = 100;

// Expansion prompt template
const EXPANSION_PROMPT = `You are a query expansion assistant for a personal notes search system.

Given a user's search query, generate ${QUERY_EXPANSION_REWRITES} alternative phrasings that would help find relevant notes.

Rules:
1. Keep the same semantic meaning
2. Use synonyms and related terms
3. Try different phrasings (questions, statements, keywords)
4. Include any acronym expansions or abbreviations
5. Keep each variant concise (under 50 words)
6. Return ONLY the variants, one per line, no numbering or bullets

User query: "{query}"

Alternative phrasings:`;

/**
 * Check if query expansion is available
 */
export function isQueryExpansionAvailable(): boolean {
  return QUERY_EXPANSION_ENABLED && isGenAIAvailable();
}

/**
 * Get cache key for a query
 */
function getCacheKey(query: string): string {
  return query.toLowerCase().trim();
}

/**
 * Evict old cache entries
 */
function evictOldCacheEntries(): void {
  const now = Date.now();
  for (const [key, value] of expansionCache.entries()) {
    if (now - value.timestamp > QUERY_EXPANSION_TTL_MS) {
      expansionCache.delete(key);
    }
  }
  
  // Also evict if cache is too large
  if (expansionCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(expansionCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    for (const [key] of toDelete) {
      expansionCache.delete(key);
    }
  }
}

/**
 * Expand a query into multiple variants using Gemini
 * 
 * @param query - Original user query
 * @returns Array of query variants (including original)
 */
export async function expandQuery(query: string): Promise<string[]> {
  if (!isQueryExpansionAvailable()) {
    return [query];
  }

  const cacheKey = getCacheKey(query);
  
  // Check cache
  const cached = expansionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < QUERY_EXPANSION_TTL_MS) {
    logInfo('Query expansion cache hit', { query: query.slice(0, 50) });
    return cached.variants;
  }

  const startTime = Date.now();

  try {
    const client = getGenAIClient();
    const prompt = EXPANSION_PROMPT.replace('{query}', query);

    const response = await client.models.generateContent({
      model: QUERY_EXPANSION_MODEL,
      contents: prompt,
      config: {
        temperature: 0.7, // Some creativity for variations
        maxOutputTokens: 200,
      },
    });

    const text = response.text?.trim() || '';
    
    // Parse variants from response
    const variants = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.length < 200)
      .slice(0, QUERY_EXPANSION_REWRITES);

    // Always include original query first
    const allVariants = [query, ...variants.filter(v => v.toLowerCase() !== query.toLowerCase())];

    // Cache the result
    evictOldCacheEntries();
    expansionCache.set(cacheKey, { variants: allVariants, timestamp: Date.now() });

    logInfo('Query expansion complete', {
      originalQuery: query.slice(0, 50),
      variantCount: allVariants.length,
      elapsedMs: Date.now() - startTime,
    });

    return allVariants;
  } catch (err) {
    logError('Query expansion failed', err);
    return [query]; // Fallback to original query
  }
}

