/**
 * Execution Plan Validator
 * Part of LEO Protocol Gate 1 Validation
 *
 * Validates that PRD has at least one execution step defined.
 */

/**
 * Validate execution plan has steps
 * @param {object} context - Validation context with prd
 * @returns {Promise<object>} Validation result
 */
export async function validateExecutionPlan(context) {
  const { prd } = context;
  // SD-LIFECYCLE-GAP-004: Also check metadata.execution_plan.steps (standard PRD structure)
  const executionPlan = prd?.execution_plan || prd?.implementation_steps || prd?.metadata?.execution_plan?.steps || [];

  if (!executionPlan || executionPlan.length === 0) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: ['Execution plan has no steps'],
      warnings: [],
      details: { stepCount: 0 }
    };
  }

  // Check for quality of steps
  const validSteps = executionPlan.filter(step => {
    if (typeof step === 'string') return step.length > 10;
    if (typeof step === 'object') return step.description || step.title;
    return false;
  });

  const quality = validSteps.length / executionPlan.length;

  return {
    passed: true,
    score: Math.round(quality * 100),
    max_score: 100,
    issues: [],
    warnings: quality < 1 ? [`${executionPlan.length - validSteps.length} steps may need more detail`] : [],
    details: {
      stepCount: executionPlan.length,
      validSteps: validSteps.length
    }
  };
}
