/**
 * AuroraNotes API - Internal Endpoint Authentication (OIDC)
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

// =============================================================================
// Token Verification
// =============================================================================

let oauthClient: OAuth2Client | null = null;

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const [type, token] = auth.split(' ');
  return type?.toLowerCase() === 'bearer' ? token : null;
}

async function verifyOidcToken(token: string): Promise<{ valid: boolean; email?: string; error?: string }> {
  try {
    if (!oauthClient) oauthClient = new OAuth2Client();

    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: INTERNAL_AUTH_AUDIENCE || undefined,
    });

    const payload = ticket.getPayload();
    if (!payload) return { valid: false, error: 'No payload' };

    const validIssuers = [INTERNAL_AUTH_ISSUER, 'accounts.google.com'];
    if (!validIssuers.includes(payload.iss || '')) {
      return { valid: false, error: `Invalid issuer: ${payload.iss}` };
    }

    if (INTERNAL_AUTH_AUDIENCE && payload.aud !== INTERNAL_AUTH_AUDIENCE) {
      return { valid: false, error: `Invalid audience: ${payload.aud}` };
    }

    if (INTERNAL_AUTH_SERVICE_ACCOUNT && payload.email !== INTERNAL_AUTH_SERVICE_ACCOUNT) {
      return { valid: false, error: `Invalid service account: ${payload.email}` };
    }

    return { valid: true, email: payload.email };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// =============================================================================
// Middleware
// =============================================================================

export async function internalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!INTERNAL_AUTH_ENABLED) {
    return next();
  }

  const token = extractBearerToken(req);
  if (!token) {
    logWarn('Internal auth: missing token', { path: req.path });
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const result = await verifyOidcToken(token);
  if (!result.valid) {
    logWarn('Internal auth: invalid token', { path: req.path, error: result.error });
    res.status(401).json({ error: 'Invalid authorization token' });
    return;
  }

  logInfo('Internal auth verified', { path: req.path, email: result.email });
  return next();
}

export function isInternalAuthConfigured(): boolean {
  if (!INTERNAL_AUTH_ENABLED) return true;
  if (!INTERNAL_AUTH_AUDIENCE) {
    logError('INTERNAL_AUTH_ENABLED=true but INTERNAL_AUTH_AUDIENCE not set', null);
    return false;
  }
  return true;
}
