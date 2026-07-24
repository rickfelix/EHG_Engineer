/**
 * Prerequisite Handoff Check Gate for PLAN-TO-LEAD
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * ROOT CAUSE FIX: Validates EXEC-TO-PLAN handoff exists before PLAN-TO-LEAD (SD-VISION-V2-009)
 */

import { isInfrastructureSDSync } from '../../../../sd-type-checker.js';
import { autoResolveFailedHandoffs } from '../../../gates/auto-resolve-failures.js';
// SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001 TR-1: construct the WAIT verdict through
// the shared helper (this gate is the PR #4021 precedent; shape is unchanged).
import { buildWaitResult } from '../../../../../../lib/handoff/wait-verdict.js';

/**
 * Create the PREREQUISITE_HANDOFF_CHECK gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createPrerequisiteCheckGate(supabase) {
  return {
    name: 'PREREQUISITE_HANDOFF_CHECK',
    validator: async (ctx) => {
      console.log('\n🔐 PREREQUISITE CHECK: EXEC-TO-PLAN Handoff');
      console.log('-'.repeat(50));

      // Use UUID (ctx.sd.id) not legacy_id (ctx.sdId) - handoffs are stored by UUID
      let sdUuid = ctx.sd?.id || ctx.sdId;

      // QF-20260703-906: ctx.sd.id has been observed carrying the SD's legacy
      // uuid_id column instead of its canonical id, making every .eq(sdUuid) below
      // come back clean-empty (valid UUID, zero matches) rather than erroring —
      // which silently downgraded a parent-orchestrator WAIT into a hard FAIL.
      // Re-resolve via sd_key (unaffected by the id/uuid_id ambiguity) whenever available.
      if (ctx.sd?.sd_key) {
        const { data: canonical } = await supabase
          .from('strategic_directives_v2')
          .select('id')
          .eq('sd_key', ctx.sd.sd_key)
          .maybeSingle();
        if (canonical?.id && canonical.id !== sdUuid) {
          console.log(`   ⚠️  sdUuid mismatch (${sdUuid} vs canonical ${canonical.id}) — using canonical id`);
          sdUuid = canonical.id;
        }
      }

      // Auto-resolve previous failed PLAN-TO-LEAD attempts on retry
      const resolveResult = await autoResolveFailedHandoffs(supabase, sdUuid, 'PLAN-TO-LEAD');
      if (resolveResult.resolved > 0) {
        console.log(`   ✅ Auto-resolved ${resolveResult.resolved} previous PLAN-TO-LEAD failure(s)`);
      } else if (resolveResult.error) {
        console.log(`   ⚠️  Could not check previous failures: ${resolveResult.error}`);
      }

      // PARENT SD DETECTION: Parent orchestrator SDs don't have their own EXEC phase
      const parentCheckResult = await checkParentOrchestrator(supabase, sdUuid, ctx);
      if (parentCheckResult) return parentCheckResult;

      // SD-TYPE-AWARE: Infrastructure/documentation SDs can skip EXEC-TO-PLAN
      const isInfrastructure = isInfrastructureSDSync(ctx.sd);
      if (isInfrastructure) {
        console.log('   ℹ️  SD Type: infrastructure/documentation');
        console.log('   ✅ EXEC-TO-PLAN is OPTIONAL for this SD type');
        console.log('   📝 Modified LEO workflow allows direct PLAN-TO-LEAD');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['EXEC-TO-PLAN skipped - infrastructure SD type uses modified workflow'],
          details: {
            sd_type: ctx.sd?.sd_type || ctx.sd?.category,
            workflow_modification: 'EXEC-TO-PLAN optional for infrastructure'
          }
        };
      }

      console.log('   SD Type: feature/standard - EXEC-TO-PLAN required');

      // Query for an accepted EXEC-TO-PLAN handoff for this SD
      const { data: execToPlanHandoff, error } = await supabase
        .from('sd_phase_handoffs')
        .select('id, status, created_at, validation_score')
        .eq('sd_id', sdUuid)
        .eq('handoff_type', 'EXEC-TO-PLAN')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.log(`   ⚠️  Database error checking prerequisite: ${error.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`Database error: ${error.message}`],
          warnings: [],
          remediation: 'Check database connectivity and retry'
        };
      }

      if (!execToPlanHandoff || execToPlanHandoff.length === 0) {
        console.log('   ❌ No accepted EXEC-TO-PLAN handoff found');
        console.log('   ⚠️  LEO Protocol requires EXEC-TO-PLAN before PLAN-TO-LEAD');
        console.log('');
        console.log('   LEO Protocol handoff sequence:');
        console.log('   1. LEAD-TO-PLAN  (approval to plan)');
        console.log('   2. PLAN-TO-EXEC  (approval to execute) ← verify this passed');
        console.log('   3. EXEC-TO-PLAN  (execution complete)  ← MISSING');
        console.log('   4. PLAN-TO-LEAD  (final approval)      ← blocked');

        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: ['BLOCKING: No accepted EXEC-TO-PLAN handoff found - LEO Protocol violation'],
          warnings: [],
          remediation: 'Complete EXEC-TO-PLAN handoff before attempting PLAN-TO-LEAD. Run: node scripts/handoff.js exec-to-plan --sd-id <SD-ID>'
        };
      }

      const handoff = execToPlanHandoff[0];
      console.log('   ✅ Prerequisite satisfied: EXEC-TO-PLAN handoff found');
      console.log(`      Handoff ID: ${handoff.id}`);
      console.log(`      Status: ${handoff.status}`);
      console.log(`      Score: ${handoff.validation_score || 'N/A'}`);
      console.log(`      Date: ${new Date(handoff.created_at).toLocaleString()}`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: {
          prerequisite_handoff_id: handoff.id,
          prerequisite_score: handoff.validation_score,
          prerequisite_date: handoff.created_at
        }
      };
    },
    required: true
  };
}

/**
 * SD-REFILL-001YZJNQ — premature-parent guard. A parent orchestrator auto-completes when all its
 * CREATED children reach a terminal status, but the program plan may declare MORE children (waves)
 * that were never authored as SD rows (witnessed on SD-LEO-ORCH-ADAM-PLAN-KEEPER-001: 6 created
 * children all complete, Wave 2-4 ~SDs/QFs never created → counting only created children completed
 * the parent prematurely). This decides whether an all-created-children-complete parent should still
 * WAIT because more children are planned than authored.
 *
 * CONSERVATIVE / regression-free: returns wait=false UNLESS an EXPLICIT planned-children signal is
 * present AND exceeds the created count AND decomposition is not explicitly marked complete. Parents
 * without any planned signal behave exactly as before (no regression). decomposition_complete===true
 * short-circuits to NO wait (author asserts the plan is fully decomposed / intentionally smaller).
 * Planned count is taken from the first present of: metadata.planned_children_count (number) |
 * metadata.planned_children (array length) | metadata.plan_content.planned_children_count (number).
 * Free-form plan_content TEXT is NOT parsed — that would risk false WAITs blocking legitimate parents.
 *
 * @param {{parentMetadata?:object, createdChildCount:number}} args
 * @returns {{wait:boolean, plannedCount:number|null, createdCount:number, reason:string}}
 */
export function evaluatePlannedDecomposition({ parentMetadata, createdChildCount } = {}) {
  const md = parentMetadata && typeof parentMetadata === 'object' ? parentMetadata : {};
  const created = Number.isFinite(createdChildCount) ? createdChildCount : 0;
  if (md.decomposition_complete === true) {
    return { wait: false, plannedCount: null, createdCount: created, reason: 'decomposition_complete=true (author marked the plan fully decomposed)' };
  }
  let planned = null;
  if (Number.isFinite(md.planned_children_count)) planned = md.planned_children_count;
  else if (Array.isArray(md.planned_children)) planned = md.planned_children.length;
  else if (md.plan_content && typeof md.plan_content === 'object' && Number.isFinite(md.plan_content.planned_children_count)) planned = md.plan_content.planned_children_count;
  if (!Number.isFinite(planned) || planned <= created) {
    return { wait: false, plannedCount: Number.isFinite(planned) ? planned : null, createdCount: created, reason: 'no explicit planned-children signal exceeding the created count' };
  }
  return {
    wait: true,
    plannedCount: planned,
    createdCount: created,
    reason: `Parent program plan declares ${planned} child SD(s) but only ${created} have been authored — ${planned - created} planned child(ren) not yet created (premature-parent guard).`,
  };
}

/**
 * Check if SD is a parent orchestrator with completed children
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdUuid - SD UUID
 * @param {Object} ctx - Gate context
 * @returns {Object|null} Gate result if parent orchestrator, null otherwise
 */
async function checkParentOrchestrator(supabase, sdUuid, _ctx) {
  const { data: childSDs, error: childError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status')
    .eq('parent_sd_id', sdUuid);

  // QF-20260703-906 (fix 1/2): a genuine query error must never be treated the same as
  // "zero children" — both previously fell through silently to "not a parent," hiding a
  // DB/connectivity problem behind a misleading EXEC-TO-PLAN-required failure.
  if (childError) {
    console.log(`   ⚠️  Parent-detection query failed: ${childError.message} — cannot determine parent status`);
    return null;
  }

  if (childSDs && childSDs.length > 0) {
    console.log(`   ℹ️  Parent SD detected with ${childSDs.length} children`);

    const terminalStatuses = ['completed', 'cancelled', 'deferred'];
    const completedChildren = childSDs.filter(c => terminalStatuses.includes(c.status));
    const incompleteChildren = childSDs.filter(c => !terminalStatuses.includes(c.status));

    console.log(`   ✅ Completed: ${completedChildren.length}/${childSDs.length}`);

    if (incompleteChildren.length > 0) {
      // SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 FR-4:
      // Waiting on children is NOT a validation failure — it is a known-and-expected
      // state in the parent orchestrator lifecycle (parent's PLAN-TO-LEAD blocks until
      // children COMPLETE). Returning passed=false with wait=true tells the handoff
      // executor to record handoff_status='blocked_wait' (or 'blocked' + metadata.wait
      // flag fallback) WITHOUT incrementing retry_count or setting rejection_reason.
      // See CLAUDE.md SD Continuation Truth Table — Orchestrator Parent Lifecycle.
      const incompleteList = incompleteChildren.map(c => c.sd_key || c.id);
      console.log('   ⏳ WAITING on incomplete children (not a failure — expected parent lifecycle state):');
      incompleteChildren.forEach(c => {
        console.log(`      - ${c.sd_key || c.id}: ${c.status}`);
      });
      return buildWaitResult({
        score: 0,
        max_score: 100,
        wait_reason: `Parent orchestrator waiting on ${incompleteChildren.length} child SD(s) to complete: ${incompleteList.join(', ')}`,
        issues: [],
        warnings: [`WAIT: parent orchestrator blocked until children complete (${incompleteList.length} pending)`],
        remediation: `Wait for children to complete via their own LEAD→FINAL cycles: ${incompleteList.join(', ')}. Re-run PLAN-TO-LEAD when all children reach status='completed'.`,
        details: {
          is_parent_sd: true,
          total_children: childSDs.length,
          completed_children: completedChildren.length,
          incomplete_children: incompleteList,
        },
      });
    }

    // SD-REFILL-001YZJNQ: all CREATED children are terminal — but guard against PREMATURE parent
    // completion when the program plan declares MORE children than were authored as SD rows. The
    // parent SD is ctx.sd (the row being handed off); read its metadata directly (no extra query).
    // Only WAITs on an EXPLICIT planned-children signal (regression-free + fail-open: a thin context
    // with no metadata degrades to today's behavior, never a false block).
    const decomp = evaluatePlannedDecomposition({
      parentMetadata: _ctx?.sd?.metadata,
      createdChildCount: childSDs.length,
    });
    if (decomp.wait) {
      console.log(`   ⏳ WAITING on un-authored planned children (${decomp.createdCount}/${decomp.plannedCount} authored) — not a failure (premature-parent guard):`);
      console.log(`      ${decomp.reason}`);
      return buildWaitResult({
        score: 0,
        max_score: 100,
        wait_reason: decomp.reason,
        issues: [],
        warnings: [`WAIT: parent plan declares ${decomp.plannedCount} children but only ${decomp.createdCount} authored — decomposition incomplete`],
        remediation: `Author the remaining ${decomp.plannedCount - decomp.createdCount} planned child SD(s), OR set metadata.decomposition_complete=true if the plan is intentionally smaller than declared. Then re-run PLAN-TO-LEAD.`,
        details: {
          is_parent_sd: true,
          total_children: childSDs.length,
          completed_children: completedChildren.length,
          planned_children: decomp.plannedCount,
          decomposition_incomplete: true,
        },
      });
    }

    console.log('   ✅ All children completed - parent SD ready for final approval');
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: {
        is_parent_sd: true,
        total_children: childSDs.length,
        completed_children: completedChildren.length,
        workflow_modification: 'Parent SD - completion based on children'
      }
    };
  }

  return null; // Not a parent orchestrator
}
