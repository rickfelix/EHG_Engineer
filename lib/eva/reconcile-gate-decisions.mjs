// SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 (FR-3): reconciliation guard.
// For every gated (decision-creating) stage a venture has PASSED, a corresponding
// chairman_decision row MUST exist. A venture past a gated stage with no decision is a
// SILENT BYPASS — surface it so it cannot recur unnoticed.
//
// Pure helper (findGateDecisionViolations) is unit-testable with in-memory fixtures; the
// CLI wrapper (scripts/reconcile-gate-decisions.mjs) runs it against the live DB.

import { FALLBACK_DECISION_CREATING_STAGES } from './chairman-decision-watcher.js';
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/**
 * Pure violation finder. A violation = a venture whose current_lifecycle_stage is PAST a
 * decision-creating stage for which NO chairman_decision row exists.
 *
 * @param {Array<{id:string, current_lifecycle_stage:number}>} ventures
 * @param {Array<{venture_id:string, lifecycle_stage:number}>} decisions  any chairman_decision rows
 * @param {Iterable<number>} [gatedStages=FALLBACK_DECISION_CREATING_STAGES] decision-creating stages
 * @returns {Array<{venture_id:string, stage:number}>} violations (gated stage passed, no decision)
 */
export function findGateDecisionViolations(ventures, decisions, gatedStages = FALLBACK_DECISION_CREATING_STAGES) {
  const gated = [...gatedStages].sort((a, b) => a - b);
  const haveDecision = new Set((decisions || []).map((d) => `${d.venture_id}:${d.lifecycle_stage}`));
  const violations = [];
  for (const v of ventures || []) {
    const cur = Number(v.current_lifecycle_stage);
    if (!Number.isFinite(cur)) continue;
    for (const stage of gated) {
      if (stage >= cur) break; // only stages strictly PASSED (current is still in progress / at the gate)
      if (!haveDecision.has(`${v.id}:${stage}`)) violations.push({ venture_id: v.id, stage });
    }
  }
  return violations;
}

/**
 * DB-backed reconciliation across all ventures. Returns { violations, checked }.
 * @param {object} supabase service-role client
 */
export async function reconcileGateDecisions(supabase) {
  // Paginated (FR-6 batch 7): a capped read on EITHER side breaks reconciliation —
  // missing ventures hide bypasses, missing decisions fabricate false violations.
  let ventures;
  try {
    ventures = await fetchAllPaginated(() => supabase
      .from('ventures')
      .select('id, current_lifecycle_stage')
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`ventures read failed: ${e.message}`);
  }
  let decisions;
  try {
    decisions = await fetchAllPaginated(() => supabase
      .from('chairman_decisions')
      .select('id, venture_id, lifecycle_stage')
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`chairman_decisions read failed: ${e.message}`);
  }
  const violations = findGateDecisionViolations(ventures || [], decisions || []);
  return { violations, checked: (ventures || []).length };
}

export default { findGateDecisionViolations, reconcileGateDecisions };
