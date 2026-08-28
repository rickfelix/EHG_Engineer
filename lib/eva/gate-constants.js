/**
 * Gate Constants — non-governance constants.
 *
 * SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 FR-2/FR-3 removed the governance
 * sets (KILL_GATE_STAGES, PROMOTION_GATE_STAGES, REVIEW_MODE_STAGES,
 * CHAIRMAN_GATES.BLOCKING, getBlockingStagesFromDB) in favor of the unified
 * DB-backed reader at `lib/eva/stage-governance.js`. Use `getStageGovernance(supabase)`
 * and the returned `.isKill / .isPromotion / .isReview / .isBlocking` helpers.
 *
 * What remains here:
 *   - TASTE_GATE_STAGES: feature-flagged subsystem (separate from kill/promotion),
 *     not yet unified into stage_config. Out-of-scope for the unification SD.
 *   - OPERATING_MODES: operating-mode boundaries derived from stage ranges, not
 *     governance. Stable.
 *
 * SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001 FR-1: MAX_STAGE (hardcoded pipeline length) removed
 * from this module — it had no importers (the live pipeline ceiling was a SEPARATE local
 * constant in stage-execution-worker.js, now itself replaced by a DB-derived value; see
 * lib/eva/stage-governance.js's maxStageNumber). Leaving an unimported, uncorrected second
 * "26" here would have been exactly the drift class this SD exists to close.
 *
 * @module lib/eva/gate-constants
 */

/**
 * Taste gate stages — checkpoints where ventures require human taste
 * decisions (design, scope, architecture). Starts as hard-block,
 * graduates to auto-proceed via confidence-based self-learning.
 * Feature-flagged per gate (OFF by default).
 * SD: SD-LEO-ORCH-GSTACK-TASTE-GATE-001-A
 */
export const TASTE_GATE_STAGES = new Set([10, 13, 16]);

/**
 * Operating mode boundaries — entering a new mode requires all prior
 * stages in the previous mode to be complete.
 *
 * SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001: LAUNCH's end updated 26 -> 27 for the
 * 2026-08-28 27-stage renumbering (dedicated_venture_uat inserted at 23; the old
 * 23-26 tail shifted to 24-27, so LAUNCH's last stage is now 27, not 26).
 */
export const OPERATING_MODES = Object.freeze({
  EVALUATION: { start: 1, end: 5 },
  STRATEGY:   { start: 6, end: 12 },
  PLANNING:   { start: 13, end: 17 },
  BUILD:      { start: 18, end: 22 },
  LAUNCH:     { start: 23, end: 27 },
});
