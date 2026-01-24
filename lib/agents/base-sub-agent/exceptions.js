/**
 * Exception Classes for Base Sub-Agent
 * Extracted from lib/agents/base-sub-agent.js (SD-LEO-REFAC-BASE-AGENT-003)
 *
 * Responsibilities:
 * - Budget-related exception handling
 * - Venture governance exceptions
 */

/**
 * BudgetExhaustedException - Thrown when agent budget is depleted
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
