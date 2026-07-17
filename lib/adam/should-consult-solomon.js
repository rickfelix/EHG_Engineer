/**
 * Adam PRE-SEND Solomon-consult gate — SD-LEO-INFRA-ADAM-PRE-SEND-001 (FR-1/3/4/5).
 *
 * TRUST-CRITICAL, L1 mechanism (not willpower): when Adam is about to send a
 * CONSEQUENTIAL-class decision/recommendation to the coordinator, it must consult
 * Solomon FIRST, then send. The origin miss was a security webhook-deploy call Adam
 * made SOLO after mis-classifying a service-role-on-public-host hole as routine.
 *
 * ALL decision logic lives here, behind unit tests, with NO live Solomon/DB I/O. The
 * live send path (scripts/adam-advisory.cjs) keeps a tiny diff and injects every side
 * effect through `deps`.
 *
 * ORDER MATTERS (see evaluatePreSendConsult):
 *   1. FR-4 TRIAGE FIRST (volume guard) — a clearly non-consequential/routine send
 *      short-circuits to `proceed` with NO classifier and NO consult. Preserves
 *      silence-by-default + protects the Solomon consult quota. Routed through the
 *      canonical lib/adam/execute-vs-escalate.js classifyDecision authority, never a
 *      parallel boolean.
 *   2. FR-2 CLASSIFY — the shared DECISION-axis taxonomy classifyConsequence()
 *      (fail-closed: unknown -> high). NOT 'high' => proceed. One taxonomy, Adam is
 *      its 2nd consumer (SMS bridge is the 1st). No parallel list is minted here.
 *   3. Consequential (high) => a consult is REQUIRED; performBoundedConsult (FR-3)
 *      does the bounded-wait with FAIL-OPEN degradation (Adam is NEVER hard-blocked
 *      on Solomon).
 *   4. FR-5 NO SELF-EXEMPTION — this module takes no "skip"/"exempt" flag. The ONLY
 *      way past a high-consequence send is a recorded consult (action:'send') or an
 *      audited degraded-proceed (ledger capture) / chairman hold-and-surface.
 *
 * @module lib/adam/should-consult-solomon
 */

import { classifyDecision, VERDICT } from './execute-vs-escalate.js';
import { classifyConsequence as defaultClassifyConsequence } from '../chairman/consequence-classifier.js';

/** Default bounded-wait for the Solomon consult (ms). Overridable via deps.timeoutMs. */
export const DEFAULT_CONSULT_TIMEOUT_MS = 8000;

/** Unique sentinel so a real verdict of `null`/`undefined` is never mistaken for a win. */
const TIMEOUT = Symbol('solomon-consult-timeout');

/**
 * Positive recognition of CLEARLY-routine, informational sends. Presence of one of
 * these (AND absence of any CONSEQUENCE_HINT below) is what lets the triage verb
 * short-circuit — silence-by-default. Deliberately about the *form* of the send
 * (status/FYI/ack), NOT the consequence taxonomy (that stays solely in
 * classifyConsequence).
 */
const ROUTINE_INFO_PATTERNS = [
  /\bfyi\b/i,
  /\bstatus\b/i,
  /\bupdate\b/i,
  /\bheads[-\s]?up\b/i,
  /\bmerged\b/i,
  /\bcomplete[d]?\b/i,
  /\bdone\b/i,
  /\backnowledg\w*/i,
  /\bconfirm\w*\s+receipt\b/i,
  /\breminder\b/i,
  /\bprogress\b/i,
  /\bsync(?:ing|ed)?\b/i,
  /\bno[-\s]?op\b/i,
  /\bnoted\b/i,
  /\bno action (?:needed|required)\b/i,
];

/**
 * Coarse "smells like a decision / has blast radius" net. This is NOT the consequence
 * taxonomy — it is a ROUTER that forces a borderline send to FALL THROUGH into the
 * authoritative classifyConsequence(), never away from it (fail-toward-classify). Any
 * hit here disqualifies a send from the routine short-circuit even if a routine word is
 * also present (e.g. "FYI: proceeding with the prod deploy").
 */
const CONSEQUENCE_HINT_PATTERNS = [
  /\bapprove\b/i,
  /\bproceed\w*/i,
  /\bdeploy\w*/i,
  /\bship\b/i,
  /\blaunch\w*/i,
  /\bkill\b/i,
  /\bshut\b(?:\s+\w+){0,3}\s+down\b/i,
  /\bpause\b/i,
  /\bdefer\b/i,
  /\bpivot\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bescalat\w*/i,
  /\bmigrat\w*/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\brotate\b/i,
  /\bsign\b/i,
  /\bauthoriz\w*/i,
  /\bauthorit\w*/i,
  /\bprivileg\w*/i,
  /\bpermission\b/i,
  /\brecommend\w*/i,
  /\bpropose\w*/i,
  /\bdecide\b/i,
  /\bshould\s+(?:we|i)\b/i,
  /\bgovernance\b/i,
  /\bcredential\w*/i,
  /\bsecret\w*/i,
  /\bpassword\b/i,
  /\bapi[\s-]?key\b/i,
  /\bwebhook\b/i,
  /\bcontract\w*/i,
  /\bpolicy\b/i,
  /\bprecedent\b/i,
  /\bmechanism\b/i,
  /\bchairman\b/i,
  /\bkill[-\s]?gate\b/i,
  /\birreversible\b/i,
  /\bspend\b/i,
  /\bbudget\b/i,
  /\binvoice\b/i,
  /\bpayment\b/i,
  /\$\s?\d/i,
];

function stringifyContext(context) {
  if (context == null) return '';
  if (typeof context === 'string') return context;
  try {
    return JSON.stringify(context);
  } catch {
    return '';
  }
}

function joinText({ decisionType, title, body, context }) {
  return [decisionType, title, body, stringifyContext(context)].filter(Boolean).join(' ');
}

/**
 * FR-4: derive the 3-gate inputs for the canonical classifyDecision authority from a
 * pending send. CONSERVATIVE + one-directional:
 *   - reversible/inRole resolve to `true` ONLY for a positively-recognized routine send
 *     (routine marker present AND no consequence hint) -> classifyDecision EXECUTE ->
 *     short-circuit proceed.
 *   - otherwise they stay uncertain (null) -> classifyDecision ESCALATE -> fall through
 *     to the fail-closed classifyConsequence().
 *   - a caller MAY escalate via explicit context.{flagship,governance,dataLoss}===true,
 *     but CANNOT assert a send is safe to skip (FR-5: no self-exemption downgrade path).
 *
 * @param {{decisionType?:string,title?:string,body?:string,context?:*}} input
 * @returns {{reversible:(boolean|null),inRole:(boolean|null),flagship:boolean,governance:boolean,dataLoss:boolean}}
 */
export function deriveTriageGates({ decisionType = '', title = '', body = '', context } = {}) {
  const text = joinText({ decisionType, title, body, context });
  const hasRoutineMarker = ROUTINE_INFO_PATTERNS.some((re) => re.test(text));
  const hasConsequenceHint = CONSEQUENCE_HINT_PATTERNS.some((re) => re.test(text));
  const clearlyRoutine = hasRoutineMarker && !hasConsequenceHint;

  const ctx = context && typeof context === 'object' ? context : {};
  return {
    reversible: clearlyRoutine ? true : null,
    inRole: clearlyRoutine ? true : null,
    // escalate-only caller signals (never a downgrade / exemption)
    flagship: ctx.flagship === true,
    governance: ctx.governance === true,
    dataLoss: ctx.dataLoss === true,
  };
}

/**
 * FR-1/2/4: decide what a pending send requires. Pure — performs NO consult and NO
 * ledger write; the caller runs performBoundedConsult when action === 'consult-then-send'.
 *
 * @param {Object} input
 * @param {string} [input.decisionType]
 * @param {string} [input.title]
 * @param {string} [input.body]
 * @param {*}      [input.context]
 * @param {boolean}[input.isChairmanTargeted]
 * @param {Object} [deps]
 * @param {Function}[deps.classifyDecision]     - override the triage authority (tests).
 * @param {Function}[deps.classifyConsequence]  - override the shared taxonomy (tests).
 * @returns {{action:'proceed'|'consult-then-send', consequence:string, reason:string}}
 */
export function evaluatePreSendConsult(input = {}, deps = {}) {
  const triage = deps.classifyDecision || classifyDecision;
  const classify = deps.classifyConsequence || defaultClassifyConsequence;
  const { decisionType = '', title = '', body = '', context } = input;

  // 1. FR-4 — TRIAGE FIRST. A clearly-routine send short-circuits with no classifier,
  //    no consult. Routed through the canonical classifyDecision authority.
  const gates = deriveTriageGates({ decisionType, title, body, context });
  const triageVerdict = triage(gates);
  if (triageVerdict.verdict === VERDICT.EXECUTE) {
    return { action: 'proceed', consequence: 'triage', reason: 'triage:not-consequential' };
  }

  // 2. FR-2 — CLASSIFY against the ONE shared DECISION-axis taxonomy (fail-closed high).
  //    body is folded into context so the classifier (which reads decisionType/title/
  //    context) still sees the free-text advisory body.
  const consequence = classify({
    decisionType,
    title,
    context: [body, stringifyContext(context)].filter(Boolean).join(' '),
  });
  if (consequence !== 'high') {
    return { action: 'proceed', consequence, reason: `classified:${consequence}` };
  }

  // 3. Consequential (high) => a consult is REQUIRED before the send.
  return { action: 'consult-then-send', consequence: 'high', reason: 'consequential:consult-required' };
}

function withTimeout(work, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve) => {
    // NOT unref'd: the bounded-wait timer must hold the event loop for the full window
    // so the guarantee (resolve within timeoutMs) holds even when `work` hangs and is the
    // only other pending work. The win branch clearTimeout()s it, so it never over-holds.
    timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });
  // Wrap `work` in Promise.resolve so a synchronous throw is captured as a rejection.
  const raced = Promise.resolve()
    .then(() => work())
    .then((value) => { clearTimeout(timer); return value; });
  return Promise.race([raced, timeout]);
}

/**
 * FR-3: perform the bounded-wait Solomon consult for a high-consequence send.
 *
 * GOVERNING INVARIANT: Adam is NEVER hard-blocked on Solomon. This function NEVER
 * throws and NEVER blocks past deps.timeoutMs.
 *
 *   - consult returns a verdict in time  -> {action:'send', consultRecorded:true, verdict}
 *   - timeout / absence (null) / throw   -> FAIL-OPEN:
 *       * isChairmanTargeted -> {action:'hold-and-surface', degraded:true} (do NOT
 *         auto-proceed on the chairman control surface)
 *       * else               -> {action:'proceed', degraded:true, caution:true, ledger}
 *         and deps.recordLedger(ledger) is invoked (adam_adherence_ledger capture).
 *
 * @param {Object} input
 * @param {string} [input.decisionType]
 * @param {string} [input.title]
 * @param {string} [input.body]
 * @param {*}      [input.context]
 * @param {boolean}[input.isChairmanTargeted]
 * @param {Object} deps
 * @param {Function} deps.consult        - async (payload) => verdict | null. May throw/hang.
 * @param {Function} [deps.recordLedger] - async (ledger) => void. Best-effort, never fatal.
 * @param {number}   [deps.timeoutMs]    - bounded wait (default DEFAULT_CONSULT_TIMEOUT_MS).
 * @param {Function} [deps.now]          - () => epoch ms (injected clock).
 * @returns {Promise<Object>}
 */
export async function performBoundedConsult(input = {}, deps = {}) {
  const { decisionType = '', title = '', body = '', context, isChairmanTargeted = false } = input;
  const timeoutMs = typeof deps.timeoutMs === 'number' && deps.timeoutMs >= 0
    ? deps.timeoutMs
    : DEFAULT_CONSULT_TIMEOUT_MS;
  const consult = typeof deps.consult === 'function' ? deps.consult : null;
  const recordLedger = typeof deps.recordLedger === 'function' ? deps.recordLedger : async () => {};

  const payload = { decisionType, title, body, context, isChairmanTargeted };

  let result = TIMEOUT;
  if (consult) {
    try {
      result = await withTimeout(() => consult(payload), timeoutMs);
    } catch {
      // throw is treated identically to timeout/absence — FAIL-OPEN below.
      result = TIMEOUT;
    }
  }

  const gotVerdict = result !== TIMEOUT && result != null;
  if (gotVerdict) {
    return { action: 'send', consultRecorded: true, consequence: 'high', verdict: result };
  }

  // FAIL-OPEN degradation. Adam is never hard-blocked on Solomon.
  if (isChairmanTargeted) {
    return {
      action: 'hold-and-surface',
      degraded: true,
      consequence: 'high',
      reason: 'solomon-consult-timeout::chairman-hold-and-surface',
    };
  }

  const ledger = {
    probe: 'decision_rubric',
    duty: 'pre_send_consult',
    verdict: 'unknown',
    detail: 'solomon-consult-timeout::documented-proceed',
    remediation_ref: null,
  };
  try {
    await recordLedger(ledger);
  } catch {
    // Ledger capture is best-effort; a capture failure must NEVER block the send.
  }
  return {
    action: 'proceed',
    degraded: true,
    caution: true,
    consequence: 'high',
    reason: 'solomon-consult-timeout::documented-proceed',
    ledger,
  };
}

export default evaluatePreSendConsult;
