/**
 * Firing-verification harness — compares sealed (post-discharge) kill-gate predictions against
 * the ACTUAL gate behavior observed at a gated-stage crossing, and writes a per-crossing
 * teeth-proof record.
 *
 * SD-LEO-INFRA-KILL-GATE-TEETH-001 (ALPHA leg)
 *
 * PINNED PRIMARY OBSERVATION SURFACE: `system_events`. lib/eva/lifecycle/thesis-kill-gate.js's
 * `logThesisKillEvent()` writes a system_events row on EVERY evaluation of an armed criterion —
 * FIRED (`event_type: 'THESIS_KILL_FIRED'`) and HOLD (`event_type: 'THESIS_KILL_CANNOT_EVALUATE'`)
 * alike — so it is the COMPLETE record of what the gate actually did. `chairman_decisions` rows
 * are minted ONLY on a FIRED verdict (via `createOrReusePendingDecision`, `decision_type` shaped
 * `thesis_kill_tier_b:<criterionId>`), so that table can never tell you a gate passed cleanly —
 * it is used here ONLY as a secondary cross-check ("was a fired kill correctly routed to a
 * chairman decision card"), never as the primary verdict source. This is the exact pin PLAN's own
 * validation evidence flagged as required (SC2: "actual gate behavior" had no named authoritative
 * surface among 3 candidates).
 *
 * FLAG-MODE HONESTY: `lib/eva/lifecycle/thesis-kill-gate.js` ships `LEO_THESIS_KILL_GATE=observe`
 * by default — a FIRED verdict is logged but NEVER blocks advancement; `binding` mode is a
 * separate, later decision. Every teeth-proof record persists the flag mode that was active at
 * evaluation time (read via `getThesisKillFlag()` at call time, not assumed) so a proof produced
 * under observe-mode can never later be misread as proof the gate actually blocked anything.
 *
 * @module lib/eva/kill-gate-teeth/firing-verification
 */

import { deriveLiveKillStages } from './kill-stage-set.js';
import { getThesisKillFlag } from '../lifecycle/thesis-kill-gate.js';
import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

/** system_events.event_type values thesis-kill-gate.js actually writes (do not guess new ones). */
const EVENT_TYPE_FIRED = 'THESIS_KILL_FIRED';
const EVENT_TYPE_HOLD = 'THESIS_KILL_CANNOT_EVALUATE';

/**
 * Read discharged sealed predictions covering a (venture, stage) crossing.
 *
 * Calls the `kill_gate_teeth_discharged_predictions()` SECURITY DEFINER RPC — NEVER selects from
 * the `kill_gate_sealed_predictions` base table directly. Even though this module runs under the
 * shared service-role client (which is NOT the privilege-restricted `kill_gate_traversal_ro` role
 * the base table's blindness is actually built against — see the migration's honest residual-gap
 * comment), calling the RPC keeps this code's OWN contract correct: if a future SD wires a
 * genuinely restricted connection into this call site, this line needs no change to become
 * actually-enforced, not just documented-as-correct. Filtering by venture/stage happens
 * client-side on the (already discharged-only) result — the RPC's own filter is the security
 * boundary, this narrowing is just relevance.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ventureId: string, stageNumber: number }} args
 * @returns {Promise<Array<Object>>}
 */
export async function readDischargedPredictions(supabase, { ventureId, stageNumber }) {
  const { data, error } = await supabase.rpc('kill_gate_teeth_discharged_predictions');
  if (error) throw error;
  return (data || []).filter((row) => row.venture_id === ventureId && row.expected_stage === stageNumber);
}

/**
 * Read the actual observed verdict for a (venture, stage) crossing from system_events.
 *
 * Returns 'fired' if a THESIS_KILL_FIRED row exists for this venture+stage, else 'hold' if a
 * THESIS_KILL_CANNOT_EVALUATE row exists, else 'unknown' (no thesis-kill evaluation event was
 * ever logged for this crossing — distinct from 'pass': 'unknown' means we have no evidence the
 * gate ran at all, which is itself information a teeth-proof record must not paper over as a
 * clean pass).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ventureId: string, stageNumber: number }} args
 * @returns {Promise<{ verdict: 'fired'|'hold'|'unknown', eventId: string|null, criterionIds: string[] }>}
 */
export async function readObservedVerdict(supabase, { ventureId, stageNumber }) {
  // Bounded: one venture's one stage crossing can carry at most a handful of armed-criteria
  // evaluation events (thesis-kill-gate.js writes one row per criterion per evaluation attempt,
  // never a bulk/unbounded stream) -- 500 is a generous ceiling, not an expected count.
  const { data, error } = await supabase
    .from('system_events')
    .select('id, event_type, payload, created_at')
    .eq('venture_id', ventureId)
    .eq('stage_id', stageNumber)
    .in('event_type', [EVENT_TYPE_FIRED, EVENT_TYPE_HOLD])
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  const rows = data || [];
  const fired = rows.filter((r) => r.event_type === EVENT_TYPE_FIRED);
  const held = rows.filter((r) => r.event_type === EVENT_TYPE_HOLD);

  if (fired.length > 0) {
    return {
      verdict: 'fired',
      eventId: fired[0].id,
      criterionIds: fired.map((r) => r.payload?.criterionId).filter(Boolean),
    };
  }
  if (held.length > 0) {
    return {
      verdict: 'hold',
      eventId: held[0].id,
      criterionIds: held.map((r) => r.payload?.criterionId).filter(Boolean),
    };
  }
  return { verdict: 'unknown', eventId: null, criterionIds: [] };
}

/**
 * Secondary cross-check: for a FIRED observed verdict, was it correctly routed to a
 * chairman_decisions row? (decision_type = `thesis_kill_tier_b:<criterionId>`, per
 * mintThesisKillDecision's per-criterion scoping — see thesis-kill-gate.js's own comment on why a
 * bare shared decision_type would collapse two criteria into one row.)
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ventureId: string, stageNumber: number, criterionIds: string[] }} args
 * @returns {Promise<{ routed: boolean, decisionId: string|null }>}
 */
export async function crossCheckDecisionRouting(supabase, { ventureId, stageNumber, criterionIds }) {
  if (!Array.isArray(criterionIds) || criterionIds.length === 0) {
    return { routed: false, decisionId: null };
  }
  const decisionTypes = criterionIds.map((id) => `thesis_kill_tier_b:${id}`);
  // Bounded: at most one chairman_decisions row per criterion per (venture, stage) --
  // decisionTypes.length is the natural ceiling; 500 is a generous margin, not an expectation.
  const { data, error } = await supabase
    .from('chairman_decisions')
    .select('id, decision_type')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', stageNumber)
    .in('decision_type', decisionTypes)
    .limit(500);
  if (error) throw error;
  const rows = data || [];
  return { routed: rows.length > 0, decisionId: rows[0]?.id ?? null };
}

/**
 * Compare a sealed (discharged) prediction's expected_verdict against the actual observed
 * verdict, then write a per-crossing teeth-proof record.
 *
 * Pure comparison + one read (predictions) + one read (system_events) + one optional read
 * (chairman_decisions cross-check) + one write (teeth-proof record). No inference beyond what the
 * two surfaces actually say — a crossing with zero discharged predictions still gets a record
 * (matched_prediction: null), because the teeth-proof report must be able to say "no prediction
 * covered this crossing" rather than silently omitting it.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ventureId: string, stageNumber: number }} args
 * @returns {Promise<Object>} the inserted teeth-proof record
 */
export async function verifyFiringForCrossing(supabase, { ventureId, stageNumber }) {
  const killStages = await deriveLiveKillStages(supabase);
  const gateType = killStages.includes(stageNumber) ? 'kill' : 'none';

  const [predictions, observed] = await Promise.all([
    readDischargedPredictions(supabase, { ventureId, stageNumber }),
    readObservedVerdict(supabase, { ventureId, stageNumber }),
  ]);

  let routedToDecision = null;
  let chairmanDecisionId = null;
  if (observed.verdict === 'fired') {
    const crossCheck = await crossCheckDecisionRouting(supabase, {
      ventureId,
      stageNumber,
      criterionIds: observed.criterionIds,
    });
    routedToDecision = crossCheck.routed;
    chairmanDecisionId = crossCheck.decisionId;
  }

  // A crossing can carry more than one sealed prediction (e.g. BETA's 3 armed criteria); a
  // crossing "matches" only if EVERY discharged prediction covering it agrees with what was
  // observed — a partial match is not a match, it is a partial defect (see spec §4 PARTIAL
  // verdicts, e.g. "late kill").
  const matchedPrediction = predictions.length === 0
    ? null
    : predictions.every((p) => p.expected_verdict === observed.verdict);

  const { mode: flagMode } = getThesisKillFlag();

  const record = {
    venture_id: ventureId,
    stage_number: stageNumber,
    gate_type: gateType,
    sealed_prediction_id: predictions[0]?.id ?? null,
    predicted_verdict: predictions[0]?.expected_verdict ?? null,
    observed_verdict: observed.verdict,
    observed_source: 'system_events',
    observed_event_id: observed.eventId,
    routed_to_decision: routedToDecision,
    chairman_decision_id: chairmanDecisionId,
    flag_mode: flagMode,
    matched_prediction: matchedPrediction,
    details: {
      predictions_covering_crossing: predictions.map((p) => ({ id: p.id, expected_verdict: p.expected_verdict })),
      observed_criterion_ids: observed.criterionIds,
    },
  };

  const { data, error } = await supabase
    .from('kill_gate_teeth_proof_records')
    .insert(record)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Aggregate teeth-proof report, queryable by Solomon, covering the kill set of the LIVE
 * 27-stage scheme (derived at call time, never hardcoded — see kill-stage-set.js).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ventureId?: string }} [args]
 * @returns {Promise<{ kill_stages: number[], records: Object[], summary: { total: number, matched: number, mismatched: number, uncovered: number } }>}
 */
export async function getTeethProofReport(supabase, { ventureId } = {}) {
  const killStages = await deriveLiveKillStages(supabase);

  // This IS meant to be a genuinely comprehensive aggregate (Solomon's sealed-terms discharge
  // duty reads the whole thing), so it uses fetchAllPaginated rather than a bounded .limit() --
  // a silently-truncated report would misreport teeth-proof coverage as complete when it isn't.
  const records = await fetchAllPaginated(() => {
    let query = supabase
      .from('kill_gate_teeth_proof_records')
      .select('*')
      .in('stage_number', killStages)
      .order('evaluated_at', { ascending: true });
    if (ventureId) query = query.eq('venture_id', ventureId);
    return query;
  });

  const summary = records.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.matched_prediction === true) acc.matched += 1;
      else if (r.matched_prediction === false) acc.mismatched += 1;
      else acc.uncovered += 1;
      return acc;
    },
    { total: 0, matched: 0, mismatched: 0, uncovered: 0 },
  );

  return { kill_stages: killStages, records, summary };
}

export default {
  readDischargedPredictions,
  readObservedVerdict,
  crossCheckDecisionRouting,
  verifyFiringForCrossing,
  getTeethProofReport,
};
