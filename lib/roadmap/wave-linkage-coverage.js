// Wave-linkage coverage — QF-20260711-045 (coordinator PRD rider on
// SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001, origin: Solomon plan-gap verdict).
//
// Criterion: >= 80% of CLAIMABLE LEAF SDs must be wave-linked — linked
// directly (roadmap_wave_items.promoted_to_sd_key or metadata.wave_disposition)
// or through their orchestrator parent. Below threshold, starvation is a
// NAMED failure (WAVE_LINKAGE_STARVATION), never a silent state.

export const COVERAGE_THRESHOLD = 0.8;
export const STARVATION_NAME = 'WAVE_LINKAGE_STARVATION';

const CLOSED_STATUSES = ['completed', 'cancelled', 'archived', 'superseded', 'deferred'];

/**
 * Compute wave-linkage coverage over claimable leaf SDs.
 * Pure aggregation — no writes.
 *
 * @param {object} supabase - service-role client
 * @returns {Promise<{coverage:number|null, linked:number, total:number, starved:boolean, unlinkedKeys:string[]}>}
 *   coverage is null when there are zero claimable leaves (vacuous — not starvation).
 */
export async function computeWaveLinkageCoverage(supabase) {
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, status, parent_sd_id, metadata')
    .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`);
  if (error) throw new Error(`wave-linkage-coverage: SD query failed: ${error.message}`);

  const { data: items, error: iErr } = await supabase
    .from('roadmap_wave_items')
    .select('promoted_to_sd_key')
    .not('promoted_to_sd_key', 'is', null);
  if (iErr) throw new Error(`wave-linkage-coverage: wave-items query failed: ${iErr.message}`);

  const promotedKeys = new Set((items ?? []).map((i) => i.promoted_to_sd_key));
  const rows = sds ?? [];
  const byId = new Map(rows.map((s) => [s.id, s]));
  const directlyLinked = (s) =>
    promotedKeys.has(s.sd_key) || Boolean(s.metadata?.wave_disposition);

  const leaves = rows.filter((s) => s.sd_type !== 'orchestrator');
  const linkedLeaves = leaves.filter((s) => {
    if (directlyLinked(s)) return true;
    const parent = s.parent_sd_id ? byId.get(s.parent_sd_id) : null;
    return parent ? directlyLinked(parent) : false;
  });

  const total = leaves.length;
  const linked = linkedLeaves.length;
  const coverage = total === 0 ? null : linked / total;
  return {
    coverage,
    linked,
    total,
    starved: coverage !== null && coverage < COVERAGE_THRESHOLD,
    unlinkedKeys: leaves.filter((s) => !linkedLeaves.includes(s)).map((s) => s.sd_key).slice(0, 25),
  };
}

export default { computeWaveLinkageCoverage, COVERAGE_THRESHOLD, STARVATION_NAME };
