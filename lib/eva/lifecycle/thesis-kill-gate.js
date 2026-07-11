/**
 * Thesis-Kill Gate — orchestrates the Tier-B seam at stage advancement.
 *
 * SD-LEO-INFRA-KILL-GATE-TIER-001
 *
 * Reads a venture's armed kill_criteria, evaluates the ones due at the target stage
 * (thesis-kill-evaluator.js), best-effort logs FIRED/HOLD verdicts to system_events, and — on
 * FIRED — mints (or reuses) a chairman_decisions row via the SAME createOrReusePendingDecision
 * helper Mechanism A already uses, with a distinct decision_type so it can never collide with
 * a Mechanism-A stage_gate decision at the same (venture, stage). Approval of a fired thesis
 * kill runs through the EXISTING governed override path (scripts/eva-decisions.js
 * --override-kill --override-reason + lib/eva/kill-override-guard.js) — no new override
 * mechanism is introduced.
 *
 * Ships OBSERVE-ONLY by default: a FIRED verdict is logged/surfaced but never blocks
 * advancement. Promotion to BINDING mode is a separate, later decision (gated on the
 * PROBE-BETA calibration run, docs/design/kill-gate-teeth-proof-spec.md §2-BETA/§4) —
 * this SD ships the flag and the observe-mode behavior.
 *
 * Feature flag: LEO_THESIS_KILL_GATE
 *   off      — evaluation skipped entirely (parity with LEO_S19_EXIT_GATE_ENFORCER=off shape).
 *   observe  (default) — evaluate + log + mint decision, never blocks advancement.
 *   binding  — a FIRED criterion without an APPROVED chairman_decisions row blocks advancement.
 * Read once at module-load via process.env, independent of LEO_S19_EXIT_GATE_ENFORCER (a
 * disabled exit-gate flag must never silently disable thesis-kill observation).
 *
 * @module lib/eva/lifecycle/thesis-kill-gate
 */

import { evaluateThesisKillCriteria, defaultResolveObservedValue } from './thesis-kill-evaluator.js';
import { createOrReusePendingDecision } from '../chairman-decision-watcher.js';

const FLAG_NAME = 'LEO_THESIS_KILL_GATE';
const FLAG_VALUE = (() => {
  const raw = process.env[FLAG_NAME];
  if (raw === undefined || raw === '') return 'observe'; // default: ship observe-only
  return String(raw).toLowerCase();
})();

const DECISION_TYPE = 'thesis_kill_tier_b';

/**
 * Read-only flag inspector for tests and diagnostics.
 * @returns {{ name: string, value: string, mode: 'off'|'observe'|'binding' }}
 */
export function getThesisKillFlag() {
  const mode = FLAG_VALUE === 'off' || FLAG_VALUE === 'binding' ? FLAG_VALUE : 'observe';
  return { name: FLAG_NAME, value: FLAG_VALUE, mode };
}

/**
 * Best-effort, never-throwing system_events write — mirrors exit-gate-enforcer.js's
 * logAnomalyEvent/logObserveOnlyEvent shape. A logging failure must never affect the
 * (already-computed) verdict or blocking decision.
 */
async function logThesisKillEvent({ supabase, eventType, ventureId, fromStage, stageNumber, verdict }) {
  try {
    const stamp = new Date().toISOString();
    await supabase.from('system_events').insert({
      event_type: eventType,
      venture_id: ventureId,
      stage_id: stageNumber,
      // Includes criterionId (not just venture+stage+timestamp) so two criteria firing/holding
      // in the same advancement attempt at the same millisecond never collide.
      idempotency_key: `${eventType}:${ventureId}:${stageNumber}:${verdict.criterionId}:${Date.parse(stamp)}`,
      payload: { venture_id: ventureId, from_stage: fromStage, stage_number: stageNumber, ...verdict },
      details: { venture_id: ventureId, from_stage: fromStage, stage_number: stageNumber, ...verdict },
      created_at: stamp,
    });
  } catch (err) {
    console.warn(`[thesis-kill-gate] system_events write failed (non-fatal): ${err.message}`);
  }
}

/**
 * Mint or reuse the chairman decision for a FIRED criterion. forceDecisionCreation:true because
 * a fired thesis-kill is gate-worthy at ANY stage_by (1-26) — the pre-existing
 * isDecisionCreatingStage predicate only recognizes Mechanism A's configured stage set and would
 * otherwise silently skip decision creation for the common default-criteria stages (12/16/24),
 * defeating the "route to chairman decision surface" requirement (mirrors the Stage-0 precedent's
 * own forceDecisionCreation rationale in chairman-decision-watcher.js).
 */
async function mintThesisKillDecision({ supabase, ventureId, stageNumber, verdict, logger }) {
  return createOrReusePendingDecision({
    ventureId,
    stageNumber,
    decisionType: DECISION_TYPE,
    forceDecisionCreation: true,
    briefData: {
      decision: 'kill',
      mechanism: 'thesis_kill_tier_b',
      criterion_id: verdict.criterionId,
      metric: verdict.metric,
      comparator: verdict.comparator,
      threshold: verdict.threshold,
      observed: verdict.observed,
      reasons: [`Thesis-kill criterion "${verdict.criterionId}" fired: ${verdict.metric} ${verdict.comparator} ${verdict.threshold} (observed ${verdict.observed})`],
    },
    summary: `Thesis-kill fired: ${verdict.criterionId} at stage ${stageNumber}`,
    supabase,
    logger,
  });
}

/**
 * Evaluate + (observe-mode: log-only | binding-mode: gate) a venture's thesis-kill criteria for
 * an advancement attempt. Caller is responsible for surfacing `allowed===false` as a block,
 * mirroring exit-gate-enforcer.js's checkExitGates contract.
 *
 * @param {Object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {string} args.ventureId
 * @param {number} args.fromStage
 * @param {number} args.toStage
 * @param {(metric: string) => (Promise<*>|*)} [args.resolveObservedValue] - injected gauge resolver
 * @param {Object} [args.logger]
 * @returns {Promise<{ allowed: boolean, would_kill_by: string[], blocked_by: string[], fired: Array, held: Array, flag_enforced: boolean }>}
 */
export async function checkThesisKillGate({ supabase, ventureId, fromStage, toStage, resolveObservedValue = defaultResolveObservedValue, logger = console }) {
  const { mode } = getThesisKillFlag();

  if (mode === 'off') {
    return { allowed: true, would_kill_by: [], blocked_by: [], fired: [], held: [], flag_enforced: false };
  }

  // FR-6 control-class: a venture with no armed criteria (or a read failure) must advance
  // byte-identical to pre-change behavior — fail-open here, never block on a lookup problem.
  let killCriteria = null;
  try {
    const { data: venture, error } = await supabase
      .from('ventures')
      .select('metadata')
      .eq('id', ventureId)
      .maybeSingle();
    if (error) throw error;
    killCriteria = venture?.metadata?.kill_criteria ?? null;
  } catch (err) {
    logger.warn?.(`[thesis-kill-gate] venture read failed (fail-open, no evaluation): ${err.message}`);
    return { allowed: true, would_kill_by: [], blocked_by: [], fired: [], held: [], flag_enforced: true };
  }

  if (!Array.isArray(killCriteria) || killCriteria.length === 0) {
    return { allowed: true, would_kill_by: [], blocked_by: [], fired: [], held: [], flag_enforced: true };
  }

  const { fired, held } = await evaluateThesisKillCriteria({ killCriteria, toStage, resolveObservedValue });

  for (const verdict of held) {
    await logThesisKillEvent({ supabase, eventType: 'THESIS_KILL_HOLD', ventureId, fromStage, stageNumber: toStage, verdict });
  }

  const would_kill_by = [];
  const blocked_by = [];

  for (const verdict of fired) {
    await logThesisKillEvent({ supabase, eventType: 'THESIS_KILL_FIRED', ventureId, fromStage, stageNumber: toStage, verdict });
    const reasonText = `${verdict.criterionId}: ${verdict.metric} ${verdict.comparator} ${verdict.threshold} (observed ${verdict.observed})`;
    would_kill_by.push(reasonText);

    if (mode === 'binding') {
      const { id: decisionId, isNew, skipped } = await mintThesisKillDecision({ supabase, ventureId, stageNumber: toStage, verdict, logger });
      if (skipped) {
        // Fixture venture or other intentional skip — treat as auto-clear, never strand a
        // test/demo venture on a decision that will never be approved by a real chairman.
        continue;
      }
      let approved = false;
      if (!isNew) {
        const { data: existing } = await supabase
          .from('chairman_decisions')
          .select('status')
          .eq('id', decisionId)
          .maybeSingle();
        approved = existing?.status === 'approved';
      }
      if (!approved) {
        blocked_by.push(reasonText);
      }
    }
  }

  return {
    allowed: blocked_by.length === 0,
    would_kill_by,
    blocked_by,
    fired,
    held,
    flag_enforced: true,
  };
}

export default { getThesisKillFlag, checkThesisKillGate };
