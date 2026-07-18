/**
 * Op-co switch-on reversibility classifier — SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-A.
 *
 * Answers reversible / consequential / unknown for a proposed switch-on request, by
 * ADAPTING (not mutating) lib/adam/execute-vs-escalate.js's deterministic 3-gate rubric.
 * That module has 2 verdicts (execute/escalate); this classifier maps its gates onto a
 * 3rd, explicit "unknown" verdict, and layers the chairman-ratified NEVER-AUTO class list
 * on top with absolute precedence (CONST-001/002: machine-precheck feeds chairman
 * ratification, never replaces it for irreversible/live-money/venture-commitment actions).
 *
 * Precedence (highest first):
 *   1. NEVER-AUTO-listed action  -> always 'consequential', regardless of other inputs.
 *   2. Any required field missing/ambiguous -> 'unknown' (conservative, per ADAM's own
 *      "if you are not sure it is reversible, treat it as not reversible" rule).
 *   3. Otherwise, delegate to classifyDecision(): EXECUTE -> 'reversible', ESCALATE -> 'consequential'.
 *
 * @module lib/switch-automation/reversibility-classifier
 */
import { classifyDecision, VERDICT as ADAM_VERDICT } from '../adam/execute-vs-escalate.js';

export const SWITCHON_VERDICT = Object.freeze({
  REVERSIBLE: 'reversible',
  CONSEQUENTIAL: 'consequential',
  UNKNOWN: 'unknown',
});

/** Chairman-ratified NEVER-AUTO action classes (Solomon adjudication ab03cf18). Data, not code
 * comments -- child A seeds these same string keys as rows in chairman_switchon_policy. */
export const NEVER_AUTO_CLASSES = Object.freeze([
  'venture-gate-binding-flip',
  'live-money-enablement',
  'public-launch',
  'first-external-send',
  'venture-selection',
  'venture-kill',
  'venture-promote',
  'gate-config-change',
  'gate-threshold-change',
  'gate-skiplist-change',
  'agent-authority-expansion',
  'credential-grant-expansion',
  'freeze-machinery',
  'kill-switch-machinery',
  'policy-ratchet-self-reference',
]);

/** Required input fields; any missing/ambiguous one forces 'unknown' (gate 2). */
const REQUIRED_FIELDS = ['component', 'action'];

/**
 * @param {Object} input
 * @param {string} [input.component]                     - the op-co component being switched on.
 * @param {string} [input.action]                         - the action class (checked against NEVER_AUTO_CLASSES).
 * @param {boolean|null} [input.reversible]                - passed through to classifyDecision (null/undefined = uncertain).
 * @param {boolean|null} [input.inRole]                    - passed through to classifyDecision (null/undefined = uncertain).
 * @param {boolean} [input.isLiveMoney]                    - maps to ADAM's flagship gate.
 * @param {boolean} [input.isVentureCommitment]            - maps to ADAM's governance gate.
 * @param {boolean} [input.isReversibleByMechanism]        - true only if the class declares a revert verb/TTL/invoker AND a revert rehearsal has passed. Missing/false -> not reversible.
 * @returns {{ verdict: string, reasons: string[], neverAuto: boolean }}
 */
export function classifySwitchOn(input = {}) {
  const { component, action, reversible, inRole, isLiveMoney = false, isVentureCommitment = false, isReversibleByMechanism } = input;

  // Gate 1 (highest precedence): NEVER-AUTO class list always wins.
  if (typeof action === 'string' && NEVER_AUTO_CLASSES.includes(action)) {
    return { verdict: SWITCHON_VERDICT.CONSEQUENTIAL, reasons: [`never-auto:${action}`], neverAuto: true };
  }

  // Gate 2: any required field missing/ambiguous -> unknown, even if action happens to
  // resemble a NEVER-AUTO class textually elsewhere -- this branch only runs once gate 1
  // has already ruled out an exact NEVER-AUTO match.
  const missing = REQUIRED_FIELDS.filter((f) => typeof input[f] !== 'string' || input[f].trim() === '');
  if (missing.length > 0) {
    return { verdict: SWITCHON_VERDICT.UNKNOWN, reasons: missing.map((f) => `missing:${f}`), neverAuto: false };
  }

  // Gate 3: delegate to the shared ADAM rubric. "Reversible by mechanism" (revert
  // verb/TTL/invoker declared + rehearsed) is required in addition to the raw `reversible`
  // flag -- an untested revert path is not reversible (Solomon adjudication point 3).
  const effectiveReversible = reversible === true && isReversibleByMechanism === true ? true
    : reversible === false || isReversibleByMechanism === false ? false
    : null; // uncertain if either signal is missing

  const { verdict } = classifyDecision({
    reversible: effectiveReversible,
    inRole,
    flagship: isLiveMoney,
    governance: isVentureCommitment,
  });

  return {
    verdict: verdict === ADAM_VERDICT.EXECUTE ? SWITCHON_VERDICT.REVERSIBLE : SWITCHON_VERDICT.CONSEQUENTIAL,
    reasons: verdict === ADAM_VERDICT.EXECUTE ? [] : ['adam-rubric-escalate'],
    neverAuto: false,
  };
}

export default classifySwitchOn;
