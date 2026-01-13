/**
 * Testing Strategy Validator
 * Part of LEO Protocol Gate 1 Validation
 *
 * Validates that PRD defines unit tests and e2e tests sections.
 */

/**
 * Validate testing strategy is defined
 * @param {object} context - Validation context with prd
 * @returns {Promise<object>} Validation result
 */
export async function validateTestingStrategy(context) {
  const { prd } = context;
  const testing = prd?.testing_strategy || prd?.testing || {};
  const issues = [];
  const warnings = [];
  let score = 0;

  // Check for unit tests
  if (testing.unit_tests || testing.unitTests) {
    score += 50;
  } else {
    issues.push('Testing strategy should define unit_tests');
  }

  // Check for e2e tests
  if (testing.e2e_tests || testing.e2eTests || testing.integration_tests) {
    score += 50;
  } else {
    issues.push('Testing strategy should define e2e_tests');
  }

  // Warnings for optional but recommended
  if (!testing.test_data && !testing.testData) {
    warnings.push('Consider adding test_data specifications');
  }

  return {
    passed: issues.length === 0,
    score: issues.length === 0 ? 100 : score,
    max_score: 100,
    issues,
    warnings,
    details: {
      hasUnitTests: !!(testing.unit_tests || testing.unitTests),
      hasE2ETests: !!(testing.e2e_tests || testing.e2eTests || testing.integration_tests),
      hasTestData: !!(testing.test_data || testing.testData)
    }
  };
}
