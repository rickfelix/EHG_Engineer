/**
 * Security Exception Classes
 * Centralized security exceptions for LEO Protocol
 *
 * Extracted from:
 * - lib/security/venture-storage-validator.js
 */

/**
 * SecurityError - Base class for security-related errors
 * Used for access violations, permission issues, and security boundary breaches
 */
export class SecurityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SecurityError';
    this.details = details;
    this.isRetryable = false;
  }
}

/**
 * AccessDeniedError - Thrown when access to a resource is denied
 */
export class AccessDeniedError extends SecurityError {
  constructor(resource, userId, reason) {
    super(`Access denied to ${resource} for user ${userId}: ${reason}`);
    this.name = 'AccessDeniedError';
    this.resource = resource;
    this.userId = userId;
    this.reason = reason;
  }
}

/**
 * DataIntegrityError - Thrown when data integrity check fails
 */
export class DataIntegrityError extends SecurityError {
  constructor(entityType, entityId, expectedHash, actualHash) {
    super(`Data integrity violation for ${entityType}:${entityId}. Expected: ${expectedHash}, Got: ${actualHash}`);
    this.name = 'DataIntegrityError';
    this.entityType = entityType;
    this.entityId = entityId;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}
