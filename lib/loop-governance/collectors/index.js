/**
 * Per-loop evidence-collector registry, injected through the existing collectEvidence
 * seam (lib/loop-governance/verifier.js:35).
 * (SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001)
 *
 * A loop_key with no registered collector returns {} (empty evidence), preserving the
 * honest STARVED baseline the governor shipped with (SD-LEO-INFRA-UNIVERSAL-LOOP-
 * GOVERNANCE-001) — the registry's presence must never flip an un-evidenced loop.
 *
 * A registered collector that throws is NOT caught here — it propagates so the
 * EXISTING try/catch in evaluateLoopBatch (verifier.js:38-40) converts it to
 * status='unknown'. Duplicating that fail-soft logic here would create two places
 * that can diverge on what "collector failure" means.
 *
 * EDGE-AT-NULL WHEN SCOPE EXCEEDS EVIDENCE (required pattern for every new collector,
 * QF-20260717-794 from the LOOP-EVIDENCE-COLLECTORS-001 retrospective): when a loop's
 * display_name/definition describes broader scope than the collector's single evidence
 * source can actually observe, return {upstreamFiredAt, edgeAt: null} — landing on the
 * "fired but edge absent" OPEN path — rather than deriving a real edgeAt from partial
 * evidence, which risks a false-CLOSE on a loop the evidence does not fully cover.
 * A real edgeAt is justified ONLY by a measured, scope-matching closure signal, never
 * by liveness alone; see session-coordination-retention.js's MEASURED-DECLINE GATE
 * (GT-1, SD-LEO-INFRA-L30-CLOSURE-EDGE-001) for the exemplar of earning a real edge.
 */
import { collectSessionCoordinationRetentionEvidence } from './session-coordination-retention.js';

/** loop_key -> (supabase) => Promise<Object> */
export const COLLECTORS = Object.freeze({
  L30: collectSessionCoordinationRetentionEvidence,
});

/**
 * @param {Object} supabase - service-role client
 * @returns {(loop:Object)=>Promise<Object>} collectEvidence, matching runClosureVerifier's expected signature
 */
export function createCollectEvidence(supabase) {
  return async function collectEvidence(loop) {
    const collector = COLLECTORS[loop?.loop_key];
    if (!collector) return {};
    return collector(supabase);
  };
}
