#!/usr/bin/env node
/**
 * SD-LEO-INFRA-HEALTH-ROLLUP-CORRECTNESS-001 FR-4
 *
 * One-time (idempotent) data sweep: delete phantom future-stage venture_stage_work rows —
 * rows whose lifecycle_stage exceeds the venture's current_lifecycle_stage. These were written
 * by the (now-gated, FR-3) sd-completed.js S20/S21 writer for ventures held below those stages,
 * and they poison the health rollup. Scoped strictly to lifecycle_stage > current_lifecycle_stage,
 * so no legitimate at-or-below-current row is ever touched.
 *
 * Usage:
 *   node scripts/cleanup-phantom-future-stage-rows.mjs          # dry-run (default) — reports only
 *   node scripts/cleanup-phantom-future-stage-rows.mjs --apply  # perform the scoped delete
 *
 * The correlated predicate (lifecycle_stage > ventures.current_lifecycle_stage) is computed in JS
 * (the Supabase JS client can't express the cross-table comparison), then rows are deleted by id.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: ventures, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage');
  if (vErr) throw new Error(`ventures read failed: ${vErr.message}`);
  const currentByVenture = new Map(ventures.map((v) => [v.id, v.current_lifecycle_stage ?? 0]));

  const { data: rows, error: wErr } = await supabase
    .from('venture_stage_work')
    .select('id, venture_id, lifecycle_stage');
  if (wErr) throw new Error(`venture_stage_work read failed: ${wErr.message}`);

  const phantom = rows.filter((r) => {
    const cur = currentByVenture.get(r.venture_id);
    return cur != null && r.lifecycle_stage != null && r.lifecycle_stage > cur;
  });

  console.log(`[cleanup] total venture_stage_work rows: ${rows.length}`);
  console.log(`[cleanup] phantom future-stage rows (lifecycle_stage > current_lifecycle_stage): ${phantom.length}`);
  for (const p of phantom) {
    const v = ventures.find((x) => x.id === p.venture_id);
    console.log(`  - venture "${v?.name || p.venture_id}" current=${currentByVenture.get(p.venture_id)} phantom stage=${p.lifecycle_stage} (row ${p.id})`);
  }

  if (phantom.length === 0) {
    console.log('[cleanup] nothing to delete.');
    return;
  }
  if (!APPLY) {
    console.log('[cleanup] DRY-RUN — re-run with --apply to delete the rows above.');
    return;
  }

  const ids = phantom.map((p) => p.id);
  const { error: dErr, count } = await supabase
    .from('venture_stage_work')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (dErr) throw new Error(`delete failed: ${dErr.message}`);
  console.log(`[cleanup] DELETED ${count ?? ids.length} phantom future-stage row(s).`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
