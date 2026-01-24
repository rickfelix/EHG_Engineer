/**
 * Error Analysis Domain
 * Error classification, root cause analysis, and fix generation
 *
 * @module test-intelligence/error-analysis
 */

/**
 * Classify error type based on error message
 * @param {string} errorMessage - Error message
 * @returns {string} Error type classification
 */
export function classifyError(errorMessage) {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('timeout') || msg.includes('exceeded')) return 'TIMEOUT';
  if (msg.includes('selector') || msg.includes('not found') || msg.includes('element')) return 'SELECTOR_NOT_FOUND';
  if (msg.includes('navigation') || msg.includes('goto')) return 'NAVIGATION_FAILED';
  if (msg.includes('assertion') || msg.includes('expect')) return 'ASSERTION_FAILED';
  if (msg.includes('network') || msg.includes('connection')) return 'NETWORK_ERROR';
  if (msg.includes('database') || msg.includes('query')) return 'DATABASE_ERROR';

  return 'UNKNOWN';
}

/**
 * Determine root cause based on error data
 * @param {Object} errorData - Error information
 * @param {string} _sdId - Strategic Directive ID
 * @returns {string} Root cause description
 */
export function determineRootCause(errorData, _sdId) {
  const errorType = classifyError(errorData.message);

  const rootCauses = {
    'TIMEOUT': 'Element loading too slowly or selector incorrect',
    'SELECTOR_NOT_FOUND': 'Selector text doesn\'t match actual UI component text',
    'NAVIGATION_FAILED': 'Navigation path broken or URL incorrect',
    'ASSERTION_FAILED': 'Expected value doesn\'t match actual value',
    'NETWORK_ERROR': 'API endpoint unreachable or failing',
    'DATABASE_ERROR': 'Database query failed or RLS policy blocking access',
    'UNKNOWN': 'Error type not recognized - manual investigation required'
  };

  return rootCauses[errorType] || rootCauses['UNKNOWN'];
}

/**
 * Generate fix suggestions based on error type
 * @param {string} errorType - Classified error type
 * @param {Object} _errorData - Error data
 * @returns {Array} List of suggested fixes
 */
export function generateErrorFixes(errorType, _errorData) {
  const fixes = [];

  switch (errorType) {
    case 'SELECTOR_NOT_FOUND':
      fixes.push({
        priority: 1,
        fix: 'Run selector validation to find correct component text',
        command: 'Included in Phase 1.1 output above',
        estimated_time: '2 minutes'
      });
      fixes.push({
        priority: 2,
        fix: 'Use data-testid attributes instead of text selectors',
        command: 'Add data-testid to component, update test',
        estimated_time: '5 minutes'
      });
      break;

    case 'TIMEOUT':
      fixes.push({
        priority: 1,
        fix: 'Increase timeout threshold',
        command: 'Add { timeout: 30000 } to waitForSelector',
        estimated_time: '1 minute'
      });
      fixes.push({
        priority: 2,
        fix: 'Add proper wait conditions',
        command: 'Use waitForLoadState("networkidle") before action',
        estimated_time: '3 minutes'
      });
      break;

    case 'NAVIGATION_FAILED':
      fixes.push({
        priority: 1,
        fix: 'Verify navigation path exists in UI',
        command: 'Run navigation flow validation (Phase 1.2)',
        estimated_time: '5 minutes'
      });
      break;

    case 'ASSERTION_FAILED':
      fixes.push({
        priority: 1,
        fix: 'Verify expected value matches actual implementation',
        command: 'Check component code for actual value',
        estimated_time: '5 minutes'
      });
      fixes.push({
        priority: 2,
        fix: 'Use regex matcher for dynamic content',
        command: 'expect(value).toMatch(/pattern/)',
        estimated_time: '2 minutes'
      });
      break;

    case 'NETWORK_ERROR':
      fixes.push({
        priority: 1,
        fix: 'Verify API endpoint is running and accessible',
        command: 'Check server logs and network tab',
        estimated_time: '5 minutes'
      });
      fixes.push({
        priority: 2,
        fix: 'Add retry logic or increase network timeout',
        command: 'Configure test retries in playwright config',
        estimated_time: '3 minutes'
      });
      break;

    case 'DATABASE_ERROR':
      fixes.push({
        priority: 1,
        fix: 'Verify database connection and RLS policies',
        command: 'Check Supabase dashboard for policy issues',
        estimated_time: '10 minutes'
      });
      break;

    default:
      fixes.push({
        priority: 1,
        fix: 'Review error message and stack trace',
        command: 'Check Playwright trace viewer',
        estimated_time: '10 minutes'
      });
  }

  return fixes;
}

/**
 * Calculate confidence score for error analysis
 * @param {Object} analysis - Analysis object
 * @returns {number} Confidence percentage (0-100)
 */
export function calculateErrorAnalysisConfidence(analysis) {
  let confidence = 50; // Base confidence

  if (analysis.error_type !== 'UNKNOWN') confidence += 20;
  if (analysis.root_cause) confidence += 15;
  if (analysis.suggested_fixes.length > 0) confidence += 15;

  return Math.min(100, confidence);
}

export default {
  classifyError,
  determineRootCause,
  generateErrorFixes,
  calculateErrorAnalysisConfidence
};
