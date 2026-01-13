/**
 * Executive Summary Validator
 * Part of LEO Protocol Gate Q Validation (7-element)
 *
 * Validates that handoff executive summary is complete and specific.
 */

const MIN_SUMMARY_LENGTH = 100;

/**
 * Validate executive summary completeness
 * @param {object} context - Validation context with handoff
 * @returns {Promise<object>} Validation result
 */
export async function validateExecutiveSummary(context) {
  const { handoff } = context;
  const summary = handoff?.executive_summary || '';

  if (!summary || summary.length === 0) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: ['Executive summary is missing'],
      warnings: [],
      details: { length: 0, minLength: MIN_SUMMARY_LENGTH }
    };
  }

  if (summary.length < MIN_SUMMARY_LENGTH) {
    return {
      passed: false,
      score: 50,
      max_score: 100,
      issues: [`Executive summary too short: ${summary.length} chars, min ${MIN_SUMMARY_LENGTH}`],
      warnings: [],
      details: { length: summary.length, minLength: MIN_SUMMARY_LENGTH }
    };
  }

  // Check for boilerplate/generic content
  const genericPatterns = [
    'this handoff',
    'summary of',
    'overview of',
    'please review'
  ];

  const hasGenericContent = genericPatterns.some(p =>
    summary.toLowerCase().includes(p)
  );

  return {
    passed: true,
    score: hasGenericContent ? 80 : 100,
    max_score: 100,
    issues: [],
    warnings: hasGenericContent ? ['Executive summary may contain generic content'] : [],
    details: {
      length: summary.length,
      minLength: MIN_SUMMARY_LENGTH,
      hasGenericContent
    }
  };
}
