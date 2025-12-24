/**
 * AuroraNotes API - Text Extraction Service
 * 
 * Extracts text content from various file formats for note ingestion.
 * Supports: TXT, MD, PDF, DOCX
 */

import { Storage } from '@google-cloud/storage';
import { logInfo, logError, logWarn } from './utils';

// =============================================================================
// Configuration
// =============================================================================

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || process.env.PROJECT_ID + '-notes';
const MAX_EXTRACTION_SIZE_MB = parseInt(process.env.MAX_EXTRACTION_SIZE_MB || '10', 10);

let storage: Storage | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfParse: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mammoth: any = null;

function getStorage(): Storage {
  if (!storage) storage = new Storage();
  return storage;
}

// Lazy-load heavy dependencies (optional - may not be installed)
async function getPdfParse(): Promise<((buffer: Buffer) => Promise<{ text: string; numpages: number }>) | null> {
  if (!pdfParse) {
    try {
      // Dynamic import - pdf-parse is an optional dependency
      pdfParse = (await import('pdf-parse' as string)).default;
    } catch {
      logWarn('pdf-parse not installed - PDF extraction disabled');
      return null;
    }
  }
  return pdfParse;
}

async function getMammoth(): Promise<{ extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> } | null> {
  if (!mammoth) {
    try {
      // Dynamic import - mammoth is an optional dependency
      mammoth = await import('mammoth' as string);
    } catch {
      logWarn('mammoth not installed - DOCX extraction disabled');
      return null;
    }
  }
  return mammoth;
}

// =============================================================================
// Types
// =============================================================================

export interface ExtractionResult {
  success: boolean;
  text?: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    charCount?: number;
  };
  error?: string;
}

// =============================================================================
// Extraction Functions
// =============================================================================

/**
 * Extract text from a file stored in Cloud Storage
 */
export async function extractTextFromStorage(
  storagePath: string,
  mimeType: string
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    // Download file to buffer
    const file = getStorage().bucket(BUCKET_NAME).file(storagePath);
    
    // Check file size
    const [metadata] = await file.getMetadata();
    const size = parseInt(metadata.size as string, 10);
    if (size > MAX_EXTRACTION_SIZE_MB * 1024 * 1024) {
      return {
        success: false,
        error: `File too large for extraction (max ${MAX_EXTRACTION_SIZE_MB}MB)`,
      };
    }

    const [buffer] = await file.download();

    const result = await extractTextFromBuffer(buffer, mimeType);

    logInfo('Text extraction complete', {
      storagePath,
      mimeType,
      success: result.success,
      charCount: result.metadata?.charCount,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (err) {
    logError('Text extraction failed', err as Error, { storagePath, mimeType });
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown extraction error',
    };
  }
}

/**
 * Extract text from a buffer based on mime type
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  switch (mimeType) {
    case 'text/plain':
    case 'text/markdown':
      return extractFromPlainText(buffer);

    case 'application/pdf':
      return extractFromPdf(buffer);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractFromDocx(buffer);

    case 'application/msword':
      return {
        success: false,
        error: 'Legacy .doc format not supported. Please convert to .docx',
      };

    default:
      return {
        success: false,
        error: `Unsupported file type for text extraction: ${mimeType}`,
      };
  }
}

/**
 * Extract text from plain text or markdown files
 */
function extractFromPlainText(buffer: Buffer): ExtractionResult {
  const text = buffer.toString('utf-8').trim();
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  return {
    success: true,
    text,
    metadata: {
      charCount: text.length,
      wordCount,
    },
  };
}

/**
 * Extract text from PDF files
 */
async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  const parser = await getPdfParse();
  if (!parser) {
    return {
      success: false,
      error: 'PDF extraction not available. Install pdf-parse package.',
    };
  }

  try {
    const data = await parser(buffer);
    const text = data.text.trim();
    const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;

    return {
      success: true,
      text,
      metadata: {
        pageCount: data.numpages,
        charCount: text.length,
        wordCount,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `PDF parsing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Extract text from DOCX files
 */
async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  const m = await getMammoth();
  if (!m) {
    return {
      success: false,
      error: 'DOCX extraction not available. Install mammoth package.',
    };
  }

  try {
    const result = await m.extractRawText({ buffer });
    const text = result.value.trim();
    const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;

    return {
      success: true,
      text,
      metadata: {
        charCount: text.length,
        wordCount,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `DOCX parsing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

