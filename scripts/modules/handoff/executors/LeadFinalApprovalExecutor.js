/**
 * LeadFinalApprovalExecutor - Executes LEAD-FINAL-APPROVAL handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * REFACTORED: This file is now a thin wrapper around the domain modules.
 * See scripts/modules/handoff/executors/lead-final-approval/ for the extracted domain architecture.
 *
 * Domains:
 * - gates.js: Gate validator definitions
 * - helpers.js: Helper methods (parent completion, learning items, session claims)
 * - remediations.js: Remediation messages for failed gates
 * - index.js: Main orchestrator with re-exports
 *
 * This executor handles the final step of the SD lifecycle:
 * - Validates PLAN-TO-LEAD handoff was accepted
 * - Confirms all user stories are complete
 * - Verifies retrospective exists and passed quality gate
 * - Transitions SD from 'pending_approval' → 'completed'
 * - Records the completion handoff
 */

// Re-export everything from the domain modules for backward compatibility
export {
  LeadFinalApprovalExecutor,
  getRequiredGates,
  checkAndCompleteParentSD,
  recordFailedCompletion,
  resolveLearningItems,
  releaseSessionClaim,
  getRemediation,
  REMEDIATIONS
} from './lead-final-approval/index.js';

export { default } from './lead-final-approval/index.js';
