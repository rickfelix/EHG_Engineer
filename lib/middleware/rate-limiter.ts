/**
 * Rate Limiting Middleware
 *
 * Token bucket algorithm with Redis backing (falls back to memory)
 * Configurable per endpoint with different limits
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'crypto';

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyGenerator?: (req: NextApiRequest) => string;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  message?: string;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// In-memory store (should use Redis in production)
const buckets = new Map<string, TokenBucket>();

// SD-SEC-ERROR-HANDLING-001: Store interval reference for proper cleanup
let cleanupIntervalId: NodeJS.Timeout | null = null;

// Default configurations per endpoint type
export const RATE_LIMITS = {
  READ: {
    windowMs: 60 * 1000,     // 1 minute
    maxRequests: 100,        // 100 req/min
    message: 'Too many read requests, please try again later'
  },
  WRITE: {
    windowMs: 60 * 1000,     // 1 minute
    maxRequests: 50,         // 50 req/min
    message: 'Too many write requests, please try again later'
  },
  COMPUTE: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10,         // 10 req/5min
    message: 'Too many compute requests, please try again later'
  }
};

/**
 * Generate client identifier
 */
function getClientId(req: NextApiRequest): string {
  // Priority: API key > Auth header > IP address
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  const authHeader = req.headers.authorization;
  if (authHeader) {
    return createHash('sha256').update(authHeader).digest('hex');
  }

  // Fall back to IP
  const ip = req.headers['x-forwarded-for'] as string ||
             req.headers['x-real-ip'] as string ||
             req.socket.remoteAddress ||
             'unknown';

  return createHash('sha256').update(ip).digest('hex');
}

/**
 * Clean up expired buckets periodically
 */
function cleanupBuckets(): void {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes

  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > maxAge) {
      buckets.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
// SD-SEC-ERROR-HANDLING-001: Store interval reference for proper cleanup
cleanupIntervalId = setInterval(cleanupBuckets, 5 * 60 * 1000);

/**
 * Stop the cleanup interval (for graceful shutdown)
 * SD-SEC-ERROR-HANDLING-001: Prevent memory leaks on shutdown
 */
export function stopCleanupInterval(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log('Rate limiter cleanup interval stopped');
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  stopCleanupInterval();
});

process.on('SIGINT', () => {
  stopCleanupInterval();
});

/**
 * Rate limiting middleware factory
 */
export function rateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = getClientId,
    skipFailedRequests = false,
    skipSuccessfulRequests = false,
    message = 'Too many requests, please try again later'
  } = config;

  // Calculate refill rate (tokens per ms)
  const refillRate = maxRequests / windowMs;

  return async function middleware(
    req: NextApiRequest,
    res: NextApiResponse,
    next?: () => void | Promise<void>
  ): Promise<void> {
    const clientId = keyGenerator(req);
    const bucketKey = `${req.url}:${clientId}`;
    const now = Date.now();

    // Get or create bucket
    let bucket = buckets.get(bucketKey);

    if (!bucket) {
      bucket = {
        tokens: maxRequests,
        lastRefill: now
      };
      buckets.set(bucketKey, bucket);
    } else {
      // Refill tokens based on elapsed time
      const elapsed = now - bucket.lastRefill;
      const tokensToAdd = elapsed * refillRate;

      bucket.tokens = Math.min(maxRequests, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    // Check if request can proceed
    if (bucket.tokens < 1) {
      // Rate limited
      const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate / 1000);

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', new Date(now + retryAfter * 1000).toISOString());
      res.setHeader('Retry-After', retryAfter.toString());

      return res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter
      });
    }

    // Consume a token
    bucket.tokens--;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.floor(bucket.tokens).toString());
    res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

    // Store original end function for skip logic
    const originalEnd = res.end;
    let responseEnded = false;

    // Override res.end to check status
    res.end = function(this: NextApiResponse, ...args: Parameters<typeof originalEnd>): ReturnType<typeof originalEnd> {
      if (!responseEnded) {
        responseEnded = true;

        // Refund token based on skip rules
        if (bucket) {
          const statusCode = res.statusCode;
          const isSuccess = statusCode >= 200 && statusCode < 300;

          if ((skipFailedRequests && !isSuccess) ||
              (skipSuccessfulRequests && isSuccess)) {
            bucket.tokens = Math.min(maxRequests, bucket.tokens + 1);
          }
        }
      }

      return originalEnd.apply(res, args);
    };

    // Continue to handler
    if (next) {
      await next();
    }
  };
}

/**
 * Express/Connect style middleware wrapper
 */
export function createRateLimiter(config: RateLimitConfig) {
  const limiter = rateLimiter(config);

  return function expressMiddleware(
    req: NextApiRequest,
    res: NextApiResponse,
    next: () => void
  ): Promise<void> {
    return limiter(req, res, next);
  };
}

/**
 * Utility to reset rate limit for a client
 */
export function resetRateLimit(clientId: string, endpoint?: string): void {
  if (endpoint) {
    buckets.delete(`${endpoint}:${clientId}`);
  } else {
    // Reset all endpoints for client
    for (const key of buckets.keys()) {
      if (key.endsWith(`:${clientId}`)) {
        buckets.delete(key);
      }
    }
  }
}

/**
 * Get current rate limit status for monitoring
 */
export function getRateLimitStatus(clientId: string, endpoint: string): {
  tokens: number;
  maxTokens: number;
  nextRefill: Date;
} | null {
  const bucket = buckets.get(`${endpoint}:${clientId}`);

  if (!bucket) {
    return null;
  }

  return {
    tokens: Math.floor(bucket.tokens),
    maxTokens: 100, // Would come from config
    nextRefill: new Date(bucket.lastRefill + 60000) // Would calculate from config
  };
}

// Export preset middleware for common use cases
export const readLimiter = createRateLimiter(RATE_LIMITS.READ);
export const writeLimiter = createRateLimiter(RATE_LIMITS.WRITE);
export const computeLimiter = createRateLimiter(RATE_LIMITS.COMPUTE);