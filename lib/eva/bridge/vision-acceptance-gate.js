/**
 * SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001 (FR-1): the single, pure, tested decision for whether
 * a leo_bridge venture must HOLD at Stage 19 because its built result has not been verified to
 * satisfy the chairman-approved vision. No DB access, no side effects — the truth table is
 * unit-testable in isolation and the worker S19 hold path (FR-2) consumes exactly ONE decision.
 *
 * Campaign "intelligent-venture-build" enhancement #3 of 3 (after #1 repo-grounded decomposition and
 * #2 context-aware dependency-ordered execution): the pipeline now VERIFIES its result against the
 * vision before advancement — "plan from reality -> build with context -> verify against vision". The
 * verdict itself is produced session-hosted (the /leo-verify-venture skill is the injected judge in
 * venture-vision-verifier.js) and recorded in venture_stage_work.advisory_data.vision_acceptance_verdict;
 * this module only CLASSIFIES a recorded verdict and decides hold/advance.
 *
 * Never-advance invariant (RCA a14ff998 — the S19 gate-bypass incident): this lib contains no advance
 * path, no venture stage write, and no governance/vision approval. The worker change it backs is a
 * break-HOLD only, which reaches zero of the seven _advanceStage call sites.
 */

/** Classification of a recorded vision-acceptance verdict. */
export const VISION_ACCEPTANCE = Object.freeze({
  VERIFIED_PASS: 'verified_pass',   // verdict.pass === true  → the built venture satisfies the vision
  VERIFIED_GAPS: 'verified_gaps',   // verdict.pass === false → gaps vs the vision → HOLD
  NOT_EVALUATED: 'not_evaluated',   // no verdict recorded yet (undefined/null/no boolean pass key)
  NO_VISION: 'no_vision',           // explicit "no chairman-approved vision" marker
});

/**
 * Classify a recorded verdict object into exactly one VISION_ACCEPTANCE outcome.
 *
 * null / undefined / {} (no boolean `pass` key) map to NOT_EVALUATED and must NEVER be coerced to
 * VERIFIED_PASS — the undefined-vs-false distinction is load-bearing: it decides whether the gate is
 * even active (mirrors the null-vs-false care in s19-advance-decision.js). An explicit
 * { no_vision: true } marker maps to NO_VISION so the caller can defer to the existing VISION_MISSING
 * gate rather than double-handling the no-vision case.
 *
 * @param {{pass?: boolean, no_vision?: boolean}|null|undefined} verdict
 * @returns {string} one of VISION_ACCEPTANCE
 */
export function classifyVisionAcceptance(verdict) {
  if (verdict && verdict.no_vision === true) return VISION_ACCEPTANCE.NO_VISION;
  if (!verdict || typeof verdict.pass !== 'boolean') return VISION_ACCEPTANCE.NOT_EVALUATED;
  return verdict.pass === true ? VISION_ACCEPTANCE.VERIFIED_PASS : VISION_ACCEPTANCE.VERIFIED_GAPS;
}

/**
 * THE single hold/advance decision for the vision-acceptance gate at Stage 19.
 *
 *   - buildComplete === false → no-hold. A venture is only vision-verified once its build is COMPLETE.
 *     The NOOP_EMPTY 0-payload case proceeds past shouldHoldAtS19 with buildComplete===false (nothing
 *     was built), and a stale VERIFIED_GAPS from a prior partial build must not block a later-completed
 *     build. (buildComplete===true, or null for a non-leo_bridge built venture, proceed to evaluation.)
 *   - VERIFIED_GAPS → HOLD always (the built venture has verified gaps vs the vision).
 *   - VERIFIED_PASS → no-hold (the built venture satisfies the vision; the existing normal advance runs).
 *   - NO_VISION    → no-hold (defer to the existing shouldHoldAtS19 VISION_MISSING gate; never race it).
 *   - NOT_EVALUATED → HOLD only under strict mode. The default fail-open posture is a zero-regression
 *     rollout (detection on an explicit FAIL only); strict flips it to enforce verify-before-advance
 *     once the session-hosted verifier is wired into the autonomous build flow.
 *
 * @param {{verdict?: object|null, buildComplete?: boolean|null, strict?: boolean}} [args]
 * @returns {boolean} true = HOLD at S19 (do not advance); false = ADVANCE / no-op
 */
export function shouldHoldForVisionAcceptance({ verdict, buildComplete, strict = false } = {}) {
  if (buildComplete === false) return false; // only a complete build is verified
  const outcome = classifyVisionAcceptance(verdict);
  switch (outcome) {
    case VISION_ACCEPTANCE.VERIFIED_GAPS: return true;             // gaps vs vision → HOLD
    case VISION_ACCEPTANCE.VERIFIED_PASS: return false;            // satisfies vision → advance
    case VISION_ACCEPTANCE.NO_VISION:     return false;            // defer to existing VISION_MISSING gate
    case VISION_ACCEPTANCE.NOT_EVALUATED: return strict === true;  // fail-open unless strict
    default:                              return false;
  }
}

/**
 * Feature flag: the vision-acceptance gate. Default ON; only an explicit false/0/off/no disables it
 * (then the worker S19 hold block is skipped entirely — byte-identical legacy advance). Mirrors
 * isDependencyOrderedExecutionEnabled in venture-build-consumer.js.
 */
export function isVisionAcceptanceGateEnabled() {
  const v = process.env.VISION_ACCEPTANCE_GATE;
  if (v === undefined || v === '') return true;
  const s = String(v).toLowerCase();
  return s !== 'false' && s !== '0' && s !== 'off' && s !== 'no';
}

/**
 * Strict mode: when ON, a NOT_EVALUATED venture (no recorded verdict) HOLDS at S19 — enforcing
 * verify-before-advance. Default OFF (fail-open on an unrecorded verdict) for a zero-regression
 * rollout; flip ON once the session-hosted /leo-verify-venture verifier writes verdicts in the
 * autonomous build flow (proven against a real venture, e.g. DataDistill).
 */
export function isVisionAcceptanceStrict() {
  const v = process.env.VISION_ACCEPTANCE_STRICT;
  if (v === undefined || v === '') return false;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}
