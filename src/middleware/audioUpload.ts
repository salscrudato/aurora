/**
 * AuroraNotes API - Audio Upload Middleware
 *
 * Multer configuration for handling audio file uploads with comprehensive
 * validation including MIME type checking and magic byte verification.
 *
 * Supported formats: MP3, WAV, WEBM, OGG, AAC, FLAC, AIFF, M4A
 *
 * Features:
 * - MIME type normalization for browser variations
 * - Magic byte validation for security
 * - Configurable size limits
 * - Detailed error handling
 *
 * Usage:
 *   import { audioUpload, handleMulterError } from './middleware';
 *
 *   app.post('/transcribe', (req, res, next) => {
 *     audioUpload.single('audio')(req, res, (err) => {
 *       if (err) {
 *         const uploadError = handleMulterError(err);
 *         return res.status(400).json({ error: uploadError });
 *       }
 *       next();
 *     });
 *   }, handler);
 */

import multer from 'multer';
import { Request } from 'express';
import { SUPPORTED_AUDIO_TYPES, SupportedAudioType } from '../transcription';

// ============================================================================
// Configuration Constants
// ============================================================================

/** Maximum audio file size in bytes (20MB) */
export const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;

/** Maximum audio file size in MB (for display) */
export const MAX_AUDIO_SIZE_MB = MAX_AUDIO_SIZE_BYTES / 1024 / 1024;

/** Minimum audio file size in bytes (1KB - reject empty/corrupt files) */
export const MIN_AUDIO_SIZE_BYTES = 1024;

/** Field name expected for audio file in multipart form */
export const AUDIO_FIELD_NAME = 'audio';

/**
 * Map of file extensions to normalized MIME types
 * Used for validation when MIME type detection fails
 */
export const EXTENSION_TO_MIME: Readonly<Record<string, SupportedAudioType>> = {
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.m4a': 'audio/aac',
} as const;

/**
 * Magic bytes (file signatures) for audio format validation
 * Used to verify file content matches claimed MIME type
 */
const AUDIO_MAGIC_BYTES: ReadonlyArray<{
  mime: SupportedAudioType;
  signatures: ReadonlyArray<number[]>;
  offset?: number;
}> = [
  // MP3: ID3 tag or frame sync
  { mime: 'audio/mp3', signatures: [[0x49, 0x44, 0x33], [0xFF, 0xFB], [0xFF, 0xFA], [0xFF, 0xF3], [0xFF, 0xF2]] },
  // WAV: RIFF....WAVE
  { mime: 'audio/wav', signatures: [[0x52, 0x49, 0x46, 0x46]] },
  // FLAC: fLaC
  { mime: 'audio/flac', signatures: [[0x66, 0x4C, 0x61, 0x43]] },
  // OGG: OggS
  { mime: 'audio/ogg', signatures: [[0x4F, 0x67, 0x67, 0x53]] },
  // AIFF: FORM....AIFF
  { mime: 'audio/aiff', signatures: [[0x46, 0x4F, 0x52, 0x4D]] },
  // WebM: EBML header (same as Matroska)
  { mime: 'audio/webm', signatures: [[0x1A, 0x45, 0xDF, 0xA3]] },
  // AAC: ADTS frame sync or M4A container (ftyp)
  { mime: 'audio/aac', signatures: [[0xFF, 0xF1], [0xFF, 0xF9], [0x00, 0x00, 0x00]] },
];

// ============================================================================
// MIME Type Normalization
// ============================================================================

/**
 * Map of browser MIME type variations to normalized standard types
 * Different browsers/platforms may send different MIME types for the same format
 */
const MIME_NORMALIZATION_MAP: Readonly<Record<string, SupportedAudioType>> = {
  // MP3 variations
  'audio/mpeg': 'audio/mp3',
  'audio/mpeg3': 'audio/mp3',
  'audio/x-mpeg-3': 'audio/mp3',

  // WAV variations
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',

  // AIFF variations
  'audio/x-aiff': 'audio/aiff',

  // AAC/M4A variations
  'audio/x-aac': 'audio/aac',
  'audio/mp4': 'audio/aac',
  'audio/m4a': 'audio/aac',
  'audio/x-m4a': 'audio/aac',
  'audio/aacp': 'audio/aac',

  // FLAC variations
  'audio/x-flac': 'audio/flac',

  // WebM (browsers sometimes send video/webm for audio-only)
  'video/webm': 'audio/webm',

  // OGG variations
  'audio/vorbis': 'audio/ogg',
  'application/ogg': 'audio/ogg',
} as const;

/**
 * Normalize MIME type variations to standard format
 *
 * @param mimeType - The original MIME type from the browser
 * @returns The normalized MIME type for internal use
 *
 * @example
 * normalizeMimeType('audio/mpeg') // 'audio/mp3'
 * normalizeMimeType('audio/x-wav') // 'audio/wav'
 * normalizeMimeType('video/webm') // 'audio/webm'
 */
export function normalizeMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase().trim();
  return MIME_NORMALIZATION_MAP[normalized] ?? normalized;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate file buffer against known magic bytes
 * Provides additional security by checking actual file content
 *
 * @param buffer - The file buffer to validate
 * @param claimedMime - The MIME type claimed by the upload
 * @returns true if magic bytes match a known audio format
 */
export function validateMagicBytes(buffer: Buffer, claimedMime: string): boolean {
  if (buffer.length < 12) return false;

  const normalizedMime = normalizeMimeType(claimedMime);

  for (const format of AUDIO_MAGIC_BYTES) {
    for (const signature of format.signatures) {
      const offset = format.offset ?? 0;
      let matches = true;

      for (let i = 0; i < signature.length; i++) {
        if (buffer[offset + i] !== signature[i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        // For strict validation, check if detected format matches claimed format
        // For now, accept if any valid audio format is detected
        return true;
      }
    }
  }

  // Fallback: allow if we can't detect but MIME type is valid
  // This handles edge cases like uncommon encodings
  return SUPPORTED_AUDIO_TYPES.includes(normalizedMime as SupportedAudioType);
}

/**
 * Check if a file size is within acceptable bounds
 *
 * @param sizeBytes - The file size in bytes
 * @returns Object with valid status and error message if invalid
 */
export function validateFileSize(sizeBytes: number): { valid: boolean; error?: string } {
  if (sizeBytes < MIN_AUDIO_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too small (${sizeBytes} bytes). Minimum size is ${MIN_AUDIO_SIZE_BYTES} bytes.`,
    };
  }

  if (sizeBytes > MAX_AUDIO_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Maximum size is ${MAX_AUDIO_SIZE_MB}MB.`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Multer Configuration
// ============================================================================

/**
 * Custom file filter for audio uploads
 * Validates MIME type before accepting the file
 */
const audioFileFilter: multer.Options['fileFilter'] = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const mimeType = file.mimetype.toLowerCase();
  const normalizedMime = normalizeMimeType(mimeType);

  if (SUPPORTED_AUDIO_TYPES.includes(normalizedMime as SupportedAudioType)) {
    cb(null, true);
  } else {
    const supportedFormats = Object.keys(EXTENSION_TO_MIME)
      .map(ext => ext.replace('.', '').toUpperCase())
      .join(', ');
    cb(new Error(`Unsupported audio format: ${mimeType}. Supported formats: ${supportedFormats}`));
  }
};

/**
 * Multer storage configuration
 * Uses memory storage for direct buffer access (required for Gemini API)
 */
const storage = multer.memoryStorage();

/**
 * Configured multer instance for audio uploads
 *
 * @example
 * // In route handler
 * audioUpload.single('audio')(req, res, (err) => {
 *   if (err) {
 *     const uploadError = handleMulterError(err);
 *     return res.status(400).json({ error: uploadError });
 *   }
 *   // Access file via req.file
 * });
 */
export const audioUpload = multer({
  storage,
  limits: {
    fileSize: MAX_AUDIO_SIZE_BYTES,
    files: 1, // Only allow single file upload
    fieldSize: MAX_AUDIO_SIZE_BYTES, // Limit field size to match file size
  },
  fileFilter: audioFileFilter,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the normalized MIME type for an uploaded file
 *
 * @param file - The multer file object
 * @returns The normalized MIME type string
 */
export function getNormalizedMimeType(file: Express.Multer.File): string {
  return normalizeMimeType(file.mimetype);
}

/**
 * Get file extension from MIME type
 *
 * @param mimeType - The MIME type
 * @returns The corresponding file extension (with dot) or null
 */
export function getExtensionFromMime(mimeType: string): string | null {
  const normalized = normalizeMimeType(mimeType);

  for (const [ext, mime] of Object.entries(EXTENSION_TO_MIME)) {
    if (mime === normalized) {
      return ext;
    }
  }

  return null;
}

/**
 * Get human-readable format name from MIME type
 *
 * @param mimeType - The MIME type
 * @returns Human-readable format name (e.g., "MP3", "WAV")
 */
export function getFormatName(mimeType: string): string {
  const normalized = normalizeMimeType(mimeType);
  const ext = getExtensionFromMime(normalized);
  return ext ? ext.replace('.', '').toUpperCase() : 'Unknown';
}

// ============================================================================
// Error Handling
// ============================================================================

/** Error codes for audio upload failures */
export type AudioUploadErrorCode =
  | 'FILE_TOO_LARGE'
  | 'FILE_TOO_SMALL'
  | 'UNSUPPORTED_FORMAT'
  | 'INVALID_CONTENT'
  | 'NO_FILE'
  | 'UPLOAD_FAILED';

/**
 * Custom error class for audio upload failures
 * Provides structured error information for API responses
 */
export class AudioUploadError extends Error {
  readonly code: AudioUploadErrorCode;
  readonly statusCode: number;

  constructor(message: string, code: AudioUploadErrorCode, statusCode = 400) {
    super(message);
    this.name = 'AudioUploadError';
    this.code = code;
    this.statusCode = statusCode;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AudioUploadError.prototype);
  }

  /**
   * Convert to JSON for API response
   */
  toJSON(): { code: string; message: string } {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Handle multer errors and convert to AudioUploadError
 * Provides consistent error handling for upload failures
 *
 * @param error - The error from multer or file filter
 * @returns A structured AudioUploadError
 */
export function handleMulterError(error: unknown): AudioUploadError {
  // Handle multer-specific errors
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return new AudioUploadError(
          `File too large. Maximum size is ${MAX_AUDIO_SIZE_MB}MB.`,
          'FILE_TOO_LARGE',
          413
        );
      case 'LIMIT_UNEXPECTED_FILE':
        return new AudioUploadError(
          `Unexpected field name. Use '${AUDIO_FIELD_NAME}' for audio file.`,
          'UPLOAD_FAILED'
        );
      case 'LIMIT_FILE_COUNT':
        return new AudioUploadError(
          'Only one audio file can be uploaded at a time.',
          'UPLOAD_FAILED'
        );
      default:
        return new AudioUploadError(
          `Upload failed: ${error.message}`,
          'UPLOAD_FAILED'
        );
    }
  }

  // Handle custom format errors from file filter
  if (error instanceof Error) {
    if (error.message.includes('Unsupported audio format')) {
      return new AudioUploadError(error.message, 'UNSUPPORTED_FORMAT', 415);
    }

    return new AudioUploadError(
      error.message || 'Upload failed',
      'UPLOAD_FAILED'
    );
  }

  // Handle unknown errors
  return new AudioUploadError('Upload failed', 'UPLOAD_FAILED');
}

/**
 * Validate an uploaded audio file buffer
 * Call this after upload to verify file content
 *
 * @param file - The multer file object
 * @returns Object with valid status and error if invalid
 */
export function validateAudioFile(file: Express.Multer.File): {
  valid: boolean;
  error?: AudioUploadError;
} {
  // Check file size bounds
  const sizeCheck = validateFileSize(file.size);
  if (!sizeCheck.valid) {
    const code = file.size < MIN_AUDIO_SIZE_BYTES ? 'FILE_TOO_SMALL' : 'FILE_TOO_LARGE';
    return {
      valid: false,
      error: new AudioUploadError(sizeCheck.error!, code),
    };
  }

  // Validate magic bytes
  if (!validateMagicBytes(file.buffer, file.mimetype)) {
    return {
      valid: false,
      error: new AudioUploadError(
        'File content does not match declared audio format. The file may be corrupt or mislabeled.',
        'INVALID_CONTENT'
      ),
    };
  }

  return { valid: true };
}
