/**
 * SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-H — 25-fixture code-scored smoke-eval fixture set.
 *
 * Purposes are derived from the EXPORTED MODEL_DEFAULTS.google map, never hardcoded --
 * a drift-safe list so sibling G (cost-governor, adds a 9th purpose key) forces a loud,
 * visible fixture-count assertion failure here rather than silently escaping coverage
 * (VALIDATION finding, LEAD phase, evidence e5874db1).
 *
 * Fixtures never carry a literal `gemini-<digit>` model string (gemini-pin-lint.mjs scans
 * scripts/lib/tests for exactly that pattern) -- every model id is resolved live via
 * getGoogleModel(purpose) at run time, which IS the point of a "production config path"
 * smoke-eval (per item 7's own scope text).
 *
 * The single timeout fixture is explicitly `synthetic: true` (mirroring the flag already
 * established in lib/eval/eval-set-fixtures.mjs's own synthetic-case discipline: synthetic
 * cases never count toward a real-pass-rate denominator). It has NO real historical
 * incident behind it -- the "2026-08-28 timeout clip" named in the parent SD's inherited
 * scope text could not be located anywhere in-repo or in any queryable DB table
 * (/signal prd-ambiguous, signal 039cd683).
 */
import { MODEL_DEFAULTS } from '../config/model-config.js';

/** Drift-safe: re-derive from the real map every time, never hardcode the list. */
export const GOOGLE_PURPOSES = Object.keys(MODEL_DEFAULTS.google);

/** Aggregation rule for the synthetic timeout fixture (item 7's own "3x runs, 1 timeout = fail"). */
export const TIMEOUT_FIXTURE_RUNS = 3;
export const TIMEOUT_FIXTURE_FAIL_THRESHOLD = 1;

/**
 * Pure predicate: does this set of per-run results fail the timeout fixture?
 * @param {Array<{timedOut: boolean}>} runResults
 * @returns {boolean}
 */
export function evaluateTimeoutFixture(runResults) {
  if (!Array.isArray(runResults) || runResults.length !== TIMEOUT_FIXTURE_RUNS) {
    throw new Error(`evaluateTimeoutFixture: expected exactly ${TIMEOUT_FIXTURE_RUNS} run results, got ${runResults?.length}`);
  }
  const timeoutCount = runResults.filter((r) => r.timedOut === true).length;
  return timeoutCount >= TIMEOUT_FIXTURE_FAIL_THRESHOLD;
}

/**
 * Build the fixture set: 3 per Google purpose key + 1 synthetic timeout fixture.
 * Total is GOOGLE_PURPOSES.length * 3 + 1 -- 25 today (8 purposes). If that count ever
 * drifts, tests/unit/eval/gemini-smoke-eval.test.js's count assertion fails loudly.
 * @returns {Array<Object>}
 */
export function buildFixtures() {
  const fixtures = [];
  for (const purpose of GOOGLE_PURPOSES) {
    for (let n = 1; n <= 3; n++) {
      fixtures.push({
        task_id: `GEMINI-SMOKE-${purpose}-${n}`,
        purpose,
        synthetic: false,
        timeoutFixture: false,
        prompt: `Smoke check ${n}/3 for the '${purpose}' Gemini purpose -- respond with a short, non-empty acknowledgement.`,
        content_hash: `gemini-smoke-${purpose}-${n}`,
        source_ref: `fixture:gemini-smoke:${purpose}:${n}`,
      });
    }
  }
  fixtures.push({
    task_id: 'GEMINI-SMOKE-TIMEOUT-SYNTHETIC',
    purpose: 'fast',
    synthetic: true,
    timeoutFixture: true,
    prompt: 'Synthetic timeout fixture -- exercises the timeout path only, no real incident behind it.',
    content_hash: 'gemini-smoke-timeout-synthetic',
    source_ref: 'fixture:gemini-smoke:timeout-synthetic',
  });
  return fixtures;
}
