/**
 * AuroraNotes API - Note Enrichment Service
 *
 * Extracts structured metadata from notes using LLM.
 */

import { getGenAIClient, isGenAIAvailable, acquireRequestSlot } from './genaiClient';
import { logInfo, logError, logWarn } from './utils';
import { NoteType, ActionItem, Entity } from './types';

// =============================================================================
// Constants
// =============================================================================

const MODEL = process.env.ENRICHMENT_MODEL || 'gemini-2.0-flash';
const TIMEOUT_MS = parseInt(process.env.ENRICHMENT_TIMEOUT_MS || '15000');
const MAX_INPUT_CHARS = 8000;

const VALID_NOTE_TYPES: NoteType[] = ['meeting', 'idea', 'task', 'reference', 'journal', 'other'];
const VALID_ENTITY_TYPES = ['person', 'organization', 'location', 'date', 'product', 'other'];

// =============================================================================
// Types
// =============================================================================

interface EnrichmentResult {
  title?: string;
  summary?: string;
  noteType?: NoteType;
  actionItems?: ActionItem[];
  entities?: Entity[];
}

// =============================================================================
// Prompt Building
// =============================================================================

function buildPrompt(text: string, hasTitle: boolean, wasTruncated: boolean): string {
  const titleLine = hasTitle ? '' : '  "title": "Concise title (max 100 chars)",\n';
  const truncNote = wasTruncated ? ' (note was truncated)' : '';

  return `Analyze this note and extract structured metadata.
${hasTitle ? 'Skip title generation.' : 'Generate a concise title (max 100 chars).'}

Extract:
- summary: 1-2 sentence summary${truncNote}
- noteType: meeting|idea|task|reference|journal|other
- actionItems: todos with text, completed status, dueDate (YYYY-MM-DD or null)
- entities: people, organizations, locations, dates, products

Note:
---
${text}
---

Respond with valid JSON only:
{
${titleLine}  "summary": "...",
  "noteType": "...",
  "actionItems": [{"text": "...", "completed": false, "dueDate": null}],
  "entities": [{"text": "...", "type": "person|organization|location|date|product|other"}]
}`;
}

// =============================================================================
// Response Parsing
// =============================================================================

function parseResponse(responseText: string): EnrichmentResult {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logWarn('No JSON found in enrichment response');
      return {};
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result: EnrichmentResult = {};

    if (typeof parsed.title === 'string') {
      result.title = parsed.title.slice(0, 200);
    }
    if (typeof parsed.summary === 'string') {
      result.summary = parsed.summary.slice(0, 500);
    }
    if (VALID_NOTE_TYPES.includes(parsed.noteType)) {
      result.noteType = parsed.noteType;
    }

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

    if (Array.isArray(parsed.entities)) {
      result.entities = parsed.entities
        .filter((e: any) => e && typeof e.text === 'string' && VALID_ENTITY_TYPES.includes(e.type))
        .slice(0, 50)
        .map((e: any) => ({ text: e.text.slice(0, 200), type: e.type }));
    }

    return result;
  } catch (err) {
    logWarn('Failed to parse enrichment response', { error: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

// =============================================================================
// Public API
// =============================================================================

export async function enrichNote(text: string, existingTitle?: string): Promise<EnrichmentResult> {
  if (!isGenAIAvailable()) {
    logWarn('GenAI not available for enrichment');
    return {};
  }

  const truncatedText = text.slice(0, MAX_INPUT_CHARS);
  const prompt = buildPrompt(truncatedText, !!existingTitle, text.length > MAX_INPUT_CHARS);

  const releaseSlot = await acquireRequestSlot();
  try {
    const client = getGenAIClient();

    const response = await Promise.race([
      client.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: { temperature: 0.3, maxOutputTokens: 1000 },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Enrichment timeout')), TIMEOUT_MS)
      ),
    ]);

    const result = parseResponse(response.text || '');

    logInfo('Note enriched', {
      hasTitle: !!result.title,
      hasSummary: !!result.summary,
      noteType: result.noteType,
      actionItems: result.actionItems?.length || 0,
      entities: result.entities?.length || 0,
    });

    return result;
  } catch (err) {
    logError('Note enrichment failed', err);
    return {};
  } finally {
    releaseSlot();
  }
}
