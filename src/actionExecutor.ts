/**
 * Agentic Action Executor - AI-driven note actions
 *
 * Detects and executes actions from natural language:
 * create_note, set_reminder, search_notes, summarize_period,
 * list_action_items, find_mentions, append_to_note, tag_note, summarize_note
 */

import { createNote, updateNote, getNote, searchNotes } from './notes';
import { retrieveRelevantChunks } from './retrieval';
import { logInfo, logError, logWarn } from './utils';
import { NoteResponse } from './types';
import { enrichNote } from './enrichment';

// =============================================================================
// Types
// =============================================================================

/** Supported action types */
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

/** Period types for summarization */
export type PeriodType = 'day' | 'week' | 'month';

/** Search filters for notes */
export interface SearchFilters {
  dateRange?: { start?: Date; end?: Date };
  tags?: string[];
  mentionedPerson?: string;
}

/** Action parameters - union of all possible params */
export interface ActionParameters {
  // Note creation
  noteContent?: string;
  noteTitle?: string;
  noteTags?: string[];
  // Reminders
  reminderText?: string;
  reminderDate?: Date;
  reminderTime?: string;
  // Search
  searchQuery?: string;
  searchFilters?: SearchFilters;
  // Summarization
  periodType?: PeriodType;
  periodDate?: Date;
  // Action items
  includeCompleted?: boolean;
  assignee?: string;
  // Mentions
  personName?: string;
  topicName?: string;
  // Note targeting
  targetNoteId?: string;
  targetNoteQuery?: string;
  appendContent?: string;
  // Tags
  tagsToAdd?: string[];
  tagsToRemove?: string[];
  // Note summary
  summarizeNoteId?: string;
  summarizeNoteQuery?: string;
}

/** Detected action with confidence score */
export interface DetectedAction {
  type: ActionType;
  confidence: number;
  parameters: ActionParameters;
  /** Raw regex match for debugging */
  matchedPattern?: string;
}

/** Action execution options */
export interface ExecuteOptions {
  /** User has confirmed destructive action */
  confirmed?: boolean;
  /** Skip confirmation even for destructive actions */
  skipConfirmation?: boolean;
}

/** Action result data by type */
export interface ActionResultData {
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
}

/** Action execution result */
export interface ActionResult {
  success: boolean;
  action: ActionType;
  message: string;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  data?: ActionResultData;
  /** Execution time in ms */
  durationMs?: number;
}

/** Custom error for action failures */
export class ActionError extends Error {
  constructor(
    message: string,
    public readonly action: ActionType,
    public readonly code: string = 'ACTION_FAILED'
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

// =============================================================================
// Configuration
// =============================================================================

/** Minimum confidence threshold to consider an action detected */
export const MIN_CONFIDENCE_THRESHOLD = 0.7;

/** Actions that modify data and require confirmation */
const DESTRUCTIVE_ACTIONS: ActionType[] = ['append_to_note', 'tag_note'];

// =============================================================================
// Action Patterns
// =============================================================================

interface ActionPattern {
  pattern: RegExp;
  type: ActionType;
  confidence: number;
  /** Human-readable description for debugging */
  desc?: string;
}

const ACTION_PATTERNS: ActionPattern[] = [
  // Create note
  { pattern: /^(?:create|make|add|write|save)\s+(?:a\s+)?note\s+(?:about|for|on|regarding)\s+(.+)/i, type: 'create_note', confidence: 0.9, desc: 'create note about X' },
  { pattern: /^note(?:\s+down)?:\s*(.+)/i, type: 'create_note', confidence: 0.85, desc: 'note: X' },
  { pattern: /^(?:jot\s+down|record|capture)\s+(.+)/i, type: 'create_note', confidence: 0.85, desc: 'jot down X' },

  // Reminders
  { pattern: /^remind\s+me\s+(?:about|to|that)\s+(.+?)(?:\s+(?:tomorrow|today|on|at|in)\s+(.+))?$/i, type: 'set_reminder', confidence: 0.9, desc: 'remind me to X' },
  { pattern: /^(?:set|add|create)\s+(?:a\s+)?reminder\s+(?:for|to|about)\s+(.+)/i, type: 'set_reminder', confidence: 0.9, desc: 'set reminder for X' },

  // Search
  { pattern: /^(?:find|search|look\s+for|show)\s+(?:my\s+)?notes?\s+(?:about|mentioning|with|on)\s+(.+)/i, type: 'search_notes', confidence: 0.85, desc: 'find notes about X' },
  { pattern: /^(?:find|search|look\s+for)\s+(.+)\s+in\s+(?:my\s+)?notes?/i, type: 'search_notes', confidence: 0.8, desc: 'find X in notes' },

  // Period summary
  { pattern: /^summarize\s+(?:my\s+)?(?:this|last)\s+(week|month|day)(?:'s)?\s+(?:notes?)?/i, type: 'summarize_period', confidence: 0.9, desc: 'summarize this week' },
  { pattern: /^what\s+(?:did\s+)?I\s+(?:write|note|work\s+on)\s+(?:about\s+)?(?:this|last)\s+(week|month)/i, type: 'summarize_period', confidence: 0.85, desc: 'what did I write this week' },

  // Action items
  { pattern: /^(?:list|show|find|what\s+are)\s+(?:my\s+)?(?:action\s+items|todos?|tasks)/i, type: 'list_action_items', confidence: 0.9, desc: 'list action items' },
  { pattern: /^what\s+do\s+I\s+need\s+to\s+do/i, type: 'list_action_items', confidence: 0.85, desc: 'what do I need to do' },

  // Find mentions
  { pattern: /^(?:find|show)\s+(?:all\s+)?(?:notes?\s+)?(?:mentioning|about|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i, type: 'find_mentions', confidence: 0.85, desc: 'find mentions of Person' },
  { pattern: /^what\s+(?:did\s+)?(?:I\s+)?(?:discuss|talk|write)\s+(?:about\s+)?with\s+([A-Z][a-z]+)/i, type: 'find_mentions', confidence: 0.8, desc: 'what did I discuss with Person' },

  // Append to note
  { pattern: /^(?:append|add)\s+(?:to\s+)?(?:the\s+)?(?:note\s+)?(?:about\s+)?(.+?):\s*(.+)/i, type: 'append_to_note', confidence: 0.85, desc: 'append to note about X: Y' },
  { pattern: /^(?:update|add\s+to)\s+(?:my\s+)?note\s+(?:about|on)\s+(.+?)\s+(?:with|to\s+include)\s+(.+)/i, type: 'append_to_note', confidence: 0.85, desc: 'update note about X with Y' },

  // Tag note
  { pattern: /^(?:tag|label)\s+(?:the\s+)?(?:note\s+)?(?:about\s+)?(.+?)\s+(?:as|with)\s+#?(.+)/i, type: 'tag_note', confidence: 0.85, desc: 'tag note about X with Y' },
  { pattern: /^add\s+(?:the\s+)?tags?\s+#?(.+?)\s+to\s+(?:the\s+)?(?:note\s+)?(?:about\s+)?(.+)/i, type: 'tag_note', confidence: 0.85, desc: 'add tag Y to note about X' },

  // Summarize note
  { pattern: /^summarize\s+(?:the\s+)?(?:note\s+)?(?:about|on)\s+(.+)/i, type: 'summarize_note', confidence: 0.85, desc: 'summarize note about X' },
  { pattern: /^(?:give\s+me\s+)?(?:a\s+)?summary\s+of\s+(?:the\s+)?(?:note\s+)?(?:about|on)\s+(.+)/i, type: 'summarize_note', confidence: 0.85, desc: 'give me a summary of note about X' },
];

// =============================================================================
// Action Detection
// =============================================================================

/** Detect if a query is an action command */
export function detectAction(
  query: string,
  options: { minConfidence?: number } = {}
): DetectedAction | null {
  const { minConfidence = MIN_CONFIDENCE_THRESHOLD } = options;
  const trimmed = query.trim();

  for (const { pattern, type, confidence, desc } of ACTION_PATTERNS) {
    if (confidence < minConfidence) continue;

    const match = trimmed.match(pattern);
    if (match) {
      const parameters = extractParameters(type, match, trimmed);
      logInfo('Action detected', { type, confidence, pattern: desc });
      return { type, confidence, parameters, matchedPattern: desc };
    }
  }

  return null;
}

/** Check if an action requires confirmation */
export function requiresConfirmation(action: ActionType): boolean {
  return DESTRUCTIVE_ACTIONS.includes(action);
}

/** Get all supported action types */
export function getSupportedActions(): ActionType[] {
  return Array.from(new Set(ACTION_PATTERNS.map(p => p.type)));
}

// =============================================================================
// Parameter Extraction
// =============================================================================

function extractParameters(
  type: ActionType,
  match: RegExpMatchArray,
  fullQuery: string
): ActionParameters {
  const params: ActionParameters = {};

  const extractors: Record<ActionType, () => void> = {
    create_note: () => {
      params.noteContent = match[1]?.trim();
    },
    set_reminder: () => {
      params.reminderText = match[1]?.trim();
      params.reminderTime = match[2]?.trim();
    },
    search_notes: () => {
      params.searchQuery = match[1]?.trim();
    },
    summarize_period: () => {
      params.periodType = match[1]?.toLowerCase() as PeriodType;
    },
    list_action_items: () => {
      // No specific params to extract
    },
    find_mentions: () => {
      params.personName = match[1]?.trim();
    },
    append_to_note: () => {
      params.targetNoteQuery = match[1]?.trim();
      params.appendContent = match[2]?.trim();
    },
    tag_note: () => {
      // Handle both: "tag note about X with Y" and "add tag Y to note about X"
      if (fullQuery.toLowerCase().startsWith('add')) {
        params.tagsToAdd = parseTags(match[1]);
        params.targetNoteQuery = match[2]?.trim();
      } else {
        params.targetNoteQuery = match[1]?.trim();
        params.tagsToAdd = parseTags(match[2]);
      }
    },
    summarize_note: () => {
      params.summarizeNoteQuery = match[1]?.trim();
    },
  };

  extractors[type]?.();
  return params;
}

/** Parse comma/space separated tags, removing # prefix */
function parseTags(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/[,\s]+/)
    .map(t => t.replace(/^#/, '').trim())
    .filter(Boolean);
}

// =============================================================================
// Action Execution
// =============================================================================

/** Action executor function type */
type ActionExecutor = (
  params: ActionParameters,
  tenantId: string,
  options: ExecuteOptions
) => Promise<ActionResult>;

/** Registry of action executors */
const ACTION_EXECUTORS: Record<ActionType, ActionExecutor> = {
  create_note: executeCreateNote,
  set_reminder: executeSetReminder,
  search_notes: executeSearchNotes,
  summarize_period: executeSummarizePeriod,
  list_action_items: executeListActionItems,
  find_mentions: executeFindMentions,
  append_to_note: executeAppendToNote,
  tag_note: executeTagNote,
  summarize_note: executeSummarizeNote,
};

/** Execute a detected action */
export async function executeAction(
  action: DetectedAction,
  tenantId: string,
  options: ExecuteOptions = {}
): Promise<ActionResult> {
  const { type, parameters } = action;
  const startTime = Date.now();

  const executor = ACTION_EXECUTORS[type];
  if (!executor) {
    logWarn('Unknown action type', { type });
    return { success: false, action: type, message: `Unknown action type: ${type}` };
  }

  try {
    const result = await executor(parameters, tenantId, options);
    result.durationMs = Date.now() - startTime;
    return result;
  } catch (error) {
    logError('Action execution failed', { type, error });

    const message = error instanceof ActionError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Action execution failed';

    return {
      success: false,
      action: type,
      message,
      durationMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// Action Executors
// =============================================================================

/** Helper to create error result */
function errorResult(action: ActionType, message: string): ActionResult {
  return { success: false, action, message };
}

/** Helper to create success result */
function successResult(
  action: ActionType,
  message: string,
  data?: ActionResultData
): ActionResult {
  return { success: true, action, message, data };
}

/** Helper to create confirmation-required result */
function confirmationResult(
  action: ActionType,
  prompt: string,
  data?: ActionResultData
): ActionResult {
  return {
    success: false,
    action,
    message: 'Confirmation required',
    requiresConfirmation: true,
    confirmationPrompt: prompt,
    data,
  };
}

/** Truncate text with ellipsis */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

async function executeCreateNote(
  params: ActionParameters,
  tenantId: string,
  _options: ExecuteOptions
): Promise<ActionResult> {
  if (!params.noteContent) {
    return errorResult('create_note', 'No content provided for note');
  }

  const note = await createNote(params.noteContent, tenantId, {
    title: params.noteTitle,
    tags: params.noteTags,
  });

  return successResult(
    'create_note',
    `Created note: "${truncate(params.noteContent, 50)}"`,
    { createdNote: note }
  );
}

async function executeSetReminder(
  params: ActionParameters,
  tenantId: string,
  _options: ExecuteOptions
): Promise<ActionResult> {
  if (!params.reminderText) {
    return errorResult('set_reminder', 'No reminder text provided');
  }

  const dueAt = parseReminderTime(params.reminderTime);
  const content = `🔔 REMINDER: ${params.reminderText}${dueAt ? `\n\nDue: ${dueAt.toISOString()}` : ''}`;

  const note = await createNote(content, tenantId, {
    title: `Reminder: ${truncate(params.reminderText, 50)}`,
    tags: ['reminder', 'action-item'],
    metadata: { type: 'reminder', dueAt: dueAt?.toISOString() },
  });

  const dateStr = dueAt ? ` for ${dueAt.toLocaleDateString()}` : '';
  return successResult(
    'set_reminder',
    `Reminder set: "${params.reminderText}"${dateStr}`,
    { reminder: { id: note.id, text: params.reminderText, dueAt: dueAt?.toISOString() || 'unspecified' } }
  );
}

// =============================================================================
// Time Parsing Utilities
// =============================================================================

/** Time unit multipliers in milliseconds */
const TIME_UNITS: Record<string, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/** Parse natural language time string */
function parseReminderTime(timeStr?: string): Date | undefined {
  if (!timeStr) return undefined;

  const lower = timeStr.toLowerCase().trim();
  const now = new Date();

  // Relative words
  if (lower === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (lower === 'today') return now;

  // "in X units" pattern
  const inMatch = lower.match(/in\s+(\d+)\s+(minute|hour|day|week)s?/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    return new Date(now.getTime() + amount * (TIME_UNITS[unit] || 0));
  }

  // Try native Date parsing
  const parsed = new Date(timeStr);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

async function executeSearchNotes(
  params: ActionParameters,
  tenantId: string,
  _options: ExecuteOptions
): Promise<ActionResult> {
  if (!params.searchQuery) {
    return errorResult('search_notes', 'No search query provided');
  }

  const { chunks } = await retrieveRelevantChunks(params.searchQuery, {
    tenantId,
    topK: 20,
    rerankTo: 10,
  });

  const searchResults = chunks.slice(0, 5).map(chunk => ({
    noteId: chunk.noteId,
    preview: truncate(chunk.text, 150),
    date: chunk.createdAt.toLocaleDateString(),
  }));

  return successResult(
    'search_notes',
    `Found ${chunks.length} notes about "${params.searchQuery}"`,
    { searchResults }
  );
}

/** Period to days mapping */
const PERIOD_DAYS: Record<PeriodType, number> = { day: 1, week: 7, month: 30 };

async function executeSummarizePeriod(
  params: ActionParameters,
  tenantId: string,
  _options: ExecuteOptions
): Promise<ActionResult> {
  const periodType = params.periodType || 'week';
  const daysBack = PERIOD_DAYS[periodType];

  const { chunks } = await retrieveRelevantChunks(
    `Summarize my notes from the last ${periodType}`,
    { tenantId, topK: 30, rerankTo: 15, maxAgeDays: daysBack }
  );

  return successResult(
    'summarize_period',
    `Found ${chunks.length} notes from the last ${periodType} to summarize`,
    { summary: `Retrieved ${chunks.length} notes from the last ${periodType}. The AI will provide a summary.` }
  );
}

/** Patterns for extracting action items from text */
const ACTION_ITEM_PATTERNS = [
  /(?:^|\n)\s*[-*□☐]\s*(.+)/gm,        // Bullet points
  /(?:TODO|TASK|ACTION):\s*(.+)/gi,    // Labels
  /(?:need to|should|must|have to)\s+(.+?)(?:\.|$)/gi, // Natural language
];

async function executeListActionItems(
  _params: ActionParameters,
  tenantId: string,
  _options: ExecuteOptions
): Promise<ActionResult> {
  const { chunks } = await retrieveRelevantChunks('action items todos tasks to do', {
    tenantId,
    topK: 20,
    rerankTo: 10,
  });

  const actionItems: Array<{ text: string; source: string; status?: string }> = [];

  for (const chunk of chunks.slice(0, 10)) {
    for (const pattern of ACTION_ITEM_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex state
      let match;
      while ((match = pattern.exec(chunk.text)) !== null) {
        const text = match[1]?.trim();
        if (text && text.length > 5) {
          actionItems.push({ text, source: chunk.noteId, status: 'pending' });
        }
      }
    }
  }

  return successResult(
    'list_action_items',
    `Found ${actionItems.length} action items`,
    { actionItems: actionItems.slice(0, 20) }
  );
}

async function executeFindMentions(
  params: ActionParameters,
  tenantId: string,
  _options: ExecuteOptions
): Promise<ActionResult> {
  const searchTerm = params.personName || params.topicName;
  if (!searchTerm) {
    return errorResult('find_mentions', 'No person or topic specified');
  }

  const { chunks } = await retrieveRelevantChunks(searchTerm, {
    tenantId,
    topK: 20,
    rerankTo: 10,
  });

  const mentions = chunks.slice(0, 10).map(chunk => ({
    noteId: chunk.noteId,
    context: truncate(chunk.text, 200),
    date: chunk.createdAt.toLocaleDateString(),
  }));

  return successResult(
    'find_mentions',
    `Found ${chunks.length} mentions of "${searchTerm}"`,
    { mentions }
  );
}

/** Find a note by ID or search query */
async function findTargetNote(
  params: ActionParameters,
  tenantId: string,
  action: ActionType
): Promise<{ noteId: string; note: NoteResponse } | ActionResult> {
  let noteId = params.targetNoteId || params.summarizeNoteId;
  const query = params.targetNoteQuery || params.summarizeNoteQuery;

  if (!noteId && query) {
    const searchResult = await searchNotes(query, tenantId, { limit: 1 });
    if (searchResult.results.length === 0) {
      return errorResult(action, `Could not find a note about "${query}"`);
    }
    noteId = searchResult.results[0].note.id;
  }

  if (!noteId) {
    return errorResult(action, 'No target note specified');
  }

  const note = await getNote(noteId, tenantId);
  if (!note) {
    return errorResult(action, 'Note not found');
  }

  return { noteId, note };
}

/** Check if result is an ActionResult (error) */
function isActionResult(result: unknown): result is ActionResult {
  return typeof result === 'object' && result !== null && 'success' in result;
}

async function executeAppendToNote(
  params: ActionParameters,
  tenantId: string,
  options: ExecuteOptions
): Promise<ActionResult> {
  if (!params.appendContent) {
    return errorResult('append_to_note', 'No content to append provided');
  }

  const found = await findTargetNote(params, tenantId, 'append_to_note');
  if (isActionResult(found)) return found;
  const { noteId, note } = found;

  // Require confirmation unless skipped
  if (!options.confirmed && !options.skipConfirmation) {
    return confirmationResult(
      'append_to_note',
      `I found a note that starts with: "${truncate(note.text, 100)}"\n\nDo you want me to append: "${params.appendContent}"?`,
      { targetNotePreview: truncate(note.text, 200) }
    );
  }

  const updatedText = note.text + '\n\n' + params.appendContent;
  const updatedNote = await updateNote(noteId, tenantId, { text: updatedText });

  return successResult('append_to_note', 'Appended content to note', {
    updatedNote: updatedNote || undefined,
  });
}

async function executeTagNote(
  params: ActionParameters,
  tenantId: string,
  options: ExecuteOptions
): Promise<ActionResult> {
  if (!params.tagsToAdd?.length && !params.tagsToRemove?.length) {
    return errorResult('tag_note', 'No tags specified');
  }

  const found = await findTargetNote(params, tenantId, 'tag_note');
  if (isActionResult(found)) return found;
  const { noteId, note } = found;

  // Require confirmation unless skipped
  if (!options.confirmed && !options.skipConfirmation) {
    const tagsStr = params.tagsToAdd?.map(t => `#${t}`).join(', ') || '';
    return confirmationResult(
      'tag_note',
      `I found a note that starts with: "${truncate(note.text, 100)}"\n\nDo you want me to add tags: ${tagsStr}?`,
      { targetNotePreview: truncate(note.text, 200) }
    );
  }

  // Update tags - merge and deduplicate
  const currentTags = note.tags || [];
  const merged = currentTags.concat(params.tagsToAdd || []);
  const newTags = Array.from(new Set(merged));
  const finalTags = newTags.filter(t => !params.tagsToRemove?.includes(t));

  const updatedNote = await updateNote(noteId, tenantId, { tags: finalTags });

  return successResult('tag_note', 'Updated tags on note', {
    updatedNote: updatedNote || undefined,
    tagsAdded: params.tagsToAdd,
    tagsRemoved: params.tagsToRemove,
  });
}

async function executeSummarizeNote(
  params: ActionParameters,
  tenantId: string,
  _options: ExecuteOptions
): Promise<ActionResult> {
  const found = await findTargetNote(params, tenantId, 'summarize_note');
  if (isActionResult(found)) return found;
  const { note } = found;

  const enrichment = await enrichNote(note.text, note.title);

  return successResult('summarize_note', 'Generated summary for note', {
    noteSummary: enrichment.summary || 'No summary available',
    targetNotePreview: truncate(note.text, 200),
  });
}

// =============================================================================
// Response Formatting
// =============================================================================

/** Icons for each action type */
const ACTION_ICONS: Record<ActionType, string> = {
  create_note: '✅',
  set_reminder: '🔔',
  search_notes: '📝',
  summarize_period: '📊',
  list_action_items: '📋',
  find_mentions: '🔍',
  append_to_note: '✏️',
  tag_note: '🏷️',
  summarize_note: '📄',
};

/** Format action result as a user-friendly response */
export function formatActionResponse(result: ActionResult): string {
  // Handle confirmation required
  if (result.requiresConfirmation) {
    return result.confirmationPrompt || result.message;
  }

  // Handle errors
  if (!result.success) {
    return `I couldn't complete that action: ${result.message}`;
  }

  const icon = ACTION_ICONS[result.action] || '✓';
  const { data } = result;

  switch (result.action) {
    case 'create_note':
      return `${icon} ${result.message}\n\nYour note has been saved and will be searchable shortly.`;

    case 'set_reminder':
      return `${icon} ${result.message}\n\nI've saved this as a reminder note tagged with #reminder.`;

    case 'search_notes':
      if (!data?.searchResults?.length) {
        return `I searched your notes but didn't find anything matching that query.`;
      }
      return `${icon} ${result.message}\n\nHere are the most relevant notes:\n${formatList(data.searchResults, r => r.preview)}`;

    case 'summarize_period':
      return result.message;

    case 'list_action_items':
      if (!data?.actionItems?.length) {
        return `I couldn't find any action items in your recent notes.`;
      }
      return `${icon} ${result.message}\n\n${formatList(data.actionItems, item => item.text)}`;

    case 'find_mentions':
      if (!data?.mentions?.length) {
        return `I couldn't find any mentions matching that criteria.`;
      }
      return `${icon} ${result.message}\n\n${formatList(data.mentions, m => m.context, '\n\n')}`;

    case 'append_to_note':
      return `${icon} ${result.message}\n\nThe note has been updated.`;

    case 'tag_note': {
      const tags = data?.tagsAdded?.map(t => `#${t}`).join(', ') || '';
      return `${icon} ${result.message}\n\nAdded tags: ${tags}`;
    }

    case 'summarize_note':
      return `${icon} ${result.message}\n\n${data?.noteSummary || ''}`;

    default:
      return result.message;
  }
}

/** Format a list of items with numbering */
function formatList<T>(
  items: T[],
  getText: (item: T) => string,
  separator = '\n'
): string {
  return items.map((item, i) => `${i + 1}. ${getText(item)}`).join(separator);
}

