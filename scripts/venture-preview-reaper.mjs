#!/usr/bin/env node
/**
 * TTL reaper for venture_preview_instances (deploy-pipeline Child B, FR-3).
 *
 * Sweeps rows with expires_at < now() AND status IN ('planned','live'):
 *   --dry-run  list reap-eligible instances, mutate NOTHING (default is real mode)
 *   real mode  invoke teardown through the injected adapter seam (plan-mode teardown
 *              until credentials exist — no cloud CLI reached) and mark rows
 *              status='reaped' with metadata.reaped_at.
 *
 * Idempotent: reaped/failed rows are never re-processed; a second run over the
 * same set reaps zero rows. Exit 0 on success (including zero eligible),
 * exit 1 on query/update failure.
 *
 * Usage: node scripts/venture-preview-reaper.mjs [--dry-run]
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';

export const REAP_ELIGIBLE_STATUSES = Object.freeze(['planned', 'live']);

/** Pure eligibility predicate (unit-tested): expired AND still planned/live. */
export function isReapEligible(row, nowIso) {
  if (!row || !row.expires_at) return false;
  if (!REAP_ELIGIBLE_STATUSES.includes(row.status)) return false;
  return new Date(row.expires_at).getTime() < new Date(nowIso).getTime();
}

/**
 * Run one reaper sweep.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ dryRun?: boolean, now?: () => Date, teardownAdapter?: (row: object) => Promise<void> }} [opts]
 * @returns {Promise<{eligible: object[], reaped: string[], dryRun: boolean}>}
 */
export async function reapExpiredPreviews(supabase, opts = {}) {
  const dryRun = opts.dryRun === true;
  const now = opts.now || (() => new Date());
  const nowIso = now().toISOString();

  const { data, error } = await supabase
    .from('venture_preview_instances')
    .select('id, venture_id, sha, fixture_id, status, url, expires_at, metadata')
    .in('status', [...REAP_ELIGIBLE_STATUSES])
    .lt('expires_at', nowIso);
  if (error) throw new Error(`reaper: eligibility query failed: ${error.message}`);

  const eligible = (data || []).filter((r) => isReapEligible(r, nowIso));
  if (dryRun) return { eligible, reaped: [], dryRun: true };

  const reaped = [];
  for (const row of eligible) {
    if (opts.teardownAdapter) {
      // Adapter seam: real cloud teardown when credentials land; plan-mode no-op today.
      await opts.teardownAdapter(row);
    }
    const { error: upErr } = await supabase
      .from('venture_preview_instances')
      .update({ status: 'reaped', metadata: { ...(row.metadata || {}), reaped_at: nowIso, reaped_by: 'venture-preview-reaper' } })
      .eq('id', row.id)
      .in('status', [...REAP_ELIGIBLE_STATUSES]); // guard: never overwrite a concurrent reap/fail
    if (upErr) throw new Error(`reaper: failed to mark ${row.id} reaped: ${upErr.message}`);
    reaped.push(row.id);
  }
  return { eligible, reaped, dryRun: false };
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isDirectRun) {
  const dryRun = process.argv.includes('--dry-run');
  try {
    const supabase = createSupabaseServiceClient();
    const { eligible, reaped } = await reapExpiredPreviews(supabase, { dryRun });
    for (const row of eligible) {
      console.log(`${dryRun ? '[dry-run] reap-eligible' : 'reaped'}: ${row.id} venture=${row.venture_id} sha=${row.sha} status=${row.status} expired=${row.expires_at}`);
    }
    console.log(`${dryRun ? 'Would reap' : 'Reaped'} ${dryRun ? eligible.length : reaped.length} instance(s).`);
    process.exit(0);
  } catch (e) {
    console.error(`venture-preview-reaper: ${e?.message || e}`);
    process.exit(1);
  }
}
