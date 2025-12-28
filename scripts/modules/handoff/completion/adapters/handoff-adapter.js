/**
 * Handoff Adapter
 *
 * SD-REFACTOR-VERIFY-001 Phase 1: Legacy Adapter
 *
 * Adapts ValidationOrchestrator callers to CompletionValidator.
 * Preserves existing interface while using new rule engine.
 *
 * @module completion/adapters/handoff-adapter
 */

import { validateForHandoff, validateCompletion } from '../CompletionValidator.js';

/**
 * Adapt legacy ValidationOrchestrator.validateGates() to CompletionValidator
 *
 * Legacy interface:
 *   const orchestrator = new ValidationOrchestrator(supabase);
 *   const result = await orchestrator.validateGates(gates, context);
 *
 * New interface:
 *   const result = await validateGatesLegacy(handoffType, sdId, supabase, context);
 *
 * @param {string} handoffType - Handoff type
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @param {Object} [context] - Additional context
 * @returns {Promise<Object>} Result in legacy format
 */
export async function validateGatesLegacy(handoffType, sdId, supabase, context = {}) {
  // Call new implementation
  const result = await validateForHandoff(sdId, handoffType, supabase, {
    debugDiagnostics: context.debug || false,
    ...context.options
  });

  // Transform to legacy format
  return transformToGatesFormat(result, handoffType);
}

/**
 * Transform ValidationResult to legacy ValidationOrchestrator format
 *
 * Legacy format:
 * {
 *   passed: boolean,
 *   totalScore: number,
 *   totalMaxScore: number,
 *   normalizedScore: number,
 *   gateCount: number,
 *   gateResults: { [gateName]: result },
 *   failedGate: string | null,
 *   issues: string[],
 *   warnings: string[]
 * }
 *
 * @private
 */
function transformToGatesFormat(result, handoffType) {
  const gateResults = {};
  let failedGate = null;

  for (const rule of result.ruleResults) {
    // Map rule IDs to gate names (add GATE_ prefix for compatibility)
    const gateName = rule.ruleId.startsWith('GATE_') ? rule.ruleId : `GATE_${rule.ruleId}`;

    gateResults[gateName] = {
      passed: rule.passed,
      score: rule.score,
      maxScore: rule.maxScore,
      issues: rule.issues || [],
      warnings: rule.warnings || [],
      details: rule.details || {}
    };

    if (!rule.passed && !failedGate) {
      failedGate = gateName;
    }
  }

  return {
    passed: result.isValid,
    totalScore: result.score,
    totalMaxScore: result.maxScore,
    normalizedScore: result.percentage,
    gateCount: result.ruleResults.length,
    gateResults,
    failedGate,
    issues: result.errors.map(e => e.message),
    warnings: result.warnings.map(w => w.message)
  };
}

/**
 * Create a legacy-compatible ValidationOrchestrator wrapper
 *
 * For code that instantiates ValidationOrchestrator directly:
 *   const orchestrator = new LegacyValidationOrchestrator(supabase, sdId, handoffType);
 *   const result = await orchestrator.validateAll();
 */
export class LegacyValidationOrchestrator {
  constructor(supabase, sdId, handoffType) {
    this.supabase = supabase;
    this.sdId = sdId;
    this.handoffType = handoffType;
  }

  async validateAll(context = {}) {
    return validateGatesLegacy(this.handoffType, this.sdId, this.supabase, context);
  }

  // Preserve validateGate for individual gate testing
  async validateGate(gateName, validator, context = {}) {
    // For individual gate testing, fall back to direct execution
    // This maintains compatibility with custom validators
    try {
      const result = await validator(context);
      return {
        passed: result.passed ?? result.pass ?? (result.score >= (result.max_score || 100)),
        score: result.score ?? 0,
        maxScore: result.max_score || result.maxScore || 100,
        issues: result.issues || [],
        warnings: result.warnings || [],
        details: result.details || result
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        maxScore: 100,
        issues: [`Validation error: ${error.message}`],
        warnings: [],
        error: error.message
      };
    }
  }
}

export default {
  validateGatesLegacy,
  LegacyValidationOrchestrator
};
