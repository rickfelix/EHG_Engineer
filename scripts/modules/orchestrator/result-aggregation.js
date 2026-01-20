/**
 * Result Aggregation
 *
 * Functions for aggregating sub-agent execution results into final verdicts.
 *
 * Extracted from orchestrate-phase-subagents.js for maintainability.
 * Part of SD-LEO-REFACTOR-ORCH-001
 */

/**
 * Aggregate sub-agent results into final verdict
 *
 * @param {Array} results - Array of sub-agent execution results
 * @returns {Object} - Aggregated result with verdict, can_proceed, confidence, etc.
 */
export function aggregateResults(results) {
  const criticalFails = results.filter(r =>
    r.verdict === 'FAIL' && ['CRITICAL', 'HIGH'].includes(r.priority)
  );

  const anyFails = results.filter(r => r.verdict === 'FAIL');
  const anyBlocked = results.filter(r => r.verdict === 'BLOCKED');
  const allPass = results.every(r => ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict));

  let finalVerdict, canProceed, message;

  if (criticalFails.length > 0) {
    finalVerdict = 'BLOCKED';
    canProceed = false;
    message = `${criticalFails.length} CRITICAL sub-agent(s) failed: ${criticalFails.map(r => r.sub_agent_code).join(', ')}`;
  } else if (anyBlocked.length > 0) {
    finalVerdict = 'BLOCKED';
    canProceed = false;
    message = `${anyBlocked.length} sub-agent(s) blocked: ${anyBlocked.map(r => r.sub_agent_code).join(', ')}`;
  } else if (anyFails.length > 0) {
    finalVerdict = 'CONDITIONAL_PASS';
    canProceed = true; // LEAD can review and decide
    message = `${anyFails.length} sub-agent(s) failed (non-critical): ${anyFails.map(r => r.sub_agent_code).join(', ')}`;
  } else if (allPass) {
    finalVerdict = 'PASS';
    canProceed = true;
    message = `All ${results.length} sub-agent(s) passed`;
  } else {
    finalVerdict = 'WARNING';
    canProceed = true;
    message = 'Mixed results, review recommended';
  }

  const confidence = results.length > 0
    ? Math.floor(results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length)
    : 0;

  return {
    verdict: finalVerdict,
    can_proceed: canProceed,
    confidence,
    message,
    total_agents: results.length,
    passed: results.filter(r => ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)).length,
    failed: anyFails.length,
    blocked: anyBlocked.length,
    results
  };
}

/**
 * Calculate confidence score from sub-agent results
 *
 * @param {Array} results - Array of sub-agent execution results
 * @returns {number} - Average confidence score (0-100)
 */
export function calculateConfidence(results) {
  if (results.length === 0) return 0;
  return Math.floor(
    results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length
  );
}

/**
 * Get summary statistics from results
 *
 * @param {Array} results - Array of sub-agent execution results
 * @returns {Object} - Summary statistics
 */
export function getResultsSummary(results) {
  return {
    total: results.length,
    passed: results.filter(r => r.verdict === 'PASS').length,
    conditionalPass: results.filter(r => r.verdict === 'CONDITIONAL_PASS').length,
    failed: results.filter(r => r.verdict === 'FAIL').length,
    blocked: results.filter(r => r.verdict === 'BLOCKED').length,
    warnings: results.filter(r => r.verdict === 'WARNING').length,
    confidence: calculateConfidence(results)
  };
}

/**
 * Check if results allow proceeding to next phase
 *
 * @param {Array} results - Array of sub-agent execution results
 * @returns {boolean} - Whether can proceed
 */
export function canProceed(results) {
  // Cannot proceed if any CRITICAL/HIGH priority failures or any blocked
  const criticalFails = results.filter(r =>
    r.verdict === 'FAIL' && ['CRITICAL', 'HIGH'].includes(r.priority)
  );
  const anyBlocked = results.filter(r => r.verdict === 'BLOCKED');

  return criticalFails.length === 0 && anyBlocked.length === 0;
}

/**
 * Get blocking issues from results
 *
 * @param {Array} results - Array of sub-agent execution results
 * @returns {Array} - Array of blocking issues
 */
export function getBlockingIssues(results) {
  const issues = [];

  results.forEach(r => {
    if (r.verdict === 'FAIL' && ['CRITICAL', 'HIGH'].includes(r.priority)) {
      issues.push({
        agent: r.sub_agent_code,
        severity: r.priority,
        issues: r.critical_issues || []
      });
    }
    if (r.verdict === 'BLOCKED') {
      issues.push({
        agent: r.sub_agent_code,
        severity: 'BLOCKED',
        issues: r.critical_issues || []
      });
    }
  });

  return issues;
}

/**
 * Format results for console output
 *
 * @param {Object} aggregated - Aggregated results from aggregateResults()
 * @returns {string} - Formatted output string
 */
export function formatResultsOutput(aggregated) {
  const lines = [
    '=' .repeat(60),
    'ORCHESTRATION RESULT',
    '='.repeat(60),
    `Verdict: ${aggregated.verdict}`,
    `Can Proceed: ${aggregated.can_proceed ? 'YES' : 'NO'}`,
    `Confidence: ${aggregated.confidence}%`,
    `Message: ${aggregated.message}`,
    '',
    'Breakdown:',
    `  Total agents: ${aggregated.total_agents}`,
    `  Passed: ${aggregated.passed}`,
    `  Failed: ${aggregated.failed}`,
    `  Blocked: ${aggregated.blocked}`,
    '='.repeat(60)
  ];

  return lines.join('\n');
}
