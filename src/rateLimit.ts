/**
 * AuroraNotes API - Simple Rate Limiter
 * 
 * In-memory rate limiter for API protection.
 * Designed for single-instance deployment (Cloud Run with concurrency).
 */

import { Request, Response, NextFunction } from 'express';
import { logWarn } from './utils';
import { 
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_REQUESTS_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
} from './config';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limits (per IP)
const rateLimits = new Map<string, RateLimitEntry>();

// Cleanup interval to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60000;

/**
 * Get client identifier for rate limiting
 * Uses X-Forwarded-For for Cloud Run, falls back to remote IP
 */
function getClientId(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Check rate limit for a client
 */
function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimits.get(clientId);
  
  // No existing entry or expired window - create new
  if (!entry || now > entry.resetAt) {
    rateLimits.set(clientId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { 
      allowed: true, 
      remaining: RATE_LIMIT_REQUESTS_PER_MIN - 1,
      resetIn: RATE_LIMIT_WINDOW_MS,
    };
  }
  
  // Within window - check count
  if (entry.count >= RATE_LIMIT_REQUESTS_PER_MIN) {
    return { 
      allowed: false, 
      remaining: 0,
      resetIn: entry.resetAt - now,
    };
  }
  
  // Increment and allow
  entry.count++;
  return { 
    allowed: true, 
    remaining: RATE_LIMIT_REQUESTS_PER_MIN - entry.count,
    resetIn: entry.resetAt - now,
  };
}

/**
 * Rate limiting middleware
 * Only applies if RATE_LIMIT_ENABLED is true
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip rate limiting if disabled
  if (!RATE_LIMIT_ENABLED) {
    next();
    return;
  }
  
  // Skip health checks
  if (req.path === '/health') {
    next();
    return;
  }
  
  const clientId = getClientId(req);
  const { allowed, remaining, resetIn } = checkRateLimit(clientId);
  
  // Set rate limit headers
  res.set('X-RateLimit-Limit', String(RATE_LIMIT_REQUESTS_PER_MIN));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)));
  
  if (!allowed) {
    logWarn('Rate limit exceeded', { clientId, path: req.path });
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(resetIn / 1000),
    });
    return;
  }
  
  next();
}

/**
 * Cleanup expired entries periodically
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of rateLimits.entries()) {
    if (now > entry.resetAt) {
      rateLimits.delete(key);
      cleaned++;
    }
  }
  
  // Only log if we cleaned something significant
  if (cleaned > 10) {
    logWarn('Rate limit cleanup', { cleaned, remaining: rateLimits.size });
  }
}

// Start cleanup interval
setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);

/**
 * Get current rate limit stats (for debugging/monitoring)
 */
export function getRateLimitStats(): { activeClients: number } {
  return { activeClients: rateLimits.size };
}

