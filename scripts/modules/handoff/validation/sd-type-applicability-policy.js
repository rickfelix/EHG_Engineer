/**
 * SD-Type Applicability Policy Module
 * Part of SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001
 *
 * Centralized policy defining which validators are REQUIRED vs NON_APPLICABLE
 * per SD type. Used by:
 * - Validator runner (early-exit gating)
 * - Progress calculator (treat SKIPPED as satisfied for non-applicable)
 * - Handoff decision aggregator
 *
 * Design Principle: ALLOWLIST approach (safe default = all REQUIRED)
 * Unknown SD types require ALL validators. Only explicitly listed types can skip.
 *
 * @version 1.0.0
 * @since 2026-01-24
 */

// Policy version for traceability and debugging
export const POLICY_VERSION = '1.0.0';

/**
 * Validator requirement levels
 */
export const RequirementLevel = {
  REQUIRED: 'REQUIRED',         // Must PASS for handoff to succeed
  NON_APPLICABLE: 'NON_APPLICABLE', // Should SKIP for this SD type
  OPTIONAL: 'OPTIONAL'          // Can SKIP or run - doesn't affect outcome
};

/**
 * Validator result statuses
 */
export const ValidatorStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  SKIPPED: 'SKIPPED',
  NOT_RUN: 'NOT_RUN'
};

/**
 * Reason codes for SKIPPED status
 */
export const SkipReasonCode = {
  NON_APPLICABLE_SD_TYPE: 'NON_APPLICABLE_SD_TYPE',  // Validator not needed for this SD type
  PREREQUISITE_NOT_MET: 'PREREQUISITE_NOT_MET',      // Required prerequisite missing
  DISABLED_BY_CONFIG: 'DISABLED_BY_CONFIG',          // Explicitly disabled in config
  ALREADY_COMPLETED: 'ALREADY_COMPLETED'             // Already ran and passed
};

/**
 * SD-Type to Validator Applicability Policy
 *
 * For each SD type, defines which validators are REQUIRED vs NON_APPLICABLE.
 * Validators not listed default to REQUIRED (safe default).
 *
 * Key:
 * - TESTING: Code quality, unit tests, coverage
 * - GITHUB: Git/PR validation, branch enforcement
 * - DESIGN: UI/UX design validation
 * - DATABASE: Schema/migration validation
 * - REGRESSION: Behavior preservation validation (critical for refactors)
 * - DOCMON: Documentation validation
 * - STORIES: User story quality validation
 */
const SD_TYPE_POLICY = {
  // ============================================================================
  // NON-CODE SD TYPES (skip most code validation)
  // ============================================================================

  infrastructure: {
    TESTING: RequirementLevel.NON_APPLICABLE,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.NON_APPLICABLE,
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.REQUIRED,
    STORIES: RequirementLevel.OPTIONAL
  },

  documentation: {
    TESTING: RequirementLevel.NON_APPLICABLE,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.NON_APPLICABLE,
    DATABASE: RequirementLevel.NON_APPLICABLE,
    REGRESSION: RequirementLevel.NON_APPLICABLE,
    DOCMON: RequirementLevel.REQUIRED,
    STORIES: RequirementLevel.OPTIONAL
  },

  docs: {  // Alias for documentation
    TESTING: RequirementLevel.NON_APPLICABLE,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.NON_APPLICABLE,
    DATABASE: RequirementLevel.NON_APPLICABLE,
    REGRESSION: RequirementLevel.NON_APPLICABLE,
    DOCMON: RequirementLevel.REQUIRED,
    STORIES: RequirementLevel.OPTIONAL
  },

  process: {
    TESTING: RequirementLevel.NON_APPLICABLE,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.NON_APPLICABLE,
    DATABASE: RequirementLevel.NON_APPLICABLE,
    REGRESSION: RequirementLevel.NON_APPLICABLE,
    DOCMON: RequirementLevel.REQUIRED,
    STORIES: RequirementLevel.OPTIONAL
  },

  qa: {
    TESTING: RequirementLevel.NON_APPLICABLE,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.NON_APPLICABLE,
    DATABASE: RequirementLevel.NON_APPLICABLE,
    REGRESSION: RequirementLevel.NON_APPLICABLE,
    DOCMON: RequirementLevel.OPTIONAL,
    STORIES: RequirementLevel.OPTIONAL
  },

  orchestrator: {
    // Orchestrators coordinate children - no direct validation needed
    TESTING: RequirementLevel.NON_APPLICABLE,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.NON_APPLICABLE,
    DATABASE: RequirementLevel.NON_APPLICABLE,
    REGRESSION: RequirementLevel.NON_APPLICABLE,
    DOCMON: RequirementLevel.OPTIONAL,
    STORIES: RequirementLevel.NON_APPLICABLE
  },

  // ============================================================================
  // CODE-PRODUCING SD TYPES (require validation, but some are non-applicable)
  // ============================================================================

  refactor: {
    // CRITICAL: Refactors ONLY need REGRESSION (behavior preservation)
    // This is the primary fix for SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001
    TESTING: RequirementLevel.NON_APPLICABLE,  // No new tests for refactors
    DESIGN: RequirementLevel.NON_APPLICABLE,   // No design changes
    GITHUB: RequirementLevel.REQUIRED,         // Still need PR validation
    DATABASE: RequirementLevel.NON_APPLICABLE, // No schema changes
    REGRESSION: RequirementLevel.REQUIRED,     // CRITICAL: Must verify no behavior change
    DOCMON: RequirementLevel.OPTIONAL,
    STORIES: RequirementLevel.NON_APPLICABLE   // No new user stories
  },

  bugfix: {
    TESTING: RequirementLevel.REQUIRED,        // Must verify fix
    DESIGN: RequirementLevel.NON_APPLICABLE,   // Usually no design changes
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.OPTIONAL,
    STORIES: RequirementLevel.OPTIONAL
  },

  feature: {
    // Full validation for features
    TESTING: RequirementLevel.REQUIRED,
    DESIGN: RequirementLevel.REQUIRED,
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.OPTIONAL,  // Only if DB changes
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.REQUIRED,
    STORIES: RequirementLevel.REQUIRED
  },

  enhancement: {
    // Similar to feature but lighter
    TESTING: RequirementLevel.REQUIRED,
    DESIGN: RequirementLevel.OPTIONAL,
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.OPTIONAL,
    STORIES: RequirementLevel.REQUIRED
  },

  database: {
    TESTING: RequirementLevel.OPTIONAL,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.REQUIRED,    // CRITICAL
    REGRESSION: RequirementLevel.REQUIRED,  // Must verify no breakage
    DOCMON: RequirementLevel.OPTIONAL,
    STORIES: RequirementLevel.OPTIONAL
  },

  security: {
    // Full validation for security
    TESTING: RequirementLevel.REQUIRED,
    DESIGN: RequirementLevel.OPTIONAL,
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.REQUIRED,
    DOCMON: RequirementLevel.REQUIRED,
    STORIES: RequirementLevel.REQUIRED
  },

  performance: {
    TESTING: RequirementLevel.REQUIRED,     // Must measure improvement
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.REQUIRED,  // Must not break existing behavior
    DOCMON: RequirementLevel.OPTIONAL,
    STORIES: RequirementLevel.OPTIONAL
  },

  // API/backend - no E2E but needs unit/integration tests
  api: {
    TESTING: RequirementLevel.REQUIRED,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.REQUIRED,
    STORIES: RequirementLevel.OPTIONAL
  },

  backend: {
    TESTING: RequirementLevel.REQUIRED,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.REQUIRED,
    STORIES: RequirementLevel.OPTIONAL
  }
};

/**
 * Get the requirement level for a specific validator and SD type
 *
 * @param {string} sdType - SD type (e.g., 'refactor', 'feature')
 * @param {string} validatorName - Validator name (e.g., 'TESTING', 'REGRESSION')
 * @returns {string} RequirementLevel (REQUIRED, NON_APPLICABLE, or OPTIONAL)
 */
export function getValidatorRequirement(sdType, validatorName) {
  const normalizedType = (sdType || '').toLowerCase();
  const normalizedValidator = (validatorName || '').toUpperCase();

  // Check if SD type is defined in policy
  const typePolicy = SD_TYPE_POLICY[normalizedType];

  if (!typePolicy) {
    // SAFE DEFAULT: Unknown SD types require all validators
    console.log(`   ⚠️  Unknown SD type '${sdType}' - defaulting to REQUIRED for ${validatorName}`);
    return RequirementLevel.REQUIRED;
  }

  // Check if validator is defined for this type
  const requirement = typePolicy[normalizedValidator];

  if (requirement === undefined) {
    // Validators not in policy default to REQUIRED
    return RequirementLevel.REQUIRED;
  }

  return requirement;
}

/**
 * Check if a validator is required for a given SD type
 *
 * @param {string} sdType - SD type
 * @param {string} validatorName - Validator name
 * @returns {boolean} True if REQUIRED
 */
export function isValidatorRequired(sdType, validatorName) {
  return getValidatorRequirement(sdType, validatorName) === RequirementLevel.REQUIRED;
}

/**
 * Check if a validator is non-applicable for a given SD type
 *
 * @param {string} sdType - SD type
 * @param {string} validatorName - Validator name
 * @returns {boolean} True if NON_APPLICABLE
 */
export function isValidatorNonApplicable(sdType, validatorName) {
  return getValidatorRequirement(sdType, validatorName) === RequirementLevel.NON_APPLICABLE;
}

/**
 * Get all validators and their requirements for an SD type
 *
 * @param {string} sdType - SD type
 * @returns {Object} Map of validator name to requirement level
 */
export function getValidatorRequirements(sdType) {
  const normalizedType = (sdType || '').toLowerCase();
  const typePolicy = SD_TYPE_POLICY[normalizedType];

  if (!typePolicy) {
    // Return empty - all validators will default to REQUIRED
    return {};
  }

  return { ...typePolicy };
}

/**
 * Get list of required validators for an SD type
 *
 * @param {string} sdType - SD type
 * @returns {string[]} Array of required validator names
 */
export function getRequiredValidators(sdType) {
  const requirements = getValidatorRequirements(sdType);

  return Object.entries(requirements)
    .filter(([_, level]) => level === RequirementLevel.REQUIRED)
    .map(([name]) => name);
}

/**
 * Get list of non-applicable validators for an SD type
 *
 * @param {string} sdType - SD type
 * @returns {string[]} Array of non-applicable validator names
 */
export function getNonApplicableValidators(sdType) {
  const requirements = getValidatorRequirements(sdType);

  return Object.entries(requirements)
    .filter(([_, level]) => level === RequirementLevel.NON_APPLICABLE)
    .map(([name]) => name);
}

/**
 * Create a SKIPPED validator result
 *
 * @param {string} validatorName - Validator name
 * @param {string} sdType - SD type
 * @param {string} reasonCode - SkipReasonCode value
 * @returns {Object} Validator result with SKIPPED status
 */
export function createSkippedResult(validatorName, sdType, reasonCode = SkipReasonCode.NON_APPLICABLE_SD_TYPE) {
  return {
    passed: true,           // Backward compatible - SKIPPED counts as not blocking
    status: ValidatorStatus.SKIPPED,
    score: 100,             // Full score (not a deduction)
    max_score: 100,
    issues: [],
    warnings: [],
    skipped: true,
    skipReason: reasonCode,
    skipDetails: {
      validator_name: validatorName,
      sd_type: sdType,
      reason_code: reasonCode,
      policy_version: POLICY_VERSION,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Check if a validator result represents a SKIPPED validation
 *
 * @param {Object} result - Validator result
 * @returns {boolean} True if result is SKIPPED
 */
export function isSkippedResult(result) {
  if (!result) return false;

  return result.status === ValidatorStatus.SKIPPED ||
         result.skipped === true ||
         result.skipReason !== undefined;
}

/**
 * Get policy summary for an SD type (for logging/debugging)
 *
 * @param {string} sdType - SD type
 * @returns {Object} Policy summary
 */
export function getPolicySummary(sdType) {
  const requirements = getValidatorRequirements(sdType);
  const required = getRequiredValidators(sdType);
  const nonApplicable = getNonApplicableValidators(sdType);
  const optional = Object.entries(requirements)
    .filter(([_, level]) => level === RequirementLevel.OPTIONAL)
    .map(([name]) => name);

  return {
    sd_type: sdType,
    policy_version: POLICY_VERSION,
    required,
    non_applicable: nonApplicable,
    optional,
    total_validators: Object.keys(requirements).length
  };
}

/**
 * Log policy summary for an SD
 *
 * @param {string} sdType - SD type
 */
export function logPolicySummary(sdType) {
  const summary = getPolicySummary(sdType);

  console.log(`\n📋 SD-Type Applicability Policy (v${POLICY_VERSION})`);
  console.log(`   SD Type: ${sdType}`);
  console.log(`   Required validators: ${summary.required.join(', ') || 'none'}`);
  console.log(`   Non-applicable validators: ${summary.non_applicable.join(', ') || 'none'}`);
  console.log(`   Optional validators: ${summary.optional.join(', ') || 'none'}`);
}

export default {
  POLICY_VERSION,
  RequirementLevel,
  ValidatorStatus,
  SkipReasonCode,
  getValidatorRequirement,
  isValidatorRequired,
  isValidatorNonApplicable,
  getValidatorRequirements,
  getRequiredValidators,
  getNonApplicableValidators,
  createSkippedResult,
  isSkippedResult,
  getPolicySummary,
  logPolicySummary
};
