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

/** Transcription request options */
export interface TranscriptionOptions {
  /** Language hint for better accuracy (e.g., 'en', 'es', 'fr') */
  languageHint?: string;
  /** Include timestamps in transcription */
  includeTimestamps?: boolean;
  /** Include speaker diarization */
  includeSpeakerDiarization?: boolean;
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
  });

  // Acquire request slot for concurrency limiting
  const releaseSlot = await acquireRequestSlot();

  try {
    const client = getGenAIClient();

    // Build the transcription prompt
    let prompt = 'Generate a transcript of the speech. Return only the transcribed text, nothing else.';
    
    if (options.languageHint) {
      prompt = `Generate a transcript of the speech. The audio is in ${options.languageHint}. Return only the transcribed text, nothing else.`;
    }

    if (options.includeTimestamps) {
      prompt = `Generate a transcript of the speech with timestamps in the format [MM:SS]. ${options.languageHint ? `The audio is in ${options.languageHint}.` : ''}`;
    }

    if (options.includeSpeakerDiarization) {
      prompt = `Generate a transcript of the speech, identifying different speakers (Speaker 1, Speaker 2, etc.). ${options.includeTimestamps ? 'Include timestamps [MM:SS].' : ''} ${options.languageHint ? `The audio is in ${options.languageHint}.` : ''}`;
    }

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
    const processingTimeMs = Date.now() - startTime;

    // Estimate duration from response token count (if available)
    // Gemini uses 32 tokens per second of audio
    const estimatedDurationSeconds = response.usageMetadata?.promptTokenCount
      ? Math.round(response.usageMetadata.promptTokenCount / 32)
      : undefined;

    logInfo('Transcription completed', {
      textLength: transcribedText.length,
      processingTimeMs,
      estimatedDurationSeconds,
    });

    return {
      text: transcribedText,
      processingTimeMs,
      model: TRANSCRIPTION_MODEL,
      estimatedDurationSeconds,
    };
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

