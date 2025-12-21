/**
 * Transcription Module Tests
 *
 * Tests for speech-to-text transcription functionality.
 * Run with: npx ts-node --test src/transcription.test.ts
 * Or: node --experimental-strip-types --test src/transcription.test.ts
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  transcribeAudio,
  TranscriptionError,
  isAudioTypeSupported,
  SUPPORTED_AUDIO_TYPES,
} from './transcription';

// ============================================================================
// Unit Tests - isAudioTypeSupported
// ============================================================================

describe('isAudioTypeSupported', () => {
  it('returns true for supported audio types', () => {
    assert.strictEqual(isAudioTypeSupported('audio/mp3'), true);
    assert.strictEqual(isAudioTypeSupported('audio/wav'), true);
    assert.strictEqual(isAudioTypeSupported('audio/mpeg'), true);
    assert.strictEqual(isAudioTypeSupported('audio/webm'), true);
    assert.strictEqual(isAudioTypeSupported('audio/ogg'), true);
    assert.strictEqual(isAudioTypeSupported('audio/flac'), true);
    assert.strictEqual(isAudioTypeSupported('audio/aac'), true);
    assert.strictEqual(isAudioTypeSupported('audio/aiff'), true);
  });

  it('returns false for unsupported audio types', () => {
    assert.strictEqual(isAudioTypeSupported('audio/midi'), false);
    assert.strictEqual(isAudioTypeSupported('video/mp4'), false);
    assert.strictEqual(isAudioTypeSupported('image/png'), false);
    assert.strictEqual(isAudioTypeSupported('text/plain'), false);
    assert.strictEqual(isAudioTypeSupported(''), false);
  });

  it('is case-sensitive for MIME types', () => {
    // MIME types are case-insensitive by spec, but our implementation expects lowercase
    assert.strictEqual(isAudioTypeSupported('AUDIO/MP3'), false);
    assert.strictEqual(isAudioTypeSupported('Audio/Wav'), false);
  });
});

describe('SUPPORTED_AUDIO_TYPES', () => {
  it('includes all common audio formats', () => {
    assert.ok(SUPPORTED_AUDIO_TYPES.includes('audio/mp3'), 'Should support MP3');
    assert.ok(SUPPORTED_AUDIO_TYPES.includes('audio/wav'), 'Should support WAV');
    assert.ok(SUPPORTED_AUDIO_TYPES.includes('audio/webm'), 'Should support WebM');
    assert.ok(SUPPORTED_AUDIO_TYPES.includes('audio/ogg'), 'Should support OGG');
  });

  it('has expected number of supported formats', () => {
    assert.ok(SUPPORTED_AUDIO_TYPES.length >= 7, 'Should support at least 7 audio formats');
  });
});

// ============================================================================
// Unit Tests - TranscriptionError
// ============================================================================

describe('TranscriptionError', () => {
  it('creates error with correct properties', () => {
    const error = new TranscriptionError('File is too large', 'FILE_TOO_LARGE');
    
    assert.strictEqual(error.message, 'File is too large');
    assert.strictEqual(error.code, 'FILE_TOO_LARGE');
    assert.strictEqual(error.name, 'TranscriptionError');
    assert.ok(error instanceof Error);
  });

  it('supports all error codes', () => {
    const codes = ['FILE_TOO_LARGE', 'UNSUPPORTED_FORMAT', 'TRANSCRIPTION_FAILED', 'INVALID_AUDIO'] as const;
    
    for (const code of codes) {
      const error = new TranscriptionError(`Error: ${code}`, code);
      assert.strictEqual(error.code, code);
    }
  });
});

// ============================================================================
// Unit Tests - transcribeAudio (validation only, no API calls)
// ============================================================================

describe('transcribeAudio - validation', () => {
  it('rejects files larger than 20MB', async () => {
    // Create a buffer slightly over 20MB
    const largeBuffer = Buffer.alloc(21 * 1024 * 1024);
    
    await assert.rejects(
      () => transcribeAudio(largeBuffer, 'audio/mp3'),
      (error: TranscriptionError) => {
        assert.strictEqual(error.code, 'FILE_TOO_LARGE');
        assert.ok(error.message.includes('20MB'));
        return true;
      }
    );
  });

  it('rejects unsupported audio formats', async () => {
    const buffer = Buffer.from('fake audio data');
    
    await assert.rejects(
      () => transcribeAudio(buffer, 'audio/midi'),
      (error: TranscriptionError) => {
        assert.strictEqual(error.code, 'UNSUPPORTED_FORMAT');
        assert.ok(error.message.includes('audio/midi'));
        return true;
      }
    );
  });

  it('rejects non-audio MIME types', async () => {
    const buffer = Buffer.from('fake data');
    
    await assert.rejects(
      () => transcribeAudio(buffer, 'text/plain'),
      (error: TranscriptionError) => {
        assert.strictEqual(error.code, 'UNSUPPORTED_FORMAT');
        return true;
      }
    );
  });

  it('rejects empty MIME type', async () => {
    const buffer = Buffer.from('fake audio data');

    await assert.rejects(
      () => transcribeAudio(buffer, ''),
      (error: TranscriptionError) => {
        assert.strictEqual(error.code, 'UNSUPPORTED_FORMAT');
        return true;
      }
    );
  });
});

// ============================================================================
// Unit Tests - Audio Upload Middleware Helpers
// ============================================================================

import { getNormalizedMimeType, AudioUploadError, handleMulterError } from './middleware/audioUpload';

describe('getNormalizedMimeType', () => {
  it('normalizes audio/mpeg to audio/mp3', () => {
    const file = { mimetype: 'audio/mpeg' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/mp3');
  });

  it('normalizes audio/x-wav to audio/wav', () => {
    const file = { mimetype: 'audio/x-wav' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/wav');
  });

  it('normalizes audio/wave to audio/wav', () => {
    const file = { mimetype: 'audio/wave' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/wav');
  });

  it('normalizes video/webm to audio/webm', () => {
    const file = { mimetype: 'video/webm' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/webm');
  });

  it('normalizes audio/m4a to audio/aac', () => {
    const file = { mimetype: 'audio/m4a' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/aac');
  });

  it('normalizes audio/mp4 to audio/aac', () => {
    const file = { mimetype: 'audio/mp4' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/aac');
  });

  it('passes through already correct MIME types', () => {
    const file = { mimetype: 'audio/mp3' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/mp3');
  });

  it('handles uppercase MIME types', () => {
    const file = { mimetype: 'AUDIO/MPEG' } as Express.Multer.File;
    assert.strictEqual(getNormalizedMimeType(file), 'audio/mp3');
  });
});

describe('AudioUploadError', () => {
  it('creates error with correct properties', () => {
    const error = new AudioUploadError('No file provided', 'NO_FILE');

    assert.strictEqual(error.message, 'No file provided');
    assert.strictEqual(error.code, 'NO_FILE');
    assert.strictEqual(error.name, 'AudioUploadError');
    assert.ok(error instanceof Error);
  });

  it('supports FILE_TOO_LARGE code', () => {
    const error = new AudioUploadError('File too large', 'FILE_TOO_LARGE');
    assert.strictEqual(error.code, 'FILE_TOO_LARGE');
  });

  it('supports UNSUPPORTED_FORMAT code', () => {
    const error = new AudioUploadError('Bad format', 'UNSUPPORTED_FORMAT');
    assert.strictEqual(error.code, 'UNSUPPORTED_FORMAT');
  });
});

describe('handleMulterError', () => {
  it('handles unsupported format error messages', () => {
    const error = new Error('Unsupported audio format: audio/midi');

    const result = handleMulterError(error);

    assert.ok(result instanceof AudioUploadError);
    assert.strictEqual(result.code, 'UNSUPPORTED_FORMAT');
  });

  it('handles generic errors', () => {
    const error = new Error('Something went wrong');

    const result = handleMulterError(error);

    assert.ok(result instanceof AudioUploadError);
    assert.strictEqual(result.message, 'Something went wrong');
  });

  it('returns AudioUploadError instance for any error', () => {
    const error = { message: 'Unknown error' };

    const result = handleMulterError(error);

    assert.ok(result instanceof AudioUploadError);
  });
});

