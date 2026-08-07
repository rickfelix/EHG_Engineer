#!/usr/bin/env node
/**
 * QF-20260807-190 — reap e2e fixture residue from periodic_process_registry.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────
 * MEASURED 2026-08-07T16:51Z: 53 rows whose process_key begins `__e2e_periodic_liveness_` had
 * leaked into the PRODUCTION registry and were 49 of the 64 OVERDUE rows — 77% of every alarm on
 * the fleet-health panel, against 15 real ones. All carry expected_interval_seconds=5, so they
 * alarm within seconds of creation and never stop; max consecutive_miss_count was 953.
 *
 * That is not cosmetic. The panel is the surface an operator scans to decide whether anything
 * needs attention, and a permanent block of false OVERDUE entries trains the reader to skip the
 * section — which is exactly where a genuinely dead process would appear.
 *
 * ── THE PREDICATE IS THE WHOLE SAFETY ARGUMENT ────────────────────────────────────────────
 * `__e2e_` ONLY, never a bare `__` prefix. Two REAL rows lead with `__`:
 *   __watcher_self__              — the liveness watcher's own marker
 *   __eva_scheduler_watcher_self  — the scheduler watcher's own marker
 * Reaping either BLINDS THE INSTRUMENT THIS REAPER EXISTS TO UNBLIND. The second one was not in
 * the original report and surfaced only by enumerating prefixes FROM THE DATA rather than from
 * the one example that had been noticed — which is why isReapable is a pure, tested predicate
 * and not an inline filter string.
 *
 * AND NEVER MATCH ON NAME KEYWORDS. Three live rows contain test/fixture/sample in their keys —
 * gha_cron:venture-fixture-sweep.yml, standard_loop:account-usage-sample,
 * cron_script:account-usage-sample.mjs — and they read as REAL processes whose names merely sound
 * test-shaped. A name is a claim, not evidence.
 *
 * ── DRY-RUN IS THE DEFAULT, AND THAT IS NOT POLITENESS ────────────────────────────────────
 * This deletes rows from a production table. Nothing here constitutes authorization to do that;
 * the QF that specifies this script says so explicitly, and a QF description is not an approval.
 * So the default prints exactly what WOULD be deleted and exits without writing. `--apply`
 * requires the operator to have obtained that authorization separately.
 *
 * Usage:
 *   node scripts/reap-e2e-liveness-fixtures.mjs            # dry run (default) — prints the plan
 *   node scripts/reap-e2e-liveness-fixtures.mjs --apply    # delete, once authorized
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
// The CANONICAL entry-point predicate, not a hand-rolled one. My first version compared
// import.meta.url to a `file://` + process.argv[1] string with a slash swap, and on Windows it
// silently NEVER MATCHED — the script ran, printed nothing, and exited 0. A reaper whose main()
// never fires is indistinguishable from a reaper that found nothing to reap, which is the exact
// class of defect this QF is about. Caught only because the dry run's output was empty.
import { isMainModule } from '../lib/utils/is-main-module.js';

/** The one prefix that is fixture residue. Exported so the safety argument is testable. */
export const E2E_FIXTURE_PREFIX = '__e2e_';

/**
 * True iff this row is e2e fixture residue and safe to delete.
 *
 * Deliberately takes the KEY ONLY: a predicate that also consulted last_state or age could be
 * argued into reaping a real row that merely looked abandoned. Provenance decides, not symptoms.
 */
export function isReapable(processKey) {
  return typeof processKey === 'string' && processKey.startsWith(E2E_FIXTURE_PREFIX);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // select('*') rather than naming columns: a phantom column in a PostgREST select returns 42703
  // and poisons the ENTIRE projection, which would render as "no residue found".
  const { data, error } = await supabase.from('periodic_process_registry').select('*');
  if (error) {
    console.error(`[reap-e2e] read failed: ${error.message}`);
    process.exit(1);
  }

  const reapable = (data || []).filter((r) => isReapable(r.process_key));
  const overdue = reapable.filter((r) => r.last_state === 'OVERDUE').length;
  const allOverdue = (data || []).filter((r) => r.last_state === 'OVERDUE').length;

  console.log(`[reap-e2e] registry rows: ${(data || []).length}`);
  console.log(`[reap-e2e] fixture residue (${E2E_FIXTURE_PREFIX}*): ${reapable.length}`);
  console.log(`[reap-e2e] of which OVERDUE: ${overdue} of ${allOverdue} total OVERDUE`);
  // Name the survivors so the operator can see the reaper is NOT touching them.
  const dunderKept = (data || []).filter((r) => /^__/.test(r.process_key || '') && !isReapable(r.process_key));
  console.log(`[reap-e2e] __-leading rows DELIBERATELY KEPT: ${dunderKept.map((r) => r.process_key).join(', ') || '(none)'}`);

  if (reapable.length === 0) {
    console.log('[reap-e2e] nothing to reap.');
    return;
  }

  if (!apply) {
    console.log('[reap-e2e] DRY RUN — no rows deleted. Re-run with --apply once deletion is authorized.');
    for (const r of reapable) console.log(`  would delete: ${r.process_key}`);
    return;
  }

  // Delete BY EXPLICIT KEY LIST, not by a LIKE pattern. The keys were already filtered through
  // isReapable in this process, so the write cannot widen beyond what was just printed — a
  // server-side pattern would be a second, unreviewed representation of the predicate.
  const keys = reapable.map((r) => r.process_key);
  const { error: delErr, count } = await supabase
    .from('periodic_process_registry')
    .delete({ count: 'exact' })
    .in('process_key', keys);
  if (delErr) {
    console.error(`[reap-e2e] delete failed: ${delErr.message}`);
    process.exit(1);
  }
  // Report what LANDED, not what was attempted.
  console.log(`[reap-e2e] deleted ${count ?? 'unknown'} row(s) of ${keys.length} targeted.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[reap-e2e] ${e?.message || e}`); process.exit(1); });
}
