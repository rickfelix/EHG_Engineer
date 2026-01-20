/**
 * Plan Presentation Validation for PLAN-TO-EXEC Verifier
 *
 * Validates plan_presentation structure in handoff metadata.
 * SD-PLAN-PRESENT-001: Ensures PLAN->EXEC handoffs include implementation guidance.
 *
 * Extracted from scripts/verify-handoff-plan-to-exec.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

/**
 * Validate plan_presentation structure in handoff metadata
 *
 * @param {Object} metadata - Handoff metadata object
 * @returns {Object} - Validation result with valid and errors
 */
export function validatePlanPresentation(metadata) {
  const validation = {
    valid: true,
    errors: []
  };

  if (!metadata?.plan_presentation) {
    validation.valid = false;
    validation.errors.push('plan_presentation required in PLAN->EXEC handoff metadata');
    return validation;
  }

  const pp = metadata.plan_presentation;

  // Validate goal_summary
  if (!pp.goal_summary || pp.goal_summary.trim().length === 0) {
    validation.errors.push('plan_presentation.goal_summary is required');
    validation.valid = false;
  } else if (pp.goal_summary.length > 300) {
    validation.errors.push(`plan_presentation.goal_summary must be <=300 characters (current: ${pp.goal_summary.length})`);
    validation.valid = false;
  }

  // Validate file_scope
  if (!pp.file_scope || typeof pp.file_scope !== 'object') {
    validation.errors.push('plan_presentation.file_scope is required');
    validation.valid = false;
  } else {
    const hasFiles = (pp.file_scope.create?.length > 0) ||
                     (pp.file_scope.modify?.length > 0) ||
                     (pp.file_scope.delete?.length > 0);
    if (!hasFiles) {
      validation.errors.push('plan_presentation.file_scope must have at least one of: create, modify, or delete');
      validation.valid = false;
    }
  }

  // Validate execution_plan
  if (!Array.isArray(pp.execution_plan) || pp.execution_plan.length === 0) {
    validation.errors.push('plan_presentation.execution_plan must be array with >=1 step');
    validation.valid = false;
  }

  // Validate testing_strategy
  if (!pp.testing_strategy || typeof pp.testing_strategy !== 'object') {
    validation.errors.push('plan_presentation.testing_strategy is required');
    validation.valid = false;
  } else {
    if (!pp.testing_strategy.unit_tests) {
      validation.errors.push('plan_presentation.testing_strategy.unit_tests is required');
      validation.valid = false;
    }
    if (!pp.testing_strategy.e2e_tests) {
      validation.errors.push('plan_presentation.testing_strategy.e2e_tests is required');
      validation.valid = false;
    }
  }

  return validation;
}
