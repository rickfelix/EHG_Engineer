/**
 * Declarative retention-policy registry (SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001).
 *
 * Pure module — no DB access. scripts/retention-enforce.js is the only executor.
 *
 * KEYING: age of each table's OWN timestamp column (created_at / changed_at /
 * captured_at — verified per-table against the live schema), NEVER row status —
 * the sd_id-scoped gate readers (learning-or-bypass-resolved, Aegis bypass
 * completeness) read only the current in-flight SD's recent rows, so an
 * age-keyed archiver can never strand them (validation-agent c081fe53).
 *
 * WINDOW FLOOR: the longest enforced automated consumer lookback found by the
 * validation sweep is 30 days (validation_audit_log false-positive leaderboard;
 * governance_audit_log queryBypassPatterns). MIN_HOT_DAYS = 45 gives margin;
 * the default 90-day window is 3x the longest consumer. Policies below the
 * floor REFUSE to run.
 *
 * Chairman governance: hotDays values are chairman-approved (SD deliverable).
 * Env overrides RETENTION_HOT_DAYS_<TABLE_UPPER> allow tuning without code
 * change, still floor-clamped.
 */

export const MIN_HOT_DAYS = 45;
export const DEFAULT_HOT_DAYS = 90;
export const DEFAULT_PER_RUN_CAP = 20000;
// PostgREST silently caps SELECTs at max-rows=1000 — a larger .limit() returns
// 1000 rows anyway, which made the enforcement loop's `rows.length < batchLimit`
// convergence check misread "truncated" as "drained" and stop after ONE batch
// (witnessed on the first live apply 2026-06-10: exactly 1000/table). Keep
// BATCH_SIZE at the PostgREST cap so the check stays truthful.
export const BATCH_SIZE = 1000;
export const DELETE_CHUNK = 200;
export const LIVENESS_MAX_AGE_DAYS = 8;

/** Verified per-table timestamp columns (live schema, 2026-06-10). */
export const RETENTION_POLICIES = [
  { table: 'workflow_trace_log',   timestampColumn: 'created_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'governance_audit_log', timestampColumn: 'changed_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'audit_log',            timestampColumn: 'created_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'validation_audit_log', timestampColumn: 'created_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'model_usage_log',      timestampColumn: 'captured_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'permission_audit_log', timestampColumn: 'created_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
];

/**
 * REPORT-ONLY entries: surfaced by the CLI, never executed by it.
 * management_reviews_quarantine_20260610 is the reversibility backup from the
 * SD-LEO-INFRA-REVIVE-EVA-PURGE-MGMT-REVIEWS-001 purge — eligible for a manual
 * chairman-reviewed drop after its verification soak window.
 */
export const SOAK_ENTRIES = [
  {
    table: 'management_reviews_quarantine_20260610',
    mode: 'soak_until',
    eligibleAfter: '2026-06-24',
    action: 'manual chairman-reviewed drop after the purge verification window (45,015 backup rows)',
  },
];

/**
 * Resolve a policy's effective hot window (env override, floor-clamped).
 * @param {{table: string, hotDays: number}} policy
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number} effective hotDays (>= MIN_HOT_DAYS)
 */
export function effectiveHotDays(policy, env = process.env) {
  const key = `RETENTION_HOT_DAYS_${policy.table.toUpperCase()}`;
  const raw = env[key];
  const requested = raw !== undefined && raw !== '' ? Number(raw) : policy.hotDays;
  if (!Number.isFinite(requested)) {
    throw new Error(`${key}: not a number (${raw})`);
  }
  if (requested < MIN_HOT_DAYS) {
    throw new Error(
      `Retention window for ${policy.table} is ${requested}d — below the MIN_HOT_DAYS floor of ${MIN_HOT_DAYS}d ` +
      '(longest enforced consumer lookback is 30d; the floor protects readers). Refusing to run.'
    );
  }
  return requested;
}

/** Cutoff ISO timestamp for a policy as of `now`. */
export function cutoffIso(policy, now = new Date(), env = process.env) {
  const days = effectiveHotDays(policy, env);
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
