/**
 * can-auto-advance.js — the ONE shared gate-eligibility predicate
 * (SD-LEO-INFRA-RUN-STAGE-ENGINE-GATE-AUTONOMY-001).
 *
 * The 4-layer governance logic (global_auto_proceed off → kill/promotion always-block → explicit
 * pause → review default-pause + the hard-gate set) lives in the SECURITY-DEFINER RPC
 * `can_auto_advance(p_stage_number)`. Both the EVA stage-execution WORKER and the stage-execution
 * ENGINE (run-stage.js / executeStage) must consult the SAME predicate — the engine previously
 * called checkAutonomy(ventureId, 'stage_gate') with a HARDCODED gateType + OMITTED stageNumber,
 * which auto-approved review + HARD gates regardless of every flag (the S10 hard-gate bypass).
 *
 * This module is the worker's _canAutoAdvance wrapper, extracted verbatim so there is exactly ONE
 * JS predicate, not two divergent ones. DEFAULT-BLOCK on any error/uncertainty. The [SAE]
 * canAutoAdvance(N) log contract (REGRESSION REG-7) is preserved.
 *
 * @module lib/eva/governance/can-auto-advance
 */

/**
 * @param {Object} params
 * @param {Object} params.supabase - supabase client (service role)
 * @param {number} params.stageNumber - the lifecycle stage to evaluate
 * @param {Object} [params.logger=console] - logger (preserves the [SAE] log contract)
 * @returns {Promise<boolean>} true iff the stage may auto-advance; false (BLOCK) on any error/uncertainty
 */
export async function canAutoAdvance({ supabase, stageNumber, logger = console }) {
  try {
    const { data, error } = await supabase
      .rpc('can_auto_advance', { p_stage_number: stageNumber });

    if (error || !Array.isArray(data) || data.length === 0) {
      logger.warn(`[SAE] canAutoAdvance(${stageNumber}): RPC failed — ${error?.message || 'no rows'}, defaulting to block`);
      return false;
    }

    const { can, reason, layer } = data[0];

    // Preserve [SAE] log contract — REGRESSION REG-7
    if (can) {
      logger.log(`[SAE] canAutoAdvance(${stageNumber}): approved — all governance layers passed`);
    } else {
      const reasonLabel = {
        global_off: 'global_auto_proceed=false',
        kill_promotion_gate: 'kill/promotion gate (stage_config)',
        explicit_pause: 'stage_override.auto_proceed=false',
        review_default_pause: 'review-mode default-pause (no explicit opt-in)',
        config_missing: 'config query failed',
        stage_not_found: 'stage not found in stage_config',
      }[reason] || `unknown (${reason})`;
      logger.log(`[SAE] canAutoAdvance(${stageNumber}): blocked — ${reasonLabel} [layer=${layer}]`);
    }

    return !!can;
  } catch (err) {
    logger.warn(`[SAE] canAutoAdvance threw: ${err.message}`);
    return false;
  }
}

export default canAutoAdvance;
