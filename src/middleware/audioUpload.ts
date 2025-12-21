/**
 * AuroraNotes API - Audio Upload Middleware
 *
 * Multer configuration for handling audio file uploads.
 * Supports MP3, WAV, WEBM, OGG, AAC, FLAC, and AIFF formats.
 *
 * Usage:
 *   app.post('/transcribe', audioUpload.single('audio'), handler);
 */

import multer from 'multer';
import { Request } from 'express';
import { SUPPORTED_AUDIO_TYPES } from '../transcription';

// ============================================================================
// Configuration
// ============================================================================

/** Maximum audio file size (20MB) */
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Map of file extensions to MIME types for validation
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.m4a': 'audio/aac',
};

// ============================================================================
// Multer Configuration
// ============================================================================

/**
 * Custom file filter for audio uploads
 */
const audioFileFilter: multer.Options['fileFilter'] = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Check MIME type
  const mimeType = file.mimetype.toLowerCase();
  
  // Normalize some common variations
  const normalizedMime = normalizeMimeType(mimeType);
  
  if (SUPPORTED_AUDIO_TYPES.includes(normalizedMime as any)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported audio format: ${mimeType}. Supported formats: MP3, WAV, WEBM, OGG, AAC, FLAC, AIFF`));
  }
};

/**
 * Normalize MIME type variations to standard format
 */
function normalizeMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'audio/mpeg': 'audio/mp3',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/x-aiff': 'audio/aiff',
    'audio/x-aac': 'audio/aac',
    'audio/mp4': 'audio/aac',
    'audio/m4a': 'audio/aac',
    'audio/x-m4a': 'audio/aac',
    'audio/x-flac': 'audio/flac',
    'video/webm': 'audio/webm', // Browser may send this for audio-only webm
  };
  
  return mimeMap[mimeType] || mimeType;
}

/**
 * Multer storage configuration - memory storage for processing
 */
const storage = multer.memoryStorage();

/**
 * Configured multer instance for audio uploads
 */
export const audioUpload = multer({
  storage,
  limits: {
    fileSize: MAX_AUDIO_SIZE_BYTES,
    files: 1, // Only allow single file upload
  },
  fileFilter: audioFileFilter,
});

/**
 * Get the normalized MIME type for a file
 */
export function getNormalizedMimeType(file: Express.Multer.File): string {
  return normalizeMimeType(file.mimetype.toLowerCase());
}

/**
 * Error class for audio upload errors
 */
export class AudioUploadError extends Error {
  code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'NO_FILE';
  
  constructor(message: string, code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'NO_FILE') {
    super(message);
    this.name = 'AudioUploadError';
    this.code = code;
  }
}

/**
 * Handle multer errors and convert to AudioUploadError
 */
export function handleMulterError(error: any): AudioUploadError {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AudioUploadError(
        `File too large. Maximum size is ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB`,
        'FILE_TOO_LARGE'
      );
    }
  }
  
  if (error.message?.includes('Unsupported audio format')) {
    return new AudioUploadError(error.message, 'UNSUPPORTED_FORMAT');
  }
  
  return new AudioUploadError(error.message || 'Upload failed', 'UNSUPPORTED_FORMAT');
}

