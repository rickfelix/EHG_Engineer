/**
 * map-reader.mjs — reader for the Fable-suitability map (SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-A).
 *
 * Read side of the persistence seam. Child C (Solomon Mode-B fan-out) reads the LATEST score per
 * region through the v_fable_suitability_map_current view — NEVER the raw history table — so a
 * consumer always sees exactly one row per (region_key, repo): the highest score_version. The raw
 * table keeps every version for the section-11 ledger; the view is the "what is the current
 * ranking" surface.
 *
 * Like the writer, an absent (not-yet-ceremonially-applied) table surfaces as a typed
 * CEREMONY_PENDING result rather than an exception, so a caller can degrade gracefully before the
 * chairman apply ceremony runs.
 */

import { isMissingTableError } from './map-writer.mjs';

const CURRENT_VIEW = 'v_fable_suitability_map_current';

/**
 * Read the current suitability map (latest score_version per region), optionally filtered by
 * duty_cluster, ordered by composite_score DESC (NULLS effectively last via the view's own order,
 * re-sorted client-side for a stable ranking).
 *
 * @returns {Promise<{status:'ok', rows:object[]} | {status:'CEREMONY_PENDING', reason:string}>}
 */
export async function readCurrentMap(supabase, { dutyCluster = null, limit = null } = {}) {
  let query = supabase.from(CURRENT_VIEW).select('*');
  if (dutyCluster) query = query.eq('duty_cluster', dutyCluster);
  if (Number.isInteger(limit) && limit > 0) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return {
        status: 'CEREMONY_PENDING',
        reason: `${CURRENT_VIEW} not available — fable_suitability_map STAGED migration not yet chairman-applied (Postgres 42P01).`,
      };
    }
    throw new Error(`readCurrentMap: ${error.message}`);
  }

  const rows = (data || []).slice().sort((a, b) => (b.composite_score ?? -1) - (a.composite_score ?? -1));
  return { status: 'ok', rows };
}

/**
 * Read the full version history for a single region (all score_versions, newest first).
 * This is the ledger-grading read: Solomon joins a prediction made at score_version=N against a
 * later outcome, so it must see every version, not just the current one.
 */
export async function readRegionHistory(supabase, { regionKey, repo }) {
  if (typeof regionKey !== 'string' || regionKey.trim() === '') {
    throw new Error('readRegionHistory: regionKey is required');
  }
  if (typeof repo !== 'string' || repo.trim() === '') {
    throw new Error('readRegionHistory: repo is required');
  }
  const { data, error } = await supabase
    .from('fable_suitability_map')
    .select('*')
    .eq('region_key', regionKey)
    .eq('repo', repo)
    .order('score_version', { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      return {
        status: 'CEREMONY_PENDING',
        reason: 'fable_suitability_map STAGED migration not yet chairman-applied (Postgres 42P01).',
      };
    }
    throw new Error(`readRegionHistory: ${error.message}`);
  }
  return { status: 'ok', rows: data || [] };
}
