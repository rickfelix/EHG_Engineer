/**
 * SD Objectives Validator
 * Part of LEO Protocol Gate L Validation
 *
 * Validates that Strategic Directives have sufficient objectives and success metrics.
 */

/**
 * Validate SD objectives are properly defined
 * @param {object} context - Validation context with sd
 * @returns {Promise<object>} Validation result
 */
export async function validateSDObjectives(context) {
  const { sd } = context;
  const objectives = sd?.strategic_objectives || [];
  const issues = [];
  let score = 0;

  // Check minimum objectives (2 recommended)
  if (objectives.length >= 2) {
    score += 70;
  } else if (objectives.length === 1) {
    score += 35;
    issues.push('SD should have at least 2 strategic objectives');
  } else {
    issues.push('SD has no strategic objectives defined');
  }

  // Check for success metrics
  if (sd?.success_metrics && sd.success_metrics.length > 0) {
    score += 30;
  } else {
    issues.push('SD should have success metrics defined');
  }

  return {
    passed: issues.length === 0,
    score,
    max_score: 100,
    issues,
    warnings: [],
    details: {
      objectivesCount: objectives.length,
      metricsCount: sd?.success_metrics?.length || 0
    }
  };
}
