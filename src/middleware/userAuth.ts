/**
 * AuroraNotes API - User Authentication Middleware
 *
 * Firebase Authentication middleware for end-user authentication.
 * Validates Firebase ID tokens and attaches user info to requests.
 *
 * Features:
 * - Firebase ID token verification with revocation checking
 * - Automatic user info extraction (UID, email, provider, etc.)
 * - Development mode bypass for local testing
 * - Optional authentication for mixed endpoints
 * - Role-based access control helpers
 * - Comprehensive error handling with specific error codes
 *
 * Security:
 * - Tokens are verified with `checkRevoked: true` for security
 * - User UIDs are hashed in logs for privacy
 * - Sensitive token info is never logged
 *
 * Configuration:
 *   USER_AUTH_ENABLED - Set to 'true' to enforce authentication (default: false)
 *
 * @example
 * ```typescript
 * // Require authentication for all note routes
 * app.use('/notes', userAuthMiddleware);
 *
 * // Access authenticated user in handler
 * app.get('/notes', (req, res) => {
 *   const userId = req.user!.uid;  // Firebase UID
 *   // ... fetch user's notes
 * });
 *
 * // Optional auth - works with or without token
 * app.get('/public', optionalAuthMiddleware, (req, res) => {
 *   if (req.user) {
 *     // Authenticated user
 *   } else {
 *     // Anonymous user
 *   }
 * });
 * ```
 *
 * @see https://firebase.google.com/docs/auth/admin/verify-id-tokens
 */

import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { logInfo, logWarn, logError, hashText } from '../utils';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Environment detection for security guards
 */
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

/**
 * Whether user authentication is enabled
 *
 * SECURITY: In production, this MUST always be true.
 * The DEV_USER bypass is only allowed in development environments.
 */
const USER_AUTH_ENABLED_RAW = process.env.USER_AUTH_ENABLED === 'true';

// CRITICAL SECURITY GUARD: Force auth enabled in production
const USER_AUTH_ENABLED = IS_PRODUCTION ? true : USER_AUTH_ENABLED_RAW;

// Startup validation - log loud warning if auth is disabled
if (!USER_AUTH_ENABLED && !IS_PRODUCTION) {
  console.warn('\n' + '⚠️'.repeat(30));
  console.warn('⚠️  WARNING: USER_AUTH_ENABLED=false - Using development bypass');
  console.warn('⚠️  This is ONLY acceptable in local development!');
  console.warn('⚠️  Set USER_AUTH_ENABLED=true before deploying.');
  console.warn('⚠️'.repeat(30) + '\n');
}

// Crash immediately if someone tries to disable auth in production
if (IS_PRODUCTION && process.env.USER_AUTH_ENABLED === 'false') {
  console.error('🚨 CRITICAL: Cannot disable USER_AUTH_ENABLED in production!');
  console.error('🚨 This is a security violation. Refusing to start.');
  process.exit(1);
}

/**
 * Default development user for local testing
 * SECURITY: This user is NEVER used in production - see guards above.
 */
const DEV_USER: AuthenticatedUser = {
  uid: 'dev-user-local',
  email: 'dev@local.test',
  emailVerified: true,
  provider: 'development',
  displayName: 'Development User',
};

// =============================================================================
// Types
// =============================================================================

/**
 * Authenticated user attached to Express request
 *
 * This interface represents the decoded Firebase ID token information
 * that is attached to `req.user` after successful authentication.
 */
export interface AuthenticatedUser {
  /** Firebase UID - used as tenantId for data isolation */
  uid: string;

  /** User's email address (if available) */
  email?: string;

  /** Whether the email has been verified */
  emailVerified?: boolean;

  /** User's phone number (if available) */
  phoneNumber?: string;

  /** Firebase Auth provider ID (e.g., 'google.com', 'phone', 'password') */
  provider?: string;

  /** User's display name (if available) */
  displayName?: string;

  /** User's profile picture URL (if available) */
  photoURL?: string;

  /** When the token was issued */
  issuedAt?: Date;

  /** When the token expires */
  expiresAt?: Date;

  /** Custom claims from Firebase (for role-based access) */
  customClaims?: Record<string, unknown>;
}

/**
 * Authentication error codes
 */
export type AuthErrorCode =
  | 'UNAUTHORIZED'        // No token provided
  | 'INVALID_TOKEN'       // Token format is invalid
  | 'TOKEN_EXPIRED'       // Token has expired
  | 'TOKEN_REVOKED'       // Token has been revoked
  | 'USER_DISABLED'       // User account is disabled
  | 'USER_NOT_FOUND'      // User account doesn't exist
  | 'EMAIL_NOT_VERIFIED'  // Email verification required
  | 'INSUFFICIENT_ROLE'   // User lacks required role
  | 'AUTH_ERROR';         // Generic auth error

/**
 * Result of token verification
 */
export interface TokenVerificationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** Authenticated user info (if valid) */
  user?: AuthenticatedUser;
  /** Error code (if invalid) */
  errorCode?: AuthErrorCode;
  /** Error message (if invalid) */
  errorMessage?: string;
}

/**
 * Custom error class for authentication failures
 */
export class AuthenticationError extends Error {
  readonly code: AuthErrorCode;
  readonly statusCode: number;

  constructor(message: string, code: AuthErrorCode, statusCode = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
    this.statusCode = statusCode;

    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }

  toJSON(): { code: string; message: string } {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      /** Authenticated user (set by userAuthMiddleware) */
      user?: AuthenticatedUser;
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract Bearer token from Authorization header
 *
 * @param req - Express request
 * @returns The token string or null if not present/invalid format
 *
 * @example
 * // Header: "Authorization: Bearer eyJhbGc..."
 * const token = extractBearerToken(req); // "eyJhbGc..."
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  const token = parts[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Get the Firebase Auth instance
 * Ensures Firebase Admin is initialized before returning
 */
function getAuth(): admin.auth.Auth {
  // Ensure app is initialized (getDb handles this)
  const { getDb } = require('../firestore');
  getDb(); // Initialize if not already
  return admin.auth();
}

/**
 * Map Firebase error codes to our AuthErrorCode
 */
function mapFirebaseError(error: Error): { code: AuthErrorCode; message: string } {
  const message = error.message.toLowerCase();
  const firebaseCode = (error as any).code as string | undefined;

  // Check Firebase error codes first
  if (firebaseCode) {
    switch (firebaseCode) {
      case 'auth/id-token-expired':
        return { code: 'TOKEN_EXPIRED', message: 'Authentication token has expired. Please sign in again.' };
      case 'auth/id-token-revoked':
        return { code: 'TOKEN_REVOKED', message: 'Authentication token has been revoked. Please sign in again.' };
      case 'auth/user-disabled':
        return { code: 'USER_DISABLED', message: 'User account has been disabled.' };
      case 'auth/user-not-found':
        return { code: 'USER_NOT_FOUND', message: 'User account not found.' };
      case 'auth/argument-error':
      case 'auth/invalid-id-token':
        return { code: 'INVALID_TOKEN', message: 'Invalid authentication token format.' };
    }
  }

  // Fallback to message matching
  if (message.includes('expired')) {
    return { code: 'TOKEN_EXPIRED', message: 'Authentication token has expired. Please sign in again.' };
  }
  if (message.includes('revoked')) {
    return { code: 'TOKEN_REVOKED', message: 'Authentication token has been revoked. Please sign in again.' };
  }
  if (message.includes('disabled')) {
    return { code: 'USER_DISABLED', message: 'User account has been disabled.' };
  }
  if (message.includes('invalid') || message.includes('malformed')) {
    return { code: 'INVALID_TOKEN', message: 'Invalid authentication token format.' };
  }

  return { code: 'AUTH_ERROR', message: error.message };
}

/**
 * Verify Firebase ID token and extract user info
 *
 * @param token - The Firebase ID token to verify
 * @returns Verification result with user info or error details
 */
export async function verifyFirebaseToken(token: string): Promise<TokenVerificationResult> {
  try {
    // Verify token with revocation check for security
    const decodedToken = await getAuth().verifyIdToken(token, true);

    const user: AuthenticatedUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      phoneNumber: decodedToken.phone_number,
      provider: decodedToken.firebase?.sign_in_provider,
      displayName: decodedToken.name,
      photoURL: decodedToken.picture,
      issuedAt: decodedToken.iat ? new Date(decodedToken.iat * 1000) : undefined,
      expiresAt: decodedToken.exp ? new Date(decodedToken.exp * 1000) : undefined,
      // Extract custom claims (excluding standard claims)
      customClaims: extractCustomClaims(decodedToken),
    };

    return { valid: true, user };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const mapped = mapFirebaseError(error);

    return {
      valid: false,
      errorCode: mapped.code,
      errorMessage: mapped.message,
    };
  }
}

/**
 * Extract custom claims from decoded token
 * Filters out standard JWT and Firebase claims
 */
function extractCustomClaims(
  decodedToken: admin.auth.DecodedIdToken
): Record<string, unknown> | undefined {
  const standardClaims = new Set([
    'iss', 'sub', 'aud', 'exp', 'iat', 'auth_time', 'nonce',
    'acr', 'amr', 'azp', 'email', 'email_verified', 'phone_number',
    'name', 'picture', 'firebase', 'uid', 'user_id',
  ]);

  const customClaims: Record<string, unknown> = {};
  let hasCustomClaims = false;

  for (const [key, value] of Object.entries(decodedToken)) {
    if (!standardClaims.has(key)) {
      customClaims[key] = value;
      hasCustomClaims = true;
    }
  }

  return hasCustomClaims ? customClaims : undefined;
}

// =============================================================================
// Middleware Functions
// =============================================================================

/**
 * User authentication middleware (required)
 *
 * Requires a valid Firebase ID token in the Authorization header.
 * On success, attaches the decoded user to `req.user`.
 * On failure, returns 401 Unauthorized.
 *
 * Behavior:
 * - USER_AUTH_ENABLED=true: Requires valid Firebase token
 * - USER_AUTH_ENABLED=false: Uses dev user (for local development)
 *
 * @example
 * ```typescript
 * // Protect all routes under /api
 * app.use('/api', userAuthMiddleware);
 *
 * // Or protect specific routes
 * app.post('/notes', userAuthMiddleware, createNoteHandler);
 * ```
 */
export async function userAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Development mode bypass - ONLY works in non-production (see guards above)
  if (!USER_AUTH_ENABLED && !IS_PRODUCTION) {
    req.user = { ...DEV_USER };
    logInfo('User auth disabled, using dev user (DEV ONLY)', {
      path: req.path,
      method: req.method,
      uid: req.user.uid,
      NODE_ENV,
    });
    return next();
  }

  // Extract bearer token
  const token = extractBearerToken(req);
  if (!token) {
    logWarn('User auth: missing bearer token', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
    });

    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide a valid Firebase ID token in the Authorization header.',
      },
    });
    return;
  }

  // Verify Firebase ID token
  const result = await verifyFirebaseToken(token);

  if (!result.valid || !result.user) {
    logWarn('User auth: token verification failed', {
      path: req.path,
      method: req.method,
      errorCode: result.errorCode,
    });

    res.status(401).json({
      error: {
        code: result.errorCode || 'INVALID_TOKEN',
        message: result.errorMessage || 'Invalid authentication token',
      },
    });
    return;
  }

  // Attach user to request
  req.user = result.user;

  // Log successful auth (hash UID for privacy)
  logInfo('User authenticated', {
    path: req.path,
    method: req.method,
    uidHash: hashText(result.user.uid).slice(0, 8),
    provider: result.user.provider,
    emailVerified: result.user.emailVerified,
  });

  return next();
}

/**
 * Check if user authentication is enabled
 *
 * @returns true if USER_AUTH_ENABLED=true, false otherwise
 */
export function isUserAuthEnabled(): boolean {
  return USER_AUTH_ENABLED;
}

/**
 * Optional authentication middleware
 *
 * Attempts to authenticate if a token is present, but allows
 * requests to proceed even without authentication.
 *
 * Use for endpoints that work differently for authenticated vs anonymous users.
 *
 * @example
 * ```typescript
 * app.get('/content', optionalAuthMiddleware, (req, res) => {
 *   if (req.user) {
 *     // Show personalized content
 *   } else {
 *     // Show public content
 *   }
 * });
 * ```
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Development mode bypass - ONLY works in non-production
  if (!USER_AUTH_ENABLED && !IS_PRODUCTION) {
    req.user = { ...DEV_USER };
    return next();
  }

  // Try to extract and verify token
  const token = extractBearerToken(req);
  if (!token) {
    // No token provided - continue without user (anonymous)
    return next();
  }

  // Verify token if present
  const result = await verifyFirebaseToken(token);
  if (result.valid && result.user) {
    req.user = result.user;
    logInfo('Optional auth: user authenticated', {
      path: req.path,
      uidHash: hashText(result.user.uid).slice(0, 8),
    });
  }
  // If token is invalid, continue without user (don't fail the request)

  return next();
}

// =============================================================================
// Authorization Helper Middleware
// =============================================================================

/**
 * Middleware factory that requires email verification
 *
 * Must be used after userAuthMiddleware.
 *
 * @example
 * ```typescript
 * app.post('/sensitive',
 *   userAuthMiddleware,
 *   requireEmailVerified(),
 *   sensitiveHandler
 * );
 * ```
 */
export function requireEmailVerified() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
      return;
    }

    if (!req.user.emailVerified) {
      logWarn('Email verification required', {
        path: req.path,
        uidHash: hashText(req.user.uid).slice(0, 8),
      });

      res.status(403).json({
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email verification required. Please verify your email address.',
        },
      });
      return;
    }

    next();
  };
}

/**
 * Middleware factory that requires specific custom claims (roles)
 *
 * Must be used after userAuthMiddleware.
 *
 * @param requiredClaims - Object with required claim key-value pairs
 *
 * @example
 * ```typescript
 * // Require admin role
 * app.delete('/users/:id',
 *   userAuthMiddleware,
 *   requireClaims({ admin: true }),
 *   deleteUserHandler
 * );
 *
 * // Require specific role
 * app.get('/reports',
 *   userAuthMiddleware,
 *   requireClaims({ role: 'analyst' }),
 *   reportsHandler
 * );
 * ```
 */
export function requireClaims(requiredClaims: Record<string, unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
      return;
    }

    const userClaims = req.user.customClaims || {};

    for (const [key, value] of Object.entries(requiredClaims)) {
      if (userClaims[key] !== value) {
        logWarn('Insufficient permissions', {
          path: req.path,
          uidHash: hashText(req.user.uid).slice(0, 8),
          requiredClaim: key,
        });

        res.status(403).json({
          error: {
            code: 'INSUFFICIENT_ROLE',
            message: 'You do not have permission to access this resource.',
          },
        });
        return;
      }
    }

    next();
  };
}

/**
 * Get current user from request (type-safe helper)
 *
 * @param req - Express request
 * @returns The authenticated user
 * @throws AuthenticationError if user is not authenticated
 *
 * @example
 * ```typescript
 * app.get('/profile', userAuthMiddleware, (req, res) => {
 *   const user = getAuthenticatedUser(req);
 *   res.json({ uid: user.uid, email: user.email });
 * });
 * ```
 */
export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new AuthenticationError(
      'User is not authenticated',
      'UNAUTHORIZED'
    );
  }
  return req.user;
}

/**
 * Check if request has an authenticated user
 *
 * @param req - Express request
 * @returns true if user is authenticated
 */
export function isAuthenticated(req: Request): boolean {
  return !!req.user;
}

/**
 * Get user ID from request (convenience helper)
 *
 * @param req - Express request
 * @returns The user's UID or null if not authenticated
 */
export function getUserId(req: Request): string | null {
  return req.user?.uid ?? null;
}
