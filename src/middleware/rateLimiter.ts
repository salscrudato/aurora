/**
 * AuroraNotes API - Per-User Rate Limiting Middleware
 *
 * Rate limiting based on authenticated user UID.
 * Uses in-memory sliding window for simplicity.
 *
 * Configuration:
 *   RATE_LIMIT_WINDOW_MS - Window size in ms (default: 60000 = 1 minute)
 *   RATE_LIMIT_MAX_REQUESTS - Max requests per window (default: 100)
 */

import { Request, Response, NextFunction } from 'express';
import { logWarn } from '../utils';

// Configuration
const DEFAULT_WINDOW_MS = 60000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string | null;
  skipFailedRequests?: boolean;
}

/**
 * In-memory rate limit store
 * In production, consider using Redis for distributed rate limiting
 */
class RateLimitStore {
  private entries: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check and increment rate limit for a key
   * Returns { allowed: boolean, remaining: number, resetAt: number }
   */
  check(
    key: string,
    windowMs: number,
    maxRequests: number
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      // New window
      this.entries.set(key, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs,
      };
    }

    // Existing window
    entry.count++;
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetAt = entry.windowStart + windowMs;

    return {
      allowed: entry.count <= maxRequests,
      remaining,
      resetAt,
    };
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, entry] of this.entries) {
      if (now - entry.windowStart > maxAge) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Get current stats for monitoring
   */
  getStats(): { entryCount: number } {
    return { entryCount: this.entries.size };
  }
}

// Singleton store
const store = new RateLimitStore();

/**
 * Create a rate limiter middleware with custom configuration
 */
export function createRateLimiter(config: Partial<RateLimiterConfig> = {}) {
  const envWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '');
  const envMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '');
  const windowMs = config.windowMs ?? (isNaN(envWindowMs) ? DEFAULT_WINDOW_MS : envWindowMs);
  const maxRequests = config.maxRequests ?? (isNaN(envMaxRequests) ? DEFAULT_MAX_REQUESTS : envMaxRequests);
  const keyGenerator = config.keyGenerator ?? ((req: Request) => req.user?.uid ?? null);

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);

    // Skip rate limiting if no key (unauthenticated)
    if (!key) {
      return next();
    }

    const result = store.check(key, windowMs, maxRequests);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      logWarn('Rate limit exceeded', {
        key: key.slice(0, 8) + '...',
        path: req.path,
        method: req.method,
      });

      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        },
      });
      return;
    }

    next();
  };
}

/**
 * Default per-user rate limiter
 * Uses authenticated user's UID as the rate limit key
 */
export const perUserRateLimiter = createRateLimiter();

/**
 * Get rate limiter stats for monitoring
 */
export function getRateLimiterStats() {
  return store.getStats();
}

