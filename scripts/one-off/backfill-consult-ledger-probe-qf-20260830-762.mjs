#!/usr/bin/env node
// QF-20260830-762: bounded, counted one-time backfill. Relabels historical
// probe='decision_rubric' consult-placeholder rows (written by the pre-fix
// lib/adam/should-consult-solomon.js) to probe='pre_send_consult', so the
// decision_rubric audit pass rate is computed over real audit rows only.
//
// Two phases, run independently — phase 2 requires
// database/migrations/20260830_adam_adherence_ledger_consult_verdicts_STAGED.sql
// to be applied first (check_class='consult' would otherwise violate the live
// CHECK constraint):
//   node scripts/one-off/backfill-consult-ledger-probe-qf-20260830-762.mjs            (dry-run, phase 1)
//   node scripts/one-off/backfill-consult-ledger-probe-qf-20260830-762.mjs --execute  (phase 1, live)
//   node scripts/one-off/backfill-consult-ledger-probe-qf-20260830-762.mjs --execute --check-class  (phase 2, after migration applies)
//
// STANDING CAUTION (coordinator, this session): any multi-row write must be BOUNDED AND
// COUNTED — pre-count and a sample printed before it runs. This script does both and never
// touches `verdict` (only probe/check_class), so it carries none of the CHECK-constraint risk
// the migration itself is scoped to isolate.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DETAIL_MATCHES = [
  'solomon-consult-async::pending-reconcile',
  'solomon-consult-timeout::documented-proceed',
];

async function main() {
  const execute = process.argv.includes('--execute');
  const withCheckClass = process.argv.includes('--check-class');

  // fetchAllPaginated, not a single .limit() — a plain limit silently truncates at PostgREST's
  // 1000-row cap (measured: this exact query returns exactly 1000 with .limit(2000), which is the
  // cap firing, not the true count) and this backfill's whole point is an ACCURATE pre-count.
  const matched = await fetchAllPaginated(() => {
    let q = supabase
      .from('adam_adherence_ledger')
      .select('id, probe, check_class, detail')
      .in('detail', DETAIL_MATCHES)
      .order('id', { ascending: true }); // unique tiebreaker for stable pagination
    return withCheckClass
      ? q.eq('probe', 'pre_send_consult').is('check_class', null)
      : q.eq('probe', 'decision_rubric');
  });

  console.log(`Matched ${matched.length} row(s) for ${withCheckClass ? 'phase 2 (check_class backfill)' : 'phase 1 (probe relabel)'}.`);
  console.log('Sample (first 5):', JSON.stringify(matched.slice(0, 5), null, 2));

  if (!execute) {
    console.log('DRY-RUN — no rows changed. Pass --execute to apply.');
    return;
  }
  if (matched.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  // Batched, not one giant .in() — 900+ UUIDs in one filter risks the client's urlLengthLimit.
  const BATCH_SIZE = 200;
  const patch = withCheckClass ? { check_class: 'consult' } : { probe: 'pre_send_consult', check_class: 'consult' };
  let updated = 0;
  let checkClassDeferred = false;
  for (let i = 0; i < matched.length; i += BATCH_SIZE) {
    const batchIds = matched.slice(i, i + BATCH_SIZE).map((r) => r.id);
    // batchIds came from a fresh SELECT of these exact PKs, so a no-error .in('id', batchIds)
    // update means every one of them matched — batchIds.length is the true count, no separate
    // count-mode select needed (and one less request per batch).
    const { error: updErr } = await supabase.from('adam_adherence_ledger').update(patch).in('id', batchIds);
    if (updErr) {
      if (!withCheckClass && /check_class/i.test(updErr.message || '')) {
        checkClassDeferred = true;
        const retry = await supabase.from('adam_adherence_ledger').update({ probe: 'pre_send_consult' }).in('id', batchIds);
        if (retry.error) throw retry.error;
        updated += batchIds.length;
        continue;
      }
      throw updErr;
    }
    updated += batchIds.length;
  }
  console.log(`Updated ${updated} row(s) total.${checkClassDeferred ? ' check_class rejected (migration not yet applied) — deferred to phase 2, probe relabeled only.' : ''}`);
}

main().catch((e) => {
  console.error('FAILED:', e.message || e);
  process.exit(1);
});
