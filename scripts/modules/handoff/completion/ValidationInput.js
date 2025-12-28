/**
 * ValidationInput Schema
 *
 * SD-REFACTOR-VERIFY-001 Phase 1: Input Normalization
 *
 * Normalizes disparate legacy caller arguments into a stable ValidationInput.
 * Future rule changes are isolated from legacy argument shapes.
 *
 * @module completion/ValidationInput
 */

/**
 * @typedef {Object} ValidationInput
 * @property {string} sdId - Strategic Directive ID
 * @property {string} handoffType - 'LEAD-TO-PLAN' | 'PLAN-TO-EXEC' | 'EXEC-TO-PLAN' | 'PLAN-TO-LEAD'
 * @property {Object} sd - Strategic Directive record
 * @property {Object} prd - Product Requirements Document (if available)
 * @property {Object[]} [userStories] - User stories array
 * @property {Object[]} [deliverables] - Scope deliverables
 * @property {Object[]} [handoffs] - Previous handoff records
 * @property {Object} [children] - Child SDs (for orchestrator types)
 * @property {Object} supabase - Supabase client instance
 * @property {Object} [options] - Additional options
 */

/**
 * Default options for validation
 */
export const DEFAULT_OPTIONS = {
  silent: false,
  strictMode: false,
  gracePeriod: true,
  debugDiagnostics: false,
  includeWarnings: true
};

/**
 * Create a normalized ValidationInput from legacy caller arguments
 *
 * @param {Object} rawInput - Raw input from legacy callers
 * @returns {ValidationInput} Normalized input
 */
export function createValidationInput(rawInput) {
  if (!rawInput) {
    throw new Error('ValidationInput: rawInput is required');
  }

  // Extract sdId from various sources
  const sdId = rawInput.sdId ||
               rawInput.sd_id ||
               rawInput.sd?.id ||
               rawInput.directiveId;

  if (!sdId) {
    throw new Error('ValidationInput: sdId is required (provide sdId, sd_id, sd.id, or directiveId)');
  }

  // Normalize handoff type
  const handoffType = normalizeHandoffType(rawInput.handoffType || rawInput.type);

  // Build normalized input
  return {
    sdId,
    handoffType,
    sd: rawInput.sd || null,
    prd: rawInput.prd || null,
    userStories: rawInput.userStories || rawInput.stories || [],
    deliverables: rawInput.deliverables || rawInput.scope_deliverables || [],
    handoffs: rawInput.handoffs || rawInput.previousHandoffs || [],
    children: rawInput.children || null,
    retrospective: rawInput.retrospective || null,
    supabase: rawInput.supabase || null,
    options: {
      ...DEFAULT_OPTIONS,
      ...(rawInput.options || {})
    },
    // Preserve raw input for special-case handling
    _raw: rawInput
  };
}

/**
 * Normalize handoff type string to canonical format
 *
 * @param {string} type - Raw handoff type
 * @returns {string} Normalized type
 */
function normalizeHandoffType(type) {
  if (!type) return 'UNKNOWN';

  const normalized = type.toUpperCase().replace(/_/g, '-');

  // Map variants to canonical forms
  const typeMap = {
    'LEAD-TO-PLAN': 'LEAD-TO-PLAN',
    'LEADTOPLAN': 'LEAD-TO-PLAN',
    'L2P': 'LEAD-TO-PLAN',

    'PLAN-TO-EXEC': 'PLAN-TO-EXEC',
    'PLANTOEXEC': 'PLAN-TO-EXEC',
    'P2E': 'PLAN-TO-EXEC',

    'EXEC-TO-PLAN': 'EXEC-TO-PLAN',
    'EXECTOPLAN': 'EXEC-TO-PLAN',
    'E2P': 'EXEC-TO-PLAN',

    'PLAN-TO-LEAD': 'PLAN-TO-LEAD',
    'PLANTOLEAD': 'PLAN-TO-LEAD',
    'P2L': 'PLAN-TO-LEAD',

    'LEAD-FINAL-APPROVAL': 'LEAD-FINAL-APPROVAL',
    'LEADFINALAPPROVAL': 'LEAD-FINAL-APPROVAL',
    'LFA': 'LEAD-FINAL-APPROVAL'
  };

  return typeMap[normalized] || normalized;
}

/**
 * Validate that input has minimum required fields for a handoff type
 *
 * @param {ValidationInput} input - Normalized input
 * @returns {{valid: boolean, missing: string[]}}
 */
export function validateInputCompleteness(input) {
  const missing = [];

  // Always required
  if (!input.sdId) missing.push('sdId');
  if (!input.supabase) missing.push('supabase');

  // Type-specific requirements
  const typeRequirements = {
    'LEAD-TO-PLAN': ['sd'],
    'PLAN-TO-EXEC': ['sd', 'prd'],
    'EXEC-TO-PLAN': ['sd', 'prd', 'userStories'],
    'PLAN-TO-LEAD': ['sd', 'prd'],
    'LEAD-FINAL-APPROVAL': ['sd', 'prd']
  };

  const required = typeRequirements[input.handoffType] || [];
  for (const field of required) {
    if (!input[field]) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

export default {
  createValidationInput,
  validateInputCompleteness,
  DEFAULT_OPTIONS
};
