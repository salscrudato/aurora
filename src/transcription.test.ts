/** Transcription Module Tests - Run: node --experimental-strip-types --test src/transcription.test.ts */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { transcribeAudio, TranscriptionError, isAudioTypeSupported, SUPPORTED_AUDIO_TYPES } from './transcription';
import { getNormalizedMimeType, AudioUploadError, handleMulterError } from './middleware/audioUpload';

describe('isAudioTypeSupported', () => {
  it('returns true for supported types', () => {
    ['audio/mp3', 'audio/wav', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/aiff']
      .forEach(t => assert.strictEqual(isAudioTypeSupported(t), true));
  });

  it('returns false for unsupported types', () => {
    ['audio/midi', 'video/mp4', 'image/png', 'text/plain', '']
      .forEach(t => assert.strictEqual(isAudioTypeSupported(t), false));
  });

  it('is case-sensitive (expects lowercase)', () => {
    assert.strictEqual(isAudioTypeSupported('AUDIO/MP3'), false);
    assert.strictEqual(isAudioTypeSupported('Audio/Wav'), false);
  });
});

describe('SUPPORTED_AUDIO_TYPES', () => {
  it('includes common formats', () => {
    ['audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg'].forEach(t => assert.ok(SUPPORTED_AUDIO_TYPES.includes(t as typeof SUPPORTED_AUDIO_TYPES[number])));
    assert.ok(SUPPORTED_AUDIO_TYPES.length >= 7);
  });
});

describe('TranscriptionError', () => {
  it('creates error with correct properties', () => {
    const err = new TranscriptionError('File is too large', 'FILE_TOO_LARGE');
    assert.strictEqual(err.message, 'File is too large');
    assert.strictEqual(err.code, 'FILE_TOO_LARGE');
    assert.strictEqual(err.name, 'TranscriptionError');
    assert.ok(err instanceof Error);
  });

  it('supports all error codes', () => {
    (['FILE_TOO_LARGE', 'UNSUPPORTED_FORMAT', 'TRANSCRIPTION_FAILED', 'INVALID_AUDIO'] as const)
      .forEach(code => assert.strictEqual(new TranscriptionError(`Error: ${code}`, code).code, code));
  });
});

describe('transcribeAudio - validation', () => {
  it('rejects files larger than 20MB', async () => {
    await assert.rejects(() => transcribeAudio(Buffer.alloc(21 * 1024 * 1024), 'audio/mp3'), (e: TranscriptionError) => {
      assert.strictEqual(e.code, 'FILE_TOO_LARGE');
      assert.ok(e.message.includes('20MB'));
      return true;
    });
  });

  it('rejects unsupported formats', async () => {
    const buf = Buffer.from('fake');
    await assert.rejects(() => transcribeAudio(buf, 'audio/midi'), (e: TranscriptionError) => e.code === 'UNSUPPORTED_FORMAT' && e.message.includes('audio/midi'));
    await assert.rejects(() => transcribeAudio(buf, 'text/plain'), (e: TranscriptionError) => e.code === 'UNSUPPORTED_FORMAT');
    await assert.rejects(() => transcribeAudio(buf, ''), (e: TranscriptionError) => e.code === 'UNSUPPORTED_FORMAT');
  });
});

describe('getNormalizedMimeType', () => {
  const cases: [string, string][] = [
    ['audio/mpeg', 'audio/mp3'], ['audio/x-wav', 'audio/wav'], ['audio/wave', 'audio/wav'],
    ['video/webm', 'audio/webm'], ['audio/m4a', 'audio/aac'], ['audio/mp4', 'audio/aac'],
    ['audio/mp3', 'audio/mp3'], ['AUDIO/MPEG', 'audio/mp3'],
  ];
  cases.forEach(([input, expected]) => {
    it(`normalizes ${input} to ${expected}`, () => {
      assert.strictEqual(getNormalizedMimeType({ mimetype: input } as Express.Multer.File), expected);
    });
  });
});

describe('AudioUploadError', () => {
  it('creates error with correct properties', () => {
    const err = new AudioUploadError('No file provided', 'NO_FILE');
    assert.strictEqual(err.message, 'No file provided');
    assert.strictEqual(err.code, 'NO_FILE');
    assert.strictEqual(err.name, 'AudioUploadError');
    assert.ok(err instanceof Error);
  });

  it('supports all error codes', () => {
    assert.strictEqual(new AudioUploadError('x', 'FILE_TOO_LARGE').code, 'FILE_TOO_LARGE');
    assert.strictEqual(new AudioUploadError('x', 'UNSUPPORTED_FORMAT').code, 'UNSUPPORTED_FORMAT');
  });
});

describe('handleMulterError', () => {
  it('handles unsupported format errors', () => {
    const result = handleMulterError(new Error('Unsupported audio format: audio/midi'));
    assert.ok(result instanceof AudioUploadError);
    assert.strictEqual(result.code, 'UNSUPPORTED_FORMAT');
  });

  it('handles generic errors', () => {
    const result = handleMulterError(new Error('Something went wrong'));
    assert.ok(result instanceof AudioUploadError);
    assert.strictEqual(result.message, 'Something went wrong');
  });

  it('returns AudioUploadError for any error', () => {
    assert.ok(handleMulterError({ message: 'Unknown error' }) instanceof AudioUploadError);
  });
});
