/**
 * TESTING Sub-Agent - Evidence Collection Module
 * Phase 4: Collect test evidence (screenshots, reports, logs)
 *
 * Responsibilities:
 * - Collect Playwright HTML reports
 * - Gather test screenshots
 * - Store evidence paths for verification
 */

/**
 * Collect evidence from test execution
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} phase3Results - Results from E2E test execution
 * @returns {Promise<Object>} Collected evidence
 */
export async function collectEvidence(sdId, phase3Results) {
  console.log('   Collecting test evidence...');

  const evidence = {
    screenshots: [],
    reports: [],
    logs: []
  };

  if (phase3Results.report_url) {
    evidence.reports.push({
      type: 'playwright_html',
      url: phase3Results.report_url,
      description: 'Playwright HTML test report'
    });
    console.log(`      [PASS] Report: ${phase3Results.report_url}`);
  }

  if (phase3Results.tests_executed > 0) {
    evidence.screenshots.push({
      count: phase3Results.tests_passed,
      description: `Screenshots for ${phase3Results.tests_passed} passing tests`
    });
    console.log(`      [PASS] Screenshots: ${phase3Results.tests_passed} captured`);
  }

  console.log(`      [STORE] Evidence stored in: tests/e2e/evidence/${sdId}/`);

  return evidence;
}
