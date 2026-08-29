/**
 * Live kill-set derivation — the ONE authorized read site for "which stages are kill gates".
 *
 * SD-LEO-INFRA-KILL-GATE-TEETH-001 (ALPHA leg)
 *
 * `venture_stages.gate_type` (`text NOT NULL`) is the correct surface for kill-SET derivation —
 * NOT `venture_stages.work_type`, despite a sibling module
 * (scripts/modules/architectural-prevention/stage-gate-type-canonicalize-invariant.js) declaring
 * `gate_type` a "lossy mirror" of `work_type` and treating `work_type` as canonical. That
 * declaration is correct for THAT module's own purpose (decision_type classification writers) and
 * WRONG for this one: `work_type='decision_gate'` conflates the 4 kill stages with promotion
 * stages 10/16/17/25 (measured live 2026-08-29: decision_gate covers stages
 * {3,5,10,13,16,17,24,25}), which cannot express the kill/promotion distinction this module needs.
 * `gate_type` is the ONLY column carrying that distinction (distribution measured live:
 * none=16, promotion=7, kill=4, over a 27-row scheme; kill stages = {3,5,13,24}).
 *
 * Do NOT hardcode the kill-stage list anywhere that consumes this module's output — a future
 * "cleanup" that collapses this onto `work_type` would silently widen the kill set from 4 stages
 * to 8. This file is the single call site; if a second one appears, that is the defect.
 *
 * @module lib/eva/kill-gate-teeth/kill-stage-set
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<number[]>} sorted, deduped kill-stage numbers, e.g. [3, 5, 13, 24]
 * @throws on a genuine read failure — callers decide fail-open/fail-closed for their own context;
 *   this module never guesses a kill set on error.
 */
export async function deriveLiveKillStages(supabase) {
  // Bounded: venture_stages is a fixed lifecycle scheme (27 rows today); 500 is a generous
  // ceiling, not an expectation -- this is not a per-venture table that grows with usage.
  const { data, error } = await supabase
    .from('venture_stages')
    .select('stage_number')
    .eq('gate_type', 'kill')
    .limit(500);
  if (error) throw error;
  const stages = (data || [])
    .map((row) => row?.stage_number)
    .filter((n) => Number.isInteger(n));
  return [...new Set(stages)].sort((a, b) => a - b);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} stageNumber
 * @returns {Promise<boolean>}
 */
export async function isLiveKillStage(supabase, stageNumber) {
  const stages = await deriveLiveKillStages(supabase);
  return stages.includes(stageNumber);
}

export default { deriveLiveKillStages, isLiveKillStage };
