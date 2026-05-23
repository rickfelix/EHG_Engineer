/**
 * Pure policy — should the worker open a post-execution chairman gate for a stage?
 *
 * Returns false when the stage produced no usable result (FAILED or missing) UNLESS
 * the build-loop governance-override path applies.
 *
 * Why this exists (RCA: Canvas AI Stage 19, 2026-05-23): the worker's post-execution
 * hard-gate check ran unconditionally — even when processStage returned FAILED with
 * zero artifacts. That opened a pending "stage_gate" chairman_decision with no
 * artifact/advisory behind it, so the venture parked at a CONTENT-LESS gate and the
 * Stage panel spun "Loading…" forever. A failed stage must instead surface via the
 * worker's FAILED handler (orchestrator_state='failed' — a clean terminal state),
 * not as a misleading "awaiting decision" gate.
 *
 * The build-loop governance-override path (a FAILED stage 17-22 that governance
 * auto-advances) keeps opening its gate so existing auto-advance behaviour is
 * unchanged.
 *
 * @param {object} args
 * @param {boolean} args.isHardGate - stage is a hardcoded or dynamic hard gate
 * @param {boolean} args.stageFailed - processStage returned FAILED or produced no result
 * @param {boolean} args.canGovernanceOverrideFailed - build-loop (17-22) FAILED stage that governance auto-advances
 * @returns {boolean} true if a chairman gate should be opened for this stage
 */
export function shouldOpenChairmanGate({ isHardGate, stageFailed, canGovernanceOverrideFailed }) {
  if (!isHardGate) return false;
  if (stageFailed && !canGovernanceOverrideFailed) return false;
  return true;
}
