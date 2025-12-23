/** Speech-to-Text Transcription Service using Google GenAI (Gemini) */

import { getGenAIClient, acquireRequestSlot } from './genaiClient';
import { logInfo, logError, logWarn } from './utils';

const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gemini-2.0-flash';
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;

export const SUPPORTED_AUDIO_TYPES = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm'] as const;
export type SupportedAudioType = typeof SUPPORTED_AUDIO_TYPES[number];
export type TranscriptionOutputFormat = 'text' | 'segments' | 'srt' | 'vtt';

export interface TranscriptionSegment { text: string; startTime: number; endTime: number; speaker?: string; confidence?: number; }
export interface ActionItem { text: string; assignee?: string; dueDate?: string; priority?: 'high' | 'medium' | 'low'; }

export interface TranscriptionOptions {
  languageHint?: string; includeTimestamps?: boolean; includeSpeakerDiarization?: boolean;
  addPunctuation?: boolean; vocabularyHints?: string; outputFormat?: TranscriptionOutputFormat;
  generateSummary?: boolean; extractActionItems?: boolean; detectTopics?: boolean;
}

export interface TranscriptionResult {
  text: string; detectedLanguage?: string; processingTimeMs: number; model: string;
  estimatedDurationSeconds?: number; segments?: TranscriptionSegment[]; summary?: string;
  actionItems?: ActionItem[]; topics?: string[]; subtitles?: string; speakerCount?: number;
}

function buildTranscriptionPrompt(opts: TranscriptionOptions): string {
  const p = ['Generate a transcript of the speech.'];
  if (opts.languageHint) p.push(`The audio is in ${opts.languageHint}.`);
  if (opts.vocabularyHints) p.push(`Domain-specific terms: ${opts.vocabularyHints}.`);
  if (opts.includeSpeakerDiarization) p.push('Identify different speakers (Speaker 1, Speaker 2, etc.).');
  if (opts.includeTimestamps || ['segments', 'srt', 'vtt'].includes(opts.outputFormat || '')) p.push('Include timestamps [MM:SS] at segment start.');
  if (opts.addPunctuation !== false) p.push('Add proper punctuation and capitalization.');
  if (opts.outputFormat === 'segments') p.push('Format: [timestamp] speaker: text');
  else if (opts.outputFormat === 'srt') p.push('Format as SRT subtitles (numbering, HH:MM:SS,mmm --> HH:MM:SS,mmm, text).');
  else if (opts.outputFormat === 'vtt') p.push('Format as WebVTT (WEBVTT header, HH:MM:SS.mmm --> HH:MM:SS.mmm).');
  else p.push('Return transcribed text.');
  return p.join(' ');
}

const buildSummaryPrompt = (t: string) => `Summarize in 2-3 sentences:\n\n${t}\n\nSummary:`;
const buildActionItemsPrompt = (t: string) => `Extract action items as JSON array [{text, assignee, dueDate, priority}]. Empty [] if none.\n\nTranscript:\n${t}\n\nAction items (JSON):`;
const buildTopicsPrompt = (t: string) => `Identify 3-5 main topics (comma-separated):\n\n${t}\n\nTopics:`;

/** Transcribe audio to text using Google GenAI */
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
  const startTime = Date.now();
  if (audioBuffer.length > MAX_AUDIO_SIZE_BYTES) throw new TranscriptionError(`Audio file too large. Maximum size is ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB`, 'FILE_TOO_LARGE');
  if (!SUPPORTED_AUDIO_TYPES.includes(mimeType as SupportedAudioType)) throw new TranscriptionError(`Unsupported audio format: ${mimeType}. Supported: ${SUPPORTED_AUDIO_TYPES.join(', ')}`, 'UNSUPPORTED_FORMAT');

  logInfo('Starting transcription', { mimeType, sizeBytes: audioBuffer.length });
  const releaseSlot = await acquireRequestSlot();

  try {
    const client = getGenAIClient();
    const response = await client.models.generateContent({
      model: TRANSCRIPTION_MODEL,
      contents: [{ parts: [{ text: buildTranscriptionPrompt(options) }, { inlineData: { mimeType, data: audioBuffer.toString('base64') } }] }],
    });

    const transcribedText = response.text?.trim() || '';
    const estimatedDurationSeconds = response.usageMetadata?.promptTokenCount ? Math.round(response.usageMetadata.promptTokenCount / 32) : undefined;
    const result: TranscriptionResult = { text: transcribedText, processingTimeMs: Date.now() - startTime, model: TRANSCRIPTION_MODEL, estimatedDurationSeconds };

    // Handle subtitle formats
    if (options.outputFormat === 'srt' || options.outputFormat === 'vtt') {
      result.subtitles = transcribedText;
      result.text = transcribedText.replace(/^\d+\n/gm, '').replace(/^WEBVTT\n/m, '').replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/g, '').replace(/\n{2,}/g, ' ').trim() || transcribedText;
    }

    // Parse segments
    if (options.outputFormat === 'segments' || (options.includeTimestamps && options.includeSpeakerDiarization)) {
      result.segments = parseSegments(transcribedText, options.includeSpeakerDiarization);
      if (options.includeSpeakerDiarization) result.speakerCount = new Set(result.segments?.map(s => s.speaker).filter(Boolean)).size;
    }

    // Optional enhancements
    const gen = (prompt: string) => client.models.generateContent({ model: TRANSCRIPTION_MODEL, contents: [{ parts: [{ text: prompt }] }] });
    if (options.generateSummary && transcribedText.length > 100) {
      try { result.summary = (await gen(buildSummaryPrompt(transcribedText))).text?.trim(); } catch (e) { logWarn('Summary failed', { error: e instanceof Error ? e.message : String(e) }); }
    }
    if (options.extractActionItems && transcribedText.length > 50) {
      try {
        const txt = (await gen(buildActionItemsPrompt(transcribedText))).text?.trim() || '[]';
        const m = txt.match(/\[[\s\S]*\]/); if (m) result.actionItems = JSON.parse(m[0]) as ActionItem[];
      } catch (e) { logWarn('Action items failed', { error: e instanceof Error ? e.message : String(e) }); }
    }
    if (options.detectTopics && transcribedText.length > 100) {
      try { result.topics = ((await gen(buildTopicsPrompt(transcribedText))).text?.trim() || '').split(',').map(t => t.trim()).filter(Boolean); } catch (e) { logWarn('Topics failed', { error: e instanceof Error ? e.message : String(e) }); }
    }

    result.processingTimeMs = Date.now() - startTime;
    logInfo('Transcription completed', { textLength: transcribedText.length, processingTimeMs: result.processingTimeMs });
    return result;
  } catch (error) {
    logError('Transcription failed', error);
    if (error instanceof TranscriptionError) throw error;
    throw new TranscriptionError(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'TRANSCRIPTION_FAILED');
  } finally { releaseSlot(); }
}

function parseSegments(text: string, hasSpeakers = false): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  let currentTime = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim(); if (!trimmed) continue;
    const tsMatch = trimmed.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
    let startTime = currentTime;
    if (tsMatch) {
      const [, a, b, c] = tsMatch;
      startTime = c ? parseInt(a) * 3600 + parseInt(b) * 60 + parseInt(c) : parseInt(a) * 60 + parseInt(b);
      currentTime = startTime;
    }
    let speaker: string | undefined, segText = trimmed.replace(/^\[[\d:]+\]\s*/, '');
    if (hasSpeakers) { const sm = segText.match(/^(Speaker\s*\d+|[A-Za-z]+):\s*/i); if (sm) { speaker = sm[1]; segText = segText.slice(sm[0].length); } }
    if (segText) segments.push({ text: segText, startTime, endTime: startTime + 5, speaker });
  }
  for (let i = 0; i < segments.length - 1; i++) segments[i].endTime = segments[i + 1].startTime;
  return segments;
}

export type TranscriptionErrorCode = 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'TRANSCRIPTION_FAILED' | 'INVALID_AUDIO';

export class TranscriptionError extends Error {
  code: TranscriptionErrorCode;
  constructor(message: string, code: TranscriptionErrorCode) { super(message); this.name = 'TranscriptionError'; this.code = code; }
}

export function isAudioTypeSupported(mimeType: string): boolean {
  return SUPPORTED_AUDIO_TYPES.includes(mimeType as SupportedAudioType);
}
