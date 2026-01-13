/**
 * Goal Summary Validator
 * Part of LEO Protocol Gate 1 Validation
 *
 * Validates that PRD goal summary is present and within character limits.
 */

const MAX_GOAL_SUMMARY_LENGTH = 300;

/**
 * Validate goal summary is present and concise
 * @param {object} context - Validation context with prd
 * @returns {Promise<object>} Validation result
 */
export async function validateGoalSummary(context) {
  const { prd } = context;
  const goalSummary = prd?.goal_summary || prd?.executive_summary || '';

  if (!goalSummary || goalSummary.length === 0) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: ['Goal summary is missing'],
      warnings: [],
      details: { length: 0, maxLength: MAX_GOAL_SUMMARY_LENGTH }
    };
  }

  if (goalSummary.length > MAX_GOAL_SUMMARY_LENGTH) {
    return {
      passed: false,
      score: 70,
      max_score: 100,
      issues: [`Goal summary is ${goalSummary.length} chars, max ${MAX_GOAL_SUMMARY_LENGTH} recommended`],
      warnings: [],
      details: { length: goalSummary.length, maxLength: MAX_GOAL_SUMMARY_LENGTH }
    };
  }

  return {
    passed: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [],
    details: { length: goalSummary.length, maxLength: MAX_GOAL_SUMMARY_LENGTH }
  };
}
