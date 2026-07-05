/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-D: observe-only enforcement rung.
 *
 * Wraps a handoff gate's validator so every evaluation ALSO records a
 * gate_witness_events row (Child C) via the 'gate-harness' witness identity --
 * without blocking, retrying, or altering the gate's own pass/fail result in
 * any way. This is deliberately OBSERVE-ONLY (leo_protocol_sections id=620):
 * it starts collecting real signal on the 3 highest-blast-radius
 * self_evidence_only gates identified by Child B before any enforcement is
 * promoted, so a clean observation window can be established first.
 *
 * Known limitation (same one documented in Child C): 'gate-harness' is a
 * fixed, code-controlled identity, not a cryptographically distinct actor --
 * under the shared SUPABASE_SERVICE_ROLE_KEY architecture this is
 * convention-strength, not structural. It is still strictly better than no
 * witness event at all for these 3 gates.
 */
import { createClient } from '@supabase/supabase-js';
import { recordWitnessEvent } from './record-witness-event.js';

const WITNESS_SESSION_ID = 'gate-harness';

function resolveJudgedSessionId(ctx) {
  return ctx?.sd?.claiming_session_id || ctx?.sessionId || null;
}

function resolveVerdict(result) {
  const passed = 'passed' in (result || {}) ? result.passed : result?.pass;
  return passed ? 'witnessed' : 'rejected';
}

/**
 * Best-effort, non-blocking witness observation. Never throws; a failure to
 * record (missing session id, network error, RLS denial) is swallowed so the
 * wrapped gate's real behavior is completely unaffected.
 */
export async function observeGateWitness(gateId, ctx, result, supabaseOverride) {
  try {
    const judgedSessionId = resolveJudgedSessionId(ctx);
    if (!judgedSessionId || judgedSessionId === WITNESS_SESSION_ID) return;

    const supabase = supabaseOverride
      || createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    await recordWitnessEvent(supabase, {
      gateId,
      witnessSessionId: WITNESS_SESSION_ID,
      judgedSessionId,
      verdict: resolveVerdict(result),
      notes: 'observe-only enforcement rung (SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-D) -- not yet blocking',
    });
  } catch {
    // Observe-only: a witness-recording failure must never affect the gate itself.
  }
}

/**
 * Wraps a gate object's validator with observe-only witness recording.
 * @param {string} gateId - stable gate_id, matches Child B's inventory (e.g. 'RETROSPECTIVE_EXISTS')
 * @param {Object} gate - the gate object as returned by a createXGate() factory
 * @returns {Object} the same gate object with validator wrapped
 */
export function withObserveOnlyWitness(gateId, gate) {
  const originalValidator = gate.validator;
  return {
    ...gate,
    validator: async (ctx) => {
      const result = await originalValidator(ctx);
      await observeGateWitness(gateId, ctx, result);
      return result;
    },
  };
}
