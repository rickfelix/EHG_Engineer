// QF-20260913-812 — retire the cron_script:batch-mint-sweep.mjs periodic_process_registry row.
// Same mechanism SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-A used to retire
// cron_script:index-jam-detector.mjs (see scripts/one-off/qf-100-retire-singleton-relaunch-registry.mjs
// for the precedent pattern this mirrors): periodic_process_registry has no top-level retired_at/
// retired_reason columns (confirmed absent from every periodic_process_registry migration) —
// retirement is currently_expected_active=false (the watcher's own evaluateRow short-circuits to
// INTENTIONALLY_DOWN for such rows, never OVERDUE/UNVERIFIED) plus provenance merged into the
// existing liveness_source_ref JSONB.
//
// The row is now superseded: scripts/coordinator-startup-check.mjs's STANDARD_LOOPS gained a
// 'batch-mint-sweep' entry in this same QF, so enumerate-processes.mjs's coveredScripts exclusion
// (lib/periodic-liveness/enumerate-processes.mjs, the same logic that already excludes
// cron_script:index-jam-detector.mjs) stops re-seeding this row on every seed-periodic-process-
// registry.mjs run — the real cadence now lives on standard_loop:batch-mint-sweep instead.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const KEY = 'cron_script:batch-mint-sweep.mjs';
const RETIRED_REASON =
  'RETIRED (QF-20260913-812): superseded by standard_loop:batch-mint-sweep (coordinator ' +
  'STANDARD_LOOPS, session_arm: true), which now owns this cadence with a real liveness stamp ' +
  "(stampLastFired('standard_loop:batch-mint-sweep')). This row's own self_stamped liveness " +
  'source never received a stamp (last_fired_at stayed null, UNVERIFIED) and ' +
  'enumerate-processes.mjs excludes this script from re-discovery now that a STANDARD_LOOPS entry ' +
  'names it, so re-seeding would otherwise silently resurrect it. Reversible: re-arm ' +
  'currently_expected_active + remove the STANDARD_LOOPS entry if standard_loop:batch-mint-sweep ' +
  'is ever retired instead.';

async function main() {
  const { data: pre, error: preErr } = await sb.from('periodic_process_registry')
    .select('process_key, currently_expected_active, liveness_source_ref').eq('process_key', KEY);
  if (preErr) throw preErr;
  console.log(`[qf-812] pre-write target row count=${pre.length}`);
  console.log(JSON.stringify(pre, null, 2));
  if (pre.length !== 1) throw new Error(`expected exactly 1 target row, found ${pre.length} — refusing to write`);

  const ref = pre[0].liveness_source_ref && typeof pre[0].liveness_source_ref === 'object' ? pre[0].liveness_source_ref : {};
  const patch = {
    currently_expected_active: false,
    liveness_source_ref: { ...ref, retired_at: new Date().toISOString(), retired_reason: RETIRED_REASON },
    updated_at: new Date().toISOString(),
  };
  const { error: upErr } = await sb.from('periodic_process_registry').update(patch).eq('process_key', KEY);
  if (upErr) throw upErr;

  const { data: post, error: postErr } = await sb.from('periodic_process_registry')
    .select('process_key, currently_expected_active, liveness_source_ref').eq('process_key', KEY);
  if (postErr) throw postErr;
  console.log('[qf-812] readback after write:');
  console.log(JSON.stringify(post, null, 2));
  if (post[0].currently_expected_active !== false) throw new Error(`${KEY}: currently_expected_active did not flip to false`);
  if (!post[0].liveness_source_ref.retired_reason) throw new Error(`${KEY}: retired_reason missing after write`);
  console.log('[qf-812] DONE — row retired (currently_expected_active=false) with provenance, readback-verified.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('[qf-812] FAILED:', e.message); process.exit(1); });
}
