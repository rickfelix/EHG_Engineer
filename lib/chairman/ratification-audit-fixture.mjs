/**
 * lib/chairman/ratification-audit-fixture.mjs — SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B
 * FR-5: a deliberately-unencoded FIXTURE row plus the audit-flag check, both kept OUT of the live
 * chairman_ratifications table (VALIDATION found: a live unencoded row trips
 * QUIET_TICK_RATIFICATION_STALE forever — lib/governance/ratification-stall.mjs:29-32, called from
 * scripts/adam-quiet-tick.mjs:1237, coordinator-quiet-tick.mjs:515, scripts/solomon-advisory.cjs:1060).
 *
 * NON-QUARANTINABLE BY CONSTRUCTION: tests/quarantine-manifest.json's QUARANTINE_EXCLUDE mechanism
 * (vitest.config.js) only ever excludes whole *.test.js files from the vitest run — it has no
 * mechanism to suppress a plain lib/ module or its exports. The audit flag itself lives HERE, in a
 * production module callable by any real audit-run caller (not gated behind a test framework at
 * all); the accompanying test merely exercises it. Quarantining the test file would stop vitest
 * from asserting the flag fires, but would not — and cannot — stop runAuditFixtureCheck() itself
 * from flagging the fixture when a real caller invokes it.
 */

/** A deliberately unencoded row. Never insert this into the live chairman_ratifications table. */
export const FIXTURE_ROW = Object.freeze({
  id: 'FIXTURE-non-quarantinable-audit-row',
  encoded_at: null,
  encoded_ref: null,
  marker_text: null,
  ratified_at: '2026-01-01T00:00:00.000Z', // fixed, arbitrary — not used for staleness (kept off the live table)
});

/**
 * The audit-run check: given a set of chairman_ratifications-shaped rows (which MUST include
 * FIXTURE_ROW when invoked by the audit suite), returns every row with encoded_at === null.
 * Pure — no DB, no fs, so nothing about this function's behavior can be silenced by a test-runner
 * exclusion mechanism.
 * @param {Array<{id:string, encoded_at:?string}>} rows
 * @returns {Array<{id:string, encoded_at:?string}>} unencoded rows, in input order
 */
export function runAuditFixtureCheck(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && r.encoded_at === null);
}
