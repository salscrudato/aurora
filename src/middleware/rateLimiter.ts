/**
 * AuroraNotes API - Per-User Rate Limiting Middleware
 *
 * Implements sliding window rate limiting based on authenticated user UID.
 * Uses in-memory storage with automatic cleanup for single-instance deployments.
 *
 * Features:
 * - Per-user rate limiting using Firebase UID
 * - IP-based fallback for unauthenticated requests
 * - Standard rate limit headers (X-RateLimit-*)
 * - Configurable window size and request limits
 * - Skip conditions (whitelist paths, methods)
 * - Monitoring stats (hits, blocks, active entries)
 *
 * Configuration (Environment Variables):
 *   RATE_LIMIT_WINDOW_MS    - Window size in ms (default: 60000 = 1 minute)
 *   RATE_LIMIT_MAX_REQUESTS - Max requests per window (default: 100)
 *
 * @example
 * ```typescript
 * // Use default rate limiter (100 req/min per user)
 * app.use('/api', userAuthMiddleware, perUserRateLimiter);
 *
 * // Create custom rate limiter
 * const strictLimiter = createRateLimiter({
 *   windowMs: 60000,
 *   maxRequests: 10,
 *   keyGenerator: (req) => req.user?.uid ?? null,
 * });
 *
 * app.post('/expensive-operation', strictLimiter, handler);
 * ```
 *
 * @see https://tools.ietf.org/html/rfc6585#section-4 (429 Too Many Requests)
 */

import { Request, Response, NextFunction } from 'express';
import { logWarn, logInfo } from '../utils';

// =============================================================================
// Configuration Constants
// =============================================================================

/** Default rate limit window in milliseconds (1 minute) */
export const DEFAULT_WINDOW_MS = 60000;

/** Default maximum requests per window */
export const DEFAULT_MAX_REQUESTS = 100;

/** Cleanup interval for expired entries (1 minute) */
const CLEANUP_INTERVAL_MS = 60000;

/** Maximum age for rate limit entries before cleanup (5 minutes) */
const MAX_ENTRY_AGE_MS = 5 * 60 * 1000;

// =============================================================================
// Types
// =============================================================================

/**
 * Internal rate limit entry for tracking request counts
 */
interface RateLimitEntry {
  /** Number of requests in current window */
  count: number;
  /** Timestamp when current window started */
  windowStart: number;
}

/**
 * Configuration options for rate limiter
 */
export interface RateLimiterConfig {
  /** Window size in milliseconds (default: 60000 = 1 minute) */
  windowMs: number;

  /** Maximum requests allowed per window (default: 100) */
  maxRequests: number;

  /**
   * Function to generate rate limit key from request
   * Return null to skip rate limiting for this request
   * Default: uses req.user?.uid
   */
  keyGenerator: (req: Request) => string | null;

  /**
   * Whether to skip rate limiting for failed requests (4xx/5xx)
   * Useful to avoid penalizing users for server errors
   * Default: false
   */
  skipFailedRequests: boolean;

  /**
   * Paths to skip rate limiting (exact match)
   * Default: ['/health', '/ready']
   */
  skipPaths: string[];

  /**
   * HTTP methods to skip rate limiting
   * Default: ['OPTIONS']
   */
  skipMethods: string[];

  /**
   * Whether to use IP address as fallback key for unauthenticated requests
   * Default: false (skip unauthenticated requests)
   */
  useIpFallback: boolean;

  /**
   * Custom handler for rate limit exceeded
   * Default: sends 429 JSON response
   */
  onRateLimited?: (req: Request, res: Response, retryAfterSeconds: number) => void;
}

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Timestamp when rate limit resets (ms since epoch) */
  resetAt: number;
  /** Total limit for the window */
  limit: number;
}

/**
 * Rate limiter statistics for monitoring
 */
export interface RateLimiterStats {
  /** Number of active rate limit entries */
  entryCount: number;
  /** Total requests checked since startup */
  totalChecks: number;
  /** Total requests that were rate limited */
  totalBlocked: number;
  /** Requests blocked in the last minute */
  blockedLastMinute: number;
}

// =============================================================================
// Rate Limit Store
// =============================================================================

/**
 * In-memory rate limit store with automatic cleanup
 *
 * For distributed deployments (multiple Cloud Run instances), consider:
 * - Redis-based rate limiting (redis-rate-limiter)
 * - Cloud Memorystore for Redis
 * - Firestore-based rate limiting (with transactions)
 *
 * This in-memory implementation is suitable for:
 * - Single instance deployments
 * - Development/testing
 * - Low-traffic applications
 */
class RateLimitStore {
  private entries: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Statistics tracking
  private stats = {
    totalChecks: 0,
    totalBlocked: 0,
    blockedTimestamps: [] as number[],
  };

  constructor() {
    // Cleanup expired entries periodically
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);

    // Prevent cleanup interval from keeping Node.js alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check and increment rate limit for a key
   *
   * @param key - The rate limit key (user ID, IP, etc.)
   * @param windowMs - Window size in milliseconds
   * @param maxRequests - Maximum requests allowed in window
   * @returns Rate limit check result
   */
  check(key: string, windowMs: number, maxRequests: number): RateLimitResult {
    const now = Date.now();
    const entry = this.entries.get(key);

    this.stats.totalChecks++;

    if (!entry || now - entry.windowStart >= windowMs) {
      // New window - reset count
      this.entries.set(key, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs,
        limit: maxRequests,
      };
    }

    // Existing window - increment count
    entry.count++;
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetAt = entry.windowStart + windowMs;
    const allowed = entry.count <= maxRequests;

    if (!allowed) {
      this.stats.totalBlocked++;
      this.stats.blockedTimestamps.push(now);
    }

    return {
      allowed,
      remaining,
      resetAt,
      limit: maxRequests,
    };
  }

  /**
   * Get current rate limit entry for a key (without incrementing)
   */
  peek(key: string, windowMs: number, maxRequests: number): RateLimitResult | null {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      return null;
    }

    return {
      allowed: entry.count < maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
      resetAt: entry.windowStart + windowMs,
      limit: maxRequests,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Clear all rate limit entries (useful for testing)
   */
  clear(): void {
    this.entries.clear();
    this.stats.totalChecks = 0;
    this.stats.totalBlocked = 0;
    this.stats.blockedTimestamps = [];
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): RateLimiterStats {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean up old timestamps and count recent blocks
    this.stats.blockedTimestamps = this.stats.blockedTimestamps.filter(ts => ts > oneMinuteAgo);

    return {
      entryCount: this.entries.size,
      totalChecks: this.stats.totalChecks,
      totalBlocked: this.stats.totalBlocked,
      blockedLastMinute: this.stats.blockedTimestamps.length,
    };
  }

  /**
   * Remove expired entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.entries) {
      if (now - entry.windowStart > MAX_ENTRY_AGE_MS) {
        this.entries.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logInfo('Rate limit store cleanup', { cleaned, remaining: this.entries.size });
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton store instance
const store = new RateLimitStore();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get client IP address from request
 * Handles X-Forwarded-For header for proxied requests
 */
function getClientIp(req: Request): string | null {
  // Check X-Forwarded-For header (Cloud Run, load balancers)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }

  // Fallback to direct connection IP
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/**
 * Default key generator - uses user UID or IP fallback
 */
function defaultKeyGenerator(req: Request, useIpFallback: boolean): string | null {
  // Prefer authenticated user UID
  if (req.user?.uid) {
    return `user:${req.user.uid}`;
  }

  // Fallback to IP if enabled
  if (useIpFallback) {
    const ip = getClientIp(req);
    if (ip) {
      return `ip:${ip}`;
    }
  }

  return null;
}

// =============================================================================
// Middleware Factory
// =============================================================================

/**
 * Create a rate limiter middleware with custom configuration
 *
 * @param config - Partial configuration (defaults will be used for missing values)
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * // Strict rate limit for expensive operations
 * const strictLimiter = createRateLimiter({
 *   windowMs: 60000,    // 1 minute
 *   maxRequests: 5,     // Only 5 requests per minute
 * });
 *
 * // Custom key generator (e.g., by API key)
 * const apiKeyLimiter = createRateLimiter({
 *   keyGenerator: (req) => req.headers['x-api-key'] as string ?? null,
 * });
 * ```
 */
export function createRateLimiter(config: Partial<RateLimiterConfig> = {}) {
  // Parse environment variables
  const envWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '', 10);
  const envMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '', 10);

  // Merge configuration with defaults
  const resolvedConfig: RateLimiterConfig = {
    windowMs: config.windowMs ?? (isNaN(envWindowMs) ? DEFAULT_WINDOW_MS : envWindowMs),
    maxRequests: config.maxRequests ?? (isNaN(envMaxRequests) ? DEFAULT_MAX_REQUESTS : envMaxRequests),
    keyGenerator: config.keyGenerator ?? ((req) => defaultKeyGenerator(req, resolvedConfig.useIpFallback)),
    skipFailedRequests: config.skipFailedRequests ?? false,
    skipPaths: config.skipPaths ?? ['/health', '/ready'],
    skipMethods: config.skipMethods ?? ['OPTIONS'],
    useIpFallback: config.useIpFallback ?? false,
    onRateLimited: config.onRateLimited,
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip based on path
    if (resolvedConfig.skipPaths.includes(req.path)) {
      return next();
    }

    // Skip based on method
    if (resolvedConfig.skipMethods.includes(req.method)) {
      return next();
    }

    // Generate rate limit key
    const key = resolvedConfig.keyGenerator(req);

    // Skip if no key (unauthenticated and no IP fallback)
    if (!key) {
      return next();
    }

    // Check rate limit
    const result = store.check(key, resolvedConfig.windowMs, resolvedConfig.maxRequests);

    // Set standard rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);

      // Set Retry-After header (RFC 6585)
      res.setHeader('Retry-After', retryAfterSeconds);

      logWarn('Rate limit exceeded', {
        key: key.length > 12 ? key.slice(0, 12) + '...' : key,
        path: req.path,
        method: req.method,
        retryAfterSeconds,
      });

      // Use custom handler if provided
      if (resolvedConfig.onRateLimited) {
        resolvedConfig.onRateLimited(req, res, retryAfterSeconds);
        return;
      }

      // Default 429 response
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: retryAfterSeconds,
        },
      });
      return;
    }

    next();
  };
}

// =============================================================================
// Pre-configured Rate Limiters
// =============================================================================

/** Default per-user rate limiter (100 req/min, uses user UID) */
export const perUserRateLimiter = createRateLimiter();

/** Strict rate limiter for expensive operations (10 req/min) */
export const strictRateLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60000 });

/** Burst rate limiter for short bursts (30 req/10sec) */
export const burstRateLimiter = createRateLimiter({ maxRequests: 30, windowMs: 10000 });

/** Global IP-based rate limiter (applied before auth, uses RATE_LIMIT_* env vars) */
export const ipRateLimiter = createRateLimiter({
  useIpFallback: true,
  keyGenerator: (req) => getClientIp(req) ? `ip:${getClientIp(req)}` : null,
});

// =============================================================================
// Monitoring & Management Functions
// =============================================================================

/**
 * Get rate limiter statistics for monitoring
 *
 * @returns Current rate limiter stats
 *
 * @example
 * ```typescript
 * app.get('/admin/rate-limit-stats', (req, res) => {
 *   res.json(getRateLimiterStats());
 * });
 * ```
 */
export function getRateLimiterStats(): RateLimiterStats {
  return store.getStats();
}

/**
 * Reset rate limit for a specific user
 * Useful for admin operations or customer support
 *
 * @param userId - The user ID to reset
 */
export function resetUserRateLimit(userId: string): void {
  store.reset(`user:${userId}`);
  logInfo('Rate limit reset', { userId });
}

/**
 * Reset rate limit for a specific IP address
 *
 * @param ip - The IP address to reset
 */
export function resetIpRateLimit(ip: string): void {
  store.reset(`ip:${ip}`);
  logInfo('Rate limit reset', { ip });
}

/**
 * Clear all rate limits (use with caution)
 * Primarily for testing
 */
export function clearAllRateLimits(): void {
  store.clear();
  logWarn('All rate limits cleared');
}

/**
 * Check rate limit status for a user without incrementing
 *
 * @param userId - The user ID to check
 * @param windowMs - Window size (default: DEFAULT_WINDOW_MS)
 * @param maxRequests - Max requests (default: DEFAULT_MAX_REQUESTS)
 * @returns Current rate limit status or null if not tracked
 */
export function peekUserRateLimit(
  userId: string,
  windowMs: number = DEFAULT_WINDOW_MS,
  maxRequests: number = DEFAULT_MAX_REQUESTS
): RateLimitResult | null {
  return store.peek(`user:${userId}`, windowMs, maxRequests);
}
