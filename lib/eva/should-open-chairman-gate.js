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
 * SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 (FR-1): a stage that MINTS a chairman decision
 * (stage_creates_decision / isDecisionCreatingStage — e.g. S18, a gate_type='promotion'
 * stage with work_type='artifact_only') was SILENTLY BYPASSED because the gate-open test
 * keyed only on isHardGate (isBlocking || hard_gate_stages), which excludes artifact_only
 * promotion gates. `isDecisionGate` makes such a stage open the chairman gate too. The
 * content-less-failed-stage guard is unchanged, so a FAILED stage still never opens a gate.
 * `isDecisionGate` is OPTIONAL (default false) so existing callers are byte-identical.
 *
 * @param {object} args
 * @param {boolean} args.isHardGate - stage is a hardcoded or dynamic hard gate
 * @param {boolean} args.stageFailed - processStage returned FAILED or produced no result
 * @param {boolean} args.canGovernanceOverrideFailed - build-loop (17-22) FAILED stage that governance auto-advances
 * @param {boolean} [args.isDecisionGate=false] - stage mints a chairman decision (stage_creates_decision)
 * @returns {boolean} true if a chairman gate should be opened for this stage
 */
export function shouldOpenChairmanGate({ isHardGate, stageFailed, canGovernanceOverrideFailed, isDecisionGate = false }) {
  if (!isHardGate && !isDecisionGate) return false;
  if (stageFailed && !canGovernanceOverrideFailed) return false;
  return true;
}

/**
 * SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 (FR-2): the S19 BUILD-CHECKPOINT hard invariant.
 * A venture must NOT advance past S19 / into pipeline_mode='building' on the leo_bridge
 * build-readiness check ALONE — that is a technical readiness gate, NOT the chairman's
 * go/no-go. BOTH must hold: the build is ready AND the chairman approved the S19
 * build-checkpoint decision. Pure + fail-closed on the chairman approval.
 *
 * @param {object} args
 * @param {boolean} args.buildComplete - leo_bridge build-readiness gate passed
 * @param {boolean} args.hasApprovedChairmanDecision - an APPROVED S19 chairman_decision exists
 * @returns {boolean} true only when BOTH conditions hold
 */
export function canAdvancePastBuildCheckpoint({ buildComplete, hasApprovedChairmanDecision }) {
  return buildComplete === true && hasApprovedChairmanDecision === true;
}
