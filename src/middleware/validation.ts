/**
 * AuroraNotes API - Request Validation Middleware
 *
 * Zod-based validation for request body, query, and params.
 * Provides consistent error responses for validation failures.
 *
 * Note: Validated data is stored in req.validatedQuery and req.validatedParams
 * since req.query and req.params may be read-only in some Node.js versions.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logWarn } from '../utils';

// Extend Express Request to include validated data
declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
      validatedParams?: unknown;
    }
  }
}

/**
 * Validation error response format
 */
export interface ValidationError {
  code: 'VALIDATION_ERROR';
  message: string;
  details: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Format Zod errors into a consistent structure
 */
function formatZodError(error: ZodError<unknown>): ValidationError {
  const issues = error.issues || [];
  return {
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/**
 * Create a middleware that validates request body against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware
 *
 * @example
 * const CreateNoteSchema = z.object({
 *   title: z.string().min(1).max(200),
 *   content: z.string().min(1),
 * });
 *
 * router.post('/notes', validateBody(CreateNoteSchema), (req, res) => {
 *   // req.body is now typed and validated
 * });
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const error = formatZodError(result.error);
      logWarn('Request body validation failed', {
        path: req.path,
        method: req.method,
        errors: error.details,
      });
      res.status(400).json({ error });
      return;
    }

    // Replace body with parsed/transformed data
    req.body = result.data;
    next();
  };
}

/**
 * Create a middleware that validates query parameters against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware
 *
 * @example
 * const ListNotesQuerySchema = z.object({
 *   limit: z.coerce.number().min(1).max(100).default(20),
 *   cursor: z.string().optional(),
 * });
 *
 * router.get('/notes', validateQuery(ListNotesQuerySchema), (req, res) => {
 *   const { limit, cursor } = req.validatedQuery as ListNotesQuery;
 * });
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const error = formatZodError(result.error);
      logWarn('Request query validation failed', {
        path: req.path,
        method: req.method,
        errors: error.details,
      });
      res.status(400).json({ error });
      return;
    }

    // Store validated data in a separate property since req.query may be read-only
    req.validatedQuery = result.data;
    // Also try to copy properties to req.query for compatibility
    try {
      Object.assign(req.query, result.data);
    } catch {
      // Ignore if req.query is frozen/sealed
    }
    next();
  };
}

/**
 * Create a middleware that validates URL parameters against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware
 *
 * @example
 * const NoteIdParamSchema = z.object({
 *   noteId: z.string().min(1),
 * });
 *
 * router.get('/notes/:noteId', validateParams(NoteIdParamSchema), (req, res) => {
 *   const { noteId } = req.validatedParams as NoteIdParam;
 * });
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const error = formatZodError(result.error);
      logWarn('Request params validation failed', {
        path: req.path,
        method: req.method,
        errors: error.details,
      });
      res.status(400).json({ error });
      return;
    }

    // Store validated data in a separate property since req.params may be read-only
    req.validatedParams = result.data;
    // Also try to copy properties to req.params for compatibility
    try {
      Object.assign(req.params, result.data);
    } catch {
      // Ignore if req.params is frozen/sealed
    }
    next();
  };
}
