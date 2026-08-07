/**
 * Canonical-roadmap resolution — SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001.
 *
 * A single-writer roadmap model has exactly one status='active' strategic_roadmaps
 * row at any time -- the chairman-ratified plan-of-record. Both distill's write path
 * (scripts/roadmap-generate.js) and PLAN CHECK's read path (lib/roadmap/plan-check-status.js)
 * resolve through this ONE function so they can never silently disagree on which roadmap
 * is canonical. Deliberately does NOT filter on current_baseline_version -- baselining
 * (lib/integrations/roadmap-manager.js approveSequence) is an approval-workflow concern,
 * not an identity concern; a not-yet-baselined active roadmap is still THE canonical one
 * (ground-truthed live: the actual canonical roadmap has current_baseline_version=0).
 */

/**
 * @param {object} supabase
 * @returns {Promise<{id:string,title:string,status:string,current_baseline_version:number}|null>}
 *   null when no active roadmap exists yet (bootstrap required).
 * @throws {Error} when MORE THAN ONE active roadmap exists (ambiguous -- fail loud, never guess)
 */
export async function resolveCanonicalRoadmap(supabase) {
  const { data, error } = await supabase
    .from('strategic_roadmaps')
    .select('id, title, status, current_baseline_version')
    .eq('status', 'active');
  if (error) throw new Error(`resolveCanonicalRoadmap: query failed: ${error.message}`);

  const rows = data || [];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(
      `resolveCanonicalRoadmap: ${rows.length} status='active' strategic_roadmaps rows found -- ` +
      `ambiguous (expected exactly 1). IDs: ${rows.map((r) => r.id).join(', ')}. ` +
      'Resolve manually (archive the extras) before distill or PLAN CHECK can proceed.'
    );
  }
  return rows[0];
}

/**
 * The wave ids belonging to the canonical roadmap — SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001.
 *
 * Exists so that readers of roadmap_wave_items have ONE scoping primitive to depend on instead of
 * each hand-rolling `resolve → select waves → map ids`. The defective readers this SD fixes were
 * precisely the ones that hand-rolled their own selection, so adding a fourth open-coded variant
 * would fix the instances and leave the class intact.
 *
 * Returns null (NOT an empty array) when the canonical roadmap cannot be determined. The
 * distinction is load-bearing: `[]` passed to `.in('wave_id', [])` matches nothing and silently
 * reads as "no items", which is indistinguishable from a genuinely empty roadmap. null forces the
 * caller to decide explicitly — degrade to unknown if it only reads, refuse if it writes.
 *
 * @returns {Promise<string[]|null>}
 * @throws {Error} propagates the >1-active ambiguity throw from resolveCanonicalRoadmap.
 */
export async function resolveCanonicalWaveIds(supabase) {
  const roadmap = await resolveCanonicalRoadmap(supabase);
  if (!roadmap) return null;
  const { data, error } = await supabase.from('roadmap_waves').select('id').eq('roadmap_id', roadmap.id);
  if (error) throw new Error(`resolveCanonicalWaveIds: wave query failed: ${error.message}`);
  return (data || []).map((w) => w.id);
}

export default { resolveCanonicalRoadmap, resolveCanonicalWaveIds };
