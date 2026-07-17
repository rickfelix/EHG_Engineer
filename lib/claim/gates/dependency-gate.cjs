/**
 * Shared claim DEPENDENCY gate — ONE resolution, raw-axes verdict, TWO caller polarities.
 * SD-ARCH-HOTSPOT-SD-START-001 FR-2 (prospective-testing D3/D4/D5).
 *
 * WHY RAW AXES, NOT AN allow BOOLEAN: the two claim CLIs apply OPPOSITE polarities
 * to the same facts —
 *   - worker-checkin (draftDepsSatisfied heritage) fails CLOSED: an unresolved ref
 *     or a query error means SKIP the candidate (never claim a maybe-blocked SD).
 *   - sd-start (evaluateDependencyGate heritage) warns-never-blocks on unresolved
 *     refs (blocking on a bad reference would strand the SD forever) and fails
 *     OPEN on query errors, refusing only CONFIRMED-incomplete deps (--force
 *     downgrades that refusal to a warning).
 * A single `allowed` boolean cannot preserve both (prospective-testing CRITICAL
 * D3/D4), so this gate returns the classified axes and each caller applies its
 * native polarity: checkin via depsSatisfiedFromVerdict(); sd-start by feeding
 * verdict.resolved into lib/sd-start/dependency-gate.mjs evaluateDependencyGate
 * (which stays the pure refuse/warn SSOT).
 *
 * ONE RESOLUTION PATH (the convergence this SD exists for): dependency-shape
 * handling from lib/fleet/claim-eligibility.cjs draftDepsSatisfied — plain text
 * ("SD-X needs Y"), {sd_id}, {sd_key}, "none"/"None" sentinels, ref-less notes —
 * PLUS the metadata.blocked_on_sd fold (QF-20260706-786: re-derived from LIVE
 * status every call, independent of any boolean flag), PLUS sd-start's richer
 * status lookup that matches referenced SDs by sd_key OR id (uuid refs resolve
 * instead of dangling). NOTE for checkin: uuid refs that previously came back
 * unresolved (sd_key-only lookup → fail-closed skip) now RESOLVE; a ref that
 * resolves to a completed SD stops skipping (strictly more accurate — the skip
 * was a resolution gap, not a policy), while non-completed resolutions still
 * block. The fail-closed POLARITY itself is unchanged.
 *
 * NO audit writes here — DEPENDENCY_GATE_REFUSED stays in the sd-start caller
 * (D5: checkin writes no dependency audit today and must not start). No console,
 * no process.exit, no argv/env reads (grep-pinned by the unit suite).
 *
 * @module lib/claim/gates/dependency-gate
 */
'use strict';

const { extractAllDependencyRefs } = require('../../utils/parse-sd-dependencies.cjs');

/** Extract referenced SD keys/ids. Pure. Delegates to the SHARED superset extractor
 *  (FR-1, SD-LEO-INFRA-MAKE-WSJF-SELF-001): top-level dependencies + the
 *  metadata.{dependencies,depends_on,blocked_by_sd_key,blocked_on_sd} folds — a strict
 *  behavioral superset of the old dependencies+blocked_on_sd resolution, so this gate,
 *  draftDepsSatisfied and the WSJF fetcher can no longer diverge on dependency shape. */
function extractDependencyRefs(sd) {
  return extractAllDependencyRefs(sd);
}

/**
 * Resolve + classify an SD's declared dependencies.
 *
 * @param {object} supabase - service client
 * @param {object} sd - SD row; needs `dependencies` (fetched when absent and
 *   `id`/`sd_key` is present) and `metadata` (for the blocked_on_sd fold)
 * @returns {Promise<{
 *   blocking: Array<{sd_id: string, status: string}>,
 *   unresolved: Array<{sd_id: string, status: null}>,
 *   satisfied: Array<{sd_id: string, status: 'completed'}>,
 *   resolved: Array<{sd_id: string, status: string|null}>,
 *   queryError: string|null
 * }>} raw axes; on queryError the axis arrays are empty and callers apply
 *   their native error polarity (checkin: skip; sd-start: proceed-with-warning)
 */
async function evaluateClaimDependencyGate(supabase, sd) {
  const empty = { blocking: [], unresolved: [], satisfied: [], resolved: [], queryError: null };
  const row = sd || {};
  let deps = row.dependencies;
  try {
    // sd-start's getSDDetails historically omitted `dependencies`; fetch it when
    // the caller did not load it (undefined — an explicit [] / null is respected).
    if (deps === undefined && (row.id || row.sd_key)) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('dependencies')
        .or(row.id ? `id.eq.${row.id}` : `sd_key.eq.${row.sd_key}`)
        .maybeSingle();
      if (error) throw error;
      deps = data ? data.dependencies : null;
    }
    const refs = extractDependencyRefs({ ...row, dependencies: deps });
    if (!refs.length) return empty;

    // Richer lookup than draftDepsSatisfied's sd_key-only .in(): match by sd_key
    // OR id so uuid-shaped refs resolve (sd-start heritage). Statuses keyed by
    // BOTH columns so each ref finds its row regardless of which form it used.
    const keyList = refs.map((k) => `"${String(k).replace(/"/g, '')}"`).join(',');
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status')
      .or(`sd_key.in.(${keyList}),id.in.(${keyList})`);
    if (error) throw error;

    const statusByRef = {};
    for (const r of data || []) {
      if (r.sd_key) statusByRef[r.sd_key] = r.status;
      if (r.id) statusByRef[r.id] = r.status;
    }
    const resolved = refs.map((k) => ({ sd_id: k, status: statusByRef[k] || null }));
    return {
      blocking: resolved.filter((d) => d.status && d.status !== 'completed'),
      unresolved: resolved.filter((d) => !d.status),
      satisfied: resolved.filter((d) => d.status === 'completed'),
      resolved,
      queryError: null,
    };
  } catch (e) {
    return { ...empty, queryError: (e && e.message) || String(e) };
  }
}

/**
 * worker-checkin's native FAIL-CLOSED polarity over the raw axes — the drop-in
 * for its draftDepsSatisfied call: true only when every ref resolved completed
 * and the lookup succeeded. (Unresolved ref or query error => false => skip.)
 * @param {Awaited<ReturnType<typeof evaluateClaimDependencyGate>>} verdict
 * @returns {boolean}
 */
function depsSatisfiedFromVerdict(verdict) {
  if (!verdict) return false;
  if (verdict.queryError) return false;
  return verdict.blocking.length === 0 && verdict.unresolved.length === 0;
}

module.exports = { evaluateClaimDependencyGate, depsSatisfiedFromVerdict, extractDependencyRefs };
