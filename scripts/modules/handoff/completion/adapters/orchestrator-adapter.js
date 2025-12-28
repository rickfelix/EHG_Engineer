/**
 * Orchestrator Adapter
 *
 * SD-REFACTOR-VERIFY-001 Phase 1: Legacy Adapter
 *
 * Adapts OrchestratorCompletionGuardian callers to CompletionValidator.
 * Preserves existing function signatures while delegating to new implementation.
 *
 * @module completion/adapters/orchestrator-adapter
 */

import { validateOrchestratorCompletion, validateCompletion } from '../CompletionValidator.js';

/**
 * Adapt legacy guardian validate() call to CompletionValidator
 *
 * Legacy interface:
 *   const guardian = new OrchestratorCompletionGuardian(sdId);
 *   const result = await guardian.validate();
 *
 * New interface:
 *   const result = await validateOrchestratorLegacy(sdId, supabase);
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @param {Object} [options] - Options
 * @returns {Promise<Object>} Result in legacy format
 */
export async function validateOrchestratorLegacy(sdId, supabase, options = {}) {
  // Call new implementation
  const result = await validateOrchestratorCompletion(sdId, supabase, options);

  // Transform to legacy format
  return transformToLegacyFormat(result, sdId);
}

/**
 * Transform ValidationResult to legacy OrchestratorCompletionGuardian format
 *
 * Legacy format:
 * {
 *   canComplete: boolean,
 *   readyForAutoComplete: boolean,
 *   validationResults: Array<{check, passed, message}>,
 *   missingArtifacts: string[],
 *   summary: { ... }
 * }
 *
 * @private
 */
function transformToLegacyFormat(result, sdId) {
  const validationResults = result.ruleResults.map(r => ({
    check: r.ruleId,
    passed: r.passed,
    message: r.passed
      ? `${r.ruleName} validated`
      : r.issues?.[0] || `${r.ruleName} failed`
  }));

  const missingArtifacts = result.errors
    .filter(e => e.message.includes('not found') || e.message.includes('missing'))
    .map(e => e.message);

  return {
    canComplete: result.isValid,
    readyForAutoComplete: result.isValid && result.warnings.length === 0,
    score: result.percentage,
    validationResults,
    missingArtifacts,
    summary: {
      sdId,
      passed: result.isValid,
      score: result.percentage,
      threshold: result.threshold,
      errors: result.errors.length,
      warnings: result.warnings.length,
      rulesExecuted: result.metadata.rulesExecuted,
      executionTimeMs: result.metadata.executionTimeMs
    }
  };
}

/**
 * Create a legacy-compatible guardian class wrapper
 *
 * For code that instantiates OrchestratorCompletionGuardian:
 *   const guardian = new LegacyGuardianWrapper(sdId, supabase);
 *   const result = await guardian.validate();
 */
export class LegacyGuardianWrapper {
  constructor(sdId, supabase) {
    this.sdId = sdId;
    this.supabase = supabase;
  }

  async validate() {
    return validateOrchestratorLegacy(this.sdId, this.supabase);
  }
}

export default {
  validateOrchestratorLegacy,
  LegacyGuardianWrapper
};
