/**
 * Screenshot Evidence Validator
 * Part of LEO Protocol Gate 2D Validation
 *
 * Validates that E2E test screenshots exist.
 */

/**
 * Validate screenshot evidence exists
 * @param {object} context - Validation context with sd, handoff
 * @returns {Promise<object>} Validation result
 */
export async function validateScreenshotEvidence(context) {
  const { handoff, sd } = context;

  // Check for screenshot URL in handoff metadata
  const screenshotUrl = handoff?.metadata?.screenshot_url ||
                        handoff?.evidence?.screenshots ||
                        sd?.test_evidence?.screenshots;

  if (!screenshotUrl) {
    return {
      passed: true, // Non-blocking
      score: 50,
      max_score: 100,
      issues: [],
      warnings: ['No screenshot evidence found - consider adding E2E test screenshots'],
      details: { hasScreenshots: false }
    };
  }

  // Basic URL validation
  const isValidUrl = typeof screenshotUrl === 'string' &&
                     (screenshotUrl.startsWith('http') || screenshotUrl.startsWith('/'));

  if (!isValidUrl && !Array.isArray(screenshotUrl)) {
    return {
      passed: true,
      score: 70,
      max_score: 100,
      issues: [],
      warnings: ['Screenshot URL format may be invalid'],
      details: { hasScreenshots: true, urlValid: false }
    };
  }

  return {
    passed: true,
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {
      hasScreenshots: true,
      count: Array.isArray(screenshotUrl) ? screenshotUrl.length : 1
    }
  };
}
