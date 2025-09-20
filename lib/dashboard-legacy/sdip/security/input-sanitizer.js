/**
 * Input Sanitization for SDIP
 * Implements Security Sub-Agent sanitization requirements
 * Prevents XSS, SQL injection, and other attacks
 * Created: 2025-01-03
 */

const validator = require('validator');
const DOMPurify = require('isomorphic-dompurify');

class InputSanitizer {
  constructor() {
    // Define sanitization rules per Security Sub-Agent recommendations
    this.rules = {
      chairman_input: {
        maxLength: 10000,
        allowedTags: [], // Strip all HTML
        escapeSQL: true,
        escapeJS: true,
        trimWhitespace: true
      },
      intent_summary: {
        maxLength: 500,
        allowedTags: ['b', 'i', 'em', 'strong'],
        escapeSQL: true,
        escapeJS: true,
        trimWhitespace: true
      },
      submission_title: {
        maxLength: 200,
        allowedTags: [],
        escapeSQL: true,
        escapeJS: true,
        trimWhitespace: true
      },
      pacer_analysis: {
        backendOnly: true, // Never send to client
        encrypted: true,   // Field-level encryption
        maxSize: 50000,    // JSON size limit
        validateJSON: true
      },
      screenshot_url: {
        maxLength: 500,
        validateURL: true,
        allowedProtocols: ['https'],
        escapeSQL: true
      },
      client_summary: {
        maxLength: 1000,
        allowedTags: ['b', 'i', 'em', 'strong', 'ul', 'li', 'p'],
        escapeSQL: true,
        escapeJS: true,
        trimWhitespace: true
      }
    };
  }

  /**
   * Main sanitization method
   */
  sanitize(fieldName, value) {
    if (!value) return null;

    const rule = this.rules[fieldName];
    if (!rule) {
      // Unknown field - apply strictest rules
      return this.strictSanitize(value);
    }

    // Backend-only fields should never be processed from client
    if (rule.backendOnly) {
      throw new Error(`Field ${fieldName} cannot be set from client`);
    }

    let sanitized = value;

    // Step 1: Length check
    if (rule.maxLength) {
      sanitized = this.enforceMaxLength(sanitized, rule.maxLength);
    }

    // Step 2: Whitespace trimming
    if (rule.trimWhitespace) {
      sanitized = sanitized.trim();
    }

    // Step 3: HTML sanitization
    if (rule.allowedTags !== undefined) {
      sanitized = this.sanitizeHTML(sanitized, rule.allowedTags);
    }

    // Step 4: SQL escape
    if (rule.escapeSQL) {
      sanitized = this.escapeSQLInjection(sanitized);
    }

    // Step 5: JavaScript escape
    if (rule.escapeJS) {
      sanitized = this.escapeJavaScript(sanitized);
    }

    // Step 6: URL validation
    if (rule.validateURL) {
      sanitized = this.validateAndSanitizeURL(sanitized, rule.allowedProtocols);
    }

    // Step 7: JSON validation
    if (rule.validateJSON) {
      sanitized = this.validateJSON(sanitized, rule.maxSize);
    }

    return sanitized;
  }

  /**
   * Sanitize entire request body
   */
  sanitizeRequest(body) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(body)) {
      try {
        // Check for nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          sanitized[key] = this.sanitizeObject(value, key);
        } else if (Array.isArray(value)) {
          sanitized[key] = value.map(item => 
            typeof item === 'string' ? this.sanitize(key, item) : item
          );
        } else {
          sanitized[key] = this.sanitize(key, value);
        }
      } catch (error) {
        throw new Error(`Sanitization failed for field ${key}: ${error.message}`);
      }
    }

    return sanitized;
  }

  /**
   * Enforce maximum length
   */
  enforceMaxLength(value, maxLength) {
    if (typeof value !== 'string') return value;
    if (value.length > maxLength) {
      console.warn(`Input truncated: field exceeded ${maxLength} characters`);
      return value.substring(0, maxLength);
    }
    return value;
  }

  /**
   * HTML sanitization using DOMPurify
   */
  sanitizeHTML(value, allowedTags) {
    if (typeof value !== 'string') return value;
    
    if (allowedTags.length === 0) {
      // Strip all HTML
      return DOMPurify.sanitize(value, { ALLOWED_TAGS: [] });
    }
    
    // Allow only specific tags
    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: [], // No attributes allowed
      KEEP_CONTENT: true
    });
  }

  /**
   * SQL injection prevention
   */
  escapeSQLInjection(value) {
    if (typeof value !== 'string') return value;
    
    // Escape SQL special characters
    return value
      .replace(/'/g, "''")  // Escape single quotes
      .replace(/"/g, '""')  // Escape double quotes
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/\0/g, '\\0') // Null bytes
      .replace(/\n/g, '\\n') // Newlines
      .replace(/\r/g, '\\r') // Carriage returns
      .replace(/\x1a/g, '\\Z'); // Substitute character
  }

  /**
   * JavaScript injection prevention
   */
  escapeJavaScript(value) {
    if (typeof value !== 'string') return value;
    
    return value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .replace(/`/g, '&#x60;')
      .replace(/=/g, '&#x3D;');
  }

  /**
   * URL validation and sanitization
   */
  validateAndSanitizeURL(value, allowedProtocols = ['https']) {
    if (typeof value !== 'string') return null;
    
    // Validate URL format
    if (!validator.isURL(value, {
      protocols: allowedProtocols,
      require_protocol: true,
      require_valid_protocol: true,
      require_host: true,
      require_port: false,
      allow_fragments: false,
      allow_query_components: true
    })) {
      throw new Error('Invalid URL format');
    }

    // Additional checks for malicious patterns
    const suspiciousPatterns = [
      'javascript:',
      'data:',
      'vbscript:',
      'file:',
      'about:',
      '<script',
      'onclick',
      'onerror'
    ];

    const lowerValue = value.toLowerCase();
    for (const pattern of suspiciousPatterns) {
      if (lowerValue.includes(pattern)) {
        throw new Error(`Suspicious URL pattern detected: ${pattern}`);
      }
    }

    return value;
  }

  /**
   * JSON validation
   */
  validateJSON(value, maxSize) {
    if (typeof value === 'string') {
      // Check size before parsing
      if (value.length > maxSize) {
        throw new Error(`JSON exceeds maximum size of ${maxSize} bytes`);
      }

      try {
        value = JSON.parse(value);
      } catch (error) {
        throw new Error('Invalid JSON format');
      }
    }

    // Recursively sanitize JSON object
    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value);
    }

    return value;
  }

  /**
   * Sanitize nested objects
   */
  sanitizeObject(obj, parentKey = '') {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Prevent prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      if (typeof value === 'string') {
        // Apply parent key rules or strict sanitization
        const fieldName = parentKey ? `${parentKey}.${key}` : key;
        sanitized[key] = this.rules[fieldName] 
          ? this.sanitize(fieldName, value)
          : this.strictSanitize(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value, key);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Strict sanitization for unknown fields
   */
  strictSanitize(value) {
    if (typeof value !== 'string') return value;
    
    // Apply all sanitization methods
    value = this.enforceMaxLength(value, 1000);
    value = this.sanitizeHTML(value, []);
    value = this.escapeSQLInjection(value);
    value = this.escapeJavaScript(value);
    
    return value.trim();
  }

  /**
   * Express middleware for request sanitization
   */
  middleware() {
    return (req, res, next) => {
      try {
        // Sanitize body
        if (req.body) {
          req.body = this.sanitizeRequest(req.body);
        }

        // Sanitize query parameters
        if (req.query) {
          for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
              req.query[key] = this.strictSanitize(value);
            }
          }
        }

        // Sanitize URL parameters
        if (req.params) {
          for (const [key, value] of Object.entries(req.params)) {
            if (typeof value === 'string') {
              req.params[key] = this.strictSanitize(value);
            }
          }
        }

        next();
      } catch (error) {
        res.status(400).json({
          error: 'Input validation failed',
          details: error.message
        });
      }
    };
  }
}

module.exports = InputSanitizer;