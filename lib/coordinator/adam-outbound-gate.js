/**
 * adam-outbound-gate.js — the Adam Outbound Gate.
 * SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-D (child of the SMS-channel-hardening orchestrator).
 *
 * A PURE gate that runs over every Adam outbound in the scripts/adam-advisory.cjs send path,
 * mirroring the existing pure-detector style of sanityCheckUrgentAdvisory ({ tripped, reasons }).
 * It enforces three checks, each COMPOSING an existing fleet authority rather than re-deriving a
 * parallel heuristic that would drift:
 *
 *   1. advisory rationale bar   — an advisory-kind body must carry reasoning and NO manipulative
 *      framing. Reuses lib/adam/rationale-bar.js MANIPULATIVE_PATTERNS (single-sourced) + the
 *      REQUIRED_RATIONALE_FIELDS vocabulary. Scoped to advisory kinds ONLY; DIRECTIVE_KINDS and
 *      SOLOMON_CONSULT are exempt (they are not advisories).
 *   2. should-answer rubric     — flags Adam ASKING the chairman a decision that is his to
 *      execute-and-report. Routes context.decision through lib/adam/execute-vs-escalate.js
 *      classifyDecision: a chairman-addressed question whose decision classifies EXECUTE means
 *      "am I asking what I should decide myself?"; an ESCALATE decision means asking is correct.
 *   3. Solomon-review check     — warns when a CONSEQUENTIAL decision is sent without a prior
 *      Solomon consult (the pre-send "consult Solomon on consequential decisions" rubric). A
 *      solomon_consult-kind message IS the consult and is exempt.
 *
 * PURE: no DB / network / model I/O. The caller resolves the decision signals + solomonConsulted
 * and passes them via `context`; the gate only classifies. It NEVER re-implements the
 * model-availability alarm (sanityCheckUrgentAdvisory stays a separate, earlier gate).
 */
import { classifyDecision, VERDICT } from '../adam/execute-vs-escalate.js';
import { MANIPULATIVE_PATTERNS, REQUIRED_RATIONALE_FIELDS } from '../adam/rationale-bar.js';
import workerStatus from '../fleet/worker-status.cjs';

const { PAYLOAD_KINDS, DIRECTIVE_KINDS } = workerStatus;

// Fail loud if the CJS->ESM interop silently yields undefined kind constants — otherwise the
// exemptions would quietly disable themselves (TESTING interop warning).
if (!PAYLOAD_KINDS || !PAYLOAD_KINDS.ADAM_ADVISORY || !Array.isArray(DIRECTIVE_KINDS)) {
  throw new Error('adam-outbound-gate: kind constants failed to resolve from lib/fleet/worker-status.cjs');
}

const ADVISORY_KIND = PAYLOAD_KINDS.ADAM_ADVISORY;      // 'adam_advisory'
const SOLOMON_CONSULT_KIND = PAYLOAD_KINDS.SOLOMON_CONSULT; // 'solomon_consult'
const DIRECTIVE_KIND_SET = new Set(DIRECTIVE_KINDS);

// Reasoning scaffolding an advisory body must show — drawn from the rationale-bar vocabulary plus
// the natural-language connectives a free-text advisory uses to justify itself.
const RATIONALE_MARKERS = new RegExp(
  `\\b(because|since|so that|therefore|which means|the reason|driver:|rationale|why:|due to|in order to|${REQUIRED_RATIONALE_FIELDS.join('|')})\\b`,
  'i',
);

// A chairman-addressed message is question-shaped when it ends with '?' or opens with a
// decision-seeking phrase. Used only to gate the should-answer check to genuine questions.
const QUESTION_SHAPE = /\?\s*$|\b(should (?:we|i)|do you want|which (?:one|option|venture)|approve\??|shall (?:we|i)|ok to|go ahead\?)\b/i;

const CHAIRMAN_ADDRESSEES = new Set(['chairman']);

/** True when this outbound is directed at the chairman (should-answer only concerns chairman asks). */
function isChairmanAddressed(addressee) {
  return CHAIRMAN_ADDRESSEES.has(String(addressee || '').toLowerCase());
}

/**
 * @param {object} message  { body, kind, addressee, expectsReply, mode }
 * @param {object} [context]
 *   context.decision       { reversible, inRole, flagship, governance, dataLoss } — classifyDecision input
 *   context.consequential  explicit override marking the decision consequential
 *   context.solomonConsulted true if a Solomon consult already happened for this decision
 * @returns {{ tripped:boolean, reasons:string[], verdict:'pass'|'block'|'warn',
 *   checks:{ rationaleBar:{pass,reason}, shouldAnswer:{pass,reason}, solomonReview:{pass,reason} } }}
 */
export function checkAdamOutbound(message = {}, context = {}) {
  const body = String(message.body || '');
  const kind = message.kind || ADVISORY_KIND;
  const expectsReply = message.expectsReply === true || message.mode === 'request';

  const checks = {
    rationaleBar: evalRationaleBar(body, kind),
    shouldAnswer: evalShouldAnswer(message, expectsReply, context),
    solomonReview: evalSolomonReview(kind, context),
  };

  const reasons = [];
  let block = false;
  let warn = false;
  for (const [name, c] of Object.entries(checks)) {
    if (c.pass) continue;
    reasons.push(`${name}: ${c.reason}`);
    if (c.severity === 'warn') warn = true;
    else block = true;
  }

  return {
    tripped: reasons.length > 0,
    reasons,
    verdict: block ? 'block' : warn ? 'warn' : 'pass',
    checks,
  };
}

/** Check 1 — advisory rationale bar (advisory kinds only). */
function evalRationaleBar(body, kind) {
  // Exempt non-advisory classes: directives and Solomon consults are not advisories.
  if (kind !== ADVISORY_KIND) {
    return { pass: true, reason: `exempt (kind '${kind}' is not an advisory)`, severity: 'block' };
  }
  if (!body.trim()) {
    return { pass: false, reason: 'advisory body is empty (no rationale possible)', severity: 'block' };
  }
  if (MANIPULATIVE_PATTERNS.test(body)) {
    return { pass: false, reason: 'manipulative/urgent/certainty framing (CONST-010)', severity: 'block' };
  }
  if (!RATIONALE_MARKERS.test(body)) {
    return { pass: false, reason: 'advisory states a conclusion with no reasoning (missing why/because/rationale)', severity: 'block' };
  }
  return { pass: true, reason: 'advisory carries reasoning, no manipulative framing', severity: 'block' };
}

/** Check 2 — should-answer rubric (chairman-addressed questions only). */
function evalShouldAnswer(message, expectsReply, context) {
  const question = expectsReply && QUESTION_SHAPE.test(String(message.body || ''));
  if (!isChairmanAddressed(message.addressee) || !question) {
    return { pass: true, reason: 'not a chairman-addressed question', severity: 'block' };
  }
  // No decision signals -> classifyDecision is conservative (uncertain => escalate). Asking is then
  // correct, so shouldAnswer passes — we NEVER emit a false "you should have decided this" flag.
  const decision = context.decision;
  if (!decision || typeof decision !== 'object') {
    return { pass: true, reason: 'no decision signals; conservative (escalate) — asking is fine', severity: 'block' };
  }
  const { verdict, reasons } = classifyDecision(decision);
  if (verdict === VERDICT.EXECUTE) {
    return { pass: false, reason: 'asking the chairman a decision that classifies EXECUTE (Adam should decide-and-report it)', severity: 'block' };
  }
  return { pass: true, reason: `escalation is correct (${reasons.join(', ') || 'escalate'})`, severity: 'block' };
}

/** Check 3 — Solomon-review check (consequential decisions must show a prior consult). */
function evalSolomonReview(kind, context) {
  // A solomon_consult message IS the consult — exempt.
  if (kind === SOLOMON_CONSULT_KIND) {
    return { pass: true, reason: 'exempt (this IS a Solomon consult)', severity: 'warn' };
  }
  const consequential = isConsequential(context);
  if (!consequential) {
    return { pass: true, reason: 'not a consequential decision', severity: 'warn' };
  }
  if (context.solomonConsulted === true) {
    return { pass: true, reason: 'consequential, Solomon already consulted', severity: 'warn' };
  }
  return { pass: false, reason: 'consequential decision sent without a prior Solomon consult', severity: 'warn' };
}

/**
 * A decision is consequential when explicitly marked, or when classifyDecision escalates for a
 * strategic reason (governance / flagship). A merely reversibility-uncertain escalation is NOT
 * on its own consequential — that would over-warn on routine asks.
 */
function isConsequential(context) {
  if (context.consequential === true) return true;
  const decision = context.decision;
  if (!decision || typeof decision !== 'object') return false;
  if (decision.governance === true || decision.flagship === true || decision.dataLoss === true) return true;
  return false;
}

export default checkAdamOutbound;
