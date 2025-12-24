/**
 * AuroraNotes API - Cloud Storage Service
 * 
 * Handles file uploads via signed URLs to Google Cloud Storage.
 * Supports attachment metadata and tenant-scoped storage paths.
 */

import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import { logInfo, logError } from './utils';

// =============================================================================
// Configuration
// =============================================================================

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || process.env.PROJECT_ID + '-notes';
const SIGNED_URL_EXPIRATION_MINUTES = parseInt(process.env.SIGNED_URL_EXPIRATION_MINUTES || '15', 10);
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10);

// Supported file types for note attachments
const SUPPORTED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword', // doc
  'image/png',
  'image/jpeg',
  'image/webp',
];

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    storage = new Storage();
  }
  return storage;
}

// =============================================================================
// Types
// =============================================================================

export interface AttachmentMetadata {
  filename: string;
  mimeType: string;
  storagePath: string;
  size?: number;
  createdAt: Date;
  uploadedAt?: Date;
  processingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
}

export interface SignedUploadUrl {
  uploadUrl: string;
  storagePath: string;
  expiresAt: Date;
  headers: Record<string, string>;
}

export interface SignedDownloadUrl {
  downloadUrl: string;
  expiresAt: Date;
}

// =============================================================================
// Storage Path Helpers
// =============================================================================

/**
 * Generate a tenant-scoped storage path for uploads
 * Format: tenants/{tenantId}/notes/{noteId}/attachments/{filename}
 */
export function generateStoragePath(
  tenantId: string,
  noteId: string,
  filename: string
): string {
  // Sanitize filename to prevent path traversal
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  return `tenants/${tenantId}/notes/${noteId}/attachments/${timestamp}-${sanitizedFilename}`;
}

/**
 * Validate tenant ownership of a storage path
 */
export function validateStoragePathOwnership(storagePath: string, tenantId: string): boolean {
  return storagePath.startsWith(`tenants/${tenantId}/`);
}

// =============================================================================
// Signed URL Generation
// =============================================================================

/**
 * Generate a signed upload URL for direct browser upload
 */
export async function generateSignedUploadUrl(
  tenantId: string,
  noteId: string,
  filename: string,
  mimeType: string,
  fileSize?: number
): Promise<SignedUploadUrl> {
  if (!tenantId) throw new Error('tenantId is required');
  if (!noteId) throw new Error('noteId is required');
  if (!filename) throw new Error('filename is required');
  if (!mimeType) throw new Error('mimeType is required');

  // Validate mime type
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}. Supported: ${SUPPORTED_MIME_TYPES.join(', ')}`);
  }

  // Validate file size
  if (fileSize && fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE_MB}MB`);
  }

  const storagePath = generateStoragePath(tenantId, noteId, filename);
  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRATION_MINUTES * 60 * 1000);

  const options: GetSignedUrlConfig = {
    version: 'v4',
    action: 'write',
    expires: expiresAt,
    contentType: mimeType,
    extensionHeaders: {
      'x-goog-meta-tenant-id': tenantId,
      'x-goog-meta-note-id': noteId,
    },
  };

  try {
    const [url] = await getStorage()
      .bucket(BUCKET_NAME)
      .file(storagePath)
      .getSignedUrl(options);

    logInfo('Generated signed upload URL', {
      tenantId,
      noteId,
      filename,
      mimeType,
      storagePath,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      uploadUrl: url,
      storagePath,
      expiresAt,
      headers: {
        'Content-Type': mimeType,
        'x-goog-meta-tenant-id': tenantId,
        'x-goog-meta-note-id': noteId,
      },
    };
  } catch (err) {
    logError('Failed to generate signed upload URL', err as Error, { tenantId, noteId });
    throw new Error('Failed to generate upload URL');
  }
}

/**
 * Generate a signed download URL for viewing/downloading attachments
 */
export async function generateSignedDownloadUrl(
  storagePath: string,
  tenantId: string
): Promise<SignedDownloadUrl> {
  // SECURITY: Verify tenant ownership before generating download URL
  if (!validateStoragePathOwnership(storagePath, tenantId)) {
    throw new Error('Access denied: cannot access another tenant\'s files');
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRATION_MINUTES * 60 * 1000);

  const options: GetSignedUrlConfig = {
    version: 'v4',
    action: 'read',
    expires: expiresAt,
  };

  try {
    const [url] = await getStorage()
      .bucket(BUCKET_NAME)
      .file(storagePath)
      .getSignedUrl(options);

    return { downloadUrl: url, expiresAt };
  } catch (err) {
    logError('Failed to generate signed download URL', err as Error, { storagePath });
    throw new Error('Failed to generate download URL');
  }
}

/**
 * Check if a file exists in storage
 */
export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    const [exists] = await getStorage()
      .bucket(BUCKET_NAME)
      .file(storagePath)
      .exists();
    return exists;
  } catch {
    return false;
  }
}

/**
 * Delete a file from storage
 */
export async function deleteFile(storagePath: string, tenantId: string): Promise<void> {
  if (!validateStoragePathOwnership(storagePath, tenantId)) {
    throw new Error('Access denied: cannot delete another tenant\'s files');
  }

  try {
    await getStorage().bucket(BUCKET_NAME).file(storagePath).delete();
    logInfo('Deleted file from storage', { storagePath });
  } catch (err) {
    logError('Failed to delete file', err as Error, { storagePath });
    throw err;
  }
}

export { SUPPORTED_MIME_TYPES, MAX_FILE_SIZE_MB, BUCKET_NAME };

