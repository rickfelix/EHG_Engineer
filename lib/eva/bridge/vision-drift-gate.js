/**
 * SD-LEO-INFRA-STAGE-VISION-ARTIFACT-001 (FR-1): the single, pure, tested decision for whether a
 * leo_bridge venture must HOLD at Stage 19 because its chairman-approved L2 vision has materially
 * DRIFTED from the venture's S13-S18 artifacts + S19 sprint. This is the INPUT-side complement to
 * SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001's OUTPUT-side vision-acceptance gate (#4163): that gate
 * verifies the built result AFTER the tree exists; this one catches a drifted vision BEFORE the tree
 * is generated. No DB access, no side effects — the truth table is unit-testable in isolation.
 *
 * The verdict is produced session-hosted (a single-LLM 4-dimension drift-probe over value-prop /
 * target-user / technical-modality / deployment-model) and recorded in
 * venture_stage_work.advisory_data.vision_drift_verdict; this module only CLASSIFIES a recorded
 * verdict and decides hold/advance PLUS the HOLD CAUSE (chairman-reconcile vs transient-alert).
 *
 * Two deliberate divergences from the acceptance gate it mirrors (both caught by prospective testing,
 * sub_agent_execution_results 697e8fe5):
 *   - NO buildComplete parameter (D7): this gate fires BEFORE the tree/build exists, so copying the
 *     acceptance gate's `buildComplete === false → no-hold` short-circuit would make it a permanent
 *     pre-tree no-op.
 *   - NOT_EVALUATED fails OPEN by default (D1): the producer is session-only and never runs on the
 *     headless stage-execution-worker path, so a recorded verdict is frequently ABSENT there. Holding
 *     on absent would deadlock every build. NOT_EVALUATED holds ONLY under enforce (VISION_DRIFT_STRICT).
 *
 * Never-advance invariant (RCA a14ff998 — the S19 gate-bypass incident): this lib contains no advance
 * path, no venture stage write, and no governance/vision approval. The worker change it backs is a
 * break-HOLD only, which reaches zero of the seven _advanceStage call sites.
 */

/** Classification of a recorded vision-drift verdict. */
export const VISION_DRIFT = Object.freeze({
  NO_DRIFT: 'no_drift',                   // verdict.material_drift === false → the vision matches the artifacts
  MATERIAL_DRIFT: 'material_drift',       // verdict.material_drift === true  → HOLD → chairman reconcile
  BOARD_UNAVAILABLE: 'board_unavailable', // producer ran but the LLM probe failed/timed out → transient
  PACKET_INCOMPLETE: 'packet_incomplete', // the read-in packet (vision/artifacts/sprint) was incomplete → transient
  NOT_EVALUATED: 'not_evaluated',         // no verdict recorded yet (undefined/null/no boolean material_drift key)
});

/** Why a HOLD fired — drives chairman-reconcile vs transient-alert routing (never conflate them, D9). */
export const DRIFT_HOLD_CAUSE = Object.freeze({
  NONE: 'none',
  CHAIRMAN: 'chairman',       // material drift → route to the chairman reconcile path
  TRANSIENT: 'transient',     // board unavailable / packet incomplete → bounded retry + ALERT, NEVER chairman
  UNEVALUATED: 'unevaluated', // not evaluated + strict → HOLD (non-chairman)
});

/**
 * Classify a recorded verdict object into exactly one VISION_DRIFT outcome.
 *
 * Transient producer signals ({ board_unavailable } / { packet_incomplete }) are checked FIRST: if the
 * probe could not run cleanly, its material_drift value is unreliable and must not be trusted.
 * null / undefined / {} (no boolean `material_drift` key) map to NOT_EVALUATED and must NEVER be coerced
 * to NO_DRIFT — the undefined-vs-false distinction is load-bearing (mirrors the null-vs-false care in
 * vision-acceptance-gate.js and s19-advance-decision.js): on the headless path the verdict is usually
 * absent, and NOT_EVALUATED is what keeps the gate fail-open there.
 *
 * @param {{material_drift?: boolean, board_unavailable?: boolean, packet_incomplete?: boolean}|null|undefined} verdict
 * @returns {string} one of VISION_DRIFT
 */
export function classifyVisionDrift(verdict) {
  if (verdict && verdict.board_unavailable === true) return VISION_DRIFT.BOARD_UNAVAILABLE;
  if (verdict && verdict.packet_incomplete === true) return VISION_DRIFT.PACKET_INCOMPLETE;
  if (!verdict || typeof verdict.material_drift !== 'boolean') return VISION_DRIFT.NOT_EVALUATED;
  return verdict.material_drift === true ? VISION_DRIFT.MATERIAL_DRIFT : VISION_DRIFT.NO_DRIFT;
}

/**
 * THE single hold/advance decision for the vision-drift gate at Stage 19. Returns BOTH whether to hold
 * and the CAUSE, so the worker routes a material-drift HOLD to the chairman and a transient HOLD to an
 * alert/retry (never the chairman — D9). Deliberately takes NO buildComplete param (D7).
 *
 *   - MATERIAL_DRIFT    → HOLD, cause=chairman (the vision diverges from what is actually built).
 *   - BOARD_UNAVAILABLE → HOLD, cause=transient (the probe failed; never build on an un-vetted vision,
 *     but alert+retry rather than page the chairman). Holds under any `enforce` value.
 *   - PACKET_INCOMPLETE → HOLD, cause=transient (same rationale; the read-in packet was incomplete).
 *   - NO_DRIFT          → no-hold (vision matches the artifacts; the existing normal advance runs).
 *   - NOT_EVALUATED     → HOLD only under enforce (VISION_DRIFT_STRICT). Default fail-OPEN: a session-only
 *     producer never runs on the headless worker path, so an absent verdict must not deadlock the build.
 *
 * @param {{verdict?: object|null, enforce?: boolean}} [args]
 * @returns {{hold: boolean, cause: string, outcome: string}}
 */
export function shouldHoldForVisionDrift({ verdict, enforce = false } = {}) {
  const outcome = classifyVisionDrift(verdict);
  switch (outcome) {
    case VISION_DRIFT.MATERIAL_DRIFT:    return { hold: true,  cause: DRIFT_HOLD_CAUSE.CHAIRMAN,    outcome };
    case VISION_DRIFT.BOARD_UNAVAILABLE: return { hold: true,  cause: DRIFT_HOLD_CAUSE.TRANSIENT,   outcome };
    case VISION_DRIFT.PACKET_INCOMPLETE: return { hold: true,  cause: DRIFT_HOLD_CAUSE.TRANSIENT,   outcome };
    case VISION_DRIFT.NO_DRIFT:          return { hold: false, cause: DRIFT_HOLD_CAUSE.NONE,        outcome };
    case VISION_DRIFT.NOT_EVALUATED:     return enforce
      ? { hold: true,  cause: DRIFT_HOLD_CAUSE.UNEVALUATED, outcome }
      : { hold: false, cause: DRIFT_HOLD_CAUSE.NONE,        outcome };
    default:                             return { hold: false, cause: DRIFT_HOLD_CAUSE.NONE, outcome };
  }
}

/**
 * Feature flag: the vision-drift gate. Default OFF (this is a NEW gate; observe-first rollout) — only an
 * explicit true/1/on/yes enables the worker HOLD block. When OFF the worker seam is skipped entirely
 * (byte-identical legacy advance); the session-hosted producer still records verdicts for observability.
 * Note: this default is the INVERSE of isVisionAcceptanceGateEnabled (which is default-ON because it is
 * already proven) — a new gate ships dark and is enabled only after back-testing.
 */
export function isVisionDriftGateEnabled() {
  const v = process.env.VISION_DRIFT_GATE;
  if (v === undefined || v === '') return false;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}

/**
 * Strict mode: when ON, a NOT_EVALUATED venture (no recorded verdict) HOLDS — enforcing
 * verify-before-build. Default OFF (fail-open on an unrecorded verdict) to avoid the headless-path
 * deadlock (D1: the producer is session-only and never runs on the worker path); flip ON only once the
 * session-hosted drift-probe is proven to write verdicts in the autonomous build flow.
 */
export function isVisionDriftStrict() {
  const v = process.env.VISION_DRIFT_STRICT;
  if (v === undefined || v === '') return false;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}
