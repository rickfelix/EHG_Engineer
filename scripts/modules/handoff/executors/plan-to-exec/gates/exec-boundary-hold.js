/**
 * EXEC_BOUNDARY_HOLD Gate for PLAN-TO-EXEC
 * Part of SD-LEO-INFRA-PHASE-SCOPED-FENCE-001
 *
 * Phase-scoped fence: metadata.exec_boundary_hold=true permits claiming and all
 * PLAN-phase work (LEAD-TO-PLAN, PRD creation) but BLOCKS the PLAN-TO-EXEC handoff
 * until the coordinator clears the flag. Distinct from the binary
 * needs_coordinator_review/requires_human_action fence (BaseExecutor.js Step 1.9,
 * GATE_COORDINATOR_AUTHORITY_FENCE), which blocks CLAIMING entirely via a hard FAIL
 * early-return BEFORE the gate pipeline. exec_boundary_hold is claim-ALLOWING by
 * design, so it must never be added to lib/fleet/claim-eligibility.cjs's
 * INELIGIBILITY_AXES / CLAIM_WRITE_FENCE_AXES -- see execBoundaryHoldReason() there,
 * the structurally-separate reader this gate reuses.
 *
 * Mirrors the plan-to-lead prerequisite-check.js parent-WAIT precedent (PR #4021):
 * returns buildWaitResult (passed:false, wait:true) rather than a hard failure, so
 * the ValidationOrchestrator records blocked_wait status without burning retry
 * budget or triggering RCA.
 */

import { buildWaitResult } from '../../../../../../lib/handoff/wait-verdict.js';
import { execBoundaryHoldReason } from '../../../../../../lib/fleet/claim-eligibility.cjs';

/**
 * Create the EXEC_BOUNDARY_HOLD gate validator.
 * @returns {Object} Gate configuration
 */
export function createExecBoundaryHoldGate() {
  return {
    name: 'EXEC_BOUNDARY_HOLD',
    // FR-3 (the critical finding of this SD): this gate's WAIT must NEVER
    // auto-escalate to a real FAIL past ValidationOrchestrator's
    // WAIT_MAX_ATTEMPTS/WAIT_MAX_WALL_CLOCK_MS ceiling. exec_boundary_hold is a
    // deliberate, coordinator-managed sequencing park (e.g. "wait for sibling
    // child B") that can legitimately outlast 24h/10 attempts -- unlike the
    // transient race-window blocks the ceiling was designed to catch.
    exemptFromWaitCeiling: true,
    validator: async (ctx) => {
      const hold = execBoundaryHoldReason(ctx.sd);
      if (!hold) {
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
      }
      console.log('\n[PAUSE] EXEC_BOUNDARY_HOLD: PLAN-TO-EXEC parked by coordinator');
      console.log(`   Reason: ${hold.reason}`);
      if (hold.setAt) console.log(`   Set at: ${hold.setAt}`);
      return buildWaitResult({
        wait_reason: `exec_boundary_hold: ${hold.reason}`,
        warnings: [`WAIT: EXEC-parked by coordinator - ${hold.reason}`],
        remediation: 'Coordinator must clear metadata.exec_boundary_hold (set false, stamp exec_boundary_hold_cleared_at/by) to unblock this handoff.',
        details: { exec_boundary_hold: true, exec_boundary_hold_reason: hold.reason, exec_boundary_hold_set_at: hold.setAt },
      });
    },
    required: true,
  };
}
