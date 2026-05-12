/**
 * FROZEN snapshot of the pre-refactor _canAutoAdvance 4-layer logic.
 *
 * Captured 2026-05-12 BEFORE SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 FR-2 swaps the
 * worker body to call the new can_auto_advance RPC. The equivalence test (FR-6)
 * compares the new RPC verdict against this frozen function for every stage.
 *
 * Mandated by TESTING sub-agent verdict b3331359 (#3): without this frozen
 * snapshot, the post-refactor equivalence test compares the new RPC to itself
 * (tautology that always passes). DO NOT MODIFY this file after the body swap.
 *
 * Source: lib/eva/stage-execution-worker.js:3079-3132 at commit 2433ceec27.
 */

/**
 * Pre-refactor _canAutoAdvance — pure-function port for testability.
 *
 * @param {number} stageNumber
 * @param {object} ctx — fixture context replacing instance state:
 *   - cdcRow: { global_auto_proceed: boolean, stage_overrides: object | null }
 *   - gov: { isBlocking: (n) => boolean, isReview: (n) => boolean }
 *   - cdcError: optional Error → forces fail-safe to false
 * @returns {Promise<boolean>}
 */
export async function preRefactorCanAutoAdvance(stageNumber, ctx) {
  try {
    const { cdcRow, cdcError, gov } = ctx;

    if (cdcError || !cdcRow) {
      return false;
    }

    if (!cdcRow.global_auto_proceed) {
      return false;
    }

    if (gov.isBlocking(stageNumber)) {
      return false;
    }

    const override = cdcRow.stage_overrides?.[`stage_${stageNumber}`];

    if (override?.auto_proceed === false) {
      return false;
    }

    if (gov.isReview(stageNumber) && override?.auto_proceed !== true) {
      return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Convenience: returns the structured verdict shape the new RPC will return,
 * for direct comparison in the equivalence test.
 *
 * Mirror reason enum from REGRESSION REG-7:
 *   "global_off" | "kill_promotion_gate" | "explicit_pause" | "review_default_pause" | "approved"
 */
export async function preRefactorCanAutoAdvanceVerdict(stageNumber, ctx) {
  const { cdcRow, cdcError, gov } = ctx;

  if (cdcError || !cdcRow) {
    return { can: false, reason: 'config_missing', layer: 0 };
  }

  if (!cdcRow.global_auto_proceed) {
    return { can: false, reason: 'global_off', layer: 1 };
  }

  if (gov.isBlocking(stageNumber)) {
    return { can: false, reason: 'kill_promotion_gate', layer: 2 };
  }

  const override = cdcRow.stage_overrides?.[`stage_${stageNumber}`];

  if (override?.auto_proceed === false) {
    return { can: false, reason: 'explicit_pause', layer: 3 };
  }

  if (gov.isReview(stageNumber) && override?.auto_proceed !== true) {
    return { can: false, reason: 'review_default_pause', layer: 4 };
  }

  return { can: true, reason: 'approved', layer: null };
}
