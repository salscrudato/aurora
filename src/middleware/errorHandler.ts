/**
 * AuroraNotes API - Standardized Error Handling
 * 
 * Provides consistent error response shapes for frontend consumption.
 * All errors follow the same contract for predictable client-side handling.
 */

import { Request, Response, NextFunction } from 'express';
import { logError, logWarn } from '../utils';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Standard error codes for API responses
 */
export type ApiErrorCode =
  // Auth errors (401)
  | 'UNAUTHORIZED'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  // Forbidden errors (403)
  | 'FORBIDDEN'
  | 'TENANT_MISMATCH'
  | 'EMAIL_NOT_VERIFIED'
  | 'INSUFFICIENT_ROLE'
  // Not found errors (404)
  | 'NOT_FOUND'
  | 'NOTE_NOT_FOUND'
  | 'THREAD_NOT_FOUND'
  // Validation errors (400)
  | 'VALIDATION_ERROR'
  | 'INVALID_REQUEST'
  | 'MISSING_PARAMETER'
  // Rate limiting (429)
  | 'RATE_LIMITED'
  // Server errors (500)
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

/**
 * Standard API error response shape
 */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * Custom error class with HTTP status and code
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ApiErrorCode,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  toResponse(requestId?: string): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        requestId,
      },
    };
  }
}

// =============================================================================
// Error Factory Functions
// =============================================================================

export const errors = {
  unauthorized: (message = 'Authentication required') =>
    new ApiError(message, 'UNAUTHORIZED', 401),

  invalidToken: (message = 'Invalid authentication token') =>
    new ApiError(message, 'INVALID_TOKEN', 401),

  forbidden: (message = 'Access denied') =>
    new ApiError(message, 'FORBIDDEN', 403),

  tenantMismatch: () =>
    new ApiError('Cannot access another user\'s data', 'TENANT_MISMATCH', 403),

  notFound: (resource = 'Resource') =>
    new ApiError(`${resource} not found`, 'NOT_FOUND', 404),

  noteNotFound: (noteId: string) =>
    new ApiError(`Note not found: ${noteId}`, 'NOTE_NOT_FOUND', 404),

  threadNotFound: (threadId: string) =>
    new ApiError(`Thread not found: ${threadId}`, 'THREAD_NOT_FOUND', 404),

  validation: (message: string, details?: Record<string, unknown>) =>
    new ApiError(message, 'VALIDATION_ERROR', 400, details),

  missingParam: (param: string) =>
    new ApiError(`Missing required parameter: ${param}`, 'MISSING_PARAMETER', 400),

  rateLimited: (retryAfterSeconds?: number) =>
    new ApiError(
      'Too many requests. Please try again later.',
      'RATE_LIMITED',
      429,
      retryAfterSeconds ? { retryAfter: retryAfterSeconds } : undefined
    ),

  internal: (message = 'An unexpected error occurred') =>
    new ApiError(message, 'INTERNAL_ERROR', 500),

  serviceUnavailable: (service: string) =>
    new ApiError(`${service} is temporarily unavailable`, 'SERVICE_UNAVAILABLE', 503),
};

// =============================================================================
// Error Handler Middleware
// =============================================================================

/**
 * Global error handler middleware
 * 
 * Catches all errors and converts them to standardized API responses.
 * Must be registered LAST in the middleware chain.
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as any).requestId as string | undefined;

  if (err instanceof ApiError) {
    logWarn('API error', {
      code: err.code,
      message: err.message,
      path: req.path,
      method: req.method,
      requestId,
    });
    res.status(err.statusCode).json(err.toResponse(requestId));
    return;
  }

  // Log unexpected errors
  logError('Unexpected error', err, {
    path: req.path,
    method: req.method,
    requestId,
  });

  // Return generic error to client
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  } as ApiErrorResponse);
}

