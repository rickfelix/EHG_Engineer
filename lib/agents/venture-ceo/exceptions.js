/**
 * CEO Runtime Exception Classes
 * Custom exceptions for budget, capability, and governance violations
 *
 * Extracted from venture-ceo-runtime.js for modularity
 * SD-LEO-REFACTOR-VENTURE-CEO-001
 */

/**
 * Budget exhaustion exception
 * Thrown when agent/venture budget is depleted
 */
export class BudgetExhaustedException extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'BudgetExhaustedException';
    this.context = context;
    this.isRecoverable = false;
  }
}

/**
 * Budget configuration exception
 * Thrown when budget configuration is invalid or missing
 */
export class BudgetConfigurationException extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'BudgetConfigurationException';
    this.context = context;
    this.isRecoverable = true;
  }
}

/**
 * Circuit breaker exception
 * Thrown when loop detection triggers circuit breaker
 * INDUSTRIAL-HARDENING-v2.9.0: Loop Detection
 */
export class CircuitBreakerException extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'CircuitBreakerException';
    this.context = context;
    this.isRecoverable = false;
  }
}

/**
 * Unauthorized capability error
 * Thrown when agent attempts action without required capability
 */
export class UnauthorizedCapabilityError extends Error {
  constructor(capability, agentId) {
    super(`Agent ${agentId} lacks required capability: ${capability}`);
    this.name = 'UnauthorizedCapabilityError';
    this.capability = capability;
    this.agentId = agentId;
  }
}

/**
 * Business hypothesis validation error
 * SOVEREIGN SEAL v2.9.0: All business hypotheses must be validated
 */
export class BusinessHypothesisValidationError extends Error {
  constructor(message, validationErrors = []) {
    super(message);
    this.name = 'BusinessHypothesisValidationError';
    this.validationErrors = validationErrors;
  }
}
