/**
 * Work-boundary gauges (SD-LEO-INFRA-009-LEAF-WORK-001)
 *
 * Generalizes the coordinator lesson -- the boundary each role must not cross (coordinator never
 * sources, Adam never claims/builds, Solomon never dispatches) -- into gauge rows verified from
 * durable row evidence instead of contract prose. Mirrors the pure-detector / I/O-fetch split
 * already established by computeClaimableLeaves + countUnrankedClaimableLeaves
 * (scripts/coordinator-backlog-rank.mjs + scripts/gauge-unranked-claimable-leaves.mjs).
 *
 * @module lib/governance/work-boundary-gauges
 */

/**
 * Pure: does an SD's sourced_by marker attribute authorship to the coordinator role?
 * Mirrors the already-shipped 'adam' sourced_by convention (lib/sourcing-engine/adam-direct-registry.js)
 * -- a coordinator-authored row would be stamped the same way, just with a 'coordinator' prefix.
 * @param {Array<{sd_key: string, sourced_by: (string|null)}>} sdRows
 * @returns {{count: number, flagged: string[]}}
 */
export function detectCoordinatorSourced(sdRows) {
  const flagged = (sdRows || [])
    .filter((r) => typeof r?.sourced_by === 'string' && r.sourced_by.toLowerCase().startsWith('coordinator'))
    .map((r) => r.sd_key);
  return { count: flagged.length, flagged };
}

/**
 * Pure: did any session in roleSessionIds ever hold a claim on an SD -- live OR historical?
 * A role that claimed then released still trips this (a boundary breach is a permanent finding,
 * not erased by release).
 * @param {Array<{sd_key: string, claiming_session_id: (string|null), claim_history: Array<{session_id: string}>}>} sdRows
 * @param {Iterable<string>} roleSessionIds
 * @returns {{count: number, flagged: string[]}}
 */
export function detectRoleClaimed(sdRows, roleSessionIds) {
  const roleSet = new Set(roleSessionIds || []);
  const flagged = [];
  for (const r of sdRows || []) {
    const claimedNow = Boolean(r?.claiming_session_id && roleSet.has(r.claiming_session_id));
    const claimedEver = Array.isArray(r?.claim_history) && r.claim_history.some((c) => c && roleSet.has(c.session_id));
    if (claimedNow || claimedEver) flagged.push(r.sd_key);
  }
  return { count: flagged.length, flagged };
}

/**
 * Pure: did any session in roleSessionIds ever set an SD's dispatch_rank_by?
 * @param {Array<{sd_key: string, dispatch_rank_by: (string|null)}>} sdRows
 * @param {Iterable<string>} roleSessionIds
 * @returns {{count: number, flagged: string[]}}
 */
export function detectRoleDispatched(sdRows, roleSessionIds) {
  const roleSet = new Set(roleSessionIds || []);
  const flagged = (sdRows || [])
    .filter((r) => r?.dispatch_rank_by && roleSet.has(r.dispatch_rank_by))
    .map((r) => r.sd_key);
  return { count: flagged.length, flagged };
}

/**
 * I/O: the ONE Supabase read shared across all 3 boundary detectors, normalized to a flat shape.
 * Fail-loud (throws) on a query error -- callers (gauge-runner's per-detector try/catch) already
 * treat a thrown detector as non-fatal/advisory, matching every other resolver in this codebase.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{sd_key: string, claiming_session_id: (string|null), sourced_by: (string|null), dispatch_rank_by: (string|null), claim_history: Array}>>}
 */
export async function fetchSdBoundaryRows(supabase) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: whole-corpus read — paginated past the
  // PostgREST 1000-row cap (the SD corpus exceeds it; a capped read would silently hide boundary
  // breaches). Fail-loud (throw) policy preserved via the wrap.
  const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, claiming_session_id, metadata')
      .order('sd_key')); // unique-key tiebreaker for stable pagination
  } catch (e) {
    throw new Error('fetchSdBoundaryRows failed: ' + ((e && e.message) || String(e)));
  }
  return (data || []).map((r) => ({
    sd_key: r.sd_key,
    claiming_session_id: r.claiming_session_id,
    sourced_by: (r?.metadata && typeof r.metadata.sourced_by === 'string') ? r.metadata.sourced_by : null,
    dispatch_rank_by: (r?.metadata && typeof r.metadata.dispatch_rank_by === 'string') ? r.metadata.dispatch_rank_by : null,
    claim_history: Array.isArray(r?.metadata?.claim_history) ? r.metadata.claim_history : [],
  }));
}
