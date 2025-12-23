/**
 * Query Expansion - Uses Gemini to generate query variations for improved recall
 */

import { getGenAIClient, isGenAIAvailable } from "./genaiClient";
import { logInfo, logError } from "./utils";
import { QUERY_EXPANSION_ENABLED, QUERY_EXPANSION_REWRITES, QUERY_EXPANSION_TTL_MS, QUERY_EXPANSION_MODEL } from "./config";

const cache = new Map<string, { variants: string[]; timestamp: number }>();
const MAX_CACHE_SIZE = 100;

const PROMPT = `Generate ${QUERY_EXPANSION_REWRITES} alternative phrasings for this search query. Keep same meaning, use synonyms, try different phrasings. Return ONLY variants, one per line.

Query: "{query}"

Alternatives:`;

export const isQueryExpansionAvailable = (): boolean => QUERY_EXPANSION_ENABLED && isGenAIAvailable();

function evictCache(): void {
  const now = Date.now();
  for (const [key, { timestamp }] of cache.entries()) {
    if (now - timestamp > QUERY_EXPANSION_TTL_MS) cache.delete(key);
  }
  if (cache.size > MAX_CACHE_SIZE) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    sorted.slice(0, sorted.length - MAX_CACHE_SIZE).forEach(([k]) => cache.delete(k));
  }
}

export async function expandQuery(query: string): Promise<string[]> {
  if (!isQueryExpansionAvailable()) return [query];

  const key = query.toLowerCase().trim();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < QUERY_EXPANSION_TTL_MS) {
    logInfo('Query expansion cache hit', { query: query.slice(0, 50) });
    return cached.variants;
  }

  try {
    const response = await getGenAIClient().models.generateContent({
      model: QUERY_EXPANSION_MODEL,
      contents: PROMPT.replace('{query}', query),
      config: { temperature: 0.7, maxOutputTokens: 200 },
    });

    const variants = (response.text?.trim() || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && l.length < 200)
      .slice(0, QUERY_EXPANSION_REWRITES);

    const allVariants = [query, ...variants.filter(v => v.toLowerCase() !== query.toLowerCase())];

    evictCache();
    cache.set(key, { variants: allVariants, timestamp: Date.now() });
    logInfo('Query expanded', { variantCount: allVariants.length });

    return allVariants;
  } catch (err) {
    logError('Query expansion failed', err);
    return [query];
  }
}
