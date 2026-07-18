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
 *
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-D: when a held SD carries
 * metadata.switchon_action, evaluate the switch-on gate (Child A classifier + Child B
 * authorizer + Child C prechecks) BEFORE falling back to the manual-park WAIT above.
 * Reversible + precheck-green auto-clears the hold; anything else (never-auto,
 * consequential, unknown, evaluator error) fires a one-tap chairman decision packet
 * (idempotent) and returns the SAME WAIT shape -- additive only, byte-identical when
 * switchon_action is absent.
 */

import { buildWaitResult } from '../../../../../../lib/handoff/wait-verdict.js';
import { execBoundaryHoldReason } from '../../../../../../lib/fleet/claim-eligibility.cjs';
import { authorizeSwitchOn } from '../../../../../../lib/switch-automation/switchon-precheck-gate.js';
import { runSwitchOnPrechecks } from '../../../../../../lib/switch-automation/switchon-prechecks.js';
import { notifySwitchOnDecisionPacket } from '../../../../../../lib/switch-automation/switchon-decision-packet.js';

/**
 * Evaluate the switch-on gate for a held SD carrying metadata.switchon_action.
 * TR-3: any evaluator throw (classifier/authorizer/prechecks) is caught and treated as
 * NOT authorized -- never authorized on ambiguity.
 * @returns {Promise<{authorized: boolean, evidence: object}>}
 */
async function evaluateSwitchOnGate(supabase, sd) {
  const md = sd.metadata || {};
  const request = {
    component: sd.sd_key,
    action: md.switchon_action,
    reversible: md.switchon_reversible,
    inRole: md.switchon_in_role,
    isReversibleByMechanism: md.switchon_reversible_by_mechanism,
    isLiveMoney: md.switchon_is_live_money,
    isVentureCommitment: md.switchon_is_venture_commitment,
  };
  try {
    const authResult = authorizeSwitchOn(request);
    if (authResult.authorized !== true) {
      return { authorized: false, evidence: { auth: authResult } };
    }
    const precheckResult = await runSwitchOnPrechecks(supabase, request, {});
    return {
      authorized: precheckResult.allPassed === true,
      evidence: { auth: authResult, prechecks: precheckResult },
    };
  } catch (error) {
    return { authorized: false, evidence: { error: (error && error.message) || String(error) } };
  }
}

/**
 * Create the EXEC_BOUNDARY_HOLD gate validator.
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase] service-role client --
 *   only required when a held SD carries metadata.switchon_action; existing manual-park
 *   callers (no switchon_action) never touch it, so omitting it is byte-identical.
 * @returns {Object} Gate configuration
 */
export function createExecBoundaryHoldGate(supabase) {
  return {
    name: 'EXEC_BOUNDARY_HOLD',
    // FR-3 (the critical finding of this SD): this gate's WAIT must NEVER
    // auto-escalate to a real FAIL past ValidationOrchestrator's
    // WAIT_MAX_ATTEMPTS/WAIT_MAX_WALL_CLOCK_MS ceiling. exec_boundary_hold is a
    // deliberate, coordinator-managed sequencing park (e.g. "wait for sibling
    // child B") that can legitimately outlast 24h/10 attempts -- unlike the
    // transient race-window blocks the ceiling was designed to catch. Static;
    // unaffected by the switchon_action branch below.
    exemptFromWaitCeiling: true,
    validator: async (ctx) => {
      const hold = execBoundaryHoldReason(ctx.sd);
      if (!hold) {
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
      }

      const switchonAction = ctx.sd && ctx.sd.metadata && ctx.sd.metadata.switchon_action;
      if (typeof switchonAction === 'string' && switchonAction.trim() !== '') {
        const { authorized, evidence } = await evaluateSwitchOnGate(supabase, ctx.sd);
        if (authorized) {
          const nowIso = new Date().toISOString();
          try {
            await supabase.from('strategic_directives_v2').update({
              metadata: {
                ...ctx.sd.metadata,
                exec_boundary_hold: false,
                exec_boundary_hold_cleared_by: 'switchon-gate-auto',
                exec_boundary_hold_cleared_at: nowIso,
                exec_boundary_hold_auto_clear_evidence: evidence,
              },
            }).eq('sd_key', ctx.sd.sd_key);
          } catch {
            // Fail-soft on the write: the gate already computed authorized:true from a
            // trusted evaluation; a persistence hiccup here is surfaced via the returned
            // pass result, not converted into a spurious WAIT.
          }
          console.log(`\n[AUTO-CLEAR] EXEC_BOUNDARY_HOLD: switch-on gate authorized ${ctx.sd.sd_key} (${switchonAction})`);
          return { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
        }

        try {
          await notifySwitchOnDecisionPacket(supabase, {
            sdKey: ctx.sd.sd_key,
            action: switchonAction,
            reasons: [(evidence.auth && evidence.auth.reason) || evidence.error || 'switchon_gate_not_authorized'],
          });
        } catch {
          // Fail-soft: the dispatcher itself is already fail-soft internally; this outer
          // guard exists solely so a dispatcher-level throw never crashes the gate.
        }
        console.log('\n[PAUSE] EXEC_BOUNDARY_HOLD: switch-on gate did not authorize -- chairman decision packet dispatched');
        console.log(`   Action: ${switchonAction}`);
        return buildWaitResult({
          wait_reason: `exec_boundary_hold: switchon_action=${switchonAction} not authorized`,
          warnings: [`WAIT: switch-on gate held ${ctx.sd.sd_key} (${switchonAction}) -- chairman decision packet dispatched`],
          remediation: 'Awaiting chairman decision on the dispatched switch-on packet (console + best-effort SMS).',
          details: { exec_boundary_hold: true, switchon_action: switchonAction, switchon_evidence: evidence },
        });
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
