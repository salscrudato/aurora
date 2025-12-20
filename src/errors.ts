/**
 * AuroraNotes API - Standardized Error Handling
 *
 * Provides consistent error types and responses across the API.
 * All errors follow the format: { error: { code, message, details? } }
 */

import { Request, Response, NextFunction } from 'express';
import { logError, logWarn } from './utils';

/**
 * Standard error codes used across the API
 */
export enum ErrorCode {
  // Authentication errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Authorization errors (403)
  FORBIDDEN = 'FORBIDDEN',
  TENANT_MISMATCH = 'TENANT_MISMATCH',

  // Client errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  INVALID_CURSOR = 'INVALID_CURSOR',

  // Not found (404)
  NOT_FOUND = 'NOT_FOUND',
  NOTE_NOT_FOUND = 'NOTE_NOT_FOUND',
  THREAD_NOT_FOUND = 'THREAD_NOT_FOUND',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',
  LLM_FAILED = 'LLM_FAILED',
}

/**
 * HTTP status codes for each error code
 */
const ERROR_STATUS_CODES: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.TENANT_MISMATCH]: 403,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.INVALID_CURSOR]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.NOTE_NOT_FOUND]: 404,
  [ErrorCode.THREAD_NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.EMBEDDING_FAILED]: 500,
  [ErrorCode.LLM_FAILED]: 500,
};

/**
 * Standard API error class
 */
export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = ERROR_STATUS_CODES[code];
    this.details = details;
  }

  /**
   * Convert to JSON response format
   */
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

/**
 * Factory functions for common errors
 */
export const Errors = {
  unauthorized: (message = 'Authentication required') =>
    new ApiError(ErrorCode.UNAUTHORIZED, message),

  invalidToken: (message = 'Invalid authentication token') =>
    new ApiError(ErrorCode.INVALID_TOKEN, message),

  forbidden: (message = 'Access denied') =>
    new ApiError(ErrorCode.FORBIDDEN, message),

  tenantMismatch: () =>
    new ApiError(ErrorCode.TENANT_MISMATCH, 'Resource belongs to a different tenant'),

  notFound: (resource = 'Resource') =>
    new ApiError(ErrorCode.NOT_FOUND, `${resource} not found`),

  noteNotFound: (noteId?: string) =>
    new ApiError(ErrorCode.NOTE_NOT_FOUND, 'Note not found', noteId ? { noteId } : undefined),

  threadNotFound: (threadId?: string) =>
    new ApiError(ErrorCode.THREAD_NOT_FOUND, 'Thread not found', threadId ? { threadId } : undefined),

  badRequest: (message: string, details?: Record<string, unknown>) =>
    new ApiError(ErrorCode.BAD_REQUEST, message, details),

  validationError: (message: string, details?: Record<string, unknown>) =>
    new ApiError(ErrorCode.VALIDATION_ERROR, message, details),

  rateLimitExceeded: (retryAfter?: number) =>
    new ApiError(ErrorCode.RATE_LIMIT_EXCEEDED, 'Too many requests', retryAfter ? { retryAfter } : undefined),

  internalError: (message = 'An internal error occurred') =>
    new ApiError(ErrorCode.INTERNAL_ERROR, message),

  embeddingFailed: (message = 'Failed to generate embeddings') =>
    new ApiError(ErrorCode.EMBEDDING_FAILED, message),

  llmFailed: (message = 'Failed to generate response') =>
    new ApiError(ErrorCode.LLM_FAILED, message),
};

/**
 * Global error handler middleware
 * Should be registered last in the middleware chain
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle ApiError instances
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logError('API error', err, { code: err.code, path: req.path });
    } else {
      logWarn('Client error', { code: err.code, message: err.message, path: req.path });
    }
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Handle unexpected errors
  logError('Unhandled error', err, { path: req.path, method: req.method });

  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

