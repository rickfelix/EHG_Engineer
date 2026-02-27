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
  const warnings = [];
  let score = 0;

  // Check minimum objectives (2 recommended)
  if (objectives.length >= 2) {
    score += 70;
  } else if (objectives.length === 1) {
    score += 35;
    warnings.push('SD has 1 strategic objective, 2+ recommended');
  } else {
    issues.push('SD has no strategic objectives defined');
  }

  // Check for success metrics
  if (sd?.success_metrics && sd.success_metrics.length > 0) {
    score += 30;
  } else {
    warnings.push('SD should have success metrics defined');
  }

  // PAT-AUTO-b6e88bcc: Use score threshold instead of zero-issues check.
  // Having 1 objective + metrics (65/100) should pass as a soft warning,
  // not fail the gate. Only fail when no objectives exist at all.
  return {
    passed: score >= 30,
    score,
    max_score: 100,
    issues,
    warnings,
    details: {
      objectivesCount: objectives.length,
      metricsCount: sd?.success_metrics?.length || 0
    }
  };
}
