/**
 * AuroraNotes API - User Authentication Middleware
 *
 * Firebase Authentication middleware for end-user authentication.
 * Validates Firebase ID tokens and attaches user info to requests.
 *
 * Usage:
 *   app.use('/notes', userAuthMiddleware);
 *   // In route: req.user.uid contains the authenticated user's Firebase UID
 *
 * Configuration:
 *   USER_AUTH_ENABLED=true (default: true in production)
 */

import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { logInfo, logWarn, logError, hashText } from '../utils';

// Configuration
// Default to false for backwards compatibility during migration
// Set USER_AUTH_ENABLED=true in production when ready to enforce auth
const USER_AUTH_ENABLED = process.env.USER_AUTH_ENABLED === 'true';

/**
 * Authenticated user attached to request
 */
export interface AuthenticatedUser {
  /** Firebase UID - used as tenantId for data isolation */
  uid: string;
  /** Email if available */
  email?: string;
  /** Email verified status */
  emailVerified?: boolean;
  /** Phone number if available */
  phoneNumber?: string;
  /** Firebase Auth provider (google.com, phone, etc.) */
  provider?: string;
  /** Display name if available */
  displayName?: string;
  /** Token issue time */
  issuedAt?: Date;
  /** Token expiration time */
  expiresAt?: Date;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Get the Auth instance (singleton from firebase-admin)
 */
function getAuth(): admin.auth.Auth {
  // Ensure app is initialized (getDb handles this)
  const { getDb } = require('../firestore');
  getDb(); // Initialize if not already
  return admin.auth();
}

/**
 * Verify Firebase ID token and extract user info
 */
async function verifyFirebaseToken(token: string): Promise<{
  valid: boolean;
  user?: AuthenticatedUser;
  error?: string;
}> {
  try {
    const decodedToken = await getAuth().verifyIdToken(token, true);

    const user: AuthenticatedUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      phoneNumber: decodedToken.phone_number,
      provider: decodedToken.firebase?.sign_in_provider,
      displayName: decodedToken.name,
      issuedAt: decodedToken.iat ? new Date(decodedToken.iat * 1000) : undefined,
      expiresAt: decodedToken.exp ? new Date(decodedToken.exp * 1000) : undefined,
    };

    return { valid: true, user };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Categorize errors
    if (message.includes('expired')) {
      return { valid: false, error: 'Token expired' };
    }
    if (message.includes('revoked')) {
      return { valid: false, error: 'Token revoked' };
    }
    if (message.includes('invalid') || message.includes('malformed')) {
      return { valid: false, error: 'Invalid token format' };
    }

    return { valid: false, error: message };
  }
}

/**
 * User authentication middleware for public endpoints
 *
 * When USER_AUTH_ENABLED=true (default):
 * - Requires valid Firebase ID token in Authorization header
 * - Attaches decoded user to req.user
 * - Returns 401 for missing/invalid tokens
 *
 * When USER_AUTH_ENABLED=false (development):
 * - Passes through all requests
 * - Sets req.user to a default dev user
 */
export async function userAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip auth if not enabled (development mode)
  if (!USER_AUTH_ENABLED) {
    // Set a default dev user for local development
    req.user = {
      uid: 'dev-user-local',
      email: 'dev@local.test',
      emailVerified: true,
      provider: 'development',
    };
    logInfo('User auth disabled, using dev user', {
      path: req.path,
      method: req.method,
      uid: req.user.uid,
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
        message: 'Authentication required. Provide a valid Firebase ID token.',
      },
    });
    return;
  }

  // Verify Firebase ID token
  const result = await verifyFirebaseToken(token);

  if (!result.valid || !result.user) {
    logWarn('User auth: invalid token', {
      path: req.path,
      method: req.method,
      error: result.error,
    });
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: result.error || 'Invalid authentication token',
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
  });

  return next();
}

/**
 * Check if user authentication is enabled
 */
export function isUserAuthEnabled(): boolean {
  return USER_AUTH_ENABLED;
}

/**
 * Middleware factory for optional auth (allows both authenticated and anonymous)
 * Sets req.user if token is present and valid, otherwise continues without user
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!USER_AUTH_ENABLED) {
    req.user = {
      uid: 'dev-user-local',
      email: 'dev@local.test',
      emailVerified: true,
      provider: 'development',
    };
    return next();
  }

  const token = extractBearerToken(req);
  if (!token) {
    // No token provided - continue without user
    return next();
  }

  const result = await verifyFirebaseToken(token);
  if (result.valid && result.user) {
    req.user = result.user;
  }

  return next();
}

