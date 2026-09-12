/**
 * Probe-writer registry (QF-20260911-287).
 *
 * Six probe/check-named scripts write a durable row on every run that acts (a health
 * snapshot, a coordination-lane ping, a drift feedback row) yet were registered nowhere
 * by script name — so the writer census and an orphan-writer lint would read them as
 * read-only, and any consumer of their rows would have no registered producer.
 *
 * Sourced from Solomon Friday Foundation Audit #2 item 12(c) (feedback 89b3be6a,
 * 2026-09-11 14:54Z, RE-DERIVED at scripts/adam-coordinator-health.mjs:758/:765). Adam
 * disposition 15:2xZ: a name that says probe/check while the code writes is the
 * READ-THE-WIRING-NOT-THE-FILENAME class — register, do not rename; behaviour unchanged.
 *
 * Each entry's `tables`/`cadence` was grepped/read live against the current script and
 * its cron workflow (or noted on-demand), not guessed:
 *   - adam-coordinator-health.mjs: persistReading() inserts codebase_health_snapshots.
 *   - solomon-forecast-trigger-check.mjs: sendOnce()/runWeeklyReminder() write
 *     session_coordination via insertCoordinationRow.
 *   - coordinator-comms-check.mjs: the ping loop writes session_coordination via
 *     insertCoordinationRow (COACHING comms_check row).
 *   - adam-adherence-staleness-check.mjs: writes session_coordination via
 *     insertCoordinationRow (already an exempt entry in
 *     lib/coordinator/insert-coordination-row-callers.cjs for a different, unrelated
 *     defect class — that registry tracks isDeliveredDispatchError handling, not writer
 *     registration by script name).
 *   - canary/run-canary-probe.mjs: writes session_coordination via insertCoordinationRow
 *     (also present in tests/static-guards/session-coordination-writer-census.test.js for
 *     the unrelated sender_session-stamping fix — same reasoning as above).
 *   - pocock/glossary-bypass-parity-check.mjs: inserts a `feedback` row
 *     (category=glossary_parity_failure) when drift is detected.
 */
export const PROBE_WRITER_REGISTRY = Object.freeze([
  Object.freeze({
    script: 'scripts/adam-coordinator-health.mjs',
    tables: ['codebase_health_snapshots'],
    cadence: 'cron 19 */3 * * * — .github/workflows/adam-coordinator-health-cron.yml (every 3h)',
  }),
  Object.freeze({
    script: 'scripts/solomon-forecast-trigger-check.mjs',
    tables: ['session_coordination'],
    cadence: 'cron 37 11 * * * (daily) + 20 8 * * 4 (weekly) — .github/workflows/solomon-duty-triggers-cron.yml',
  }),
  Object.freeze({
    script: 'scripts/coordinator-comms-check.mjs',
    tables: ['session_coordination'],
    cadence: 'on-demand — coordinator-run radio check, not cron-scheduled',
  }),
  Object.freeze({
    script: 'scripts/adam-adherence-staleness-check.mjs',
    tables: ['session_coordination'],
    cadence: 'cron 33 */6 * * * — .github/workflows/adam-adherence-staleness-cron.yml (every 6h)',
  }),
  Object.freeze({
    script: 'scripts/canary/run-canary-probe.mjs',
    tables: ['session_coordination'],
    cadence: 'cron 17 6 * * 0 — .github/workflows/canary-venture-probe.yml (weekly, Sundays)',
  }),
  Object.freeze({
    script: 'scripts/pocock/glossary-bypass-parity-check.mjs',
    tables: ['feedback'],
    cadence: 'cron 0 3 * * 5 — .github/workflows/pocock-glossary-promotion.yml (weekly, Fridays)',
  }),
]);

/** @param {string} scriptPath - repo-relative path, e.g. 'scripts/adam-coordinator-health.mjs' */
export function isRegisteredWriter(scriptPath) {
  return PROBE_WRITER_REGISTRY.some((e) => e.script === scriptPath);
}

// Matches a raw `.from('table').insert(`/`.update(` call, or the canonical
// insertCoordinationRow() choke point (which itself writes session_coordination).
const GOVERNED_TABLE_WRITE_RE = /\.from\(\s*['"`][\w]+['"`]\s*\)\s*\n?\s*\.(?:insert|update)\(/;
// Matches the identifier anywhere (not only a direct call) so a script that imports it
// and invokes it through a default-parameter alias (e.g. `sendRow = insertCoordinationRow`,
// then calls `sendRow(...)`) is still detected as a session_coordination writer.
const INSERT_COORDINATION_ROW_RE = /\binsertCoordinationRow\b/;

/** @param {string} source - a script's full file text */
export function scriptWritesGovernedTable(source) {
  return GOVERNED_TABLE_WRITE_RE.test(source) || INSERT_COORDINATION_ROW_RE.test(source);
}

/**
 * The orphan-writer lint: a script that writes a governed table must be registered by
 * script name. Extend PROBE_WRITER_REGISTRY (never rename the script) to clear this.
 * @param {string} scriptPath
 * @param {string} source
 * @returns {{ok: boolean, reason?: string}}
 */
export function assertNoUnregisteredWriter(scriptPath, source) {
  if (scriptWritesGovernedTable(source) && !isRegisteredWriter(scriptPath)) {
    return {
      ok: false,
      reason: `${scriptPath} writes a governed table (insert/update, or insertCoordinationRow) but has no PROBE_WRITER_REGISTRY entry — register it by script name, do not rename it.`,
    };
  }
  return { ok: true };
}
