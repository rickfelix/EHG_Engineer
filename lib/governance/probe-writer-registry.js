/**
 * Probe-writer registry (QF-20260911-287).
 *
 * Six probe/check-named scripts write a durable row on every run they act (a health
 * snapshot, a coordination-lane ping, a drift feedback row) yet were registered nowhere
 * by script name. Sourced from Solomon Friday Foundation Audit #2 item 12(c) (feedback
 * 89b3be6a, 2026-09-11). Adam disposition: a name that says probe/check while the code
 * writes is READ-THE-WIRING-NOT-THE-FILENAME — register, do not rename; behaviour
 * unchanged. Each `tables`/`cadence` was grepped/read live against the script + its cron
 * workflow, not guessed.
 */
export const PROBE_WRITER_REGISTRY = Object.freeze([
  Object.freeze({
    script: 'scripts/adam-coordinator-health.mjs',
    tables: ['codebase_health_snapshots'],
    cadence: 'cron 19 */3 * * * — adam-coordinator-health-cron.yml (every 3h)',
  }),
  Object.freeze({
    script: 'scripts/solomon-forecast-trigger-check.mjs',
    tables: ['session_coordination'],
    cadence: 'cron 37 11 * * * (daily) + 20 8 * * 4 (weekly) — solomon-duty-triggers-cron.yml',
  }),
  Object.freeze({
    script: 'scripts/coordinator-comms-check.mjs',
    tables: ['session_coordination'],
    cadence: 'on-demand — coordinator-run radio check, not cron-scheduled',
  }),
  Object.freeze({
    script: 'scripts/adam-adherence-staleness-check.mjs',
    tables: ['session_coordination'],
    cadence: 'cron 33 */6 * * * — adam-adherence-staleness-cron.yml (every 6h)',
  }),
  Object.freeze({
    script: 'scripts/canary/run-canary-probe.mjs',
    tables: ['session_coordination'],
    cadence: 'cron 17 6 * * 0 — canary-venture-probe.yml (weekly, Sundays)',
  }),
  Object.freeze({
    script: 'scripts/pocock/glossary-bypass-parity-check.mjs',
    tables: ['feedback'],
    cadence: 'cron 0 3 * * 5 — pocock-glossary-promotion.yml (weekly, Fridays)',
  }),
]);

/** @param {string} scriptPath - repo-relative path, e.g. 'scripts/adam-coordinator-health.mjs' */
export function isRegisteredWriter(scriptPath) {
  return PROBE_WRITER_REGISTRY.some((e) => e.script === scriptPath);
}

// A raw `.from('table').insert(`/`.update(` call, or the insertCoordinationRow identifier
// (matched bare, not only as a direct call, so a default-parameter alias like
// `sendRow = insertCoordinationRow` still counts as a governed write).
const GOVERNED_TABLE_WRITE_RE = /\.from\(\s*['"`][\w]+['"`]\s*\)\s*\n?\s*\.(?:insert|update)\(/;
const INSERT_COORDINATION_ROW_RE = /\binsertCoordinationRow\b/;

/** @param {string} source - a script's full file text */
export function scriptWritesGovernedTable(source) {
  return GOVERNED_TABLE_WRITE_RE.test(source) || INSERT_COORDINATION_ROW_RE.test(source);
}

/**
 * The orphan-writer lint: a script that writes a governed table must be registered by
 * script name. Extend PROBE_WRITER_REGISTRY (never rename the script) to clear this.
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
