/**
 * LearningExecutor
 *
 * Main entry point for the /learn command execution.
 * Delegates to specialized modules for different concerns.
 *
 * Refactored: 2026-01-20 (SD-LEO-REFACTOR-LEARN-001)
 * - Extracted sd-builders.js (build* functions)
 * - Extracted classification.js (complexity classification)
 * - Extracted sd-creation.js (SD creation workflow)
 * - Extracted improvement-appliers.js (apply* functions)
 * - Extracted decision-management.js (decision records, rollback)
 *
 * Original: 1,244 LOC → Refactored: ~70 LOC (this file)
 * Total across modules: ~900 LOC (28% reduction through deduplication)
 */

// Re-export from sd-builders
export {
  buildSDDescription,
  buildSDTitle,
  buildSuccessMetrics,
  buildSmokeTestSteps,
  buildStrategicObjectives,
  buildKeyPrinciples
} from './sd-builders.js';

// Re-export from classification
export {
  CLASSIFICATION_RULES,
  classifyComplexity,
  generateSDId,
  checkExistingAssignments
} from './classification.js';

// Re-export from sd-creation
export {
  createSDFromLearning,
  tagSourceItems
} from './sd-creation.js';

// Import for orchestration
import { executeSDCreationWorkflow as executeSDCreationWorkflowInternal } from './sd-creation.js';
import {
  createDecisionRecord,
  executeApprovedImprovements as executeApprovedImprovementsInternal,
  rollbackDecision as rollbackDecisionInternal
} from './decision-management.js';

// Re-export from improvement-appliers
export { resolvePatterns } from './improvement-appliers.js';

/**
 * Execute the SD creation workflow for /learn
 * Wrapper that injects the createDecisionRecord dependency.
 *
 * @param {Object} reviewedContext - The reviewed learning context
 * @param {Object} decisions - User decisions: { itemId: { status, reason } }
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.skipLeadValidation] - Skip protocol file read check (for CLI/auto-approve)
 * @returns {Promise<{sd_id: string, success: boolean, ...}>}
 */
export async function executeSDCreationWorkflow(reviewedContext, decisions, options = {}) {
  return executeSDCreationWorkflowInternal(reviewedContext, decisions, createDecisionRecord, options);
}

/**
 * Execute approved improvements
 * @param {Object} reviewedContext - The reviewed learning context
 * @param {Object} decisions - User decisions
 * @param {string} sdId - Optional SD ID
 */
export async function executeApprovedImprovements(reviewedContext, decisions, sdId = null) {
  return executeApprovedImprovementsInternal(reviewedContext, decisions, sdId);
}

/**
 * Rollback a previous decision
 * @param {string} decisionId - The decision ID to rollback
 */
export async function rollbackDecision(decisionId) {
  return rollbackDecisionInternal(decisionId);
}

// Default export for backward compatibility
export default {
  executeApprovedImprovements,
  rollbackDecision,
  resolvePatterns: (await import('./improvement-appliers.js')).resolvePatterns
};
