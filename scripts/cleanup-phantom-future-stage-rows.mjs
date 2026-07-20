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
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — both reads below are unfiltered
// scans (ventures grows with portfolio size; venture_stage_work is a per-venture-per-stage fanout
// table, likely larger still) whose results are cross-referenced to build the phantom-row delete
// list; a capped read would silently under-delete. The delete itself is chunked because it's
// built from this now-unbounded read.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');
const DELETE_CHUNK = 200;
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  let ventures, rows;
  try {
    ventures = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, name, current_lifecycle_stage')
      .order('id', { ascending: true }));
  } catch (e) { throw new Error(`ventures read failed: ${e.message}`); }
  const currentByVenture = new Map(ventures.map((v) => [v.id, v.current_lifecycle_stage ?? 0]));

  try {
    rows = await fetchAllPaginated(() => supabase
      .from('venture_stage_work')
      .select('id, venture_id, lifecycle_stage')
      .order('id', { ascending: true }));
  } catch (e) { throw new Error(`venture_stage_work read failed: ${e.message}`); }

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
  let deleted = 0;
  for (const idChunk of chunk(ids, DELETE_CHUNK)) {
    const { error: dErr, count } = await supabase
      .from('venture_stage_work')
      .delete({ count: 'exact' })
      .in('id', idChunk);
    if (dErr) throw new Error(`delete failed: ${dErr.message}`);
    deleted += count ?? idChunk.length;
  }
  console.log(`[cleanup] DELETED ${deleted} phantom future-stage row(s).`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
