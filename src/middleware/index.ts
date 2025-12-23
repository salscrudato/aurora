/**
 * AuroraNotes API - Middleware Barrel Export
 *
 * Central export point for all middleware modules. Provides:
 *
 * 1. **Authentication** - Firebase-based user authentication
 *    - `userAuthMiddleware` - Require valid Firebase token
 *    - `optionalAuthMiddleware` - Attach user if token present
 *    - `isUserAuthEnabled` - Check if auth is enforced
 *
 * 2. **Validation** - Zod-based request validation
 *    - `validateBody` - Validate request body
 *    - `validateQuery` - Validate query parameters
 *    - `validateParams` - Validate URL parameters
 *
 * 3. **Rate Limiting** - Per-user request throttling
 *    - `perUserRateLimiter` - Default rate limiter middleware
 *    - `createRateLimiter` - Create custom rate limiter
 *    - `getRateLimiterStats` - Get current rate limit stats
 *
 * 4. **Audio Upload** - Multer-based audio file handling
 *    - `audioUpload` - Multer instance for audio files
 *    - `validateAudioFile` - Post-upload validation
 *    - `handleMulterError` - Error handling utility
 *
 * @example
 * ```typescript
 * import {
 *   userAuthMiddleware,
 *   validateBody,
 *   perUserRateLimiter,
 *   audioUpload,
 * } from './middleware';
 *
 * app.post('/notes',
 *   userAuthMiddleware,
 *   perUserRateLimiter,
 *   validateBody(CreateNoteSchema),
 *   createNoteHandler
 * );
 * ```
 */

// =============================================================================
// Authentication Middleware
// =============================================================================

export {
  // --- Core Middleware ---
  /** Middleware requiring valid Firebase authentication token */
  userAuthMiddleware,

  /** Middleware that attaches user info if token present, but doesn't require it */
  optionalAuthMiddleware,

  // --- Authorization Helpers ---
  /** Middleware factory requiring verified email */
  requireEmailVerified,

  /** Middleware factory requiring specific custom claims/roles */
  requireClaims,

  // --- Utility Functions ---
  /** Check if user authentication is enabled */
  isUserAuthEnabled,

  /** Get authenticated user from request (throws if not authenticated) */
  getAuthenticatedUser,

  /** Check if request has authenticated user */
  isAuthenticated,

  /** Get user ID from request (or null) */
  getUserId,

  /** Extract bearer token from Authorization header */
  extractBearerToken,

  /** Verify Firebase ID token directly */
  verifyFirebaseToken,

  // --- Types ---
  /** Type: Authenticated user object */
  type AuthenticatedUser,

  /** Type: Authentication error codes */
  type AuthErrorCode,

  /** Type: Token verification result */
  type TokenVerificationResult,

  // --- Error Class ---
  /** Custom error class for authentication failures */
  AuthenticationError,
} from './userAuth';

// =============================================================================
// Request Validation Middleware
// =============================================================================

export {
  // --- Core Validators ---
  /** Create middleware to validate request body against Zod schema */
  validateBody,

  /** Create middleware to validate query parameters against Zod schema */
  validateQuery,

  /** Create middleware to validate URL parameters against Zod schema */
  validateParams,

  /** Create middleware to validate request headers against Zod schema */
  validateHeaders,

  /** Create middleware to validate body, query, and params in one call */
  validateRequest,

  // --- Type-Safe Accessors ---
  /** Get validated query with proper typing */
  getValidatedQuery,

  /** Get validated params with proper typing */
  getValidatedParams,

  /** Get validated headers with proper typing */
  getValidatedHeaders,

  // --- Utility Functions ---
  /** Format Zod error into consistent API response */
  formatZodError,

  /** Create validation error manually (for business logic errors) */
  createValidationError,

  /** Check if error is a Zod validation error */
  isZodError,

  /** Validate data standalone (without middleware) */
  validateData,

  // --- Common Schemas ---
  /** Schema for pagination query parameters */
  PaginationSchema,

  /** Schema for ID URL parameter */
  IdParamSchema,

  /** Schema for search query parameters */
  SearchQuerySchema,

  /** Schema for UUID strings */
  UuidSchema,

  /** Schema for email strings */
  EmailSchema,

  /** Schema for ISO date strings */
  IsoDateSchema,

  /** Schema for non-empty trimmed strings */
  NonEmptyStringSchema,

  // --- Types ---
  /** Type: Validation error response structure */
  type ValidationError,

  /** Type: Single field validation error detail */
  type ValidationErrorDetail,

  /** Type: Validation middleware options */
  type ValidationOptions,

  /** Type: Combined validation config */
  type CombinedValidationConfig,

  /** Type: Pagination query parameters */
  type PaginationQuery,

  /** Type: ID parameter */
  type IdParam,

  /** Type: Search query parameters */
  type SearchQuery,
} from './validation';

// =============================================================================
// Rate Limiting Middleware
// =============================================================================

export {
  // Pre-configured Rate Limiters
  perUserRateLimiter,
  strictRateLimiter,
  burstRateLimiter,
  ipRateLimiter,
  // Factory & Management
  createRateLimiter,
  getRateLimiterStats,
  resetUserRateLimit,
  resetIpRateLimit,
  clearAllRateLimits,
  peekUserRateLimit,
  // Types
  type RateLimiterConfig,
  type RateLimitResult,
  type RateLimiterStats,
  // Constants
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX_REQUESTS,
} from './rateLimiter';

// =============================================================================
// Audio Upload Middleware
// =============================================================================

export {
  // --- Core Upload Handler ---
  /** Configured multer instance for audio file uploads */
  audioUpload,

  /** Convert multer errors to structured AudioUploadError */
  handleMulterError,

  // --- Validation Functions ---
  /** Validate uploaded audio file (size + magic bytes) */
  validateAudioFile,

  /** Validate file buffer against known audio magic bytes */
  validateMagicBytes,

  /** Validate file size is within acceptable bounds */
  validateFileSize,

  // --- Helper Functions ---
  /** Get normalized MIME type for an uploaded file */
  getNormalizedMimeType,

  /** Normalize browser MIME type variations to standard format */
  normalizeMimeType,

  /** Get file extension from MIME type (e.g., '.mp3') */
  getExtensionFromMime,

  /** Get human-readable format name (e.g., 'MP3') */
  getFormatName,

  // --- Error Handling ---
  /** Custom error class for audio upload failures */
  AudioUploadError,

  /** Type: Error codes for audio upload failures */
  type AudioUploadErrorCode,

  // --- Constants ---
  /** Maximum audio file size in bytes (20MB) */
  MAX_AUDIO_SIZE_BYTES,

  /** Maximum audio file size in MB */
  MAX_AUDIO_SIZE_MB,

  /** Minimum audio file size in bytes (1KB) */
  MIN_AUDIO_SIZE_BYTES,

  /** Expected field name for audio uploads */
  AUDIO_FIELD_NAME,

  /** Map of file extensions to MIME types */
  EXTENSION_TO_MIME,
} from './audioUpload';
