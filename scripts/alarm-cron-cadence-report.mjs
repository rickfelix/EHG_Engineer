#!/usr/bin/env node
/**
 * FR-6 delivered-cadence read for the FR-5 host-local alarm crons.
 * SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001.
 *
 * Deliberately NOT a new evaluator: reuses scripts/periodic-liveness-watcher.mjs's own
 * `evaluateRow`, the exact function the fleet's watcher-of-watchers already runs against every
 * periodic_process_registry row. Building a second cadence-classifier here would be the same
 * "half that could be reached was fixed, the parallel mechanism drifts" defect class this whole
 * SD exists to close for loop-liveness -- there is no reason a delivery-cadence read should get
 * its own bespoke logic when a correct, tested one already exists and this SD's own rows are
 * registered rows in the SAME table it already reads.
 *
 * Reports OK / OVERDUE / UNVERIFIED / INTENTIONALLY_DOWN per alarm cron -- never a bare `0` on
 * error (an unreadable registry read reports every row UNVERIFIED, matching evaluateRow's own
 * never-false-OVERDUE, never-silently-live convention for missing data).
 *
 * Usage:
 *   node scripts/alarm-cron-cadence-report.mjs            # human-readable
 *   node scripts/alarm-cron-cadence-report.mjs --json     # machine-readable
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import { evaluateRow } from './periodic-liveness-watcher.mjs';

/**
 * The FR-5 alarm crons this report covers. Kept as a literal list (not re-derived from
 * ALARM_TASKS in setup-alarm-cron-tasks.mjs) because the two are DIFFERENT sets by design:
 * FR-5 also host-registers periodic-liveness-watcher.mjs's timestamp classes, which is
 * deliberately NOT given its own host_cron:* row here (it already self-tracks via its own
 * __watcher_self__ mechanism -- see seed-periodic-process-registry.mjs's seedHostAlarmCrons
 * doc comment for the full reasoning).
 */
export const REPORTED_PROCESS_KEYS = Object.freeze([
  'host_cron:fleet-down-alert',
  'host_cron:fleet-worker-pulse',
]);

/**
 * PURE: given the rows actually found (a subset of REPORTED_PROCESS_KEYS may be missing if the
 * registry was never seeded), evaluate each and report UNVERIFIED for any key with no row at all
 * -- never a bare 0 and never silently omitted.
 * @param {Array<object>} rows - periodic_process_registry rows
 * @param {object} [ctx] - forwarded to evaluateRow (nowMs override for deterministic tests)
 */
export async function buildCadenceReport(rows, ctx = {}) {
  const byKey = new Map((rows || []).map((r) => [r.process_key, r]));
  const results = [];
  for (const key of REPORTED_PROCESS_KEYS) {
    const row = byKey.get(key);
    if (!row) {
      results.push({ process_key: key, state: 'UNVERIFIED', reason: 'not_registered_in_periodic_process_registry' });
      continue;
    }
    try {
      const evaluation = await evaluateRow(row, ctx);
      results.push(evaluation);
    } catch (err) {
      // A throwing evaluator must never surface as a numeric/blank result -- fail toward the
      // same UNVERIFIED reporting convention as a missing row.
      results.push({ process_key: key, state: 'UNVERIFIED', reason: `evaluator_threw: ${err.message}` });
    }
  }
  return results;
}

export async function main(argv = process.argv, deps = {}) {
  const asJson = argv.includes('--json');
  const supabase = deps.supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let rows = [];
  try {
    const { data, error } = await supabase
      .from('periodic_process_registry')
      .select('*')
      // count-truncation-diff-lint: explicit bound -- REPORTED_PROCESS_KEYS is a fixed 2-entry
      // list (see its own doc comment above), so the IN clause can never match more than that
      // many rows; 10 is a generous literal cap that tolerates future key additions.
      .in('process_key', REPORTED_PROCESS_KEYS)
      .limit(10);
    if (error) throw new Error(error.message);
    rows = data || [];
  } catch (err) {
    // Registry unreadable: report every cron UNVERIFIED, never 0/blank/silent.
    console.error(`[alarm-cron-cadence-report] registry read failed, reporting UNVERIFIED for all: ${err.message}`);
  }

  const results = await buildCadenceReport(rows);

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('[alarm-cron-cadence-report] FR-6 delivered-cadence read:');
    for (const r of results) {
      const age = r.age_ms != null ? `, age=${Math.round(r.age_ms / 60000)}min` : '';
      const reason = r.reason ? ` (${r.reason})` : '';
      console.log(`  ${r.process_key}: ${r.state}${age}${reason}`);
    }
  }
  const anyOverdue = results.some((r) => r.state === 'OVERDUE');
  return { exitCode: anyOverdue ? 1 : 0, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(({ exitCode }) => { process.exitCode = exitCode; })
    .catch((err) => { console.error('alarm-cron-cadence-report fatal:', err.message); process.exitCode = 2; });
}
