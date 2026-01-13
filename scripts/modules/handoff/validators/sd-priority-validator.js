/**
 * SD Priority Validator
 * Part of LEO Protocol Gate L Validation
 *
 * Validates that Strategic Directives have valid priority settings.
 */

const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'];

/**
 * Validate SD priority is set to valid value
 * @param {object} context - Validation context with sd
 * @returns {Promise<object>} Validation result
 */
export async function validateSDPriority(context) {
  const { sd } = context;
  const priority = sd?.priority?.toLowerCase();

  if (!priority) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: ['SD priority not set'],
      warnings: [],
      details: { priority: null, validPriorities: VALID_PRIORITIES }
    };
  }

  if (!VALID_PRIORITIES.includes(priority)) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: [`Invalid priority: ${sd.priority}. Valid values: ${VALID_PRIORITIES.join(', ')}`],
      warnings: [],
      details: { priority: sd.priority, validPriorities: VALID_PRIORITIES }
    };
  }

  return {
    passed: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [],
    details: { priority: sd.priority }
  };
}
