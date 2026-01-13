/**
 * Known Issues Validator
 * Part of LEO Protocol Gate Q Validation (7-element)
 *
 * Validates that known issues are tracked or explicitly stated as none.
 */

/**
 * Validate known issues are tracked
 * @param {object} context - Validation context with handoff
 * @returns {Promise<object>} Validation result
 */
export async function validateKnownIssues(context) {
  const { handoff } = context;
  const issues = handoff?.known_issues;

  // Field should be defined (can be empty array if no issues)
  if (issues === undefined) {
    return {
      passed: false,
      score: 70,
      max_score: 100,
      issues: [],
      warnings: ['known_issues field not set (should be empty array if none)'],
      details: { isDefined: false }
    };
  }

  // Empty array is valid - means no known issues
  if (Array.isArray(issues) && issues.length === 0) {
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: { isDefined: true, count: 0, explicitlyNone: true }
    };
  }

  // Has issues - check they're documented
  if (Array.isArray(issues)) {
    const documented = issues.filter(i => {
      if (typeof i === 'string') return i.length > 10;
      if (typeof i === 'object') return i.description || i.issue || i.title;
      return false;
    });

    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: documented.length < issues.length ? ['Some issues may need more detail'] : [],
      details: {
        isDefined: true,
        count: issues.length,
        documented: documented.length
      }
    };
  }

  return {
    passed: true,
    score: 80,
    max_score: 100,
    issues: [],
    warnings: ['known_issues should be an array'],
    details: { isDefined: true, isArray: false }
  };
}
