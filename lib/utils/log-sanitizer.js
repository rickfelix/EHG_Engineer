/**
 * Log Sanitizer Utility
 * Redacts sensitive information from logs in development environment
 * Maintains debugging capability while improving security
 */

class LogSanitizer {
  constructor() {
    // Patterns for sensitive data
    this.sensitivePatterns = {
      email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
      token: /(Bearer\s+)?([a-zA-Z0-9_-]{20,}|sk_[a-zA-Z0-9]{32,}|pk_[a-zA-Z0-9]{32,})/gi,
      apiKey: /(api[_-]?key|apikey|api_secret)[\s:="']*([a-zA-Z0-9_-]{20,})/gi,
      password: /(password|passwd|pwd)[\s:="']*([^\s,}"']{8,})/gi,
      jwt: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
      creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      phoneNumber: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      supabaseUrl: /(https:\/\/[a-z0-9]+\.supabase\.co)/gi,
      databaseUrl: /(postgres|postgresql|mysql|mongodb):\/\/[^@]+@[^\s]+/gi
    };

    // Redaction levels
    this.levels = {
      FULL: 'full',        // Complete redaction
      PARTIAL: 'partial',  // Show first/last few characters
      MASKED: 'masked'     // Replace with asterisks
    };

    // Default redaction level
    this.defaultLevel = process.env.LOG_REDACTION_LEVEL || this.levels.PARTIAL;
  }

  /**
   * Sanitize a log message or object
   */
  sanitize(input, level = this.defaultLevel) {
    if (typeof input === 'string') {
      return this.sanitizeString(input, level);
    } else if (typeof input === 'object' && input !== null) {
      return this.sanitizeObject(input, level);
    }
    return input;
  }

  /**
   * Sanitize a string
   */
  sanitizeString(str, level) {
    let sanitized = str;

    // Email addresses
    sanitized = sanitized.replace(this.sensitivePatterns.email, (match) => 
      this.redact(match, 'email', level)
    );

    // Tokens and API keys
    sanitized = sanitized.replace(this.sensitivePatterns.token, (match, bearer, token) => 
      bearer ? `${bearer}${this.redact(token || match, 'token', level)}` : this.redact(match, 'token', level)
    );

    sanitized = sanitized.replace(this.sensitivePatterns.apiKey, (match, key, value) => 
      `${key}=${this.redact(value, 'apiKey', level)}`
    );

    // Passwords
    sanitized = sanitized.replace(this.sensitivePatterns.password, (match, key, value) => 
      `${key}=${this.redact(value, 'password', level)}`
    );

    // JWTs
    sanitized = sanitized.replace(this.sensitivePatterns.jwt, (match) => 
      this.redact(match, 'jwt', level)
    );

    // Credit cards
    sanitized = sanitized.replace(this.sensitivePatterns.creditCard, (match) => 
      this.redact(match, 'creditCard', level)
    );

    // Database URLs
    sanitized = sanitized.replace(this.sensitivePatterns.databaseUrl, (match) => 
      this.redact(match, 'databaseUrl', level)
    );

    return sanitized;
  }

  /**
   * Sanitize an object recursively
   */
  sanitizeObject(obj, level, depth = 0) {
    // Prevent infinite recursion
    if (depth > 10) return '[Max depth exceeded]';

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item, level));
    }

    const sanitized = {};
    const sensitiveKeys = [
      'password', 'passwd', 'pwd', 'secret', 'token', 
      'apiKey', 'api_key', 'apiSecret', 'api_secret',
      'authorization', 'auth', 'credentials', 'privateKey',
      'private_key', 'email', 'ssn', 'creditCard', 'credit_card'
    ];

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Check if key is sensitive
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive.toLowerCase()))) {
        sanitized[key] = this.redact(value, key, level);
      } else if (typeof value === 'string') {
        // Check string content for sensitive patterns
        sanitized[key] = this.sanitizeString(value, level);
      } else if (typeof value === 'object' && value !== null) {
        // Recurse for nested objects
        sanitized[key] = this.sanitizeObject(value, level, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Redact a value based on type and level
   */
  redact(value, type, level) {
    if (value === null || value === undefined) return value;
    
    const str = String(value);
    const len = str.length;

    switch (level) {
      case this.levels.FULL:
        return `[REDACTED:${type}]`;
      
      case this.levels.PARTIAL:
        if (len <= 4) {
          return '*'.repeat(len);
        }
        if (type === 'email') {
          const parts = str.split('@');
          if (parts.length === 2) {
            return `${parts[0][0]}***@***.${parts[1].split('.').pop()}`;
          }
        }
        if (type === 'creditCard') {
          return str.replace(/\d/g, '*').replace(/(\*{4})$/g, str.slice(-4));
        }
        // Show first 3 and last 2 characters for most types
        return `${str.slice(0, 3)}${'*'.repeat(Math.max(len - 5, 3))}${str.slice(-2)}`;
      
      case this.levels.MASKED:
        return '*'.repeat(Math.min(len, 20));
      
      default:
        return `[${type.toUpperCase()}]`;
    }
  }

  /**
   * Create a safe console.log wrapper
   */
  createSafeLogger(level = this.defaultLevel) {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const sanitizer = this;

    return {
      log: function(...args) {
        const sanitizedArgs = args.map(arg => sanitizer.sanitize(arg, level));
        originalLog.apply(console, sanitizedArgs);
      },
      error: function(...args) {
        const sanitizedArgs = args.map(arg => sanitizer.sanitize(arg, level));
        originalError.apply(console, sanitizedArgs);
      },
      warn: function(...args) {
        const sanitizedArgs = args.map(arg => sanitizer.sanitize(arg, level));
        originalWarn.apply(console, sanitizedArgs);
      },
      // Development mode - show full logs with warning
      debug: function(...args) {
        if (process.env.NODE_ENV === 'development') {
          originalLog.apply(console, ['🔒 [DEV-DEBUG]', ...args]);
        } else {
          const sanitizedArgs = args.map(arg => sanitizer.sanitize(arg, level));
          originalLog.apply(console, ['[DEBUG]', ...sanitizedArgs]);
        }
      }
    };
  }
}

// Export singleton instance
const logSanitizer = new LogSanitizer();

// Export safe logger
const safeConsole = logSanitizer.createSafeLogger();

module.exports = {
  LogSanitizer,
  logSanitizer,
  safeConsole,
  sanitize: (input, level) => logSanitizer.sanitize(input, level)
};