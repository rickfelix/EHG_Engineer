/**
 * Governance Exception Classes
 * Centralized governance/halt exceptions for LEO Protocol
 *
 * Extracted from:
 * - lib/governance/hard-halt-protocol.js
 * - lib/governance/crew-governance-wrapper.js
 * - lib/governance/four-oaths-enforcement.js
 */

/**
 * HardHaltError - Base error for hard halt system
 */
export class HardHaltError extends Error {
  constructor(code, message, context = {}) {
    super(`HARD HALT [${code}]: ${message}`);
    this.name = 'HardHaltError';
    this.code = code;
    this.context = context;
  }
}

/**
 * UnauthorizedHaltError - User not authorized to trigger halt
 */
export class UnauthorizedHaltError extends HardHaltError {
  constructor(userId) {
    super('UNAUTHORIZED', `User ${userId} is not authorized to trigger Hard Halt`);
    this.userId = userId;
  }
}

/**
 * AlreadyHaltedError - System is already in halt state
 */
export class AlreadyHaltedError extends HardHaltError {
  constructor(haltedAt) {
    super('ALREADY_HALTED', `System is already in Hard Halt state since ${haltedAt}`);
    this.haltedAt = haltedAt;
  }
}

/**
 * NotHaltedError - Cannot restore when not halted
 */
export class NotHaltedError extends HardHaltError {
  constructor() {
    super('NOT_HALTED', 'Cannot restore - system is not in Hard Halt state');
  }
}

/**
 * CrewGovernanceViolationError - Governance policy violation
 */
export class CrewGovernanceViolationError extends Error {
  constructor(code, message, context = {}) {
    super(`GOVERNANCE VIOLATION [${code}]: ${message}`);
    this.name = 'CrewGovernanceViolationError';
    this.code = code;
    this.context = context;
    this.isRetryable = false;
  }
}

/**
 * OathViolationError - Base error for Four Oaths violations
 */
export class OathViolationError extends Error {
  constructor(oath, code, message, context = {}) {
    super(`OATH VIOLATION [${oath}][${code}]: ${message}`);
    this.name = 'OathViolationError';
    this.oath = oath;
    this.code = code;
    this.context = context;
    this.isCritical = true;
  }
}

/**
 * TransparencyViolation - Transparency oath violation
 */
export class TransparencyViolation extends OathViolationError {
  constructor(message, context) {
    super('TRANSPARENCY', 'LOGGING_INCOMPLETE', message, context);
  }
}

/**
 * BoundaryViolation - Boundary oath violation
 */
export class BoundaryViolation extends OathViolationError {
  constructor(message, context) {
    super('BOUNDARIES', 'AUTHORITY_EXCEEDED', message, context);
  }
}

/**
 * EscalationViolation - Escalation integrity oath violation
 */
export class EscalationViolation extends OathViolationError {
  constructor(message, context) {
    super('ESCALATION_INTEGRITY', 'ESCALATION_SUPPRESSED', message, context);
  }
}

/**
 * DeceptionViolation - Non-deception oath violation
 */
export class DeceptionViolation extends OathViolationError {
  constructor(message, context) {
    super('NON_DECEPTION', 'CONFIDENCE_MISREPRESENTED', message, context);
  }
}
