/**
 * Gate Constants — Single Source of Truth
 *
 * Shared gate stage definitions used by both stage-execution-worker.js
 * and stage-gates.js. Any change to gate stage membership MUST be made
 * here, not in consuming modules.
 *
 * @module lib/eva/gate-constants
 */

/**
 * Kill gate stages — checkpoints where ventures may be terminated.
 * Must always require manual chairman review regardless of autonomy level.
 * Synced with frontend: KILL_GATE_STAGES in venture-workflow.ts
 */
export const KILL_GATE_STAGES = new Set([3, 5, 13, 24]);

/**
 * Promotion gate stages — checkpoints where ventures need chairman
 * approval to advance to the next operating mode.
 * Manual at L0-L1, auto at L2+.
 */
export const PROMOTION_GATE_STAGES = new Set([10, 17, 18, 23, 25]);

/**
 * Chairman gate stages where pipeline pauses for human decision.
 * BLOCKING = union of KILL_GATE_STAGES and PROMOTION_GATE_STAGES.
 */
export const CHAIRMAN_GATES = Object.freeze({
  BLOCKING: new Set([3, 5, 10, 13, 17, 18, 23, 24, 25]),
});

/**
 * Review-mode stages: worker pauses for chairman review before auto-advancing.
 * Stage 10 is already a BLOCKING gate, so it doesn't need review mode.
 * Synced with frontend: venture-workflow.ts reviewMode === 'review'
 */
export const REVIEW_MODE_STAGES = new Set([7, 8, 9, 11]);

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
