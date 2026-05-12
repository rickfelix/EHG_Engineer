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
 *   - MAX_STAGE: hardcoded pipeline length. Tests reference this.
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
 * Maximum pipeline stage number.
 */
export const MAX_STAGE = 26;

/**
 * Operating mode boundaries — entering a new mode requires all prior
 * stages in the previous mode to be complete.
 */
export const OPERATING_MODES = Object.freeze({
  EVALUATION: { start: 1, end: 5 },
  STRATEGY:   { start: 6, end: 12 },
  PLANNING:   { start: 13, end: 17 },
  BUILD:      { start: 18, end: 22 },
  LAUNCH:     { start: 23, end: 26 },
});
