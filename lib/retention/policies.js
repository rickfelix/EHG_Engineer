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

/**
 * `mode` is currently always 'archive' and is NOT read by scripts/retention-enforce.js's
 * enforcePolicy() (which always archives-before-delete unconditionally) -- it exists as a
 * forward-declared field for a possible future non-archive mode (e.g. hard-delete-only for a
 * table with no audit value), not as live-branched behavior today (SD-FDBK-FIX-BUS-RETENTION-
 * CLEANUP-001 FR-6a).
 */
/** Verified per-table timestamp columns (live schema, 2026-06-10). */
export const RETENTION_POLICIES = [
  { table: 'workflow_trace_log',   timestampColumn: 'created_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'governance_audit_log', timestampColumn: 'changed_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'audit_log',            timestampColumn: 'created_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'validation_audit_log', timestampColumn: 'created_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'model_usage_log',      timestampColumn: 'captured_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  { table: 'permission_audit_log', timestampColumn: 'created_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001: drive_state_verdicts accumulates SIX ROWS PER
  // HOURLY RUN — ~52k rows/year, unbounded, and it carries partially-untrusted text (chairman
  // decision titles reach the citation column via an anon-insertable feedback row). The
  // operator-contract gate caught the absence of this entry, correctly: a table whose creator
  // ships no retention path is exactly the accumulation this repo keeps paying for. recorded_at is
  // the DB-defaulted timestamp column.
  { table: 'drive_state_verdicts', timestampColumn: 'recorded_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001: venture_demand_verdicts takes one row per venture
  // per gate evaluation and is APPEND-ONLY BY DESIGN — a correction is a new row, never an edit —
  // so it is the one table class that CANNOT self-limit by overwriting. Growth scales with
  // ventures x evaluation cadence. computed_at is DATABASE-stamped (DEFAULT now(), never sent by
  // the writer, because a writer that supplies its own timestamp can backdate a verdict), which
  // is exactly the column class this registry's header asks for.
  { table: 'venture_demand_verdicts', timestampColumn: 'computed_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-7: venture_consent_events is append-only and
  // grows with every opt-in and opt-out. It also holds RECIPIENT EMAIL ADDRESSES, so indefinite
  // retention is a data-minimization concern and not only a size one — 'archive' keeps the
  // evidence trail that a send was lawful while bounding the hot table. occurred_at is
  // DATABASE-stamped (a writer that stamps its own time could backdate an opt_in to outrank a
  // later opt_out), which is the column class this registry's header asks for.
  { table: 'venture_consent_events', timestampColumn: 'occurred_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-REFILL-00LHUVME: eva_scheduler_metrics was unbounded (140,302 rows / 12d at authoring,
  // x1.63 in 24h per row-growth-snapshot.cjs) and uncovered by RETENTION-POLICY-UNBOUNDED-001.
  // created_at verified on live schema (occurred_at also exists); 0 triggers/FKs/inbound-FKs.
  { table: 'eva_scheduler_metrics', timestampColumn: 'created_at',  hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001: account_usage_snapshots appends one row per account per
  // sample. At the sampler's cadence over a 3-account registry that is a few thousand rows a day,
  // growing forever — a table shipped without a reaper is a slow leak, so it gets one in the same
  // SD that creates it. Keyed on created_at (insert time); fetched_at also exists and is the
  // semantic read time, but created_at is the one that cannot be influenced by an upstream value.
  // The only consumer (fetchLastKnown) reads the most recent row per account, so a 90-day hot
  // window cannot strand it — the reading it wants is minutes old, not months.
  { table: 'account_usage_snapshots', timestampColumn: 'created_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 (FR-3): sub_agent_execution_results had no retention
  // policy despite high write volume (one row per sub-agent invocation). Verified every
  // automated consumer reads at most the last 30 days, so a 90-day hot window is safe.
  { table: 'sub_agent_execution_results', timestampColumn: 'created_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001: sms_inbound_log audits every inbound SMS webhook
  // attempt (including rejected/expired/spoofed) — unbounded write volume, no existing cap.
  // Covered by the existing weekly gha_cron:retention-enforce-cron.yml (no new cadence needed).
  { table: 'sms_inbound_log', timestampColumn: 'created_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 (operator-contract REAPER): belt_capacity_verdicts gets
  // one row per capacity-forecast tick. That cron runs every 10 minutes — ~52,500 rows a year,
  // forever, from a table whose whole purpose is to be queried over time. A trend table without a
  // reaper is the archetypal slow leak, so it gets one in the SD that creates it.
  //
  // TIMESTAMP COLUMN IS recorded_at, and it is DATABASE-stamped (DEFAULT now(), never sent by the
  // writer) — which is exactly the property this registry's header asks for: a column that cannot
  // be influenced by an upstream value.
  //
  // 90 days is safe against the only consumer. drive_score leg4 reads the row it JUST wrote
  // (scripts/cron/drive-report-sweep.mjs cites verdict_row_id from the current run), and the
  // auditor question this table exists to answer — "how long have we been in DEFICIT" — is asked
  // over days, not quarters. Archive-before-delete keeps the long tail available regardless.
  { table: 'belt_capacity_verdicts', timestampColumn: 'recorded_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001 (FR-3, operator-contract REAPER): the cost governor
  // appends one row per decision (regen/tier/anomaly/tune) — append-only audit volume. Reaped by
  // the existing weekly retention-enforce cron (no new cadence needed); 90-day hot window (the
  // self-tuner reads only the most-recent ~200 regen decisions).
  { table: 'cost_governor_log', timestampColumn: 'created_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-LEO-INFRA-HOLD-STATE-CONTRACT-001: one row per non-compliant hold/fence/floor write
  // while HOLD_STATE_CONTRACT_MODE=observe (default) -- unbounded, no uniqueness constraint,
  // unlike the bounded config tables above. Covered by the existing weekly
  // gha_cron:retention-enforce-cron.yml (no new cadence needed).
  { table: 'hold_state_contract_violations', timestampColumn: 'created_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
  // SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (operator-contract REAPER): drive_rank_snapshots is
  // INSERT-only by design (append-only, enforced by a DB trigger — never UPDATE/DELETE in normal
  // operation) and gets up to 5 rows every ~15 minutes from the armed standard_loop:backlog-rank
  // cron — ~175k rows/year, unbounded, the same class every other trend/verdict table above got a
  // reaper for. Timestamp column is created_at (DB-defaulted, DEFAULT now()), not the app-supplied
  // ranked_at, matching this registry's own principle of keying on a column no writer can backdate.
  //
  // 90 days is safe against the only consumer: leg2's cohort reader (lib/drive-loop/score/
  // leg2-cohort-reader.js) only ever selects the cohort nearest ~24h old, never anything older.
  { table: 'drive_rank_snapshots', timestampColumn: 'created_at', hotDays: DEFAULT_HOT_DAYS, mode: 'archive', perRunCap: DEFAULT_PER_RUN_CAP },
];

/**
 * REPORT-ONLY entries: surfaced by the CLI, never executed by it.
 * management_reviews_quarantine_20260610 is the reversibility backup from the
 * SD-LEO-INFRA-REVIVE-EVA-PURGE-MGMT-REVIEWS-001 purge — eligible for a manual
 * chairman-reviewed drop after its verification soak window.
 *
 * SD-LEO-INFRA-RETARGET-RESTORE-REHEARSAL-001: when this table is eventually
 * DROPped (still a separate, chairman-gated migration — NOT this SD), remove
 * this entry in the same PR. See scripts/dr/restore-rehearsal.mjs (Drill B no
 * longer reads this table), scripts/probe-purge-migration.mjs, and
 * scripts/sentinels/audit-security-linter.mjs for the other 3 breadcrumbed sites.
 */
export const SOAK_ENTRIES = [
  {
    table: 'management_reviews_quarantine_20260610',
    mode: 'soak_until',
    eligibleAfter: '2026-06-24',
    action: 'manual chairman-reviewed drop after the purge verification window (45,015 backup rows)',
    status: 'dr_drill_decoupled',
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
