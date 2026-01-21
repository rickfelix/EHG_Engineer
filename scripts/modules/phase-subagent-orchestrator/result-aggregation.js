/**
 * Result Aggregation for Phase Sub-Agent Orchestrator
 * Aggregates sub-agent results into final verdict
 */

/**
 * Aggregate sub-agent results into final verdict
 * @param {Array} results - Array of sub-agent execution results
 * @returns {Object} Aggregated result with verdict, can_proceed, confidence, etc.
 */
function aggregateResults(results) {
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
    canProceed = true;
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

  const confidence = Math.floor(
    results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length
  );

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

export { aggregateResults };
