/**
 * State & Agent Exception Classes
 * Centralized state machine and agent exceptions for LEO Protocol
 *
 * Extracted from:
 * - lib/agents/venture-ceo-runtime.js
 * - lib/agents/base-sub-agent.js
 */

/**
 * VentureRequiredException - Thrown when agent is instantiated without ventureId
 * SD-HARDENING-V2-004: Legacy Mode Elimination
 * THE LAW: Every sub-agent MUST belong to a venture. NO EXCEPTIONS.
 */
export class VentureRequiredException extends Error {
  constructor(agentName) {
    super(`Venture governance required: Agent "${agentName}" cannot be instantiated without ventureId. Legacy mode has been eliminated.`);
    this.name = 'VentureRequiredException';
    this.isRetryable = false;
    this.agentName = agentName;
  }
}

/**
 * CircuitBreakerException - Thrown when iteration/loop limit exceeded
 * Industrial Hardening v3.0: Prevents runaway token consumption
 */
export class CircuitBreakerException extends Error {
  constructor(agentId, reason, iterationCount) {
    super(`Circuit breaker triggered for agent ${agentId}. Reason: ${reason}. Iterations: ${iterationCount}`);
    this.name = 'CircuitBreakerException';
    this.isRetryable = false;
    this.agentId = agentId;
    this.reason = reason;
    this.iterationCount = iterationCount;
  }
}

/**
 * UnauthorizedCapabilityError - Thrown when agent lacks required capability
 */
export class UnauthorizedCapabilityError extends Error {
  constructor(capability, agentId) {
    super(`Agent ${agentId} is not authorized to use capability: ${capability}`);
    this.name = 'UnauthorizedCapabilityError';
    this.capability = capability;
    this.agentId = agentId;
    this.isRetryable = false;
  }
}
