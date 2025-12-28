/**
 * Budget Exception Classes
 * Centralized budget-related exceptions for LEO Protocol
 *
 * Extracted from:
 * - lib/agents/venture-ceo-runtime.js
 * - lib/agents/base-sub-agent.js
 * - lib/governance/crew-governance-wrapper.js
 */

/**
 * BudgetExhaustedException - Thrown when agent budget reaches zero
 * Non-retryable error that halts agent execution immediately
 * ABSOLUTE kill switch - no agent can execute if budget is zero
 */
export class BudgetExhaustedException extends Error {
  constructor(agentId, ventureId, budgetRemaining) {
    super(`Budget exhausted for agent ${agentId} (venture: ${ventureId}). Remaining: ${budgetRemaining}`);
    this.name = 'BudgetExhaustedException';
    this.isRetryable = false;
    this.agentId = agentId;
    this.ventureId = ventureId;
    this.budgetRemaining = budgetRemaining;
  }
}

/**
 * BudgetConfigurationException - Thrown when budget tracking is not configured
 * Industrial Hardening v3.0: Fail-closed behavior - no budget record means HALT
 * NON-RETRYABLE - requires database configuration to resolve
 */
export class BudgetConfigurationException extends Error {
  constructor(agentId, ventureId, reason) {
    super(`Budget configuration missing for agent ${agentId} (venture: ${ventureId}). Reason: ${reason}`);
    this.name = 'BudgetConfigurationException';
    this.isRetryable = false;
    this.agentId = agentId;
    this.ventureId = ventureId;
    this.reason = reason;
  }
}

/**
 * BudgetExhaustedError - Alternative budget exhaustion error (governance variant)
 * Used by crew-governance-wrapper for venture-level budget tracking
 */
export class BudgetExhaustedError extends Error {
  constructor(ventureId, budgetRemaining) {
    super(`BUDGET EXHAUSTED: Venture ${ventureId} has ${budgetRemaining} tokens remaining`);
    this.name = 'BudgetExhaustedError';
    this.ventureId = ventureId;
    this.budgetRemaining = budgetRemaining;
    this.isRetryable = false;
  }
}
