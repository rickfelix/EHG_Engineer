/**
 * CompletionValidator Facade
 *
 * SD-REFACTOR-VERIFY-001 Phase 1: Main Entry Point
 *
 * Single validateCompletion(input) API for all handoff verification.
 * Orchestrates VerificationRules engine and normalizes results.
 *
 * @module completion/CompletionValidator
 */

import { createValidationInput, validateInputCompleteness, DEFAULT_OPTIONS } from './ValidationInput.js';
import { executeRules, getRulesForHandoff, RULE_ORDER } from './VerificationRules.js';

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed (all rules passed and score >= threshold)
 * @property {number} score - Total score achieved
 * @property {number} maxScore - Maximum possible score
 * @property {number} percentage - Score as percentage (0-100)
 * @property {Array<{code: string, message: string, context?: Object}>} errors - Blocking errors
 * @property {Array<{code: string, message: string, context?: Object}>} warnings - Non-blocking warnings
 * @property {Object} ruleResults - Per-rule results for diagnostics
 * @property {Object} metadata - Execution metadata
 */

/**
 * Score thresholds per handoff type
 */
export const SCORE_THRESHOLDS = {
  'LEAD-TO-PLAN': 85,
  'PLAN-TO-EXEC': 85,
  'EXEC-TO-PLAN': 85,
  'PLAN-TO-LEAD': 85,
  'ORCHESTRATOR_COMPLETION': 90
};

/**
 * Main validation function - canonical interface
 *
 * @param {Object} rawInput - Input from any caller (will be normalized)
 * @returns {Promise<ValidationResult>} Deterministic validation result
 */
export async function validateCompletion(rawInput) {
  const startTime = Date.now();

  // Normalize input
  let input;
  try {
    input = createValidationInput(rawInput);
  } catch (error) {
    return createErrorResult('INPUT_VALIDATION_FAILED', error.message);
  }

  // Validate input completeness
  const completeness = validateInputCompleteness(input);
  if (!completeness.valid) {
    return createErrorResult(
      'MISSING_REQUIRED_FIELDS',
      `Missing required fields: ${completeness.missing.join(', ')}`
    );
  }

  // Load SD data if not provided
  if (!input.sd && input.supabase) {
    const loadResult = await loadSDData(input);
    if (!loadResult.success) {
      return createErrorResult('SD_LOAD_FAILED', loadResult.error);
    }
    input.sd = loadResult.sd;
    input.prd = loadResult.prd;
    input.userStories = loadResult.userStories;
    input.children = loadResult.children;
    input.handoffs = loadResult.handoffs;
    input.retrospective = loadResult.retrospective;
  }

  // Execute rules
  const rulesResult = await executeRules(input.handoffType, input);

  // Determine threshold
  const threshold = SCORE_THRESHOLDS[input.handoffType] || 85;

  // Build normalized result
  const result = {
    isValid: rulesResult.passed && rulesResult.percentage >= threshold,
    score: rulesResult.score,
    maxScore: rulesResult.maxScore,
    percentage: rulesResult.percentage,
    threshold,
    errors: rulesResult.issues.map((issue, idx) => ({
      code: `ERR_${String(idx + 1).padStart(3, '0')}`,
      message: issue,
      context: {}
    })),
    warnings: rulesResult.warnings.map((warning, idx) => ({
      code: `WARN_${String(idx + 1).padStart(3, '0')}`,
      message: warning,
      context: {}
    })),
    ruleResults: rulesResult.ruleResults,
    metadata: {
      sdId: input.sdId,
      handoffType: input.handoffType,
      rulesExecuted: rulesResult.ruleResults.length,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  };

  // Debug diagnostics if enabled
  if (input.options.debugDiagnostics) {
    result.diagnostics = {
      input: {
        sdId: input.sdId,
        handoffType: input.handoffType,
        hasSD: !!input.sd,
        hasPRD: !!input.prd,
        userStoryCount: input.userStories?.length || 0,
        childCount: input.children?.length || 0
      },
      ruleOrder: RULE_ORDER[input.handoffType] || [],
      rawInput: input._raw
    };
  }

  return result;
}

/**
 * Load SD and related data from database
 *
 * @private
 */
async function loadSDData(input) {
  const { supabase, sdId } = input;

  try {
    // Load SD
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError) {
      return { success: false, error: `SD not found: ${sdError.message}` };
    }

    // Load PRD
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sdId)
      .single();

    // Load user stories
    const { data: userStories } = await supabase
      .from('user_stories')
      .select('*')
      .eq('sd_id', sdId);

    // Load children (for orchestrator)
    let children = null;
    if (sd.sd_type === 'orchestrator') {
      const { data: childData } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status, progress')
        .eq('parent_sd_id', sdId);
      children = childData || [];
    }

    // Load handoffs
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('*')
      .eq('sd_id', sdId);

    // Load retrospective
    const { data: retrospective } = await supabase
      .from('retrospectives')
      .select('*')
      .eq('sd_id', sdId)
      .single();

    return {
      success: true,
      sd,
      prd,
      userStories: userStories || [],
      children,
      handoffs: handoffs || [],
      retrospective
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create an error result
 *
 * @private
 */
function createErrorResult(code, message) {
  return {
    isValid: false,
    score: 0,
    maxScore: 100,
    percentage: 0,
    threshold: 85,
    errors: [{ code, message, context: {} }],
    warnings: [],
    ruleResults: [],
    metadata: {
      executionTimeMs: 0,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      error: true
    }
  };
}

/**
 * Validate for specific handoff type (convenience method)
 */
export async function validateForHandoff(sdId, handoffType, supabase, options = {}) {
  return validateCompletion({
    sdId,
    handoffType,
    supabase,
    options: { ...DEFAULT_OPTIONS, ...options }
  });
}

/**
 * Validate orchestrator completion
 */
export async function validateOrchestratorCompletion(sdId, supabase, options = {}) {
  return validateCompletion({
    sdId,
    handoffType: 'ORCHESTRATOR_COMPLETION',
    supabase,
    options: { ...DEFAULT_OPTIONS, ...options }
  });
}

/**
 * Get available rules for a handoff type (for introspection)
 */
export function getAvailableRules(handoffType) {
  const rules = getRulesForHandoff(handoffType);
  return rules.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    maxScore: r.maxScore
  }));
}

export default {
  validateCompletion,
  validateForHandoff,
  validateOrchestratorCompletion,
  getAvailableRules,
  SCORE_THRESHOLDS
};
