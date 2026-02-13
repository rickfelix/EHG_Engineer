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
export const POLICY_VERSION = '1.1.0';

/**
 * SD-LEO-FIX-COMPLETION-WORKFLOW-001: Shared list of SD types that skip
 * detailed PRD documentation requirements (exploration, file scope, etc.)
 *
 * Use this constant in PLAN-TO-EXEC validators to ensure consistency:
 * - fileScopeValidation
 * - explorationAudit
 * - executionPlanValidation
 * - testingStrategyValidation
 * - deliverablesPlanning
 *
 * Criteria for "lightweight":
 * - Scope is typically well-defined (no extensive exploration needed)
 * - PRD can be minimal or use heuristic validation
 * - Focus is on targeted changes, not new feature development
 */
export const LIGHTWEIGHT_SD_TYPES = [
  // Non-code SD types
  'infrastructure',
  'documentation',
  'docs',
  'orchestrator',
  'process',
  'uat',  // Renamed from qa: UAT campaigns are lightweight (test execution, not feature development)
  'discovery_spike',  // Research/exploration - no code changes expected

  // Code-producing but scope-limited SD types
  'bugfix',
  'fix',       // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-022: 'fix' is database equivalent of bugfix
  'refactor',
  'ux_debt',          // Similar to refactor but for UX
  'implementation'    // Typically follows a pre-defined spec
];

/**
 * Check if an SD type is lightweight (skips detailed PRD validation)
 * @param {string} sdType - The SD type to check
 * @returns {boolean} True if this SD type should skip detailed PRD validation
 */
export function isLightweightSDType(sdType) {
  return LIGHTWEIGHT_SD_TYPES.includes((sdType || '').toLowerCase());
}

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

  uat: {
    // UAT campaigns execute tests, they don't produce code
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

  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-022: 'fix' is the database sd_type equivalent of bugfix
  fix: {
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
  },

  // ============================================================================
  // ADDITIONAL SD TYPES (SD-LEO-FIX-COMPLETION-WORKFLOW-001)
  // ============================================================================

  discovery_spike: {
    // Research/exploration - no code changes expected
    TESTING: RequirementLevel.NON_APPLICABLE,
    DESIGN: RequirementLevel.NON_APPLICABLE,
    GITHUB: RequirementLevel.NON_APPLICABLE,
    DATABASE: RequirementLevel.NON_APPLICABLE,
    REGRESSION: RequirementLevel.NON_APPLICABLE,
    DOCMON: RequirementLevel.REQUIRED,  // Document findings
    STORIES: RequirementLevel.NON_APPLICABLE
  },

  implementation: {
    // Follows a pre-defined spec, similar to feature but lighter
    TESTING: RequirementLevel.REQUIRED,
    DESIGN: RequirementLevel.OPTIONAL,
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.OPTIONAL,
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.OPTIONAL,
    STORIES: RequirementLevel.OPTIONAL
  },

  ux_debt: {
    // UX technical debt - similar to refactor but for UX
    TESTING: RequirementLevel.OPTIONAL,
    DESIGN: RequirementLevel.REQUIRED,  // UX changes need design review
    GITHUB: RequirementLevel.REQUIRED,
    DATABASE: RequirementLevel.NON_APPLICABLE,
    REGRESSION: RequirementLevel.OPTIONAL,
    DOCMON: RequirementLevel.OPTIONAL,
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

// ============================================================================
// SD-LEO-INFRA-HARDENING-001: Centralized Skip Condition Checker
// Single entry point for all handoff types to check skip conditions
// ============================================================================

/**
 * Centralized skip condition checker
 * SD-LEO-INFRA-HARDENING-001: Single source of truth for skip decisions
 *
 * @param {string} validatorName - Validator/gate name (e.g., 'TESTING', 'DESIGN')
 * @param {Object} context - Context containing SD information
 * @param {Object} context.sd - Strategic Directive object
 * @param {string} context.sd.sd_type - SD type
 * @param {Object} options - Additional options
 * @param {boolean} options.logDecision - Log the skip decision (default: false)
 * @returns {Object} Skip decision { shouldSkip: boolean, result: Object|null, reason: string|null }
 */
export function checkSkipCondition(validatorName, context, options = {}) {
  const { sd } = context || {};
  const sdType = sd?.sd_type || context?.sdType || 'unknown';
  const { logDecision = false } = options;

  // Default: don't skip
  const decision = {
    shouldSkip: false,
    result: null,
    reason: null,
    sdType,
    validatorName,
    policyVersion: POLICY_VERSION
  };

  // Check 1: Is this validator non-applicable for this SD type?
  if (isValidatorNonApplicable(sdType, validatorName)) {
    decision.shouldSkip = true;
    decision.reason = SkipReasonCode.NON_APPLICABLE_SD_TYPE;
    decision.result = createSkippedResult(validatorName, sdType, SkipReasonCode.NON_APPLICABLE_SD_TYPE);

    if (logDecision) {
      console.log(`   ⏭️  SKIP ${validatorName}: Non-applicable for SD type '${sdType}'`);
    }
    return decision;
  }

  // Check 2: Is this a lightweight SD type that skips detailed PRD validation?
  if (isLightweightSDType(sdType)) {
    const lightweightSkipValidators = [
      'FILE_SCOPE',
      'EXPLORATION_AUDIT',
      'EXECUTION_PLAN',
      'DELIVERABLES_PLANNING'
    ];

    if (lightweightSkipValidators.includes(validatorName.toUpperCase())) {
      decision.shouldSkip = true;
      decision.reason = SkipReasonCode.NON_APPLICABLE_SD_TYPE;
      decision.result = createSkippedResult(validatorName, sdType, SkipReasonCode.NON_APPLICABLE_SD_TYPE);

      if (logDecision) {
        console.log(`   ⏭️  SKIP ${validatorName}: Lightweight SD type '${sdType}' skips detailed PRD validation`);
      }
      return decision;
    }
  }

  // Check 3: Documentation-only SDs skip code validation
  const docOnlyTypes = ['documentation', 'docs', 'process', 'orchestrator'];
  const codeValidators = ['TESTING', 'GITHUB', 'REGRESSION', 'DATABASE'];

  if (docOnlyTypes.includes(sdType.toLowerCase()) && codeValidators.includes(validatorName.toUpperCase())) {
    decision.shouldSkip = true;
    decision.reason = SkipReasonCode.NON_APPLICABLE_SD_TYPE;
    decision.result = createSkippedResult(validatorName, sdType, SkipReasonCode.NON_APPLICABLE_SD_TYPE);

    if (logDecision) {
      console.log(`   ⏭️  SKIP ${validatorName}: Documentation-only SD type '${sdType}'`);
    }
    return decision;
  }

  // Check 4: Library-only SDs skip UI/DESIGN gates
  // SD-LEO-INFRA-GATE-WORKTREE-FIXES-001: Feature SDs that only modify lib/ files
  // (e.g., EVA templates) should not require DESIGN validation
  const uiDesignValidators = ['DESIGN', 'UI_REVIEW', 'ACCESSIBILITY', 'RESPONSIVE'];
  const implementationContext = sd?.metadata?.implementation_context || sd?.metadata?.scope_type;
  if (uiDesignValidators.includes(validatorName.toUpperCase()) && implementationContext === 'library-only') {
    decision.shouldSkip = true;
    decision.reason = SkipReasonCode.NON_APPLICABLE_SD_TYPE;
    decision.result = createSkippedResult(validatorName, sdType, `Library-only implementation: no UI components`);

    if (logDecision) {
      console.log(`   ⏭️  SKIP ${validatorName}: Library-only SD (no UI components)`);
    }
    return decision;
  }

  // Check 5: Already completed (if context provides completion info)
  if (context?.completedValidators?.includes(validatorName)) {
    decision.shouldSkip = true;
    decision.reason = SkipReasonCode.ALREADY_COMPLETED;
    decision.result = createSkippedResult(validatorName, sdType, SkipReasonCode.ALREADY_COMPLETED);

    if (logDecision) {
      console.log(`   ⏭️  SKIP ${validatorName}: Already completed in this session`);
    }
    return decision;
  }

  // No skip condition met
  if (logDecision) {
    console.log(`   ✓  RUN ${validatorName}: Required for SD type '${sdType}'`);
  }

  return decision;
}

/**
 * Batch check skip conditions for multiple validators
 * SD-LEO-INFRA-HARDENING-001: Efficient batch processing
 *
 * @param {string[]} validatorNames - Array of validator names
 * @param {Object} context - Context containing SD information
 * @returns {Object} Map of validator name to skip decision
 */
export function checkSkipConditionsBatch(validatorNames, context) {
  const decisions = {};

  for (const validatorName of validatorNames) {
    decisions[validatorName] = checkSkipCondition(validatorName, context, { logDecision: false });
  }

  // Log summary
  const skipped = Object.values(decisions).filter(d => d.shouldSkip);
  const required = Object.values(decisions).filter(d => !d.shouldSkip);

  console.log(`\n📋 Skip Condition Summary (${context?.sd?.sd_type || 'unknown'} SD):`);
  console.log(`   Required: ${required.length} validators`);
  console.log(`   Skipped: ${skipped.length} validators`);
  if (skipped.length > 0) {
    console.log(`   Skipped list: ${skipped.map(d => d.validatorName).join(', ')}`);
  }

  return decisions;
}

/**
 * Get all skip conditions for an SD type (for documentation/debugging)
 *
 * @param {string} sdType - SD type
 * @returns {Object} Full skip condition analysis
 */
export function getSkipConditionsForType(sdType) {
  const allValidators = ['TESTING', 'DESIGN', 'GITHUB', 'DATABASE', 'REGRESSION', 'DOCMON', 'STORIES'];
  const mockContext = { sd: { sd_type: sdType } };

  const conditions = {};
  for (const validator of allValidators) {
    conditions[validator] = checkSkipCondition(validator, mockContext);
  }

  return {
    sdType,
    policyVersion: POLICY_VERSION,
    isLightweight: isLightweightSDType(sdType),
    conditions,
    summary: {
      required: Object.entries(conditions).filter(([_, v]) => !v.shouldSkip).map(([k]) => k),
      skipped: Object.entries(conditions).filter(([_, v]) => v.shouldSkip).map(([k]) => k)
    }
  };
}

export default {
  POLICY_VERSION,
  RequirementLevel,
  ValidatorStatus,
  SkipReasonCode,
  LIGHTWEIGHT_SD_TYPES,
  isLightweightSDType,
  getValidatorRequirement,
  isValidatorRequired,
  isValidatorNonApplicable,
  getValidatorRequirements,
  getRequiredValidators,
  getNonApplicableValidators,
  createSkippedResult,
  isSkippedResult,
  getPolicySummary,
  logPolicySummary,
  // SD-LEO-INFRA-HARDENING-001: Centralized skip checking
  checkSkipCondition,
  checkSkipConditionsBatch,
  getSkipConditionsForType
};
