/**
 * AuroraNotes API - Agentic Action Executor
 *
 * Enables AI to take actions based on user queries:
 * - Create notes
 * - Set reminders
 * - Generate reports
 * - Filtered search
 * - Summarize time periods
 * - Append to notes
 * - Tag notes
 * - Summarize specific notes
 */

import { createNote, updateNote, getNote, searchNotes } from './notes';
import { retrieveRelevantChunks, analyzeQuery } from './retrieval';
import { logInfo, logError } from './utils';
import { NoteResponse } from './types';
import { enrichNote } from './enrichment';

/**
 * Action types the AI can execute
 */
export type ActionType =
  | 'create_note'
  | 'set_reminder'
  | 'search_notes'
  | 'summarize_period'
  | 'list_action_items'
  | 'find_mentions'
  | 'append_to_note'
  | 'tag_note'
  | 'summarize_note';

/**
 * Action detection result
 */
export interface DetectedAction {
  type: ActionType;
  confidence: number;
  parameters: ActionParameters;
}

/**
 * Parameters for different action types
 */
export interface ActionParameters {
  // create_note
  noteContent?: string;
  noteTitle?: string;
  noteTags?: string[];

  // set_reminder
  reminderText?: string;
  reminderDate?: Date;
  reminderTime?: string;

  // search_notes
  searchQuery?: string;
  searchFilters?: {
    dateRange?: { start?: Date; end?: Date };
    tags?: string[];
    mentionedPerson?: string;
  };

  // summarize_period
  periodType?: 'day' | 'week' | 'month';
  periodDate?: Date;

  // list_action_items
  includeCompleted?: boolean;
  assignee?: string;

  // find_mentions
  personName?: string;
  topicName?: string;

  // append_to_note
  targetNoteId?: string;
  targetNoteQuery?: string; // Search for note to append to
  appendContent?: string;

  // tag_note
  tagsToAdd?: string[];
  tagsToRemove?: string[];

  // summarize_note
  summarizeNoteId?: string;
  summarizeNoteQuery?: string;
}

/**
 * Action execution result
 */
export interface ActionResult {
  success: boolean;
  action: ActionType;
  message: string;
  /** Require confirmation before executing (for destructive actions) */
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  data?: {
    createdNote?: NoteResponse;
    updatedNote?: NoteResponse;
    reminder?: { id: string; text: string; dueAt: string };
    searchResults?: Array<{ noteId: string; preview: string; date: string }>;
    summary?: string;
    actionItems?: Array<{ text: string; source: string; status?: string }>;
    mentions?: Array<{ noteId: string; context: string; date: string }>;
    tagsAdded?: string[];
    tagsRemoved?: string[];
    noteSummary?: string;
    targetNotePreview?: string;
  };
}

/**
 * Patterns for detecting action intents
 */
const ACTION_PATTERNS: Array<{ pattern: RegExp; type: ActionType; confidence: number }> = [
  // Create note patterns
  { pattern: /^(?:create|make|add|write|save)\s+(?:a\s+)?note\s+(?:about|for|on|regarding)\s+(.+)/i, type: 'create_note', confidence: 0.9 },
  { pattern: /^note(?:\s+down)?:\s*(.+)/i, type: 'create_note', confidence: 0.85 },
  { pattern: /^(?:jot\s+down|record|capture)\s+(.+)/i, type: 'create_note', confidence: 0.85 },

  // Reminder patterns
  { pattern: /^remind\s+me\s+(?:about|to|that)\s+(.+?)(?:\s+(?:tomorrow|today|on|at|in)\s+(.+))?$/i, type: 'set_reminder', confidence: 0.9 },
  { pattern: /^(?:set|add|create)\s+(?:a\s+)?reminder\s+(?:for|to|about)\s+(.+)/i, type: 'set_reminder', confidence: 0.9 },

  // Search patterns
  { pattern: /^(?:find|search|look\s+for|show)\s+(?:my\s+)?notes?\s+(?:about|mentioning|with|on)\s+(.+)/i, type: 'search_notes', confidence: 0.85 },
  { pattern: /^(?:find|search|look\s+for)\s+(.+)\s+in\s+(?:my\s+)?notes?/i, type: 'search_notes', confidence: 0.8 },

  // Summarize patterns
  { pattern: /^summarize\s+(?:my\s+)?(?:this|last)\s+(week|month|day)(?:'s)?\s+(?:notes?)?/i, type: 'summarize_period', confidence: 0.9 },
  { pattern: /^what\s+(?:did\s+)?I\s+(?:write|note|work\s+on)\s+(?:about\s+)?(?:this|last)\s+(week|month)/i, type: 'summarize_period', confidence: 0.85 },

  // Action items patterns
  { pattern: /^(?:list|show|find|what\s+are)\s+(?:my\s+)?(?:action\s+items|todos?|tasks)/i, type: 'list_action_items', confidence: 0.9 },
  { pattern: /^what\s+do\s+I\s+need\s+to\s+do/i, type: 'list_action_items', confidence: 0.85 },

  // Find mentions patterns
  { pattern: /^(?:find|show)\s+(?:all\s+)?(?:notes?\s+)?(?:mentioning|about|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i, type: 'find_mentions', confidence: 0.85 },
  { pattern: /^what\s+(?:did\s+)?(?:I\s+)?(?:discuss|talk|write)\s+(?:about\s+)?with\s+([A-Z][a-z]+)/i, type: 'find_mentions', confidence: 0.8 },

  // Append to note patterns
  { pattern: /^(?:append|add)\s+(?:to\s+)?(?:the\s+)?(?:note\s+)?(?:about\s+)?(.+?):\s*(.+)/i, type: 'append_to_note', confidence: 0.85 },
  { pattern: /^(?:update|add\s+to)\s+(?:my\s+)?note\s+(?:about|on)\s+(.+?)\s+(?:with|to\s+include)\s+(.+)/i, type: 'append_to_note', confidence: 0.85 },

  // Tag note patterns
  { pattern: /^(?:tag|label)\s+(?:the\s+)?(?:note\s+)?(?:about\s+)?(.+?)\s+(?:as|with)\s+#?(.+)/i, type: 'tag_note', confidence: 0.85 },
  { pattern: /^add\s+(?:the\s+)?tags?\s+#?(.+?)\s+to\s+(?:the\s+)?(?:note\s+)?(?:about\s+)?(.+)/i, type: 'tag_note', confidence: 0.85 },

  // Summarize specific note patterns
  { pattern: /^summarize\s+(?:the\s+)?(?:note\s+)?(?:about|on)\s+(.+)/i, type: 'summarize_note', confidence: 0.85 },
  { pattern: /^(?:give\s+me\s+)?(?:a\s+)?summary\s+of\s+(?:the\s+)?(?:note\s+)?(?:about|on)\s+(.+)/i, type: 'summarize_note', confidence: 0.85 },
];

/**
 * Detect if a query is an action command
 */
export function detectAction(query: string): DetectedAction | null {
  const trimmedQuery = query.trim();

  for (const { pattern, type, confidence } of ACTION_PATTERNS) {
    const match = trimmedQuery.match(pattern);
    if (match) {
      const parameters = extractParameters(type, match, trimmedQuery);
      logInfo('Action detected', { type, confidence, parameters });
      return { type, confidence, parameters };
    }
  }

  return null;
}

/**
 * Extract parameters from regex match based on action type
 */
function extractParameters(
  type: ActionType,
  match: RegExpMatchArray,
  _fullQuery: string
): ActionParameters {
  const params: ActionParameters = {};

  switch (type) {
    case 'create_note':
      params.noteContent = match[1]?.trim();
      break;
    case 'set_reminder':
      params.reminderText = match[1]?.trim();
      params.reminderTime = match[2]?.trim();
      break;
    case 'search_notes':
      params.searchQuery = match[1]?.trim();
      break;
    case 'summarize_period':
      params.periodType = match[1]?.toLowerCase() as 'day' | 'week' | 'month';
      break;
    case 'find_mentions':
      params.personName = match[1]?.trim();
      break;
    case 'append_to_note':
      params.targetNoteQuery = match[1]?.trim();
      params.appendContent = match[2]?.trim();
      break;
    case 'tag_note':
      // Handle both patterns: "tag note about X with Y" and "add tag Y to note about X"
      if (_fullQuery.toLowerCase().startsWith('add')) {
        params.tagsToAdd = match[1]?.split(/[,\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
        params.targetNoteQuery = match[2]?.trim();
      } else {
        params.targetNoteQuery = match[1]?.trim();
        params.tagsToAdd = match[2]?.split(/[,\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
      }
      break;
    case 'summarize_note':
      params.summarizeNoteQuery = match[1]?.trim();
      break;
  }

  return params;
}

/**
 * Execute a detected action
 */
export async function executeAction(
  action: DetectedAction,
  tenantId: string,
  options: { confirmed?: boolean } = {}
): Promise<ActionResult> {
  const { type, parameters } = action;

  try {
    switch (type) {
      case 'create_note':
        return await executeCreateNote(parameters, tenantId);
      case 'set_reminder':
        return await executeSetReminder(parameters, tenantId);
      case 'search_notes':
        return await executeSearchNotes(parameters, tenantId);
      case 'summarize_period':
        return await executeSummarizePeriod(parameters, tenantId);
      case 'list_action_items':
        return await executeListActionItems(parameters, tenantId);
      case 'find_mentions':
        return await executeFindMentions(parameters, tenantId);
      case 'append_to_note':
        return await executeAppendToNote(parameters, tenantId, options.confirmed);
      case 'tag_note':
        return await executeTagNote(parameters, tenantId, options.confirmed);
      case 'summarize_note':
        return await executeSummarizeNote(parameters, tenantId);
      default:
        return { success: false, action: type, message: 'Unknown action type' };
    }
  } catch (error) {
    logError('Action execution failed', error);
    return {
      success: false,
      action: type,
      message: error instanceof Error ? error.message : 'Action execution failed',
    };
  }
}

/**
 * Execute create note action
 */
async function executeCreateNote(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  if (!params.noteContent) {
    return { success: false, action: 'create_note', message: 'No content provided for note' };
  }

  const note = await createNote(params.noteContent, tenantId, {
    title: params.noteTitle,
    tags: params.noteTags,
  });

  return {
    success: true,
    action: 'create_note',
    message: `Created note: "${params.noteContent.slice(0, 50)}${params.noteContent.length > 50 ? '...' : ''}"`,
    data: { createdNote: note },
  };
}

/**
 * Execute set reminder action (stores as a tagged note for now)
 */
async function executeSetReminder(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  if (!params.reminderText) {
    return { success: false, action: 'set_reminder', message: 'No reminder text provided' };
  }

  // Parse reminder date/time
  const dueAt = parseReminderTime(params.reminderTime);
  const reminderContent = `🔔 REMINDER: ${params.reminderText}${dueAt ? `\n\nDue: ${dueAt.toISOString()}` : ''}`;

  const note = await createNote(reminderContent, tenantId, {
    title: `Reminder: ${params.reminderText.slice(0, 50)}`,
    tags: ['reminder', 'action-item'],
    metadata: { type: 'reminder', dueAt: dueAt?.toISOString() },
  });

  return {
    success: true,
    action: 'set_reminder',
    message: `Reminder set: "${params.reminderText}"${dueAt ? ` for ${dueAt.toLocaleDateString()}` : ''}`,
    data: {
      reminder: {
        id: note.id,
        text: params.reminderText,
        dueAt: dueAt?.toISOString() || 'unspecified',
      },
    },
  };
}

/**
 * Parse reminder time string into Date
 */
function parseReminderTime(timeStr?: string): Date | undefined {
  if (!timeStr) return undefined;

  const lower = timeStr.toLowerCase();
  const now = new Date();

  if (lower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }

  if (lower === 'today') {
    return now;
  }

  // Try parsing "in X hours/days"
  const inMatch = lower.match(/in\s+(\d+)\s+(hour|day|week|minute)s?/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const result = new Date(now);

    switch (unit) {
      case 'minute': result.setMinutes(result.getMinutes() + amount); break;
      case 'hour': result.setHours(result.getHours() + amount); break;
      case 'day': result.setDate(result.getDate() + amount); break;
      case 'week': result.setDate(result.getDate() + amount * 7); break;
    }
    return result;
  }

  // Try parsing natural date
  try {
    const parsed = new Date(timeStr);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {
    // Ignore parsing errors
  }

  return undefined;
}

/**
 * Execute search notes action
 */
async function executeSearchNotes(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  if (!params.searchQuery) {
    return { success: false, action: 'search_notes', message: 'No search query provided' };
  }

  const { chunks } = await retrieveRelevantChunks(params.searchQuery, {
    tenantId,
    topK: 20,
    rerankTo: 10,
  });

  const searchResults = chunks.slice(0, 5).map(chunk => ({
    noteId: chunk.noteId,
    preview: chunk.text.slice(0, 150) + (chunk.text.length > 150 ? '...' : ''),
    date: chunk.createdAt.toLocaleDateString(),
  }));

  return {
    success: true,
    action: 'search_notes',
    message: `Found ${chunks.length} notes about "${params.searchQuery}"`,
    data: { searchResults },
  };
}

/**
 * Execute summarize period action
 */
async function executeSummarizePeriod(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  const periodType = params.periodType || 'week';

  // Calculate date range
  const now = new Date();
  let daysBack = 7;
  if (periodType === 'month') daysBack = 30;
  if (periodType === 'day') daysBack = 1;

  const periodQuery = `Summarize my notes from the last ${periodType}`;
  const { chunks } = await retrieveRelevantChunks(periodQuery, {
    tenantId,
    topK: 30,
    rerankTo: 15,
    maxAgeDays: daysBack,
  });

  return {
    success: true,
    action: 'summarize_period',
    message: `Found ${chunks.length} notes from the last ${periodType} to summarize`,
    data: {
      summary: `Retrieved ${chunks.length} notes from the last ${periodType}. The AI will provide a summary.`,
    },
  };
}

/**
 * Execute list action items
 */
async function executeListActionItems(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  const query = 'action items todos tasks to do';
  const { chunks } = await retrieveRelevantChunks(query, {
    tenantId,
    topK: 20,
    rerankTo: 10,
  });

  // Extract action items from chunks (simple pattern matching)
  const actionItems: Array<{ text: string; source: string; status?: string }> = [];
  const actionPatterns = [
    /(?:^|\n)\s*[-*□☐]\s*(.+)/gm,
    /(?:TODO|TASK|ACTION):\s*(.+)/gi,
    /(?:need to|should|must|have to)\s+(.+?)(?:\.|$)/gi,
  ];

  for (const chunk of chunks.slice(0, 10)) {
    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(chunk.text)) !== null) {
        if (match[1] && match[1].length > 5) {
          actionItems.push({
            text: match[1].trim(),
            source: chunk.noteId,
            status: 'pending',
          });
        }
      }
    }
  }

  return {
    success: true,
    action: 'list_action_items',
    message: `Found ${actionItems.length} action items`,
    data: { actionItems: actionItems.slice(0, 20) },
  };
}

/**
 * Execute find mentions
 */
async function executeFindMentions(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  const searchTerm = params.personName || params.topicName;
  if (!searchTerm) {
    return { success: false, action: 'find_mentions', message: 'No person or topic specified' };
  }

  const { chunks } = await retrieveRelevantChunks(searchTerm, {
    tenantId,
    topK: 20,
    rerankTo: 10,
  });

  const mentions = chunks.slice(0, 10).map(chunk => ({
    noteId: chunk.noteId,
    context: chunk.text.slice(0, 200) + (chunk.text.length > 200 ? '...' : ''),
    date: chunk.createdAt.toLocaleDateString(),
  }));

  return {
    success: true,
    action: 'find_mentions',
    message: `Found ${chunks.length} mentions of "${searchTerm}"`,
    data: { mentions },
  };
}

/**
 * Execute append to note action
 */
async function executeAppendToNote(
  params: ActionParameters,
  tenantId: string,
  confirmed?: boolean
): Promise<ActionResult> {
  if (!params.appendContent) {
    return { success: false, action: 'append_to_note', message: 'No content to append provided' };
  }

  // Find the target note
  let targetNoteId = params.targetNoteId;
  let targetNotePreview = '';

  if (!targetNoteId && params.targetNoteQuery) {
    // Search for the note
    const searchResult = await searchNotes(params.targetNoteQuery, tenantId, { limit: 1 });
    if (searchResult.results.length === 0) {
      return { success: false, action: 'append_to_note', message: `Could not find a note about "${params.targetNoteQuery}"` };
    }
    const foundNote = searchResult.results[0].note;
    targetNoteId = foundNote.id;
    targetNotePreview = foundNote.text.slice(0, 100) + (foundNote.text.length > 100 ? '...' : '');
  }

  if (!targetNoteId) {
    return { success: false, action: 'append_to_note', message: 'No target note specified' };
  }

  // Get the current note
  const note = await getNote(targetNoteId, tenantId);
  if (!note) {
    return { success: false, action: 'append_to_note', message: 'Note not found' };
  }

  // Require confirmation for modifying existing notes
  if (!confirmed) {
    return {
      success: false,
      action: 'append_to_note',
      message: `Found note to update`,
      requiresConfirmation: true,
      confirmationPrompt: `I found a note that starts with: "${note.text.slice(0, 100)}..."\n\nDo you want me to append: "${params.appendContent}"?`,
      data: { targetNotePreview: note.text.slice(0, 200) },
    };
  }

  // Append content
  const updatedText = note.text + '\n\n' + params.appendContent;
  const updatedNote = await updateNote(targetNoteId, tenantId, { text: updatedText });

  return {
    success: true,
    action: 'append_to_note',
    message: `Appended content to note`,
    data: { updatedNote: updatedNote || undefined },
  };
}

/**
 * Execute tag note action
 */
async function executeTagNote(
  params: ActionParameters,
  tenantId: string,
  confirmed?: boolean
): Promise<ActionResult> {
  if (!params.tagsToAdd?.length && !params.tagsToRemove?.length) {
    return { success: false, action: 'tag_note', message: 'No tags specified' };
  }

  // Find the target note
  let targetNoteId = params.targetNoteId;

  if (!targetNoteId && params.targetNoteQuery) {
    const searchResult = await searchNotes(params.targetNoteQuery, tenantId, { limit: 1 });
    if (searchResult.results.length === 0) {
      return { success: false, action: 'tag_note', message: `Could not find a note about "${params.targetNoteQuery}"` };
    }
    targetNoteId = searchResult.results[0].note.id;
  }

  if (!targetNoteId) {
    return { success: false, action: 'tag_note', message: 'No target note specified' };
  }

  const note = await getNote(targetNoteId, tenantId);
  if (!note) {
    return { success: false, action: 'tag_note', message: 'Note not found' };
  }

  // Require confirmation
  if (!confirmed) {
    const tagsDescription = params.tagsToAdd?.map(t => `#${t}`).join(', ') || '';
    return {
      success: false,
      action: 'tag_note',
      message: `Found note to tag`,
      requiresConfirmation: true,
      confirmationPrompt: `I found a note that starts with: "${note.text.slice(0, 100)}..."\n\nDo you want me to add tags: ${tagsDescription}?`,
      data: { targetNotePreview: note.text.slice(0, 200) },
    };
  }

  // Update tags
  const currentTags = note.tags || [];
  const newTags = [...new Set([...currentTags, ...(params.tagsToAdd || [])])];
  const finalTags = newTags.filter(t => !params.tagsToRemove?.includes(t));

  const updatedNote = await updateNote(targetNoteId, tenantId, { tags: finalTags });

  return {
    success: true,
    action: 'tag_note',
    message: `Updated tags on note`,
    data: {
      updatedNote: updatedNote || undefined,
      tagsAdded: params.tagsToAdd,
      tagsRemoved: params.tagsToRemove,
    },
  };
}

/**
 * Execute summarize note action
 */
async function executeSummarizeNote(
  params: ActionParameters,
  tenantId: string
): Promise<ActionResult> {
  // Find the target note
  let targetNoteId = params.summarizeNoteId;

  if (!targetNoteId && params.summarizeNoteQuery) {
    const searchResult = await searchNotes(params.summarizeNoteQuery, tenantId, { limit: 1 });
    if (searchResult.results.length === 0) {
      return { success: false, action: 'summarize_note', message: `Could not find a note about "${params.summarizeNoteQuery}"` };
    }
    targetNoteId = searchResult.results[0].note.id;
  }

  if (!targetNoteId) {
    return { success: false, action: 'summarize_note', message: 'No target note specified' };
  }

  const note = await getNote(targetNoteId, tenantId);
  if (!note) {
    return { success: false, action: 'summarize_note', message: 'Note not found' };
  }

  // Use enrichment to generate summary
  const enrichment = await enrichNote(note.text, note.title);

  return {
    success: true,
    action: 'summarize_note',
    message: `Generated summary for note`,
    data: {
      noteSummary: enrichment.summary || 'No summary available',
      targetNotePreview: note.text.slice(0, 200),
    },
  };
}

/**
 * Format action result as a response for the user
 */
export function formatActionResponse(result: ActionResult): string {
  if (!result.success) {
    // Check if this requires confirmation
    if (result.requiresConfirmation) {
      return result.confirmationPrompt || result.message;
    }
    return `I couldn't complete that action: ${result.message}`;
  }

  switch (result.action) {
    case 'create_note':
      return `✅ ${result.message}\n\nYour note has been saved and will be searchable shortly.`;

    case 'set_reminder':
      return `🔔 ${result.message}\n\nI've saved this as a reminder note tagged with #reminder.`;

    case 'search_notes':
      if (!result.data?.searchResults?.length) {
        return `I searched your notes but didn't find anything matching that query.`;
      }
      return `📝 ${result.message}\n\nHere are the most relevant notes:\n${result.data.searchResults.map((r, i) => `${i + 1}. ${r.preview}`).join('\n\n')}`;

    case 'summarize_period':
      return result.message;

    case 'list_action_items':
      if (!result.data?.actionItems?.length) {
        return `I couldn't find any action items in your recent notes.`;
      }
      return `📋 ${result.message}\n\n${result.data.actionItems.map((item, i) => `${i + 1}. ${item.text}`).join('\n')}`;

    case 'find_mentions':
      if (!result.data?.mentions?.length) {
        return `I couldn't find any mentions matching that criteria.`;
      }
      return `🔍 ${result.message}\n\n${result.data.mentions.map((m, i) => `${i + 1}. ${m.context}`).join('\n\n')}`;

    case 'append_to_note':
      return `✏️ ${result.message}\n\nThe note has been updated.`;

    case 'tag_note':
      const tagsAdded = result.data?.tagsAdded?.map(t => `#${t}`).join(', ') || '';
      return `🏷️ ${result.message}\n\nAdded tags: ${tagsAdded}`;

    case 'summarize_note':
      return `📄 ${result.message}\n\n${result.data?.noteSummary || ''}`;

    default:
      return result.message;
  }
}

