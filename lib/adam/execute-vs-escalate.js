/**
 * Adam execute-vs-escalate classifier — SD-LEO-INFRA-ADAM-EXECUTE-VS-ESCALATE-CLASSIFIER-001
 *
 * The canonical, deterministic 3-gate decision rubric Adam runs BEFORE any
 * chairman-ask (CLAUDE_ADAM.md decision_rubric, CONST-002 boundary):
 *
 *   EXECUTE-AND-REPORT  iff  (reversible AND in-role AND NOT flagship/governance/data-loss)
 *   otherwise           ->   ESCALATE to the chairman
 *
 * CONSERVATIVE by construction: when reversibility or in-role is UNCERTAIN
 * (null/undefined), the gate fails and the decision escalates — "if you are not
 * sure it is reversible, treat it as not reversible". flagship / governance /
 * data-loss escalate only on an explicit true (they default to absent), so an
 * unknown blast-radius gate never fabricates a flag.
 *
 * It guards two opposed failure modes:
 *   - OVER-ASK:        Adam asked the chairman when the rubric says EXECUTE.
 *   - UNDER-ESCALATE:  Adam executed when the rubric says ESCALATE.
 *
 * Pure + deterministic + no I/O.
 *
 * @module lib/adam/execute-vs-escalate
 */

export const VERDICT = Object.freeze({ EXECUTE: 'execute', ESCALATE: 'escalate' });

/** The three gates, in evaluation order. */
export const GATES = Object.freeze(['reversible', 'inRole', 'blastRadius']);

/**
 * Classify a decision as execute-and-report vs escalate.
 *
 * @param {Object} input
 * @param {boolean|null} [input.reversible]  - true only if the action can be cleanly undone. null/undefined = uncertain => escalate.
 * @param {boolean|null} [input.inRole]      - true only if the decision is within Adam's standing authority. null/undefined = uncertain => escalate.
 * @param {boolean} [input.flagship]         - true if it touches a flagship/irreversible venture op.
 * @param {boolean} [input.governance]       - true if it is a new strategy/policy, a reserved kill/major gate, or a ratified-decision deviation.
 * @param {boolean} [input.dataLoss]         - true if it risks data loss / destructive mutation.
 * @returns {{ verdict: string, reasons: string[], gates: Object }}
 *   verdict ∈ VERDICT. reasons[] names each FAILED gate. gates echoes the resolved inputs.
 */
export function classifyDecision(input = {}) {
  const { reversible, inRole, flagship = false, governance = false, dataLoss = false } = input;
  const reasons = [];

  // Gate 1 — reversible (conservative on uncertainty)
  if (reversible !== true) {
    reasons.push(reversible === false ? 'irreversible' : 'reversibility-uncertain');
  }
  // Gate 2 — in-role (conservative on uncertainty)
  if (inRole !== true) {
    reasons.push(inRole === false ? 'out-of-role' : 'role-uncertain');
  }
  // Gate 3 — NOT flagship/governance/data-loss (explicit-true only)
  if (flagship === true) reasons.push('flagship');
  if (governance === true) reasons.push('governance');
  if (dataLoss === true) reasons.push('data-loss');

  return {
    verdict: reasons.length ? VERDICT.ESCALATE : VERDICT.EXECUTE,
    reasons,
    gates: { reversible, inRole, flagship, governance, dataLoss },
  };
}

/** Convenience: true iff the decision is Adam's to execute-and-report. */
export function shouldExecute(input = {}) {
  return classifyDecision(input).verdict === VERDICT.EXECUTE;
}

/**
 * Map the adherence-probe text-classifier's signals onto the structured 3 gates,
 * so the regex over-ask detector routes its verdict through the single canonical
 * authority (classifyDecision) instead of a parallel boolean.
 *
 * @param {Object} signals
 * @param {string|null} [signals.trigger]      - a COMES_TO_HIM trigger name, or null if none fired.
 * @param {boolean} [signals.alreadyDetermined]- an ADAM-DECIDES signal (e.g. "I recommend", "reversible", "per the ratified decision") is present.
 * @returns {{ reversible: (boolean|null), inRole: (boolean|null), flagship: boolean, governance: boolean, dataLoss: boolean }}
 */
export function gatesFromSignals({ trigger = null, alreadyDetermined = false } = {}) {
  // No COMES-TO-HIM trigger: the decision is presumptively Adam's (in-role); it is
  // reversible only when an ADAM-DECIDES signal asserts a reversible/already-determined
  // disposition, else reversibility is uncertain (=> conservative escalate).
  const gates = {
    reversible: alreadyDetermined ? true : null,
    inRole: true,
    flagship: false,
    governance: false,
    dataLoss: false,
  };
  switch (trigger) {
    case 'new-strategy-or-policy':
      gates.governance = true;
      gates.inRole = false;
      break;
    case 'reserved-kill-gate':
      gates.governance = true;
      gates.flagship = true;
      break;
    case 'ratified-deviation':
      gates.governance = true;
      break;
    case 'irreversible-or-external':
      gates.reversible = false;
      gates.flagship = true;
      break;
    default:
      break;
  }
  return gates;
}

export default classifyDecision;
