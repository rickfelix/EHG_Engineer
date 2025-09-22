/**
 * API Rate Limiting for SDIP
 * Implements Security Sub-Agent rate limiting requirements
 * Prevents DDoS and abuse
 * Created: 2025-01-03
 */

const rateLimit = require('express-rate-limit');
// const RedisStore = require('rate-limit-redis'); // Optional: only if using Redis
// const Redis = require('ioredis'); // Optional: only if using Redis

class RateLimiter {
  constructor(redisUrl = process.env.REDIS_URL) {
    // Initialize Redis if available (for distributed rate limiting)
    // this.redis = redisUrl ? new Redis(redisUrl) : null;
    this.redis = null; // Redis disabled for now
    
    // Define rate limit tiers per Security Sub-Agent recommendations
    this.tiers = {
      // Chairman - higher limits for submission creation
      chairman: {
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 requests per minute
        message: 'Too many requests from Chairman account, please wait before submitting more feedback'
      },
      
      // Validator - moderate limits
      validator: {
        windowMs: 60 * 1000, // 1 minute  
        max: 30, // 30 requests per minute
        message: 'Too many validation attempts, please slow down'
      },
      
      // Admin - higher limits for management
      admin: {
        windowMs: 60 * 1000, // 1 minute
        max: 60, // 60 requests per minute
        message: 'Admin rate limit exceeded'
      },
      
      // Public/unauthenticated - strict limits
      public: {
        windowMs: 60 * 1000, // 1 minute
        max: 5, // 5 requests per minute
        message: 'Please authenticate to increase rate limits'
      }
    };

    // Define endpoint-specific limits
    this.endpointLimits = {
      // Critical endpoints with stricter limits
      '/api/sdip/submit': {
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 3, // 3 submissions per 5 minutes
        message: 'Submission rate limit exceeded. Maximum 3 submissions per 5 minutes.',
        skipSuccessfulRequests: false
      },
      
      '/api/sdip/validate-gate': {
        windowMs: 60 * 1000, // 1 minute
        max: 20, // 20 validations per minute
        message: 'Gate validation rate limit exceeded'
      },
      
      '/api/sdip/pacer-analysis': {
        windowMs: 60 * 1000, // 1 minute
        max: 5, // 5 PACER analyses per minute (resource intensive)
        message: 'PACER analysis rate limit exceeded. This is a resource-intensive operation.'
      },
      
      // Read operations - more permissive
      '/api/sdip/list': {
        windowMs: 60 * 1000, // 1 minute
        max: 100, // 100 reads per minute
        message: 'List operation rate limit exceeded'
      }
    };
  }

  /**
   * Create rate limiter middleware for user tier
   */
  createUserLimiter(tier = 'public') {
    const config = this.tiers[tier] || this.tiers.public;
    
    const limiterConfig = {
      ...config,
      standardHeaders: true, // Return rate limit info in headers
      legacyHeaders: false,
      handler: this.rateLimitHandler.bind(this),
      keyGenerator: this.generateKey.bind(this),
      skip: this.skipHealthCheck.bind(this)
    };

    // Use Redis store if available for distributed limiting
    if (this.redis) {
      // limiterConfig.store = new RedisStore({
      //   client: this.redis,
      //   prefix: `rl:user:${tier}:`
      // });
    }

    return rateLimit(limiterConfig);
  }

  /**
   * Create rate limiter for specific endpoint
   */
  createEndpointLimiter(endpoint) {
    const config = this.endpointLimits[endpoint] || {
      windowMs: 60 * 1000,
      max: 50,
      message: 'Rate limit exceeded for this endpoint'
    };

    const limiterConfig = {
      ...config,
      standardHeaders: true,
      legacyHeaders: false,
      handler: this.rateLimitHandler.bind(this),
      keyGenerator: (req) => {
        // Combine user ID and IP for endpoint limiting
        const userId = req.user?.id || 'anonymous';
        const ip = this.getClientIP(req);
        return `${endpoint}:${userId}:${ip}`;
      }
    };

    if (this.redis) {
      // limiterConfig.store = new RedisStore({
      //   client: this.redis,
      //   prefix: `rl:endpoint:`
      // });
    }

    return rateLimit(limiterConfig);
  }

  /**
   * Global rate limiter to prevent DDoS
   */
  createGlobalLimiter() {
    const config = {
      windowMs: 60 * 1000, // 1 minute
      max: 1000, // 1000 requests per minute per IP
      message: 'Global rate limit exceeded. Please contact support if this persists.',
      standardHeaders: true,
      legacyHeaders: false,
      handler: this.rateLimitHandler.bind(this),
      keyGenerator: (req) => this.getClientIP(req)
    };

    if (this.redis) {
      // config.store = new RedisStore({
      //   client: this.redis,
      //   prefix: 'rl:global:'
      // });
    }

    return rateLimit(config);
  }

  /**
   * Burst protection - prevent rapid successive requests
   */
  createBurstLimiter() {
    const config = {
      windowMs: 1000, // 1 second
      max: 10, // Max 10 requests per second
      message: 'Too many requests in a short time. Please slow down.',
      standardHeaders: false, // Don't expose burst limits
      legacyHeaders: false,
      handler: this.rateLimitHandler.bind(this)
    };

    if (this.redis) {
      // config.store = new RedisStore({
      //   client: this.redis,
      //   prefix: 'rl:burst:'
      // });
    }

    return rateLimit(config);
  }

  /**
   * Dynamic rate limiting based on user role
   */
  dynamicLimiter() {
    return (req, res, next) => {
      const userRole = req.user?.role || 'public';
      const limiter = this.createUserLimiter(userRole);
      limiter(req, res, next);
    };
  }

  /**
   * Custom rate limit handler with logging
   */
  rateLimitHandler(req, res) {
    // Log rate limit violation for security monitoring
    const violation = {
      timestamp: new Date().toISOString(),
      ip: this.getClientIP(req),
      userId: req.user?.id || 'anonymous',
      userAgent: req.headers['user-agent'],
      endpoint: req.path,
      method: req.method
    };

    console.warn('Rate limit exceeded:', violation);

    // Track repeated violations (potential attack)
    this.trackViolation(violation);

    res.status(429).json({
      error: 'Too many requests',
      message: res.locals.rateLimitMessage || 'Please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }

  /**
   * Track violations for security analysis
   */
  async trackViolation(violation) {
    if (!this.redis) return;

    const key = `violations:${violation.ip}`;
    const count = await this.redis.incr(key);
    
    // Set expiry on first violation
    if (count === 1) {
      await this.redis.expire(key, 3600); // 1 hour
    }

    // Alert on suspicious activity
    if (count > 10) {
      console.error('SECURITY ALERT: Repeated rate limit violations from', violation.ip);
      // Could trigger additional security measures here
    }
  }

  /**
   * Generate rate limit key
   */
  generateKey(req) {
    // Use user ID if authenticated, otherwise use IP
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${this.getClientIP(req)}`;
  }

  /**
   * Get client IP address (handles proxies)
   */
  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           req.ip;
  }

  /**
   * Skip rate limiting for health checks
   */
  skipHealthCheck(req) {
    return req.path === '/health' || req.path === '/api/health';
  }

  /**
   * Middleware to apply all rate limiters
   */
  applyAll() {
    return [
      this.createGlobalLimiter(),
      this.createBurstLimiter(),
      this.dynamicLimiter()
    ];
  }

  /**
   * Reset rate limits for a user (admin function)
   */
  async resetUserLimits(userId) {
    if (!this.redis) {
      throw new Error('Redis not configured');
    }

    const pattern = `rl:*:user:${userId}*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
      return { cleared: keys.length };
    }
    
    return { cleared: 0 };
  }

  /**
   * Get current rate limit status for user
   */
  async getRateLimitStatus(userId) {
    if (!this.redis) {
      return { available: true, message: 'Rate limiting not configured' };
    }

    const key = `rl:user:${userId}`;
    const count = await this.redis.get(key);
    const ttl = await this.redis.ttl(key);
    
    return {
      current: parseInt(count) || 0,
      limit: 60, // Default limit
      resetIn: ttl > 0 ? ttl : 0,
      available: !count || parseInt(count) < 60
    };
  }
}

module.exports = RateLimiter;