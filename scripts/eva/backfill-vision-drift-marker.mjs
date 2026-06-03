#!/usr/bin/env node
/**
 * FR-5 — one-time SET-ONCE drift-check-required backfill marker (SD-LEO-INFRA-STAGE-VISION-DRIFT-001).
 *
 * Ventures already parked at Stage 19 before the vision-drift producer shipped have no
 * vision_drift_verdict, so they are invisible to the (dormant) drift gate. This backfill marks each such
 * venture as drift-check-required so an operator/skill can run /leo-drift-probe on it — WITHOUT writing a
 * verdict (a verdict would short-circuit the judge).
 *
 * SET-ONCE / idempotent (testing-agent condition C3): a venture is a candidate ONLY when
 *   lifecycle_stage = 19 AND advisory_data.vision_drift_verdict IS NULL AND advisory_data.vision_drift_check_required IS NULL.
 * The marker is written via read-merge-write spread (never clobbers sibling advisory_data keys, e.g. a
 * vision_acceptance_verdict). Re-running is a no-op: an already-marked or already-evaluated venture is skipped.
 *
 * This script NEVER advances a venture and NEVER writes lifecycle_stage / governance — it only sets the
 * advisory_data.vision_drift_check_required marker.
 *
 * Usage:
 *   node scripts/eva/backfill-vision-drift-marker.mjs            # dry-run (default): report candidates, ZERO writes
 *   node scripts/eva/backfill-vision-drift-marker.mjs --apply    # write the marker to candidates
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export const S19 = 19;
export const MARKER_KEY = 'vision_drift_check_required';
export const VERDICT_KEY = 'vision_drift_verdict';

/**
 * Scan S19 ventures and (when apply=true) set the SET-ONCE drift-check-required marker on those with
 * neither a recorded verdict nor an existing marker. Pure of advance/governance writes.
 *
 * @param {{supabase:object, apply?:boolean, nowIso?:string, logger?:object}} args
 * @returns {Promise<{scanned:number, marked:number, skipped:number, candidates:string[]}>}
 */
export async function backfillDriftCheckMarker({ supabase, apply = false, nowIso, logger = console }) {
  const { data: rows, error } = await supabase
    .from('venture_stage_work')
    .select('id, venture_id, advisory_data')
    .eq('lifecycle_stage', S19);
  if (error) throw new Error(`backfill: read venture_stage_work failed: ${error.message}`);

  const result = { scanned: (rows || []).length, marked: 0, skipped: 0, candidates: [] };
  const stamp = nowIso || new Date().toISOString();

  for (const row of (rows || [])) {
    const adv = row.advisory_data || {};
    // SET-ONCE predicate: skip if already evaluated OR already marked.
    if (adv[VERDICT_KEY] != null || adv[MARKER_KEY] != null) { result.skipped++; continue; }
    result.candidates.push(row.venture_id);
    if (!apply) continue;
    const merged = { ...adv, [MARKER_KEY]: { requested_at: stamp, reason: 's19-backfill', set_by: 'backfill-vision-drift-marker' } };
    const { error: upErr } = await supabase.from('venture_stage_work').update({ advisory_data: merged }).eq('id', row.id);
    if (upErr) { logger?.warn?.(`[backfill] mark failed for venture ${row.venture_id}: ${upErr.message}`); continue; }
    result.marked++;
  }
  return result;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = buildSupabase();
  const res = await backfillDriftCheckMarker({ supabase, apply });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...res }, null, 2));
  if (!apply && res.candidates.length) {
    console.log(`\n${res.candidates.length} S19 venture(s) would be marked drift-check-required. Re-run with --apply to write.`);
  }
  process.exit(0);
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/eva/backfill-vision-drift-marker.mjs');
if (invokedDirectly) {
  main().catch((err) => { console.error(`[backfill] fatal: ${err.message}`); process.exit(2); });
}
