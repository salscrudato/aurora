/**
 * AuroraNotes API - Speech-to-Text Transcription Service
 *
 * Provides audio transcription using Google GenAI (Gemini).
 * Supports MP3, WAV, AIFF, AAC, OGG, and FLAC audio formats.
 *
 * Usage:
 *   const result = await transcribeAudio(audioBuffer, 'audio/mp3');
 */

import { getGenAIClient, acquireRequestSlot } from './genaiClient';
import { logInfo, logError, logWarn } from './utils';

// ============================================================================
// Configuration
// ============================================================================

/** Model to use for transcription */
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gemini-2.0-flash';

/** Maximum audio file size (20MB - API limit for inline data) */
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;

/** Supported audio MIME types */
export const SUPPORTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
] as const;

export type SupportedAudioType = typeof SUPPORTED_AUDIO_TYPES[number];

// ============================================================================
// Types
// ============================================================================

/** Output format for transcription */
export type TranscriptionOutputFormat = 'text' | 'segments' | 'srt' | 'vtt';

/** Transcription segment with timing */
export interface TranscriptionSegment {
  text: string;
  startTime: number;
  endTime: number;
  speaker?: string;
  confidence?: number;
}

/** Action item extracted from transcription */
export interface ActionItem {
  text: string;
  assignee?: string;
  dueDate?: string;
  priority?: 'high' | 'medium' | 'low';
}

/** Transcription request options */
export interface TranscriptionOptions {
  /** Language hint for better accuracy (e.g., 'en', 'es', 'fr') */
  languageHint?: string;
  /** Include timestamps in transcription */
  includeTimestamps?: boolean;
  /** Include speaker diarization */
  includeSpeakerDiarization?: boolean;
  /** Add punctuation to transcript */
  addPunctuation?: boolean;
  /** Custom vocabulary hints for domain-specific terms */
  vocabularyHints?: string;
  /** Output format */
  outputFormat?: TranscriptionOutputFormat;
  /** Generate a summary of the transcription */
  generateSummary?: boolean;
  /** Extract action items from the transcription */
  extractActionItems?: boolean;
  /** Detect and segment by topic */
  detectTopics?: boolean;
}

/** Transcription result */
export interface TranscriptionResult {
  /** The transcribed text */
  text: string;
  /** Detected language (if available) */
  detectedLanguage?: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Model used for transcription */
  model: string;
  /** Audio duration estimate based on tokens (32 tokens/sec) */
  estimatedDurationSeconds?: number;
  /** Segments with timestamps (if includeTimestamps or outputFormat is 'segments') */
  segments?: TranscriptionSegment[];
  /** Summary of the transcription (if generateSummary) */
  summary?: string;
  /** Action items extracted (if extractActionItems) */
  actionItems?: ActionItem[];
  /** Topics detected (if detectTopics) */
  topics?: string[];
  /** Subtitle format output (if outputFormat is 'srt' or 'vtt') */
  subtitles?: string;
  /** Number of speakers detected (if includeSpeakerDiarization) */
  speakerCount?: number;
}

// ============================================================================
// Prompt Builders
// ============================================================================

/**
 * Build the main transcription prompt based on options
 */
function buildTranscriptionPrompt(options: TranscriptionOptions): string {
  const parts: string[] = [];

  // Base instruction
  parts.push('Generate a transcript of the speech.');

  // Language hint
  if (options.languageHint) {
    parts.push(`The audio is in ${options.languageHint}.`);
  }

  // Vocabulary hints
  if (options.vocabularyHints) {
    parts.push(`Domain-specific terms that may appear: ${options.vocabularyHints}.`);
  }

  // Speaker diarization
  if (options.includeSpeakerDiarization) {
    parts.push('Identify different speakers (Speaker 1, Speaker 2, etc.).');
  }

  // Timestamps
  if (options.includeTimestamps || options.outputFormat === 'segments' ||
      options.outputFormat === 'srt' || options.outputFormat === 'vtt') {
    parts.push('Include timestamps in the format [MM:SS] at the start of each segment.');
  }

  // Punctuation
  if (options.addPunctuation !== false) {
    parts.push('Add proper punctuation and capitalization.');
  }

  // Output format instructions
  if (options.outputFormat === 'segments') {
    parts.push('Format each segment as: [timestamp] speaker: text');
  } else if (options.outputFormat === 'srt') {
    parts.push('Format the output as SRT subtitles with sequential numbering, timestamps (HH:MM:SS,mmm --> HH:MM:SS,mmm format), and text.');
  } else if (options.outputFormat === 'vtt') {
    parts.push('Format the output as WebVTT subtitles starting with "WEBVTT" header, with timestamps (HH:MM:SS.mmm --> HH:MM:SS.mmm format).');
  } else {
    parts.push('Return the transcribed text.');
  }

  return parts.join(' ');
}

/**
 * Build the summary extraction prompt
 */
function buildSummaryPrompt(transcript: string): string {
  return `Summarize the following transcript in 2-3 concise sentences, capturing the main points and key takeaways:

${transcript}

Summary:`;
}

/**
 * Build the action items extraction prompt
 */
function buildActionItemsPrompt(transcript: string): string {
  return `Extract action items from the following transcript. For each action item, identify:
- The task to be done
- Who should do it (if mentioned)
- When it's due (if mentioned)
- Priority (high/medium/low based on context)

Return the result as a JSON array of objects with keys: text, assignee, dueDate, priority.
If no action items are found, return an empty array [].

Transcript:
${transcript}

Action items (JSON):`;
}

/**
 * Build the topics extraction prompt
 */
function buildTopicsPrompt(transcript: string): string {
  return `Identify the main topics discussed in the following transcript. Return 3-5 topic keywords or short phrases, separated by commas.

Transcript:
${transcript}

Topics:`;
}

// ============================================================================
// Main Transcription Function
// ============================================================================

/**
 * Transcribe audio to text using Google GenAI.
 *
 * @param audioBuffer - Audio data as a Buffer
 * @param mimeType - MIME type of the audio (e.g., 'audio/mp3')
 * @param options - Optional transcription settings
 * @returns Transcription result with text and metadata
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const startTime = Date.now();

  // Validate audio size
  if (audioBuffer.length > MAX_AUDIO_SIZE_BYTES) {
    throw new TranscriptionError(
      `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB`,
      'FILE_TOO_LARGE'
    );
  }

  // Validate MIME type
  if (!SUPPORTED_AUDIO_TYPES.includes(mimeType as SupportedAudioType)) {
    throw new TranscriptionError(
      `Unsupported audio format: ${mimeType}. Supported formats: ${SUPPORTED_AUDIO_TYPES.join(', ')}`,
      'UNSUPPORTED_FORMAT'
    );
  }

  logInfo('Starting audio transcription', {
    mimeType,
    sizeBytes: audioBuffer.length,
    languageHint: options.languageHint,
    options: {
      includeTimestamps: options.includeTimestamps,
      includeSpeakerDiarization: options.includeSpeakerDiarization,
      outputFormat: options.outputFormat,
      generateSummary: options.generateSummary,
      extractActionItems: options.extractActionItems,
      detectTopics: options.detectTopics,
    },
  });

  // Acquire request slot for concurrency limiting
  const releaseSlot = await acquireRequestSlot();

  try {
    const client = getGenAIClient();

    // Build the transcription prompt
    const prompt = buildTranscriptionPrompt(options);

    // Convert buffer to base64
    const base64Audio = audioBuffer.toString('base64');

    // Call GenAI with audio data
    const response = await client.models.generateContent({
      model: TRANSCRIPTION_MODEL,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
          ],
        },
      ],
    });

    const transcribedText = response.text?.trim() || '';
    let processingTimeMs = Date.now() - startTime;

    // Estimate duration from response token count (if available)
    // Gemini uses 32 tokens per second of audio
    const estimatedDurationSeconds = response.usageMetadata?.promptTokenCount
      ? Math.round(response.usageMetadata.promptTokenCount / 32)
      : undefined;

    // Build result
    const result: TranscriptionResult = {
      text: transcribedText,
      processingTimeMs,
      model: TRANSCRIPTION_MODEL,
      estimatedDurationSeconds,
    };

    // Handle subtitle formats
    if (options.outputFormat === 'srt' || options.outputFormat === 'vtt') {
      result.subtitles = transcribedText;
      // Extract plain text from subtitles for other processing
      const plainText = transcribedText
        .replace(/^\d+\n/gm, '')  // Remove SRT numbering
        .replace(/^WEBVTT\n/m, '')  // Remove VTT header
        .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/g, '')  // Remove timestamps
        .replace(/\n{2,}/g, ' ')
        .trim();
      result.text = plainText || transcribedText;
    }

    // Parse segments if requested
    if (options.outputFormat === 'segments' || (options.includeTimestamps && options.includeSpeakerDiarization)) {
      result.segments = parseSegments(transcribedText, options.includeSpeakerDiarization);
      if (options.includeSpeakerDiarization) {
        const speakers = new Set(result.segments?.map(s => s.speaker).filter(Boolean));
        result.speakerCount = speakers.size;
      }
    }

    // Generate summary if requested
    if (options.generateSummary && transcribedText.length > 100) {
      try {
        const summaryResponse = await client.models.generateContent({
          model: TRANSCRIPTION_MODEL,
          contents: [{ parts: [{ text: buildSummaryPrompt(transcribedText) }] }],
        });
        result.summary = summaryResponse.text?.trim();
      } catch (err) {
        logWarn('Failed to generate summary', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Extract action items if requested
    if (options.extractActionItems && transcribedText.length > 50) {
      try {
        const actionResponse = await client.models.generateContent({
          model: TRANSCRIPTION_MODEL,
          contents: [{ parts: [{ text: buildActionItemsPrompt(transcribedText) }] }],
        });
        const actionText = actionResponse.text?.trim() || '[]';
        // Parse JSON, handling potential markdown code blocks
        const jsonMatch = actionText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          result.actionItems = JSON.parse(jsonMatch[0]) as ActionItem[];
        }
      } catch (err) {
        logWarn('Failed to extract action items', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Detect topics if requested
    if (options.detectTopics && transcribedText.length > 100) {
      try {
        const topicsResponse = await client.models.generateContent({
          model: TRANSCRIPTION_MODEL,
          contents: [{ parts: [{ text: buildTopicsPrompt(transcribedText) }] }],
        });
        const topicsText = topicsResponse.text?.trim() || '';
        result.topics = topicsText.split(',').map(t => t.trim()).filter(Boolean);
      } catch (err) {
        logWarn('Failed to detect topics', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Update processing time to include additional processing
    result.processingTimeMs = Date.now() - startTime;

    logInfo('Transcription completed', {
      textLength: transcribedText.length,
      processingTimeMs: result.processingTimeMs,
      estimatedDurationSeconds,
      hasSummary: !!result.summary,
      actionItemCount: result.actionItems?.length,
      topicCount: result.topics?.length,
    });

    return result;
  } catch (error) {
    logError('Transcription failed', error);

    if (error instanceof TranscriptionError) {
      throw error;
    }

    throw new TranscriptionError(
      `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'TRANSCRIPTION_FAILED'
    );
  } finally {
    releaseSlot();
  }
}

/**
 * Parse transcript text into segments with timestamps and speakers
 */
function parseSegments(text: string, hasSpeakers: boolean = false): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];

  // Pattern for [MM:SS] or [HH:MM:SS] timestamps
  const timestampPattern = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;

  const lines = text.split('\n');
  let currentTime = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Try to extract timestamp
    const timestampMatch = trimmedLine.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
    let startTime = currentTime;

    if (timestampMatch) {
      const hours = timestampMatch[3] ? parseInt(timestampMatch[1]) : 0;
      const minutes = timestampMatch[3] ? parseInt(timestampMatch[2]) : parseInt(timestampMatch[1]);
      const seconds = timestampMatch[3] ? parseInt(timestampMatch[3]) : parseInt(timestampMatch[2]);
      startTime = hours * 3600 + minutes * 60 + seconds;
      currentTime = startTime;
    }

    // Try to extract speaker
    let speaker: string | undefined;
    let segmentText = trimmedLine.replace(/^\[[\d:]+\]\s*/, '');

    if (hasSpeakers) {
      const speakerMatch = segmentText.match(/^(Speaker\s*\d+|[A-Za-z]+):\s*/i);
      if (speakerMatch) {
        speaker = speakerMatch[1];
        segmentText = segmentText.slice(speakerMatch[0].length);
      }
    }

    if (segmentText) {
      segments.push({
        text: segmentText,
        startTime,
        endTime: startTime + 5, // Estimate 5 seconds per segment
        speaker,
      });
    }
  }

  // Update end times based on next segment
  for (let i = 0; i < segments.length - 1; i++) {
    segments[i].endTime = segments[i + 1].startTime;
  }

  return segments;
}

// ============================================================================
// Error Class
// ============================================================================

export type TranscriptionErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'TRANSCRIPTION_FAILED'
  | 'INVALID_AUDIO';

export class TranscriptionError extends Error {
  code: TranscriptionErrorCode;

  constructor(message: string, code: TranscriptionErrorCode) {
    super(message);
    this.name = 'TranscriptionError';
    this.code = code;
  }
}

/**
 * Check if a MIME type is supported for transcription
 */
export function isAudioTypeSupported(mimeType: string): boolean {
  return SUPPORTED_AUDIO_TYPES.includes(mimeType as SupportedAudioType);
}

