/**
 * SD Field Validation Helpers
 * Validates required fields before database insert to prevent handoff failures
 */

/**
 * Validate SD has required success metrics before database insert.
 * At least ONE of success_criteria OR success_metrics must be populated
 * with valid structure for LEAD-TO-PLAN handoff to pass.
 *
 * @param {object} sd - The SD data object
 * @returns {boolean} True if validation passes
 */
export function validateSuccessMetrics(sd) {
  // Check success_criteria: [{ criterion, measure }] or ["string"]
  const hasValidCriteria = Array.isArray(sd.success_criteria) &&
    sd.success_criteria.length > 0 &&
    sd.success_criteria.every(c =>
      (c.criterion && c.measure) || typeof c === 'string'
    );

  // Check success_metrics: [{ metric, target }]
  const hasValidMetrics = Array.isArray(sd.success_metrics) &&
    sd.success_metrics.length > 0 &&
    sd.success_metrics.every(m => m.metric && m.target);

  if (!hasValidCriteria && !hasValidMetrics) {
    console.warn('⚠️  WARNING: Neither success_criteria nor success_metrics has valid entries.');
    console.warn('   LEAD-TO-PLAN handoff will FAIL until this is fixed.');
    console.warn('');
    console.warn('   Required format for success_criteria:');
    console.warn('   [{ criterion: "What to achieve", measure: "How to verify" }]');
    console.warn('');
    console.warn('   OR format for success_metrics:');
    console.warn('   [{ metric: "Name", target: "Goal", actual: "Current" }]');
    return false;
  }
  return true;
}

/**
 * Validate all required fields for SD creation.
 * Checks fields that are commonly missing and cause handoff failures.
 *
 * @param {object} sd - The SD data object
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
export function validateRequiredFields(sd) {
  const errors = [];

  // Required string fields
  if (!sd.id) {
    errors.push('Missing required field: id');
  }
  if (!sd.title) {
    errors.push('Missing required field: title');
  }
  if (!sd.sd_type) {
    errors.push('Missing required field: sd_type');
  }
  if (!sd.description) {
    errors.push('Missing required field: description');
  }

  // Success metrics validation (at least one required for handoff)
  if (!validateSuccessMetrics(sd)) {
    errors.push('Missing valid success_criteria or success_metrics (required for LEAD-TO-PLAN handoff)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Log validation results to console
 * @param {object} sd - The SD data object
 * @param {object} result - Validation result from validateRequiredFields
 */
export function logValidationResult(sd, result) {
  if (result.valid) {
    console.log(`✅ SD ${sd.id}: All required fields validated`);
  } else {
    console.error(`❌ SD ${sd.id}: Validation failed`);
    result.errors.forEach(err => console.error(`   - ${err}`));
  }
}

/**
 * Validate and log SD fields before creation.
 * Use this as a pre-check in SD creation scripts.
 *
 * @param {object} sd - The SD data object
 * @returns {boolean} True if validation passes
 */
export function validateBeforeCreate(sd) {
  const result = validateRequiredFields(sd);
  logValidationResult(sd, result);
  return result.valid;
}

export default {
  validateSuccessMetrics,
  validateRequiredFields,
  validateBeforeCreate,
  logValidationResult
};
