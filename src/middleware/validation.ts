/**
 * AuroraNotes API - Request Validation Middleware
 *
 * Zod-based validation for request body, query, params, and headers.
 * Provides consistent error responses and type-safe access to validated data.
 *
 * Features:
 * - Body, query, params, and headers validation
 * - Type-safe access to validated data
 * - Consistent error response format
 * - Configurable validation options
 * - Common validation schemas (pagination, IDs, etc.)
 * - Combined validators for complex routes
 *
 * Storage:
 * - req.body is replaced with validated/transformed data
 * - req.validatedQuery stores validated query data
 * - req.validatedParams stores validated params data
 * - req.validatedHeaders stores validated headers data
 *
 * @example
 * ```typescript
 * import { validateBody, validateQuery, getValidatedQuery } from './middleware';
 * import { z } from 'zod';
 *
 * const CreateNoteSchema = z.object({
 *   title: z.string().min(1).max(200),
 *   content: z.string(),
 * });
 *
 * const ListQuerySchema = z.object({
 *   limit: z.coerce.number().min(1).max(100).default(20),
 *   cursor: z.string().optional(),
 * });
 *
 * // Validate body
 * router.post('/notes', validateBody(CreateNoteSchema), (req, res) => {
 *   const { title, content } = req.body;  // Typed!
 * });
 *
 * // Validate query with type-safe helper
 * router.get('/notes', validateQuery(ListQuerySchema), (req, res) => {
 *   const { limit, cursor } = getValidatedQuery<typeof ListQuerySchema>(req);
 * });
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, z, ZodType } from 'zod';
import { logWarn } from '../utils';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Extend Express Request to include validated data storage
 */
declare global {
  namespace Express {
    interface Request {
      /** Validated query parameters */
      validatedQuery?: unknown;
      /** Validated URL parameters */
      validatedParams?: unknown;
      /** Validated headers */
      validatedHeaders?: unknown;
    }
  }
}

/**
 * Validation error detail for a single field
 */
export interface ValidationErrorDetail {
  /** Field path (e.g., 'user.email' or 'items[0].name') */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Zod error code (e.g., 'too_small', 'invalid_type') */
  code?: string;
}

/**
 * Validation error response format
 */
export interface ValidationError {
  /** Error code - always 'VALIDATION_ERROR' */
  code: 'VALIDATION_ERROR';
  /** Human-readable summary message */
  message: string;
  /** Array of field-level validation errors */
  details: ValidationErrorDetail[];
}

/**
 * Options for validation middleware
 */
export interface ValidationOptions {
  /**
   * Custom error message prefix
   * @default 'Request validation failed'
   */
  errorMessage?: string;

  /**
   * Whether to strip unknown properties from the validated data
   * @default false (uses schema's default behavior)
   */
  stripUnknown?: boolean;

  /**
   * Whether to include Zod error codes in the response
   * @default false
   */
  includeErrorCodes?: boolean;

  /**
   * Custom error formatter
   */
  formatError?: (error: ZodError<unknown>) => ValidationError;

  /**
   * Source being validated (for logging)
   * @default 'body' | 'query' | 'params' | 'headers'
   */
  source?: string;
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format Zod errors into a consistent API response structure
 *
 * @param error - Zod validation error
 * @param options - Formatting options
 * @returns Formatted validation error
 */
export function formatZodError(
  error: ZodError<unknown>,
  options: ValidationOptions = {}
): ValidationError {
  const { errorMessage = 'Request validation failed', includeErrorCodes = false } = options;
  const issues = error.issues || [];

  return {
    code: 'VALIDATION_ERROR',
    message: errorMessage,
    details: issues.map((issue) => {
      const detail: ValidationErrorDetail = {
        field: formatFieldPath(issue.path),
        message: issue.message,
      };
      if (includeErrorCodes) {
        detail.code = issue.code;
      }
      return detail;
    }),
  };
}

/**
 * Format Zod path array to a readable field path
 *
 * @example
 * ['user', 'address', 0, 'city'] => 'user.address[0].city'
 */
function formatFieldPath(path: PropertyKey[]): string {
  if (path.length === 0) return '(root)';

  return path.reduce<string>((result, segment, index) => {
    if (typeof segment === 'number') {
      return `${result}[${segment}]`;
    }
    if (typeof segment === 'symbol') {
      return index === 0 ? String(segment) : `${result}.${String(segment)}`;
    }
    return index === 0 ? segment : `${result}.${segment}`;
  }, '');
}

// =============================================================================
// Core Validation Middleware
// =============================================================================

/**
 * Create middleware that validates request body against a Zod schema
 *
 * The validated and transformed data replaces req.body.
 *
 * @param schema - Zod schema to validate against
 * @param options - Validation options
 * @returns Express middleware
 *
 * @example
 * ```typescript
 * const CreateNoteSchema = z.object({
 *   title: z.string().min(1).max(200),
 *   content: z.string().min(1),
 *   tags: z.array(z.string()).default([]),
 * });
 *
 * router.post('/notes', validateBody(CreateNoteSchema), (req, res) => {
 *   // req.body is now typed and validated
 *   const { title, content, tags } = req.body;
 * });
 * ```
 */
export function validateBody<T>(
  schema: ZodSchema<T>,
  options: ValidationOptions = {}
) {
  const { errorMessage = 'Request body validation failed', ...opts } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const error = formatZodError(result.error, { errorMessage, ...opts });
      logWarn('Request body validation failed', {
        path: req.path,
        method: req.method,
        errorCount: error.details.length,
        fields: error.details.map((d) => d.field),
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
 * Create middleware that validates query parameters against a Zod schema
 *
 * Validated data is stored in req.validatedQuery and also merged into req.query.
 *
 * @param schema - Zod schema to validate against
 * @param options - Validation options
 * @returns Express middleware
 *
 * @example
 * ```typescript
 * const ListQuerySchema = z.object({
 *   limit: z.coerce.number().min(1).max(100).default(20),
 *   offset: z.coerce.number().min(0).default(0),
 *   search: z.string().optional(),
 * });
 *
 * router.get('/notes', validateQuery(ListQuerySchema), (req, res) => {
 *   const query = getValidatedQuery<typeof ListQuerySchema>(req);
 *   // query.limit is number, not string
 * });
 * ```
 */
export function validateQuery<T>(
  schema: ZodSchema<T>,
  options: ValidationOptions = {}
) {
  const { errorMessage = 'Query parameter validation failed', ...opts } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const error = formatZodError(result.error, { errorMessage, ...opts });
      logWarn('Request query validation failed', {
        path: req.path,
        method: req.method,
        errorCount: error.details.length,
        fields: error.details.map((d) => d.field),
      });
      res.status(400).json({ error });
      return;
    }

    // Store validated data
    req.validatedQuery = result.data;

    // Also try to copy to req.query for compatibility
    try {
      Object.assign(req.query, result.data);
    } catch {
      // Ignore if req.query is frozen/sealed
    }
    next();
  };
}

/**
 * Create middleware that validates URL parameters against a Zod schema
 *
 * Validated data is stored in req.validatedParams and also merged into req.params.
 *
 * @param schema - Zod schema to validate against
 * @param options - Validation options
 * @returns Express middleware
 *
 * @example
 * ```typescript
 * const NoteParamsSchema = z.object({
 *   noteId: z.string().min(1),
 * });
 *
 * router.get('/notes/:noteId', validateParams(NoteParamsSchema), (req, res) => {
 *   const { noteId } = getValidatedParams<typeof NoteParamsSchema>(req);
 * });
 * ```
 */
export function validateParams<T>(
  schema: ZodSchema<T>,
  options: ValidationOptions = {}
) {
  const { errorMessage = 'URL parameter validation failed', ...opts } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const error = formatZodError(result.error, { errorMessage, ...opts });
      logWarn('Request params validation failed', {
        path: req.path,
        method: req.method,
        errorCount: error.details.length,
        fields: error.details.map((d) => d.field),
      });
      res.status(400).json({ error });
      return;
    }

    // Store validated data
    req.validatedParams = result.data;

    // Also try to copy to req.params for compatibility
    try {
      Object.assign(req.params, result.data);
    } catch {
      // Ignore if req.params is frozen/sealed
    }
    next();
  };
}

/**
 * Create middleware that validates request headers against a Zod schema
 *
 * Useful for validating custom headers like API version, client info, etc.
 *
 * @param schema - Zod schema to validate against
 * @param options - Validation options
 * @returns Express middleware
 *
 * @example
 * ```typescript
 * const ApiHeadersSchema = z.object({
 *   'x-api-version': z.string().regex(/^\d+\.\d+$/),
 *   'x-client-id': z.string().optional(),
 * });
 *
 * router.use(validateHeaders(ApiHeadersSchema));
 * ```
 */
export function validateHeaders<T>(
  schema: ZodSchema<T>,
  options: ValidationOptions = {}
) {
  const { errorMessage = 'Header validation failed', ...opts } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Lowercase header names for consistent validation
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key.toLowerCase()] = value;
      }
    }

    const result = schema.safeParse(headers);

    if (!result.success) {
      const error = formatZodError(result.error, { errorMessage, ...opts });
      logWarn('Request headers validation failed', {
        path: req.path,
        method: req.method,
        errorCount: error.details.length,
        fields: error.details.map((d) => d.field),
      });
      res.status(400).json({ error });
      return;
    }

    req.validatedHeaders = result.data;
    next();
  };
}


// =============================================================================
// Type-Safe Accessor Helpers
// =============================================================================

/**
 * Get validated query parameters with proper typing
 *
 * @param req - Express request
 * @returns Validated query data
 *
 * @example
 * ```typescript
 * const QuerySchema = z.object({ limit: z.coerce.number() });
 * type Query = z.infer<typeof QuerySchema>;
 *
 * router.get('/items', validateQuery(QuerySchema), (req, res) => {
 *   const { limit } = getValidatedQuery<typeof QuerySchema>(req);
 *   // limit is number
 * });
 * ```
 */
export function getValidatedQuery<T extends ZodType>(req: Request): z.infer<T> {
  return req.validatedQuery as z.infer<T>;
}

/**
 * Get validated URL parameters with proper typing
 *
 * @param req - Express request
 * @returns Validated params data
 */
export function getValidatedParams<T extends ZodType>(req: Request): z.infer<T> {
  return req.validatedParams as z.infer<T>;
}

/**
 * Get validated headers with proper typing
 *
 * @param req - Express request
 * @returns Validated headers data
 */
export function getValidatedHeaders<T extends ZodType>(req: Request): z.infer<T> {
  return req.validatedHeaders as z.infer<T>;
}

// =============================================================================
// Combined Validators
// =============================================================================

/**
 * Configuration for combined validation
 */
export interface CombinedValidationConfig<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown
> {
  /** Schema for request body */
  body?: ZodSchema<TBody>;
  /** Schema for query parameters */
  query?: ZodSchema<TQuery>;
  /** Schema for URL parameters */
  params?: ZodSchema<TParams>;
  /** Validation options */
  options?: ValidationOptions;
}

/**
 * Create middleware that validates body, query, and params in one call
 *
 * More efficient than chaining multiple validators.
 *
 * @param config - Schemas for each request part
 * @returns Express middleware
 *
 * @example
 * ```typescript
 * const UpdateNoteValidation = {
 *   params: z.object({ noteId: z.string() }),
 *   body: z.object({ title: z.string(), content: z.string() }),
 *   query: z.object({ notify: z.coerce.boolean().default(false) }),
 * };
 *
 * router.put('/notes/:noteId',
 *   validateRequest(UpdateNoteValidation),
 *   updateNoteHandler
 * );
 * ```
 */
export function validateRequest<TBody, TQuery, TParams>(
  config: CombinedValidationConfig<TBody, TQuery, TParams>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationErrorDetail[] = [];
    const options = config.options || {};

    // Validate params
    if (config.params) {
      const result = config.params.safeParse(req.params);
      if (!result.success) {
        errors.push(
          ...result.error.issues.map((issue) => ({
            field: `params.${formatFieldPath(issue.path)}`,
            message: issue.message,
          }))
        );
      } else {
        req.validatedParams = result.data;
        try {
          Object.assign(req.params, result.data);
        } catch {
          // Ignore
        }
      }
    }

    // Validate query
    if (config.query) {
      const result = config.query.safeParse(req.query);
      if (!result.success) {
        errors.push(
          ...result.error.issues.map((issue) => ({
            field: `query.${formatFieldPath(issue.path)}`,
            message: issue.message,
          }))
        );
      } else {
        req.validatedQuery = result.data;
        try {
          Object.assign(req.query, result.data);
        } catch {
          // Ignore
        }
      }
    }

    // Validate body
    if (config.body) {
      const result = config.body.safeParse(req.body);
      if (!result.success) {
        errors.push(
          ...result.error.issues.map((issue) => ({
            field: `body.${formatFieldPath(issue.path)}`,
            message: issue.message,
          }))
        );
      } else {
        req.body = result.data;
      }
    }

    // Return all errors at once
    if (errors.length > 0) {
      const error: ValidationError = {
        code: 'VALIDATION_ERROR',
        message: options.errorMessage || 'Request validation failed',
        details: errors,
      };

      logWarn('Request validation failed', {
        path: req.path,
        method: req.method,
        errorCount: errors.length,
        fields: errors.map((e) => e.field),
      });

      res.status(400).json({ error });
      return;
    }

    next();
  };
}

// =============================================================================
// Common Validation Schemas
// =============================================================================

/**
 * Common pagination query parameters schema
 *
 * @example
 * ```typescript
 * router.get('/items', validateQuery(PaginationSchema), (req, res) => {
 *   const { limit, offset, cursor } = getValidatedQuery<typeof PaginationSchema>(req);
 * });
 * ```
 */
export const PaginationSchema = z.object({
  /** Number of items to return (1-100, default: 20) */
  limit: z.coerce.number().min(1).max(100).default(20),
  /** Offset for offset-based pagination */
  offset: z.coerce.number().min(0).default(0),
  /** Cursor for cursor-based pagination */
  cursor: z.string().optional(),
  /** Sort order */
  order: z.enum(['asc', 'desc']).default('desc'),
});

/** Type for pagination query parameters */
export type PaginationQuery = z.infer<typeof PaginationSchema>;

/**
 * Common ID parameter schema (for Firestore document IDs)
 */
export const IdParamSchema = z.object({
  id: z.string().min(1).max(128),
});

/** Type for ID parameter */
export type IdParam = z.infer<typeof IdParamSchema>;

/**
 * Common search query parameters schema
 */
export const SearchQuerySchema = z.object({
  /** Search query string */
  q: z.string().min(1).max(500),
  /** Maximum results */
  limit: z.coerce.number().min(1).max(100).default(20),
});

/** Type for search query parameters */
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/**
 * UUID validation schema
 */
export const UuidSchema = z.string().uuid();

/**
 * Email validation schema
 */
export const EmailSchema = z.string().email().max(254);

/**
 * ISO date string validation schema
 */
export const IsoDateSchema = z.string().datetime();

/**
 * Non-empty string validation (trims whitespace)
 */
export const NonEmptyStringSchema = z.string().trim().min(1);

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Create a validation error response manually
 *
 * Useful when you need to return validation errors from business logic.
 *
 * @param details - Array of field errors
 * @param message - Optional custom message
 * @returns ValidationError object
 *
 * @example
 * ```typescript
 * if (duplicateEmail) {
 *   res.status(400).json({
 *     error: createValidationError([
 *       { field: 'email', message: 'Email already exists' }
 *     ])
 *   });
 * }
 * ```
 */
export function createValidationError(
  details: ValidationErrorDetail[],
  message = 'Validation failed'
): ValidationError {
  return {
    code: 'VALIDATION_ERROR',
    message,
    details,
  };
}

/**
 * Check if an error is a Zod validation error
 */
export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

/**
 * Validate data against a schema and return result
 *
 * Standalone validation without middleware.
 *
 * @param schema - Zod schema
 * @param data - Data to validate
 * @returns Validation result with typed data or errors
 *
 * @example
 * ```typescript
 * const result = validateData(UserSchema, userData);
 * if (result.success) {
 *   // result.data is typed
 * } else {
 *   // result.error has details
 * }
 * ```
 */
export function validateData<T>(
  schema: ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ValidationError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: formatZodError(result.error),
  };
}