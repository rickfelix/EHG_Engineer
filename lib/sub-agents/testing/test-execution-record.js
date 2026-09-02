/**
 * SD-FDBK-INFRA-TESTING-SUB-AGENT-001 SC#6 (Solomon plan input, row 5d28e1c5) — the ONE
 * structured representation of test execution a TESTING verdict carries, so
 * mandatory-testing-validation.js reads a single named field instead of prose in
 * summary/detailed_analysis or ad-hoc metadata keys. Shared by BOTH writer paths: the
 * sub-agent code path (lib/sub-agents/testing/index.js) and any worker-authored
 * (source='manual') one-off evidence script — import buildTestExecution() from here rather
 * than hand-rolling the shape, so the two paths cannot silently diverge the way
 * skipE2ESdTypes/E2E_EXEMPT_SD_TYPES did.
 *
 * Stored at metadata.test_execution on the sub_agent_execution_results row.
 */

/**
 * @param {{executed?: number, passed?: number, failed?: number, skipped?: number,
 *   artifactSha?: string|null, runner?: string|null, artifactPath?: string|null,
 *   source?: 'fresh'|'reused'|null}} args
 * @returns {{tests_executed: number, tests_passed: number, tests_failed: number,
 *   tests_skipped: number, artifact_sha: string|null, runner: string|null,
 *   artifact_path: string|null, source: string|null}}
 */
export function buildTestExecution({ executed = 0, passed = 0, failed = 0, skipped = 0, artifactSha = null, runner = null, artifactPath = null, source = null } = {}) {
  return {
    tests_executed: Number(executed) || 0,
    tests_passed: Number(passed) || 0,
    tests_failed: Number(failed) || 0,
    tests_skipped: Number(skipped) || 0,
    artifact_sha: artifactSha || null,
    runner: runner || null,
    artifact_path: artifactPath || null,
    source: source || null
  };
}

/**
 * True iff a test_execution record represents a genuine, non-empty run: at least one test
 * actually executed. This is what "measured" MEANS (SC#4) -- real evidence exists, independent
 * of whether the run passed or failed. A FAILING run (tests_executed>0, tests_failed>0) is
 * still measured; it is just not a PASS. "PASS implies measured=true AND failed=0" (SC#4) is
 * therefore two separate facts, not one -- callers must check both, never infer one from
 * the other.
 * @param {object} testExecution - shape from buildTestExecution(), or undefined/null
 * @returns {boolean}
 */
export function isMeasuredExecution(testExecution) {
  if (!testExecution || typeof testExecution !== 'object') return false;
  return Number(testExecution.tests_executed) > 0;
}
