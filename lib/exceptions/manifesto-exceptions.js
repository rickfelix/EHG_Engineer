/**
 * Manifesto Exception Classes
 * Centralized manifesto mode exceptions for LEO Protocol
 *
 * Extracted from:
 * - lib/governance/manifesto-mode.js
 */

/**
 * ManifestoNotActiveError - Thrown when manifesto mode is not active
 */
export class ManifestoNotActiveError extends Error {
  constructor(message = 'Manifesto mode is not active') {
    super(`MANIFESTO INACTIVE: ${message}`);
    this.name = 'ManifestoNotActiveError';
    this.isRetryable = false;
  }
}

/**
 * ManifestoActivationError - Thrown when manifesto activation fails
 */
export class ManifestoActivationError extends Error {
  constructor(message, context = {}) {
    super(`MANIFESTO ACTIVATION FAILED: ${message}`);
    this.name = 'ManifestoActivationError';
    this.context = context;
    this.isRetryable = false;
  }
}

/**
 * ManifestoVersionMismatchError - Thrown when manifesto versions don't match
 */
export class ManifestoVersionMismatchError extends Error {
  constructor(expectedVersion, actualVersion) {
    super(`MANIFESTO VERSION MISMATCH: Expected v${expectedVersion}, got v${actualVersion}`);
    this.name = 'ManifestoVersionMismatchError';
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
    this.isRetryable = false;
  }
}
