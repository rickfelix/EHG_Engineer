/**
 * Adaptive Validation Utilities
 * SD-LEO-PROTOCOL-V4-4-0: Sub-Agent Adaptive Validation System
 *
 * Provides shared utilities for sub-agents to implement prospective vs retrospective validation modes.
 *
 * Created: 2025-11-15
 * Part of: US-002 (Sub-Agent Updates)
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

/**
 * Detect validation mode based on SD status
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Optional override options
 * @param {string} options.validation_mode - Manual override for validation mode
 * @returns {Promise<'prospective'|'retrospective'>} Validation mode
 *
 * @description
 * - Prospective: SD is in 'active' or 'in_progress' status (work not yet done)
 * - Retrospective: SD is 'completed' status (work already delivered)
 * - Manual override via options.validation_mode takes precedence
 */
export async function detectValidationMode(sdId, options = {}) {
  // Manual override
  if (options.validation_mode) {
    const validModes = ['prospective', 'retrospective'];
    if (!validModes.includes(options.validation_mode)) {
      throw new Error(`Invalid validation_mode: ${options.validation_mode}. Must be 'prospective' or 'retrospective'.`);
    }
    console.log(`   📋 Validation mode: ${options.validation_mode} (manual override)`);
    return options.validation_mode;
  }

  // Auto-detect from SD status
  try {
    const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('status')
      .eq('id', sdId)
      .single();

    if (error) {
      console.warn(`   ⚠️  Failed to fetch SD status: ${error.message}. Defaulting to prospective mode.`);
      return 'prospective';
    }

    if (!sd) {
      console.warn(`   ⚠️  SD ${sdId} not found. Defaulting to prospective mode.`);
      return 'prospective';
    }

    // Determine mode based on status
    const retrospectiveStatuses = ['completed', 'done'];
    const prospectiveStatuses = ['active', 'in_progress', 'pending', 'blocked'];

    const mode = retrospectiveStatuses.includes(sd.status?.toLowerCase()) ? 'retrospective' : 'prospective';

    console.log(`   📋 Validation mode: ${mode} (SD status: ${sd.status})`);
    return mode;

  } catch (error) {
    console.warn(`   ⚠️  Error detecting validation mode: ${error.message}. Defaulting to prospective mode.`);
    return 'prospective';
  }
}

/**
 * Validate CONDITIONAL_PASS requirements
 *
 * @param {Object} result - Sub-agent result object
 * @param {string} result.verdict - Verdict type
 * @param {string} result.validation_mode - Validation mode
 * @param {string} result.justification - Justification text (required for CONDITIONAL_PASS)
 * @param {Array<string>} result.conditions - Follow-up conditions (required for CONDITIONAL_PASS)
 * @returns {{valid: boolean, errors: Array<string>}} Validation result
 *
 * @description
 * Ensures CONDITIONAL_PASS verdicts meet requirements:
 * - Can only be used in retrospective mode
 * - Justification must be >= 50 characters
 * - Conditions array must have >= 1 item
 */
export function validateConditionalPass(result) {
  const errors = [];

  if (result.verdict !== 'CONDITIONAL_PASS') {
    return { valid: true, errors: [] };
  }

  // Rule 1: CONDITIONAL_PASS only in retrospective mode
  if (result.validation_mode !== 'retrospective') {
    errors.push('CONDITIONAL_PASS can only be used in retrospective validation mode');
  }

  // Rule 2: Justification required and >= 50 chars
  if (!result.justification) {
    errors.push('CONDITIONAL_PASS requires a justification (minimum 50 characters)');
  } else if (result.justification.length < 50) {
    errors.push(`CONDITIONAL_PASS justification too short (${result.justification.length}/50 characters)`);
  }

  // Rule 3: Conditions array required and non-empty
  if (!result.conditions) {
    errors.push('CONDITIONAL_PASS requires a conditions array (list of follow-up actions)');
  } else if (!Array.isArray(result.conditions)) {
    errors.push('conditions must be an array of strings');
  } else if (result.conditions.length === 0) {
    errors.push('CONDITIONAL_PASS requires at least 1 follow-up condition');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create a properly formatted CONDITIONAL_PASS result
 *
 * @param {Object} params - Parameters for the result
 * @param {string} params.justification - Why this work can be conditionally approved (>= 50 chars)
 * @param {Array<string>} params.conditions - Follow-up actions required
 * @param {number} params.confidence - Confidence score (0-100)
 * @param {Array<string>} params.warnings - Any warnings to document
 * @param {Array<string>} params.recommendations - Recommendations for improvement
 * @param {Object} params.metadata - Additional metadata
 * @returns {Object} Properly formatted CONDITIONAL_PASS result
 *
 * @example
 * const result = createConditionalPassResult({
 *   justification: 'E2E tests exist and pass (32 tests, 95% pass rate). Infrastructure gap documented in follow-up SD.',
 *   conditions: ['Follow-up SD: SD-TESTING-INFRASTRUCTURE-FIX-001', 'Add --full-e2e flag to CI/CD pipeline'],
 *   confidence: 85,
 *   warnings: ['Missing --full-e2e flag in test command'],
 *   recommendations: ['Update CI/CD to include full E2E flag'],
 *   metadata: { test_count: 32, pass_rate: 0.95 }
 * });
 */
export function createConditionalPassResult(params) {
  const {
    justification,
    conditions,
    confidence = 75,
    warnings = [],
    recommendations = [],
    metadata = {}
  } = params;

  const result = {
    verdict: 'CONDITIONAL_PASS',
    validation_mode: 'retrospective',  // Always retrospective
    justification,
    conditions,
    confidence,
    warnings,
    recommendations,
    metadata: {
      ...metadata,
      conditional_pass_created_at: new Date().toISOString()
    }
  };

  // Validate before returning
  const validation = validateConditionalPass(result);
  if (!validation.valid) {
    throw new Error(`Invalid CONDITIONAL_PASS result:\n${validation.errors.join('\n')}`);
  }

  return result;
}

/**
 * Helper to create standard PASS result
 *
 * @param {Object} params - Parameters for the result
 * @param {string} params.validation_mode - Validation mode used
 * @param {number} params.confidence - Confidence score (0-100)
 * @param {string} params.message - Success message
 * @param {Array<string>} params.recommendations - Optional recommendations
 * @param {Object} params.metadata - Additional metadata
 * @returns {Object} Properly formatted PASS result
 */
export function createPassResult(params) {
  const {
    validation_mode = 'prospective',
    confidence = 100,
    message = 'All validation criteria passed',
    recommendations = [],
    metadata = {}
  } = params;

  return {
    verdict: 'PASS',
    validation_mode,
    confidence,
    message,
    recommendations,
    metadata
  };
}

/**
 * Helper to create standard BLOCKED result
 *
 * @param {Object} params - Parameters for the result
 * @param {string} params.validation_mode - Validation mode used
 * @param {string} params.reason - Why the validation is blocked
 * @param {Array<string>} params.critical_issues - Critical issues found
 * @param {Array<string>} params.recommendations - How to unblock
 * @param {Object} params.metadata - Additional metadata
 * @returns {Object} Properly formatted BLOCKED result
 */
export function createBlockedResult(params) {
  const {
    validation_mode = 'prospective',
    reason,
    critical_issues = [],
    recommendations = [],
    metadata = {}
  } = params;

  return {
    verdict: 'BLOCKED',
    validation_mode,
    confidence: 100,  // High confidence in blocking criteria
    message: reason,
    critical_issues,
    recommendations,
    metadata
  };
}

/**
 * Log validation mode information for debugging
 *
 * @param {string} agentName - Name of the sub-agent
 * @param {string} validationMode - The validation mode being used
 * @param {Object} criteria - Validation criteria being applied
 */
export function logValidationMode(agentName, validationMode, criteria) {
  console.log(`\n🔍 ${agentName} Validation Mode: ${validationMode.toUpperCase()}`);
  console.log('   Criteria Applied:');
  Object.entries(criteria).forEach(([key, value]) => {
    console.log(`   - ${key}: ${value}`);
  });
}
