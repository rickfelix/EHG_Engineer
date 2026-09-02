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
 *   artifactSha?: string|null, runner?: string|null}} args
 * @returns {{tests_executed: number, tests_passed: number, tests_failed: number,
 *   tests_skipped: number, artifact_sha: string|null, runner: string|null}}
 */
export function buildTestExecution({ executed = 0, passed = 0, failed = 0, skipped = 0, artifactSha = null, runner = null } = {}) {
  return {
    tests_executed: Number(executed) || 0,
    tests_passed: Number(passed) || 0,
    tests_failed: Number(failed) || 0,
    tests_skipped: Number(skipped) || 0,
    artifact_sha: artifactSha || null,
    runner: runner || null
  };
}

/**
 * Whether a test_execution record represents a genuine, non-empty run: at least one test
 * actually executed. This is what "measured" MEANS (SC#4) -- real evidence exists, independent
 * of whether the run passed or failed. A FAILING run (tests_executed>0, tests_failed>0) is
 * still measured; it is just not a PASS. "PASS implies measured=true AND failed=0" (SC#4) is
 * therefore two separate facts, not one -- callers must check both, never infer one from
 * the other.
 *
 * Three-way, not boolean (RCA 2026-09-02, SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 FR-1
 * corrective): `false` is reserved for `tests_executed === 0` -- a genuinely confirmed empty
 * run. Every other case where `tests_executed` cannot be read (missing key, malformed/non-object
 * input) returns `null` -- "cannot confirm", not "confirmed unmeasured". Previously both cases
 * collapsed to `false`, which the EXEC-TO-PLAN gate's REQUIRED tier treats as a hard block; that
 * silently hard-blocked legacy partial-shape rows (e.g. {tests_passed, tests_failed} with no
 * tests_executed) that carry real evidence under this SD's own trigger's accepted shapes,
 * scoring them WORSE than a row with the block missing outright (which already correctly
 * resolves to `null` via resolveMeasuredState's earlier branch). `buildTestExecution()` always
 * sets all four keys, so the writer path (lib/sub-agents/testing/index.js) is unaffected -- this
 * only changes behavior for foreign/ad-hoc shapes read back through resolveMeasuredState.
 *
 * Also requires ALL FOUR counter keys present before trusting a POSITIVE (>0) tests_executed
 * value as real evidence -- mirrors the companion migration trigger's own invariant
 * (tests_executed present => all four keys required), so a shape the trigger would reject as
 * incomplete (e.g. {tests_executed:500, tests_failed:500}) can never read as measured=true here
 * either, even if it somehow reached this code without passing through the trigger (e.g. a
 * write path that bypasses it). Defense in depth, not redundant: this function has no visibility
 * into whether the trigger actually ran. `tests_executed === 0` does NOT need this corroboration
 * -- zero is self-sufficient evidence of "nothing ran" regardless of which other keys are
 * present, so it always resolves to `false` directly (this is the one existing behavior this
 * fix must not regress).
 * @param {object} testExecution - shape from buildTestExecution(), or undefined/null/malformed
 * @returns {boolean|null}
 */
export function isMeasuredExecution(testExecution) {
  if (!testExecution || typeof testExecution !== 'object') return null;
  if (!('tests_executed' in testExecution)) return null;
  const executed = Number(testExecution.tests_executed);
  if (executed <= 0) return false;
  const hasAllFour = ['tests_executed', 'tests_passed', 'tests_failed', 'tests_skipped']
    .every((k) => k in testExecution);
  return hasAllFour ? true : null;
}
