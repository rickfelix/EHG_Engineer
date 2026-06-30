'use strict';

/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-001B — Solomon triage SSOT (pure counter-gated
 * eligibility predicate over retry-state-manager counters).
 *
 * Cognitive ladder: local reasoning → rca-agent → Solomon → Chairman.
 *
 * This module is PURE and TOTAL — it never throws, never performs DB/IO of any
 * kind, and always returns a fully-populated result object. Persistence of
 * triage_score + reason for auditability is the CALLER's responsibility
 * (implemented in Phase D), keeping this module side-effect-free and trivially
 * testable.
 */

const RCA_THRESHOLD = 2;
const GATE_FAIL_THRESHOLD = 3;

/**
 * Coerce a value to a non-negative integer. Returns 0 for anything
 * non-numeric, non-finite, or NaN.
 * @param {*} v
 * @returns {number}
 */
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Evaluate whether the current friction state meets the Solomon triage bar.
 *
 * PURE + TOTAL: never throws regardless of input shape. All numeric fields are
 * coerced via toInt(); non-object state/context are treated as empty.
 *
 * @param {string} signature - Tool/gate signature (informational; not used in
 *   computation but carried for caller context and future audit logging).
 * @param {object} [state={}]
 *   @param {number} [state.toolAttempts=0] - Count of the SAME gate/test failing
 *     past the 2 auto-retries (Canonical Pause-Point #3 accumulator).
 *   @param {number} [state.rcaCount=0] - Count of rca-agent runs on the same
 *     symptom without an actionable root cause.
 *   @param {boolean} [state.selfResolutionAttemptLogged=false] - True when the
 *     worker has already logged a self-resolution attempt for the current issue.
 * @param {object} [context={}]
 *   @param {string} [context.type] - Issue type, e.g. 'spec-conflict' or
 *     'arch-ambiguity'.
 * @returns {{ eligible: boolean, triage_score: number, reason: string }}
 */
function evaluateSolomonTriage(signature, state, context) {
  // Defensive normalisation — both arguments are optional and may be garbage.
  const s = (state !== null && typeof state === 'object') ? state : {};
  const ctx = (context !== null && typeof context === 'object') ? context : {};

  const rcaCount = toInt(s.rcaCount);
  const toolAttempts = toInt(s.toolAttempts);
  const selfResolutionAttemptLogged = s.selfResolutionAttemptLogged === true;
  const type = typeof ctx.type === 'string' ? ctx.type : undefined;

  // ── Decision logic (counter-gated, strict priority order) ─────────────────

  // 1. RCA escalation — rca-agent ran >=2x without an actionable root cause.
  if (rcaCount >= RCA_THRESHOLD) {
    return {
      eligible: true,
      triage_score: 90,
      reason: 'rca-agent ran >=2x on the same symptom without an actionable root cause (cognitive-ladder escalation)',
    };
  }

  // 2. Gate/test hard-stuck — Canonical Pause-Point #3 exhausted.
  if (toolAttempts >= GATE_FAIL_THRESHOLD) {
    return {
      eligible: true,
      triage_score: 85,
      reason: 'the same gate/test failed >=3x — Canonical Pause-Point-#3 exhausted',
    };
  }

  // 3. Counter-exception: spec-conflict / arch-ambiguity WITH a logged worker
  //    self-resolution attempt. selfResolutionAttemptLogged=false (the default)
  //    must produce eligible=false — the false-eligible trap.
  if ((type === 'spec-conflict' || type === 'arch-ambiguity') && selfResolutionAttemptLogged) {
    return {
      eligible: true,
      triage_score: 75,
      reason: `first-encounter ${type} WITH a logged worker self-resolution attempt (counter-exception)`,
    };
  }

  // 4. Not eligible — compute a proximity score and produce a specific reason.
  const rawScore = (rcaCount * 20) + (toolAttempts * 10);
  const triage_score = Math.min(50, rawScore);

  let reason;
  if ((type === 'spec-conflict' || type === 'arch-ambiguity') && !selfResolutionAttemptLogged) {
    // Spec says: mention which threshold is unmet AND that a logged
    // self-resolution attempt is required for this issue type.
    reason =
      `first-encounter ${type} WITHOUT a logged worker self-resolution attempt — ` +
      `selfResolutionAttemptLogged must be true before Solomon escalation is eligible ` +
      `(rcaCount ${rcaCount}/${RCA_THRESHOLD}, toolAttempts ${toolAttempts}/${GATE_FAIL_THRESHOLD} — neither threshold cleared)`;
  } else {
    reason =
      `not eligible: rcaCount ${rcaCount} has not reached threshold ${RCA_THRESHOLD} and ` +
      `toolAttempts ${toolAttempts} has not reached threshold ${GATE_FAIL_THRESHOLD} — ` +
      `no escalation trigger cleared`;
  }

  return { eligible: false, triage_score, reason };
}

/**
 * Boolean convenience wrapper — returns the eligible field from
 * evaluateSolomonTriage without exposing the full result object.
 *
 * @param {string} signature
 * @param {object} [state={}]
 * @param {object} [context={}]
 * @returns {boolean}
 */
function isSolomonEligible(signature, state, context) {
  return evaluateSolomonTriage(signature, state, context).eligible;
}

module.exports = { evaluateSolomonTriage, isSolomonEligible, RCA_THRESHOLD, GATE_FAIL_THRESHOLD };
