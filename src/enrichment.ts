/**
 * AuroraNotes API - Note Enrichment Service
 *
 * Extracts structured metadata from notes using LLM:
 * - Title derivation (if not provided)
 * - Summary generation
 * - Note type classification
 * - Action item extraction
 * - Named entity extraction
 */

import { getGenAIClient, isGenAIAvailable, acquireRequestSlot } from './genaiClient';
import { logInfo, logError, logWarn } from './utils';
import { NoteType, ActionItem, Entity } from './types';

// Configuration
const ENRICHMENT_MODEL = process.env.ENRICHMENT_MODEL || 'gemini-2.0-flash';
const ENRICHMENT_TIMEOUT_MS = parseInt(process.env.ENRICHMENT_TIMEOUT_MS || '15000');
const ENRICHMENT_MAX_INPUT_CHARS = 8000; // Limit input to avoid token limits

/**
 * Enrichment result from LLM
 */
export interface EnrichmentResult {
  title?: string;
  summary?: string;
  noteType?: NoteType;
  actionItems?: ActionItem[];
  entities?: Entity[];
}

/**
 * Enrich a note with AI-generated metadata
 */
export async function enrichNote(
  text: string,
  existingTitle?: string
): Promise<EnrichmentResult> {
  if (!isGenAIAvailable()) {
    logWarn('GenAI not available for enrichment');
    return {};
  }

  // Truncate text if too long
  const truncatedText = text.slice(0, ENRICHMENT_MAX_INPUT_CHARS);
  const wasTruncated = text.length > ENRICHMENT_MAX_INPUT_CHARS;

  const prompt = buildEnrichmentPrompt(truncatedText, existingTitle, wasTruncated);

  const releaseSlot = await acquireRequestSlot();
  try {
    const client = getGenAIClient();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Enrichment timeout')), ENRICHMENT_TIMEOUT_MS);
    });

    const response = await Promise.race([
      client.models.generateContent({
        model: ENRICHMENT_MODEL,
        contents: prompt,
        config: { temperature: 0.3, maxOutputTokens: 1000 },
      }),
      timeoutPromise,
    ]);

    const responseText = response.text || '';
    const result = parseEnrichmentResponse(responseText);

    logInfo('Note enriched successfully', {
      hasTitle: !!result.title,
      hasSummary: !!result.summary,
      noteType: result.noteType,
      actionItemCount: result.actionItems?.length || 0,
      entityCount: result.entities?.length || 0,
    });

    return result;
  } catch (err) {
    logError('Note enrichment failed', err);
    return {};
  } finally {
    releaseSlot();
  }
}

/**
 * Build the enrichment prompt
 */
function buildEnrichmentPrompt(
  text: string,
  existingTitle?: string,
  wasTruncated?: boolean
): string {
  const titleInstruction = existingTitle
    ? 'The note already has a title, so skip title generation.'
    : 'Generate a concise title (max 100 chars) that captures the main topic.';

  return `Analyze this note and extract structured metadata.

${titleInstruction}

Generate:
1. ${existingTitle ? 'Skip title' : 'title: A concise title (max 100 chars)'}
2. summary: A 1-2 sentence summary of the key points${wasTruncated ? ' (note was truncated)' : ''}
3. noteType: Classify as one of: meeting, idea, task, reference, journal, other
4. actionItems: Extract any action items/todos (text, completed status, due date if mentioned)
5. entities: Extract named entities (people, organizations, locations, dates, products)

Note content:
---
${text}
---

Respond with valid JSON only:
{
  ${existingTitle ? '' : '"title": "...",'}
  "summary": "...",
  "noteType": "meeting|idea|task|reference|journal|other",
  "actionItems": [{"text": "...", "completed": false, "dueDate": "YYYY-MM-DD or null"}],
  "entities": [{"text": "...", "type": "person|organization|location|date|product|other"}]
}`;
}

/**
 * Parse the LLM response into structured data
 */
function parseEnrichmentResponse(responseText: string): EnrichmentResult {
  try {
    // Extract JSON from response (may have markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logWarn('No JSON found in enrichment response');
      return {};
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result: EnrichmentResult = {};

    // Validate and extract title
    if (parsed.title && typeof parsed.title === 'string') {
      result.title = parsed.title.slice(0, 200);
    }

    // Validate and extract summary
    if (parsed.summary && typeof parsed.summary === 'string') {
      result.summary = parsed.summary.slice(0, 500);
    }

    // Validate note type
    const validNoteTypes: NoteType[] = ['meeting', 'idea', 'task', 'reference', 'journal', 'other'];
    if (parsed.noteType && validNoteTypes.includes(parsed.noteType)) {
      result.noteType = parsed.noteType;
    }

    // Validate action items
    if (Array.isArray(parsed.actionItems)) {
      result.actionItems = parsed.actionItems
        .filter((item: any) => item && typeof item.text === 'string')
        .slice(0, 20)
        .map((item: any) => ({
          text: item.text.slice(0, 500),
          completed: !!item.completed,
          dueDate: typeof item.dueDate === 'string' ? item.dueDate : undefined,
        }));
    }

    // Validate entities
    if (Array.isArray(parsed.entities)) {
      const validEntityTypes = ['person', 'organization', 'location', 'date', 'product', 'other'];
      result.entities = parsed.entities
        .filter((e: any) => e && typeof e.text === 'string' && validEntityTypes.includes(e.type))
        .slice(0, 50)
        .map((e: any) => ({
          text: e.text.slice(0, 200),
          type: e.type,
        }));
    }

    return result;
  } catch (err) {
    logWarn('Failed to parse enrichment response', { error: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

