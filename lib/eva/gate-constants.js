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
 * Updated 2026-04-21: S23 Launch Readiness Kill Gate added, S24 moved to promotion
 * (SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-A)
 */
export const KILL_GATE_STAGES = new Set([3, 5, 13, 23]);

/**
 * Promotion gate stages — checkpoints where ventures need chairman
 * approval to advance to the next operating mode.
 * Manual at L0-L1, auto at L2+.
 * Updated 2026-04-21: S18 Marketing Copy needs review, S19 Build needs approval,
 * S24 Go Live requires explicit chairman trigger
 * (SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-A)
 */
export const PROMOTION_GATE_STAGES = new Set([10, 17, 18, 19, 24, 25]);

/**
 * Taste gate stages — checkpoints where ventures require human taste
 * decisions (design, scope, architecture). Starts as hard-block,
 * graduates to auto-proceed via confidence-based self-learning.
 * Feature-flagged per gate (OFF by default).
 * SD: SD-LEO-ORCH-GSTACK-TASTE-GATE-001-A
 */
export const TASTE_GATE_STAGES = new Set([10, 13, 16]);

/**
 * Chairman gate stages where pipeline pauses for human decision.
 * BLOCKING = union of KILL_GATE_STAGES and PROMOTION_GATE_STAGES.
 * Updated 2026-04-21: S23 is kill gate (launch readiness), S24 is promotion (go live)
 * (SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-A)
 */
export const CHAIRMAN_GATES = Object.freeze({
  BLOCKING: new Set([3, 5, 10, 13, 17, 18, 19, 23, 24, 25]),
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
 * DB-backed gate configuration reader (SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001).
 * Reads stage_config to derive blocking stages dynamically.
 * The hardcoded constants above remain as fallback during the transition.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{reviewStages: Set<number>, killStages: Set<number>, promotionStages: Set<number>, allBlockingStages: Set<number>}>}
 */
export async function getBlockingStagesFromDB(supabase) {
  const { data, error } = await supabase
    .from('stage_config')
    .select('stage_number, review_mode, gate_type')
    .order('stage_number');

  if (error || !data) {
    // Fail-closed: return hardcoded constants if DB read fails
    console.warn('[gate-constants] DB read failed, using hardcoded fallback:', error?.message);
    return {
      reviewStages: REVIEW_MODE_STAGES,
      killStages: KILL_GATE_STAGES,
      promotionStages: PROMOTION_GATE_STAGES,
      allBlockingStages: CHAIRMAN_GATES.BLOCKING,
    };
  }

  const reviewStages = new Set();
  const killStages = new Set();
  const promotionStages = new Set();

  for (const row of data) {
    if (row.review_mode === 'review') reviewStages.add(row.stage_number);
    if (row.gate_type === 'kill') killStages.add(row.stage_number);
    if (row.gate_type === 'promotion') promotionStages.add(row.stage_number);
  }

  const allBlockingStages = new Set([...reviewStages, ...killStages, ...promotionStages]);

  return { reviewStages, killStages, promotionStages, allBlockingStages };
}

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
