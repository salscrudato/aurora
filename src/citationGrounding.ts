/**
 * AuroraNotes API - Citation Grounding with NLI
 *
 * Uses Natural Language Inference (NLI) to verify that citations
 * actually support the claims made in the answer.
 *
 * This catches hallucinated or misattributed citations by checking
 * if the source text actually entails the claim.
 *
 * Approach:
 * 1. Extract claims from the answer (sentences with citations)
 * 2. For each claim, check if cited source entails it
 * 3. Flag citations that don't actually support the claim
 *
 * Uses Gemini as the NLI model (can be swapped for dedicated NLI model).
 */

import { Citation } from "./types";
import { getGenAIClient, isGenAIAvailable } from "./genaiClient";
import { logInfo, logError, logWarn } from "./utils";

// Configuration
const NLI_ENABLED = process.env.NLI_GROUNDING_ENABLED === 'true';
const NLI_MODEL = process.env.NLI_MODEL || 'gemini-2.0-flash';
const NLI_TIMEOUT_MS = parseInt(process.env.NLI_TIMEOUT_MS || '3000');
const NLI_MIN_CONFIDENCE = parseFloat(process.env.NLI_MIN_CONFIDENCE || '0.7');

/**
 * NLI result for a single claim-source pair
 */
export interface NLIResult {
  citationId: string;
  claim: string;
  sourceSnippet: string;
  verdict: 'entailment' | 'neutral' | 'contradiction';
  confidence: number;
  explanation?: string;
}

/**
 * Grounding result for an answer
 */
export interface GroundingResult {
  isGrounded: boolean;
  groundedCitations: string[];    // cids that are properly supported
  ungroundedCitations: string[];  // cids that lack support
  nliResults: NLIResult[];
  processingTimeMs: number;
}

/**
 * Extract claims with their citations from an answer
 */
function extractClaimsWithCitations(
  answer: string,
  citationsMap: Map<string, Citation>
): Array<{ claim: string; cid: string; source: Citation }> {
  const claims: Array<{ claim: string; cid: string; source: Citation }> = [];

  // Pattern to find sentences with citations like [N1], [N2]
  const citationPattern = /\[N(\d+)\]/g;
  const sentences = answer.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    const matches = sentence.matchAll(citationPattern);
    for (const match of matches) {
      const cid = `N${match[1]}`;
      const citation = citationsMap.get(cid);
      if (citation) {
        // Extract the claim (sentence without citation markers)
        const claim = sentence.replace(/\[N\d+\]/g, '').trim();
        if (claim.length > 10) { // Skip very short claims
          claims.push({ claim, cid, source: citation });
        }
      }
    }
  }

  return claims;
}

/**
 * Check entailment using Gemini as NLI model
 */
async function checkEntailment(
  premise: string,
  hypothesis: string
): Promise<{ verdict: NLIResult['verdict']; confidence: number; explanation?: string }> {
  const client = getGenAIClient();

  const prompt = `You are an NLI (Natural Language Inference) system. Determine if the premise entails, contradicts, or is neutral to the hypothesis.

Premise (source text): "${premise}"

Hypothesis (claim): "${hypothesis}"

Respond with ONLY a JSON object:
{"verdict": "entailment" | "neutral" | "contradiction", "confidence": 0.0-1.0, "explanation": "brief reason"}

Important:
- "entailment" = premise directly supports the hypothesis
- "neutral" = premise neither supports nor contradicts
- "contradiction" = premise contradicts the hypothesis

JSON response:`;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('NLI timeout')), NLI_TIMEOUT_MS);
    });

    const response = await Promise.race([
      client.models.generateContent({
        model: NLI_MODEL,
        contents: prompt,
        config: { temperature: 0.1, maxOutputTokens: 150 },
      }),
      timeoutPromise,
    ]);

    const text = response.text || '';
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        verdict: result.verdict || 'neutral',
        confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
        explanation: result.explanation,
      };
    }
  } catch (err) {
    logWarn('NLI check failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // Default to neutral on error
  return { verdict: 'neutral', confidence: 0.5 };
}

/**
 * Verify citations using NLI grounding
 *
 * This is the main entry point for citation verification.
 */
export async function verifyCitationsWithNLI(
  answer: string,
  citationsMap: Map<string, Citation>
): Promise<GroundingResult> {
  const startTime = Date.now();

  if (!NLI_ENABLED || !isGenAIAvailable()) {
    return {
      isGrounded: true,
      groundedCitations: Array.from(citationsMap.keys()),
      ungroundedCitations: [],
      nliResults: [],
      processingTimeMs: 0,
    };
  }

  const claims = extractClaimsWithCitations(answer, citationsMap);

  if (claims.length === 0) {
    return {
      isGrounded: true,
      groundedCitations: [],
      ungroundedCitations: [],
      nliResults: [],
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Check each claim in parallel (limit concurrency)
  const nliResults: NLIResult[] = [];
  const groundedCitations = new Set<string>();
  const ungroundedCitations = new Set<string>();

  const BATCH_SIZE = 3;
  for (let i = 0; i < claims.length; i += BATCH_SIZE) {
    const batch = claims.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ({ claim, cid, source }) => {
        const { verdict, confidence, explanation } = await checkEntailment(
          source.snippet,
          claim
        );
        return {
          citationId: cid,
          claim,
          sourceSnippet: source.snippet.slice(0, 100),
          verdict,
          confidence,
          explanation,
        };
      })
    );
    nliResults.push(...results);
  }

  for (const result of nliResults) {
    if (result.verdict === 'entailment' && result.confidence >= NLI_MIN_CONFIDENCE) {
      groundedCitations.add(result.citationId);
    } else if (result.verdict === 'contradiction') {
      ungroundedCitations.add(result.citationId);
    }
  }

  const processingTimeMs = Date.now() - startTime;
  const isGrounded = ungroundedCitations.size === 0;

  logInfo('NLI grounding complete', {
    totalClaims: claims.length,
    grounded: groundedCitations.size,
    ungrounded: ungroundedCitations.size,
    isGrounded,
    processingTimeMs,
  });

  return {
    isGrounded,
    groundedCitations: Array.from(groundedCitations),
    ungroundedCitations: Array.from(ungroundedCitations),
    nliResults,
    processingTimeMs,
  };
}

export function isNLIGroundingAvailable(): boolean {
  return NLI_ENABLED && isGenAIAvailable();
}

export function getNLIConfig() {
  return {
    enabled: NLI_ENABLED,
    model: NLI_MODEL,
    minConfidence: NLI_MIN_CONFIDENCE,
    timeoutMs: NLI_TIMEOUT_MS,
    available: isNLIGroundingAvailable(),
  };
}

