/**
 * Playwright Report Validator
 * Part of LEO Protocol Gate 2D Validation
 *
 * Validates that Playwright test report URL exists and is valid.
 */

/**
 * Validate Playwright report exists
 * @param {object} context - Validation context with sd, handoff
 * @returns {Promise<object>} Validation result
 */
export async function validatePlaywrightReport(context) {
  const { handoff, sd } = context;

  // Check for Playwright report URL
  const reportUrl = handoff?.metadata?.playwright_report_url ||
                    handoff?.evidence?.playwright_report ||
                    sd?.test_evidence?.playwright_report;

  if (!reportUrl) {
    return {
      passed: true, // Non-blocking
      score: 50,
      max_score: 100,
      issues: [],
      warnings: ['No Playwright report URL found - consider adding test report link'],
      details: { hasReport: false }
    };
  }

  // Basic URL validation
  const isValidUrl = typeof reportUrl === 'string' &&
                     (reportUrl.startsWith('http') || reportUrl.includes('playwright-report'));

  if (!isValidUrl) {
    return {
      passed: true,
      score: 70,
      max_score: 100,
      issues: [],
      warnings: ['Playwright report URL format may be invalid'],
      details: { hasReport: true, urlValid: false }
    };
  }

  return {
    passed: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [],
    details: { hasReport: true, reportUrl }
  };
}
