/**
 * PathValidator Module
 * SD-PRE-EXEC-ANALYSIS-001
 *
 * Purpose: Security validation for file paths to prevent traversal attacks
 * and exclude sensitive files from analysis.
 *
 * CRITICAL: This module must be used BEFORE any file system access.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PathValidator class - Validates file paths for security
 */
export class PathValidator {
  constructor(projectRoot) {
    // Default to EHG_Engineer root if not specified
    this.projectRoot = projectRoot || path.resolve(__dirname, '../../..');

    // Allowed directories for analysis (whitelist)
    this.allowedDirectories = [
      'src',
      'components',
      'lib',
      'hooks',
      'utils',
      'pages',
      'app',
      'features',
      'services',
      'types',
      'scripts',
      'modules'
    ];

    // Sensitive file patterns (blacklist)
    this.sensitivePatterns = [
      /\.env/i,
      /credentials/i,
      /\.ssh/,
      /\.key$/i,
      /\.pem$/i,
      /\.cert$/i,
      /password/i,
      /secret/i,
      /token/i,
      /auth.*\.json$/i,
      /\.git\//,
      /node_modules\//,
      /\.next\//,
      /dist\//,
      /build\//,
      /coverage\//,
      /\.vscode\//,
      /\.idea\//
    ];

    // Audit log for blocked attempts
    this.auditLog = [];
  }

  /**
   * Validate a file path for security
   * @param {string} filePath - Path to validate
   * @returns {Object} { valid: boolean, reason?: string, resolvedPath?: string }
   */
  validate(filePath) {
    try {
      // Resolve to absolute path
      const resolvedPath = path.resolve(this.projectRoot, filePath);

      // Check 1: Path must be within project root (prevent traversal)
      if (!resolvedPath.startsWith(this.projectRoot)) {
        this.logBlockedAttempt(filePath, 'Path traversal attempt blocked');
        return {
          valid: false,
          reason: 'Path traversal blocked: path must be within project root',
          attemptedPath: filePath,
          resolvedPath: resolvedPath
        };
      }

      // Check 2: Check against sensitive patterns
      const relativePath = path.relative(this.projectRoot, resolvedPath);
      for (const pattern of this.sensitivePatterns) {
        if (pattern.test(relativePath)) {
          this.logBlockedAttempt(filePath, `Sensitive file pattern matched: ${pattern}`);
          return {
            valid: false,
            reason: `Sensitive file excluded: matches pattern ${pattern}`,
            attemptedPath: filePath,
            relativePath: relativePath
          };
        }
      }

      // Check 3: Verify path is in allowed directories (optional, for stricter security)
      const pathParts = relativePath.split(path.sep);
      const rootDir = pathParts[0];

      // If not in root directory whitelist, log warning (but don't block)
      if (rootDir && !this.allowedDirectories.includes(rootDir)) {
        console.warn(`⚠️  Path not in recommended directories: ${relativePath}`);
      }

      // All checks passed
      return {
        valid: true,
        resolvedPath: resolvedPath,
        relativePath: relativePath
      };

    } catch (error) {
      this.logBlockedAttempt(filePath, `Validation error: ${error.message}`);
      return {
        valid: false,
        reason: `Path validation error: ${error.message}`,
        attemptedPath: filePath
      };
    }
  }

  /**
   * Validate multiple paths
   * @param {string[]} filePaths - Array of paths to validate
   * @returns {Object} { valid: string[], invalid: Object[] }
   */
  validateBatch(filePaths) {
    const results = {
      valid: [],
      invalid: []
    };

    for (const filePath of filePaths) {
      const validation = this.validate(filePath);
      if (validation.valid) {
        results.valid.push(validation.resolvedPath);
      } else {
        results.invalid.push({
          path: filePath,
          reason: validation.reason
        });
      }
    }

    return results;
  }

  /**
   * Check if a path exists and is accessible
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>}
   */
  async exists(filePath) {
    const validation = this.validate(filePath);
    if (!validation.valid) {
      return false;
    }

    try {
      await fs.access(validation.resolvedPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a directory
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>}
   */
  async isDirectory(filePath) {
    const validation = this.validate(filePath);
    if (!validation.valid) {
      return false;
    }

    try {
      const stats = await fs.stat(validation.resolvedPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Log blocked access attempt for security auditing
   * @param {string} path - Attempted path
   * @param {string} reason - Reason for blocking
   */
  logBlockedAttempt(path, reason) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      attemptedPath: path,
      reason: reason
    };

    this.auditLog.push(logEntry);

    // Console warning for immediate visibility
    console.warn('🔒 PathValidator: Blocked access attempt');
    console.warn(`   Path: ${path}`);
    console.warn(`   Reason: ${reason}`);
  }

  /**
   * Get audit log of blocked attempts
   * @returns {Array} Audit log entries
   */
  getAuditLog() {
    return this.auditLog;
  }

  /**
   * Clear audit log
   */
  clearAuditLog() {
    this.auditLog = [];
  }

  /**
   * Add custom sensitive pattern
   * @param {RegExp} pattern - Pattern to add
   */
  addSensitivePattern(pattern) {
    if (pattern instanceof RegExp) {
      this.sensitivePatterns.push(pattern);
    } else {
      throw new Error('Sensitive pattern must be a RegExp');
    }
  }

  /**
   * Add custom allowed directory
   * @param {string} directory - Directory name to allow
   */
  addAllowedDirectory(directory) {
    if (!this.allowedDirectories.includes(directory)) {
      this.allowedDirectories.push(directory);
    }
  }
}

/**
 * Create a default PathValidator instance for EHG_Engineer
 * @returns {PathValidator}
 */
export function createDefaultValidator() {
  const ehgEngineerRoot = path.resolve(__dirname, '../../..');
  return new PathValidator(ehgEngineerRoot);
}

/**
 * Create a PathValidator for EHG business application
 * @returns {PathValidator}
 */
export function createEHGValidator() {
  const ehgRoot = path.resolve(__dirname, '../../../../ehg');
  return new PathValidator(ehgRoot);
}

export default PathValidator;
