/**
 * AuroraNotes API - Internal Endpoint Authentication
 *
 * Provides OIDC JWT validation for /internal/* endpoints.
 * When INTERNAL_AUTH_ENABLED=true, validates that requests come from
 * authorized Cloud Tasks with valid Google OIDC tokens.
 *
 * Configuration:
 *   INTERNAL_AUTH_ENABLED=true       - Enable OIDC validation
 *   INTERNAL_AUTH_AUDIENCE=<url>     - Expected audience (service URL)
 *   INTERNAL_AUTH_SERVICE_ACCOUNT=<email> - Optional: expected SA email
 */

import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  INTERNAL_AUTH_ENABLED,
  INTERNAL_AUTH_AUDIENCE,
  INTERNAL_AUTH_ISSUER,
  INTERNAL_AUTH_SERVICE_ACCOUNT,
} from './config';
import { logInfo, logWarn, logError } from './utils';

// Singleton OAuth2 client for token verification
let oauthClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  if (!oauthClient) {
    oauthClient = new OAuth2Client();
  }
  return oauthClient;
}

/**
 * Extract bearer token from Authorization header
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
 * Verify OIDC token from Google
 */
async function verifyOidcToken(token: string): Promise<{
  valid: boolean;
  email?: string;
  audience?: string;
  error?: string;
}> {
  try {
    const client = getOAuthClient();
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: INTERNAL_AUTH_AUDIENCE || undefined,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return { valid: false, error: 'No payload in token' };
    }

    // Verify issuer
    if (payload.iss !== INTERNAL_AUTH_ISSUER && payload.iss !== 'accounts.google.com') {
      return { valid: false, error: `Invalid issuer: ${payload.iss}` };
    }

    // Verify audience if configured
    if (INTERNAL_AUTH_AUDIENCE && payload.aud !== INTERNAL_AUTH_AUDIENCE) {
      return { valid: false, error: `Invalid audience: ${payload.aud}` };
    }

    // Verify service account if configured
    if (INTERNAL_AUTH_SERVICE_ACCOUNT && payload.email !== INTERNAL_AUTH_SERVICE_ACCOUNT) {
      return { valid: false, error: `Invalid service account: ${payload.email}` };
    }

    return {
      valid: true,
      email: payload.email,
      audience: payload.aud as string,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }
}

/**
 * Express middleware for internal endpoint authentication
 *
 * When INTERNAL_AUTH_ENABLED=true:
 * - Requires valid OIDC bearer token
 * - Validates issuer, audience, and optionally service account
 * - Returns 401 for missing/invalid tokens
 *
 * When INTERNAL_AUTH_ENABLED=false:
 * - Passes through all requests (development mode)
 */
export async function internalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip auth if not enabled (development mode)
  if (!INTERNAL_AUTH_ENABLED) {
    logInfo('Internal auth disabled, allowing request', {
      path: req.path,
      method: req.method,
    });
    return next();
  }

  // Extract bearer token
  const token = extractBearerToken(req);
  if (!token) {
    logWarn('Internal auth: missing bearer token', {
      path: req.path,
      method: req.method,
    });
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  // Verify OIDC token
  const result = await verifyOidcToken(token);

  if (!result.valid) {
    logWarn('Internal auth: invalid token', {
      path: req.path,
      method: req.method,
      error: result.error,
    });
    res.status(401).json({ error: 'Invalid authorization token' });
    return;
  }

  // Token is valid
  logInfo('Internal auth: token verified', {
    path: req.path,
    method: req.method,
    email: result.email,
  });

  return next();
}

/**
 * Check if internal auth is properly configured
 */
export function isInternalAuthConfigured(): boolean {
  if (!INTERNAL_AUTH_ENABLED) {
    return true; // Not enabled = no config needed
  }

  // Must have audience configured
  if (!INTERNAL_AUTH_AUDIENCE) {
    logError('INTERNAL_AUTH_ENABLED=true but INTERNAL_AUTH_AUDIENCE not set', null);
    return false;
  }

  return true;
}

