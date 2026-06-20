/**
 * lib/sourcing-engine/outcome-decomposer.js
 *
 * SD-LEO-INFRA-SOURCING-ENGINE-OUTCOME-DECOMPOSER-001 — sourcing-engine child 7/10.
 *
 * The OUTCOME-GATED axis of the engine's no-drop guarantee, and its keystone value-add: it turns the
 * gauge from a dead-end into a forward router. An outcome-gated capability (one whose required state is
 * an OUTCOME, not a build — a venture EARNING, a >=90% breakage-caught rate, distance-to-quit
 * instrumented) reads unbuilt forever with no buildable next step. This decomposer takes such a
 * candidate and PROPOSES the fleet-BUILDABLE enablers that move the outcome (the instrumentation, the
 * rails, the surfaces), then PAUSES for chairman review — it NEVER auto-creates enabler SDs
 * (chairman-ratified decision #2: propose-and-pause).
 *
 * REUSE, don't reinvent (FR-3, the duplicate-SSOT trap):
 *   - routeCandidate (child 1) decides the outcome-gated lane — we guard on its verdict, not a re-derive.
 *   - the shipped escalator (child 4, escalateToChairmanQueue) is the ONE queue-writer to
 *     sourcing_chairman_queue. We reuse it with a DISTINCT gate_type ('outcome_decomposition') so the
 *     proposal row coexists with child 4's plain 'outcome-gated' escalation for the same source_id under
 *     the (source_id, gate_type) idempotency key — rather than hand-rolling a second insert path.
 *
 * The decomposition core is PURE (deterministic mapping from the candidate's own enabler hints to a
 * proposed enabler list with rationale; no LLM hard-dependency — enrichment is an optional future layer).
 */
// @wire-check-exempt: child-7 library whose only consumers today are its test and the unbuilt sibling
// engine children (the populator/orchestrator that will drive the decomposer over outcome-gated ledger
// rows). Per the engine design the pure decomposer + propose-and-pause writer land before that driver,
// reusing the shipped routeCandidate + escalator SSOTs. Pinned by tests/unit/sourcing-engine/outcome-decomposer.test.js.
import { routeCandidate, LANES } from './router.js';
import { escalateToChairmanQueue } from './escalator.js';

/** The chairman-queue gate_type for a decomposition proposal — DISTINCT from child 4's lane-named gate. */
export const DECOMPOSITION_GATE_TYPE = 'outcome_decomposition';

/**
 * PURE (FR-1): decompose an outcome-gated candidate into a PROPOSED fleet-buildable enabler list.
 *
 * Deterministic: each enabler is derived from the candidate's own enabler hints (the strings the
 * classifier/router attached) — never fabricated. A hint may be a plain string or an object
 * {capability|title, target_rung?, rationale?}; it is normalized to a proposed enabler carrying a
 * rationale that links it to the outcome. With no hints the proposal is empty (safe: propose nothing
 * rather than invent buildable work).
 *
 * @param {{title?:string, outcome?:string, enablers?:Array<string|object>, targetRung?:string|null, rung?:string|null}} candidate
 * @returns {{ outcome:(string|null), target_rung:(string|null), enablers:Array<{capability:string, rationale:string, target_rung:(string|null), buildable:boolean}>, proposed_count:number, reason?:string }}
 */
export function decomposeOutcome(candidate) {
  const c = candidate || {}; // crash-safe on null/undefined, mirroring routeCandidate's house style
  const outcome = c.outcome != null ? c.outcome : (c.title != null ? c.title : null);
  const targetRung = c.targetRung != null ? c.targetRung : (c.rung != null ? c.rung : null);
  const hints = Array.isArray(c.enablers) ? c.enablers : [];

  const enablers = [];
  for (const h of hints) {
    let capability = null;
    let rung = targetRung;
    let rationale = null;
    if (typeof h === 'string' && h.trim()) {
      capability = h.trim();
    } else if (h && typeof h === 'object') {
      capability = (h.capability || h.title || '').toString().trim() || null;
      if (h.target_rung != null) rung = h.target_rung;
      if (typeof h.rationale === 'string' && h.rationale.trim()) rationale = h.rationale.trim();
    }
    if (!capability) continue; // skip empty/malformed hints rather than emit a blank enabler
    enablers.push({
      capability,
      rationale: rationale || `Fleet-buildable enabler advancing the outcome${outcome ? ` "${outcome}"` : ''}.`,
      target_rung: rung != null ? rung : null,
      buildable: true,
    });
  }

  const out = { outcome, target_rung: targetRung, enablers, proposed_count: enablers.length };
  if (enablers.length === 0) out.reason = 'no_enabler_hints';
  return out;
}

/**
 * FR-2/FR-3/FR-4: PROPOSE-AND-PAUSE. For an outcome-gated candidate, compute the proposed enabler list
 * and write ONE pending chairman-queue row (gate_type='outcome_decomposition') via the shipped
 * escalator. NEVER drafts an enabler SD. Idempotent on (source_id, 'outcome_decomposition') via the
 * escalator's upsert. Fail-soft (dormant table / no client) is inherited from the escalator.
 *
 * @param {object} candidate - classified candidate (must carry source_id; title/enablers/targetRung)
 * @param {object|null} [routed] - routeCandidate output; computed from `candidate` when omitted (reuse)
 * @param {{ supabase?:object, nowIso?:string, slaHours?:number }} [deps]
 * @returns {Promise<{ proposed:boolean, reason?:string, decomposition?:object, queue?:object }>}
 */
export async function proposeOutcomeDecomposition(candidate, routed = null, deps = {}) {
  const item = candidate || {};
  const r = routed || routeCandidate(item, deps.routeContext || {});
  if (!r || r.lane !== LANES.OUTCOME_GATED) {
    return { proposed: false, reason: 'not_outcome_gated' };
  }

  const decomposition = decomposeOutcome(item);

  const queue = await escalateToChairmanQueue(item, r, {
    supabase: deps.supabase,
    nowIso: deps.nowIso,
    slaHours: deps.slaHours,
    gateType: DECOMPOSITION_GATE_TYPE,
    escalationType: DECOMPOSITION_GATE_TYPE,
    extraContext: {
      decomposition_source: 'outcome-decomposer',
      outcome: decomposition.outcome,
      proposed_enablers: decomposition.enablers,
      proposed_count: decomposition.proposed_count,
    },
  });

  // FR-2: we ONLY queue a proposal for chairman review — no enabler SD is drafted here.
  return { proposed: queue.escalated === true, reason: queue.reason, decomposition, queue };
}
