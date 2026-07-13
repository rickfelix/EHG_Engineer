/**
 * Closure-verifier orchestrator (FR-3).
 * (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001)
 *
 * Reads loop_registry, collects per-loop evidence (via an injected collector so the
 * orchestration stays pure + testable), evaluates each loop's closure via the shared
 * closure engine, and writes the CLOSED/OPEN/STARVED verdict back to loop_registry.
 * FAIL-SOFT throughout: a missing table (chairman-gated apply pending), a collector
 * error, or a write error never throws and never false-flags — it records the loop as
 * unknown/skipped rather than crashing the whole run.
 *
 * The verifier itself is Operator-Contract compliant: registerVerifierCadence arms it
 * in periodic_process_registry (via the shared ARMED primitive) with a witness.
 */
import { evaluateLoopClosure } from './closure-engine.js';
import { registerArmedMachinery, armedProcessKey } from '../machinery-class/armed-registration.js';

export const VERIFIER_LOGICAL_KEY = 'loop-closure-verifier';
export const VERIFIER_PROCESS_KEY = armedProcessKey(VERIFIER_LOGICAL_KEY);

/**
 * Evaluate a batch of loops. Pure — the caller supplies loops + a collectEvidence(loop)
 * function. Returns per-loop verdicts; a collector throw degrades that ONE loop to
 * unknown (never aborts the batch).
 *
 * @param {Array<Object>} loops - loop_registry rows
 * @param {(loop:Object)=>Promise<Object>|Object} collectEvidence
 * @param {Date} [now]
 * @returns {Promise<Array<{loop_key:string, status:string, reason:string}>>}
 */
export async function evaluateLoopBatch(loops, collectEvidence, now = new Date()) {
  const verdicts = [];
  for (const loop of loops || []) {
    try {
      const evidence = await collectEvidence(loop);
      const { status, reason } = evaluateLoopClosure(loop, evidence || {}, now);
      verdicts.push({ loop_key: loop.loop_key, status, reason });
    } catch (e) {
      verdicts.push({ loop_key: loop.loop_key, status: 'unknown', reason: `evidence collection failed: ${e?.message || e}` });
    }
  }
  return verdicts;
}

/**
 * Full verifier run: read loops, evaluate, write status back. FAIL-SOFT.
 *
 * @param {Object} supabase - service-role client
 * @param {(loop:Object)=>Promise<Object>|Object} collectEvidence
 * @param {Date} [now]
 * @returns {Promise<{ran:boolean, evaluated:number, written:number, reason?:string, verdicts?:Array}>}
 */
export async function runClosureVerifier(supabase, collectEvidence, now = new Date()) {
  let loops = [];
  try {
    const { data, error } = await supabase.from('loop_registry').select('loop_key, predicate_type, closure_predicate, status');
    if (error) return { ran: false, evaluated: 0, written: 0, reason: error.message };
    loops = data || [];
  } catch (e) {
    return { ran: false, evaluated: 0, written: 0, reason: (e && e.message) || String(e) };
  }

  const verdicts = await evaluateLoopBatch(loops, collectEvidence, now);
  const evaluatedAt = now.toISOString();
  let written = 0;
  for (const v of verdicts) {
    try {
      const { error } = await supabase
        .from('loop_registry')
        .update({ status: v.status, status_reason: v.reason, evaluated_at: evaluatedAt, updated_at: evaluatedAt })
        .eq('loop_key', v.loop_key);
      if (!error) written++;
    } catch { /* fail-soft per-loop */ }
  }
  return { ran: true, evaluated: verdicts.length, written, verdicts };
}

/**
 * Arm the verifier's own cadence in periodic_process_registry (Operator-Contract
 * compliance). Daily by default.
 * @param {Object} supabase
 * @param {{expectedIntervalSeconds?:number}} [opts]
 */
export async function registerVerifierCadence(supabase, opts = {}) {
  return registerArmedMachinery(
    supabase,
    { sd_key: VERIFIER_LOGICAL_KEY },
    { activationTrigger: 'loop_closure_verifier_run', owner: 'loop-governance', expectedIntervalSeconds: opts.expectedIntervalSeconds || 86400 },
  );
}
