/**
 * Parent-Exec Gate — LEAD-TO-PLAN handoff gate.
 *
 * QF-20260906-901.
 *
 * THE DEFECT: the ORCHESTRATOR PARENT LIFECYCLE clause requires a parent's two setup
 * handoffs (LEAD-TO-PLAN, PLAN-TO-EXEC) to complete before any child SD activates. Nothing
 * enforced this. `scripts/phase-preflight.js` prints a warning for a child whose parent isn't
 * yet in EXEC, but never sets an exit code or verdict — nothing consumes it. The LEAD-TO-PLAN
 * gate chain (`scripts/modules/handoff/executors/lead-to-plan/gates/*`) carried no parent-phase
 * check at all. Measured twice live: SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A (2026-09-05) and
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A (2026-09-06) both passed LEAD-TO-PLAN while their
 * parent sat draft/LEAD with zero sd_phase_handoffs rows.
 *
 * A SEPARATE, ADDITIONAL mechanism (also fixed by QF-20260906-901's addendum, not by this gate):
 * a directed WORK_ASSIGNMENT whose payload names a child SD lets the claiming seat hold the
 * child claim within one check-in regardless of a body-level "claim the parent first"
 * instruction — the directed drain claims the WA's sd_key before the body is ever read. This
 * gate is still the correct enforcement point for that case too: even if the child gets
 * claimed, its LEAD-TO-PLAN handoff is refused until the parent is genuinely ready.
 *
 * MECHANICALLY CHECKABLE: applies ONLY to a child SD (parent_sd_id set). A parent is
 * considered ready when EITHER (a) it is status='in_progress' AND current_phase='EXEC', OR
 * (b) an accepted PLAN-TO-EXEC handoff exists for it (covers the brief window between that
 * handoff landing and the parent's own status/current_phase columns catching up).
 *
 * OBSERVE-ONLY BY DEFAULT (PARENT_EXEC_GATE_BINDING=true to flip): mirrors this codebase's
 * established new-enforcement rollout convention (acceptance-tier-downgrade-gate.js,
 * success-criteria-unpopulated-gate.js, origin-criterion-gate.js, et al.).
 */

const GATE_NAME = 'PARENT_EXEC_GATE';

export function isBindingEnabled(env = process.env) {
  return env.PARENT_EXEC_GATE_BINDING === 'true';
}

/**
 * Pure — no I/O. True when a parent row is ready for its children to activate.
 * @param {{status?:string, current_phase?:string}} parent
 * @param {boolean} hasAcceptedPlanToExec
 * @returns {boolean}
 */
export function isParentReadyForChildren(parent, hasAcceptedPlanToExec) {
  if (!parent) return false;
  if (parent.status === 'in_progress' && parent.current_phase === 'EXEC') return true;
  return !!hasAcceptedPlanToExec;
}

function passResult(warnings = [], details = {}) {
  return { passed: true, score: 100, max_score: 100, issues: [], warnings, details };
}

function refuseResult(message, details, bound) {
  if (!bound) return passResult([message], { ...details, bound: false });
  return { passed: false, score: 0, max_score: 100, issues: [message], warnings: [], details: { ...details, bound: true } };
}

/**
 * Create the parent-exec gate.
 * @param {Object} supabase
 * @returns {Object} Gate configuration
 */
export function createParentExecGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n👆 GATE: Parent-Exec (orchestrator parent lifecycle)');
      console.log('-'.repeat(50));

      const sd = ctx?.sd || {};
      const parentSdId = sd.parent_sd_id;

      if (!parentSdId) {
        console.log('   ℹ️  Not a child SD — gate not applicable');
        return passResult([], { applicable: false });
      }

      if (!supabase) {
        console.log('   ⚠️  Missing supabase client — cannot verify parent state, failing open');
        return passResult(['Cannot verify parent state — missing database context'], { applicable: true, reason_code: 'MISSING_CONTEXT' });
      }

      const bound = isBindingEnabled();

      try {
        const { data: parent, error: parentErr } = await supabase
          .from('strategic_directives_v2')
          .select('id, sd_key, status, current_phase')
          .eq('id', parentSdId)
          .maybeSingle();

        if (parentErr) {
          console.log(`   ⚠️  Parent lookup error (failing open): ${parentErr.message}`);
          return passResult([`Parent-exec check skipped — lookup failed: ${parentErr.message}`], { applicable: true, reason_code: 'DB_ERROR' });
        }

        if (!parent) {
          console.log(`   ⚠️  Parent row ${parentSdId} not found — failing open`);
          return passResult([`Parent-exec check skipped — parent row ${parentSdId} not found`], { applicable: true, reason_code: 'PARENT_NOT_FOUND' });
        }

        const { data: handoffs, error: handoffErr } = await supabase
          .from('sd_phase_handoffs')
          .select('id, handoff_type, status')
          .eq('sd_id', parent.id)
          .eq('handoff_type', 'PLAN-TO-EXEC')
          .eq('status', 'accepted');

        if (handoffErr) {
          console.log(`   ⚠️  Handoff lookup error (failing open): ${handoffErr.message}`);
          return passResult([`Parent-exec check skipped — handoff lookup failed: ${handoffErr.message}`], { applicable: true, reason_code: 'DB_ERROR' });
        }

        const hasAcceptedPlanToExec = Array.isArray(handoffs) && handoffs.length > 0;
        const ready = isParentReadyForChildren(parent, hasAcceptedPlanToExec);

        if (!ready) {
          const message = `${GATE_NAME}: parent ${parent.sd_key || parent.id} is ${parent.status}/${parent.current_phase} with no accepted PLAN-TO-EXEC handoff — the ORCHESTRATOR PARENT LIFECYCLE clause requires the parent's LEAD-TO-PLAN and PLAN-TO-EXEC handoffs before any child SD activates.`;
          console.log(bound ? `   ❌ ${message}` : `   ⚠️  ${message} (observe-only)`);
          return refuseResult(message, { applicable: true, parent_sd_key: parent.sd_key, parent_status: parent.status, parent_phase: parent.current_phase, reason_code: 'PARENT_NOT_IN_EXEC' }, bound);
        }

        console.log(`   ✅ Parent ${parent.sd_key || parent.id} is ready (${parent.status}/${parent.current_phase}).`);
        return passResult([], { applicable: true, parent_sd_key: parent.sd_key, bound });
      } catch (err) {
        const msg = err && typeof err.message === 'string' ? err.message : String(err);
        console.log(`   ⚠️  Unexpected error evaluating parent-exec (failing open): ${msg}`);
        return passResult([`Parent-exec check skipped — unexpected error: ${msg}`], { applicable: true, reason_code: 'UNEXPECTED_ERROR' });
      }
    },
    required: true,
    remediation:
      'Run the parent\'s two setup handoffs first: node scripts/handoff.js execute LEAD-TO-PLAN <parent>, then node scripts/handoff.js execute PLAN-TO-EXEC <parent>. Observe-only by default — set PARENT_EXEC_GATE_BINDING=true to make this blocking.',
  };
}
