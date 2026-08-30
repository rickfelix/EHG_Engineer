// QF-20260830-100 — retire the two singleton-relaunch periodic_process_registry rows
// (currently_expected_active=false) with provenance, per chairman ruling A (2026-08-30).
// The watcher skips staleness evaluation entirely for currently_expected_active=false rows
// (per the column's own migration comment), so retired rows never accrue misses.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const KEYS = ['gha_cron:singleton-relaunch-cron.yml', 'standard_loop:singleton-relaunch'];
const RETIRED_REASON =
  'RETIRED (QF-20260830-100, chairman ruling A, 2026-08-30): scheduling armed but the relaunch ' +
  'consumer half was never built -- fired 4x (08-11 x2, 08-22 x2) with ZERO relaunches, fed ' +
  'false periodic-liveness escalations. GHA cron schedule dropped (workflow_dispatch kept); ' +
  'STANDARD_LOOPS entry removed. Reversible: re-arm SINGLETON_RELAUNCH_SCHEDULING_ENABLED + ' +
  're-add both sources if the consumer half is ever built.';

async function main() {
  const { data: pre, error: preErr } = await sb.from('periodic_process_registry')
    .select('process_key, currently_expected_active, liveness_source_ref').in('process_key', KEYS);
  if (preErr) throw preErr;
  console.log(`[qf-100] pre-write target row count=${pre.length}`);
  console.log(JSON.stringify(pre, null, 2));
  if (pre.length !== 2) throw new Error(`expected exactly 2 target rows, found ${pre.length} — refusing to write`);

  for (const row of pre) {
    const ref = row.liveness_source_ref && typeof row.liveness_source_ref === 'object' ? row.liveness_source_ref : {};
    const patch = {
      currently_expected_active: false,
      liveness_source_ref: { ...ref, retired_at: new Date().toISOString(), retired_reason: RETIRED_REASON },
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await sb.from('periodic_process_registry').update(patch).eq('process_key', row.process_key);
    if (upErr) throw upErr;
  }

  const { data: post, error: postErr } = await sb.from('periodic_process_registry')
    .select('process_key, currently_expected_active, liveness_source_ref').in('process_key', KEYS);
  if (postErr) throw postErr;
  console.log('[qf-100] readback after write:');
  console.log(JSON.stringify(post, null, 2));
  for (const row of post) {
    if (row.currently_expected_active !== false) throw new Error(`${row.process_key}: currently_expected_active did not flip to false`);
    if (!row.liveness_source_ref.retired_reason) throw new Error(`${row.process_key}: retired_reason missing after write`);
  }
  console.log('[qf-100] DONE — both rows retired (currently_expected_active=false) with provenance, readback-verified.');
}

main().catch((e) => { console.error('[qf-100] FAILED:', e.message); process.exit(1); });
