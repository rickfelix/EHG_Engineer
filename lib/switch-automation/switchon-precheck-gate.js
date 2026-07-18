/**
 * Op-co switch-on authorization gate — SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-B.
 *
 * Closes the built-not-wired gap: child A (SD-...-001-A) DEFINED the reversibility
 * classifier (lib/switch-automation/reversibility-classifier.js) but it had ZERO
 * consumers — it classified but nothing ENFORCED. This module is that first real
 * consumer: it turns the pure `classifySwitchOn` verdict into a GENUINE, STRUCTURAL
 * authorization decision that a caller must honor at the decision path.
 *
 * Contract (mirrors the enforce-mode {authorized, reason} return shape of
 * lib/claim/gates/dispatch-authorization.cjs L128-130 — that file is the PATTERN
 * reference, NOT the enforcement home):
 *
 *   authorizeSwitchOn(request, opts) -> {
 *     authorized:        boolean,   // true ONLY for a fully-classified reversible request
 *     route_to_chairman: boolean,   // true whenever authorized is false (chairman decides)
 *     verdict:           string,    // the classifier verdict ('reversible'|'consequential'|'unknown'|'error')
 *     reason:            string,    // machine-readable reason for the decision
 *     neverAuto:         boolean,   // true iff the action is a chairman-ratified NEVER-AUTO class
 *   }
 *
 * Decision map:
 *   verdict 'reversible'                          -> { authorized: true,  route_to_chairman: false, reason: 'reversible' }
 *   verdict 'consequential' && neverAuto === true -> { authorized: false, route_to_chairman: true,  reason: 'never-auto' }
 *   verdict 'consequential' (rubric escalate)     -> { authorized: false, route_to_chairman: true,  reason: 'consequential' }
 *   verdict 'unknown' / missing action / ambiguity-> { authorized: false, route_to_chairman: true,  reason: 'fail-closed-unknown' }
 *   classifier throws / unexpected verdict        -> { authorized: false, route_to_chairman: true,  reason: 'fail-closed-error' }
 *
 * SECURITY-CRITICAL INVARIANT (parent GUARDRAIL-2, TR-2):
 *   The NEVER-AUTO / consequential / unknown -> authorized:false path is UNCONDITIONAL.
 *   Unlike dispatch-authorization.cjs's off/observe/enforce ladder (mode!=='enforce'
 *   fails OPEN to authorized:true), there is NO opts/flag/env value that downgrades a
 *   NEVER-AUTO verdict to advisory or flips it to authorized:true. `opts` is accepted
 *   for forward-compatible caller ergonomics only and is deliberately INERT with
 *   respect to the authorization decision — it can never widen authority. This is the
 *   whole point of the SD: an irreversible production action (live deploy / live
 *   payment-account creation / DNS mutation) must ALWAYS route to the chairman.
 *
 * Pure/total function: no I/O, no DB, deterministic — unit-testable in isolation (TR-5).
 *
 * @module lib/switch-automation/switchon-precheck-gate
 */
import { classifySwitchOn, SWITCHON_VERDICT, NEVER_AUTO_CLASSES } from './reversibility-classifier.js';

export { NEVER_AUTO_CLASSES, SWITCHON_VERDICT };

/** A denial result. `neverAuto` is threaded through so callers can distinguish a
 * chairman-ratified irreversible class from a merely-consequential/unknown one. */
function deny(verdict, reason, neverAuto) {
  return Object.freeze({
    authorized: false,
    route_to_chairman: true,
    verdict,
    reason,
    neverAuto: Boolean(neverAuto),
  });
}

/**
 * Genuinely authorize (or hard-stop) an op-co switch-on request.
 *
 * @param {Object} request - the switch-on request; forwarded to classifySwitchOn
 *   ({ component, action, reversible, inRole, isLiveMoney, isVentureCommitment, isReversibleByMechanism }).
 * @param {Object} [opts]  - reserved for forward-compatible caller ergonomics. DELIBERATELY
 *   INERT w.r.t. the authorization decision: no key here can flip a NEVER-AUTO / consequential /
 *   unknown request to authorized:true (GUARDRAIL-2 — no advisory/observe escape hatch).
 * @returns {{authorized:boolean, route_to_chairman:boolean, verdict:string, reason:string, neverAuto:boolean}}
 */
export function authorizeSwitchOn(request, opts = {}) {
  // `opts` is intentionally read here and discarded: this line documents that the
  // parameter exists yet has ZERO bearing on authority. Removing it would not change
  // any return value — proven by the "no opts permutation bypass" tests (FR-3/TS-5).
  void opts;

  let result;
  try {
    result = classifySwitchOn(request || {});
  } catch (err) {
    // Fail CLOSED on any classifier throw — never auto-proceed on an error path.
    return deny('error', 'fail-closed-error', false);
  }

  // Defensive: a malformed classifier return (null/no verdict) also fails closed.
  if (!result || typeof result.verdict !== 'string') {
    return deny('error', 'fail-closed-error', false);
  }

  const { verdict, neverAuto } = result;

  switch (verdict) {
    case SWITCHON_VERDICT.REVERSIBLE:
      // The ONLY path to authorized:true — a fully-classified, mechanism-reversible,
      // in-role, non-never-auto request. Reversible components auto-proceed unchanged
      // (guards against re-introducing the idle-fleet bottleneck; FR-3 positive control).
      return Object.freeze({
        authorized: true,
        route_to_chairman: false,
        verdict,
        reason: 'reversible',
        neverAuto: false,
      });

    case SWITCHON_VERDICT.CONSEQUENTIAL:
      // NEVER-AUTO classes and rubric-escalated consequential actions are UNCONDITIONALLY
      // hard-stopped and routed to the chairman. No opts value reaches this decision.
      return neverAuto
        ? deny(verdict, 'never-auto', true)
        : deny(verdict, 'consequential', false);

    case SWITCHON_VERDICT.UNKNOWN:
      // Ambiguous / missing-field requests fail closed (parent Success Criteria #4).
      return deny(verdict, 'fail-closed-unknown', false);

    default:
      // Unexpected verdict string — fail closed rather than trust an unknown state.
      return deny('error', 'fail-closed-error', false);
  }
}

export default authorizeSwitchOn;
