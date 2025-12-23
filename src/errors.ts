/**
 * AuroraNotes API - Standardized Error Handling
 */

import { Request, Response, NextFunction } from 'express';
import { logError, logWarn } from './utils';

// =============================================================================
// Error Codes & Status Mapping
// =============================================================================

enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  NOTE_NOT_FOUND = 'NOTE_NOT_FOUND',
  THREAD_NOT_FOUND = 'THREAD_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

const STATUS_CODES: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.NOTE_NOT_FOUND]: 404,
  [ErrorCode.THREAD_NOT_FOUND]: 404,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

// =============================================================================
// ApiError Class
// =============================================================================

class ApiError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = STATUS_CODES[code];
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// =============================================================================
// Error Factories
// =============================================================================

export const Errors = {
  badRequest: (message: string, details?: Record<string, unknown>) =>
    new ApiError(ErrorCode.BAD_REQUEST, message, details),

  noteNotFound: (noteId?: string) =>
    new ApiError(ErrorCode.NOTE_NOT_FOUND, 'Note not found', noteId ? { noteId } : undefined),

  threadNotFound: (threadId?: string) =>
    new ApiError(ErrorCode.THREAD_NOT_FOUND, 'Thread not found', threadId ? { threadId } : undefined),
};

// =============================================================================
// Middleware
// =============================================================================

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logError('API error', err, { code: err.code, path: req.path });
    } else {
      logWarn('Client error', { code: err.code, message: err.message, path: req.path });
    }
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  logError('Unhandled error', err, { path: req.path, method: req.method });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
