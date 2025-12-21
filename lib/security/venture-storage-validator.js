#!/usr/bin/env node

/**
 * Venture Storage Validator
 * Security utility for validating Supabase Storage paths against venture boundaries
 *
 * SECURITY CONTEXT: Supabase Storage relies on path-based software filtering only.
 * This validator provides defense-in-depth by enforcing venture isolation at the
 * application layer, preventing path traversal attacks where one venture could
 * access another's files.
 *
 * LEO Protocol - Sovereign Stress Test Mitigation
 *
 * @module lib/security/venture-storage-validator
 */

import { fileURLToPath } from 'url';

/**
 * SecurityError - Custom error for security violations
 * Non-retryable error that indicates a security policy violation
 *
 * Error Codes:
 * - PATH_TRAVERSAL: Attempt to escape storage path boundaries
 * - VENTURE_MISMATCH: Path belongs to a different venture
 * - INVALID_UUID: Malformed venture UUID format
 * - INVALID_PATH: Path format is invalid or empty
 * - DOUBLE_SLASH: Path contains double slashes (potential bypass attempt)
 */
export class SecurityError extends Error {
  /**
   * @param {string} message - Error description
   * @param {string} code - Error code for programmatic handling
   * @param {Object} details - Additional context for security audit
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.isRetryable = false;
    this.isSecurityViolation = true;
    this.details = {
      ...details,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Convert to JSON for logging
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      isRetryable: this.isRetryable,
      isSecurityViolation: this.isSecurityViolation
    };
  }
}

/**
 * VentureStorageValidator - Static utility class for storage path validation
 *
 * All methods are static as this is a pure validation utility with no state.
 * Provides defense-in-depth for Supabase Storage path-based access control.
 *
 * @example
 * // Validate a storage path belongs to expected venture
 * VentureStorageValidator.validateStoragePath(
 *   'ventures/abc123-uuid/documents/file.pdf',
 *   'abc123-uuid'
 * );
 *
 * @example
 * // Build a secure path with automatic validation
 * const path = VentureStorageValidator.buildSecurePath(
 *   'abc123-uuid',
 *   'documents',
 *   'subfolder',
 *   'file.pdf'
 * );
 * // Returns: 'ventures/abc123-uuid/documents/subfolder/file.pdf'
 */
export class VentureStorageValidator {
  /**
   * UUID v4 regex pattern for validation
   * Matches standard UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
   * @private
   */
  static UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Path traversal detection patterns
   * @private
   */
  static TRAVERSAL_PATTERNS = [
    /\.\./,           // Parent directory traversal
    /\/\//,           // Double slashes
    /%2e%2e/i,        // URL-encoded ..
    /%252e%252e/i,    // Double URL-encoded ..
    /\.%2e/i,         // Mixed encoding
    /%2e\./i,         // Mixed encoding
    /\0/,             // Null byte injection
    /%00/i            // URL-encoded null byte
  ];

  /**
   * Standard storage path prefix for ventures
   * @private
   */
  static VENTURE_PATH_PREFIX = 'ventures';

  /**
   * Validate that a storage path belongs to the expected venture
   *
   * @param {string} path - Storage path to validate
   * @param {string} expectedVentureId - Expected venture UUID
   * @throws {SecurityError} If path doesn't match venture or contains traversal
   * @returns {boolean} True if path is valid
   *
   * @example
   * VentureStorageValidator.validateStoragePath(
   *   'ventures/abc123-uuid/docs/file.pdf',
   *   'abc123-uuid'
   * ); // Returns true
   *
   * VentureStorageValidator.validateStoragePath(
   *   'ventures/other-uuid/docs/file.pdf',
   *   'abc123-uuid'
   * ); // Throws SecurityError with code VENTURE_MISMATCH
   */
  static validateStoragePath(path, expectedVentureId) {
    // Validate inputs
    if (!path || typeof path !== 'string') {
      VentureStorageValidator._logSecurityEvent('INVALID_PATH', {
        path,
        expectedVentureId,
        reason: 'Path is empty or not a string'
      });
      throw new SecurityError(
        'Storage path is required and must be a string',
        'INVALID_PATH',
        { path, expectedVentureId }
      );
    }

    if (!expectedVentureId || typeof expectedVentureId !== 'string') {
      VentureStorageValidator._logSecurityEvent('INVALID_PATH', {
        path,
        expectedVentureId,
        reason: 'Expected venture ID is empty or not a string'
      });
      throw new SecurityError(
        'Expected venture ID is required',
        'INVALID_PATH',
        { path, expectedVentureId }
      );
    }

    // Validate UUID format
    if (!VentureStorageValidator.isValidVentureUUID(expectedVentureId)) {
      VentureStorageValidator._logSecurityEvent('INVALID_UUID', {
        path,
        expectedVentureId,
        reason: 'Expected venture ID is not a valid UUID v4'
      });
      throw new SecurityError(
        `Invalid venture UUID format: ${expectedVentureId}`,
        'INVALID_UUID',
        { path, expectedVentureId }
      );
    }

    // Check for path traversal attempts
    VentureStorageValidator._detectTraversalAttempt(path, expectedVentureId);

    // Extract venture ID from path
    const extractedId = VentureStorageValidator.extractVentureIdFromPath(path);

    if (!extractedId) {
      VentureStorageValidator._logSecurityEvent('INVALID_PATH', {
        path,
        expectedVentureId,
        reason: 'Could not extract venture ID from path'
      });
      throw new SecurityError(
        `Cannot extract venture ID from path: ${path}`,
        'INVALID_PATH',
        { path, expectedVentureId }
      );
    }

    // Verify venture ID matches
    if (extractedId.toLowerCase() !== expectedVentureId.toLowerCase()) {
      VentureStorageValidator._logSecurityEvent('VENTURE_MISMATCH', {
        path,
        expectedVentureId,
        extractedVentureId: extractedId,
        reason: 'Path venture ID does not match expected venture'
      });
      throw new SecurityError(
        `Path belongs to venture ${extractedId}, not ${expectedVentureId}`,
        'VENTURE_MISMATCH',
        { path, expectedVentureId, extractedVentureId: extractedId }
      );
    }

    return true;
  }

  /**
   * Extract venture UUID from a storage path
   *
   * @param {string} path - Storage path (e.g., 'ventures/uuid/folder/file.pdf')
   * @returns {string|null} Extracted venture UUID or null if not found
   *
   * @example
   * VentureStorageValidator.extractVentureIdFromPath(
   *   'ventures/abc123-def4-5678-9abc-def012345678/docs/file.pdf'
   * ); // Returns 'abc123-def4-5678-9abc-def012345678'
   */
  static extractVentureIdFromPath(path) {
    if (!path || typeof path !== 'string') {
      return null;
    }

    // Normalize path separators
    const normalizedPath = path.replace(/\\/g, '/');

    // Expected format: ventures/{ventureId}/...
    const parts = normalizedPath.split('/').filter(p => p.length > 0);

    // Must have at least 'ventures' prefix and venture ID
    if (parts.length < 2) {
      return null;
    }

    // Check for ventures prefix
    if (parts[0].toLowerCase() !== VentureStorageValidator.VENTURE_PATH_PREFIX) {
      return null;
    }

    // Extract and validate venture ID (second segment)
    const potentialId = parts[1];

    if (VentureStorageValidator.isValidVentureUUID(potentialId)) {
      return potentialId.toLowerCase();
    }

    return null;
  }

  /**
   * Build a secure storage path with validation
   *
   * @param {string} ventureId - Venture UUID
   * @param {...string} pathSegments - Path segments (folders, filename)
   * @returns {string} Validated storage path
   * @throws {SecurityError} If ventureId is invalid or segments contain traversal
   *
   * @example
   * VentureStorageValidator.buildSecurePath(
   *   'abc123-def4-5678-9abc-def012345678',
   *   'documents',
   *   'reports',
   *   '2024-report.pdf'
   * );
   * // Returns: 'ventures/abc123-def4-5678-9abc-def012345678/documents/reports/2024-report.pdf'
   */
  static buildSecurePath(ventureId, ...pathSegments) {
    // Validate venture ID
    if (!VentureStorageValidator.isValidVentureUUID(ventureId)) {
      VentureStorageValidator._logSecurityEvent('INVALID_UUID', {
        ventureId,
        pathSegments,
        reason: 'Venture ID is not a valid UUID v4'
      });
      throw new SecurityError(
        `Invalid venture UUID format: ${ventureId}`,
        'INVALID_UUID',
        { ventureId, pathSegments }
      );
    }

    // Validate and sanitize each path segment
    const sanitizedSegments = [];

    for (const segment of pathSegments) {
      if (!segment || typeof segment !== 'string') {
        continue; // Skip empty segments
      }

      // Check for traversal in segment
      for (const pattern of VentureStorageValidator.TRAVERSAL_PATTERNS) {
        if (pattern.test(segment)) {
          VentureStorageValidator._logSecurityEvent('PATH_TRAVERSAL', {
            ventureId,
            segment,
            pathSegments,
            pattern: pattern.toString(),
            reason: 'Path segment contains traversal pattern'
          });
          throw new SecurityError(
            `Path segment contains disallowed pattern: ${segment}`,
            'PATH_TRAVERSAL',
            { ventureId, segment, pathSegments }
          );
        }
      }

      // Remove leading/trailing slashes from segment
      const cleanSegment = segment.replace(/^\/+|\/+$/g, '');

      if (cleanSegment.length > 0) {
        sanitizedSegments.push(cleanSegment);
      }
    }

    // Build final path
    const resultPath = [
      VentureStorageValidator.VENTURE_PATH_PREFIX,
      ventureId.toLowerCase(),
      ...sanitizedSegments
    ].join('/');

    return resultPath;
  }

  /**
   * Validate UUID v4 format
   *
   * @param {string} id - String to validate as UUID
   * @returns {boolean} True if valid UUID v4 format
   *
   * @example
   * VentureStorageValidator.isValidVentureUUID('abc12345-1234-4567-89ab-1234567890ab');
   * // Returns true
   *
   * VentureStorageValidator.isValidVentureUUID('not-a-uuid');
   * // Returns false
   */
  static isValidVentureUUID(id) {
    if (!id || typeof id !== 'string') {
      return false;
    }

    return VentureStorageValidator.UUID_PATTERN.test(id);
  }

  /**
   * Detect path traversal attempts and throw SecurityError
   * @private
   * @param {string} path - Path to check
   * @param {string} ventureId - Venture context for logging
   * @throws {SecurityError} If traversal pattern detected
   */
  static _detectTraversalAttempt(path, ventureId) {
    for (const pattern of VentureStorageValidator.TRAVERSAL_PATTERNS) {
      if (pattern.test(path)) {
        VentureStorageValidator._logSecurityEvent('PATH_TRAVERSAL', {
          path,
          ventureId,
          pattern: pattern.toString(),
          reason: 'Path contains traversal pattern'
        });

        // Determine specific error code for double slashes
        const code = pattern.toString().includes('//') ? 'DOUBLE_SLASH' : 'PATH_TRAVERSAL';

        throw new SecurityError(
          `Path traversal attempt detected in: ${path}`,
          code,
          { path, ventureId, detectedPattern: pattern.toString() }
        );
      }
    }
  }

  /**
   * Log security event for audit trail
   * @private
   * @param {string} eventType - Type of security event
   * @param {Object} details - Event details
   */
  static _logSecurityEvent(eventType, details) {
    const event = {
      type: 'SECURITY_VIOLATION',
      subType: eventType,
      source: 'VentureStorageValidator',
      timestamp: new Date().toISOString(),
      details
    };

    // Log to console for immediate visibility (production would send to SIEM)
    console.warn(`[SECURITY] ${eventType}:`, JSON.stringify(event, null, 2));

    // In production, this would also:
    // 1. Send to centralized logging (e.g., system_events table)
    // 2. Trigger security alerting for repeated violations
    // 3. Update rate limiting counters
  }

  /**
   * Batch validate multiple paths for a venture
   * Useful for bulk operations
   *
   * @param {string[]} paths - Array of storage paths
   * @param {string} expectedVentureId - Expected venture UUID
   * @returns {{ valid: string[], invalid: Array<{path: string, error: SecurityError}> }}
   *
   * @example
   * const results = VentureStorageValidator.batchValidate(
   *   [
   *     'ventures/abc-uuid/file1.pdf',
   *     'ventures/other-uuid/file2.pdf',
   *     'ventures/abc-uuid/../../../etc/passwd'
   *   ],
   *   'abc-uuid'
   * );
   * // results.valid = ['ventures/abc-uuid/file1.pdf']
   * // results.invalid = [{ path: '...', error: SecurityError }, ...]
   */
  static batchValidate(paths, expectedVentureId) {
    const valid = [];
    const invalid = [];

    for (const path of paths) {
      try {
        VentureStorageValidator.validateStoragePath(path, expectedVentureId);
        valid.push(path);
      } catch (error) {
        if (error instanceof SecurityError) {
          invalid.push({ path, error });
        } else {
          // Re-throw unexpected errors
          throw error;
        }
      }
    }

    return { valid, invalid };
  }

  /**
   * Sanitize a filename for safe storage
   * Removes or replaces potentially dangerous characters
   *
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   *
   * @example
   * VentureStorageValidator.sanitizeFilename('../../../etc/passwd');
   * // Returns 'etc_passwd'
   *
   * VentureStorageValidator.sanitizeFilename('my file (1).pdf');
   * // Returns 'my_file_1.pdf'
   */
  static sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      return 'unnamed_file';
    }

    // Remove path separators and dangerous patterns
    let sanitized = filename
      .replace(/\.\./g, '')           // Remove ..
      .replace(/[\/\\]/g, '_')        // Replace path separators
      .replace(/[<>:"|?*\x00-\x1f]/g, '') // Remove Windows invalid chars and control chars
      .replace(/\s+/g, '_')           // Replace whitespace with underscore
      .replace(/[()[\]{}]/g, '_')     // Replace brackets
      .replace(/_+/g, '_')            // Collapse multiple underscores
      .replace(/^_|_$/g, '');         // Trim leading/trailing underscores

    // Ensure filename is not empty after sanitization
    if (sanitized.length === 0) {
      return 'unnamed_file';
    }

    // Limit filename length (255 is common filesystem limit)
    if (sanitized.length > 255) {
      const ext = sanitized.split('.').pop();
      const base = sanitized.substring(0, 250 - ext.length);
      sanitized = `${base}.${ext}`;
    }

    return sanitized;
  }
}

// Default export
export default VentureStorageValidator;

// CLI interface for testing
const isMainModule = process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
   process.argv[1].endsWith('venture-storage-validator.js'));

if (isMainModule) {
  async function cli() {
    const command = process.argv[2];
    const arg1 = process.argv[3];
    const arg2 = process.argv[4];

    console.log('\nVenture Storage Validator - Security Utility\n');

    switch (command) {
      case 'validate':
        if (!arg1 || !arg2) {
          console.error('Usage: node venture-storage-validator.js validate <path> <ventureId>');
          process.exit(1);
        }
        try {
          VentureStorageValidator.validateStoragePath(arg1, arg2);
          console.log('Path is VALID for venture');
        } catch (error) {
          console.error('Path is INVALID:', error.message);
          console.error('Code:', error.code);
          process.exit(1);
        }
        break;

      case 'extract':
        if (!arg1) {
          console.error('Usage: node venture-storage-validator.js extract <path>');
          process.exit(1);
        }
        const extracted = VentureStorageValidator.extractVentureIdFromPath(arg1);
        if (extracted) {
          console.log('Extracted Venture ID:', extracted);
        } else {
          console.log('Could not extract venture ID from path');
        }
        break;

      case 'build':
        if (!arg1) {
          console.error('Usage: node venture-storage-validator.js build <ventureId> [segments...]');
          process.exit(1);
        }
        const segments = process.argv.slice(4);
        try {
          const builtPath = VentureStorageValidator.buildSecurePath(arg1, ...segments);
          console.log('Built Path:', builtPath);
        } catch (error) {
          console.error('Failed to build path:', error.message);
          process.exit(1);
        }
        break;

      case 'uuid':
        if (!arg1) {
          console.error('Usage: node venture-storage-validator.js uuid <id>');
          process.exit(1);
        }
        const isValid = VentureStorageValidator.isValidVentureUUID(arg1);
        console.log('Valid UUID:', isValid);
        break;

      case 'sanitize':
        if (!arg1) {
          console.error('Usage: node venture-storage-validator.js sanitize <filename>');
          process.exit(1);
        }
        const sanitized = VentureStorageValidator.sanitizeFilename(arg1);
        console.log('Sanitized:', sanitized);
        break;

      default:
        console.log(`
Usage:
  node venture-storage-validator.js <command> [args]

Commands:
  validate <path> <ventureId>   - Validate path belongs to venture
  extract <path>                - Extract venture ID from path
  build <ventureId> [segments]  - Build secure storage path
  uuid <id>                     - Validate UUID format
  sanitize <filename>           - Sanitize a filename

Examples:
  node venture-storage-validator.js validate "ventures/abc-123/file.pdf" "abc-123"
  node venture-storage-validator.js extract "ventures/abc-123/docs/file.pdf"
  node venture-storage-validator.js build "abc-123" "documents" "report.pdf"
  node venture-storage-validator.js uuid "abc12345-1234-4567-89ab-1234567890ab"
  node venture-storage-validator.js sanitize "../../../etc/passwd"
        `);
    }
  }

  cli().catch(console.error);
}
