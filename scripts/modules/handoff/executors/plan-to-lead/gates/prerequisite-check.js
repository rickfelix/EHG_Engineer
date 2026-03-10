/**
 * Prerequisite Handoff Check Gate for PLAN-TO-LEAD
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * ROOT CAUSE FIX: Validates EXEC-TO-PLAN handoff exists before PLAN-TO-LEAD (SD-VISION-V2-009)
 */

import { isInfrastructureSDSync } from '../../../../sd-type-checker.js';
import { autoResolveFailedHandoffs } from '../../../gates/auto-resolve-failures.js';

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
      const sdUuid = ctx.sd?.id || ctx.sdId;

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

  if (!childError && childSDs && childSDs.length > 0) {
    console.log(`   ℹ️  Parent SD detected with ${childSDs.length} children`);

    const terminalStatuses = ['completed', 'cancelled'];
    const completedChildren = childSDs.filter(c => terminalStatuses.includes(c.status));
    const incompleteChildren = childSDs.filter(c => !terminalStatuses.includes(c.status));

    console.log(`   ✅ Completed: ${completedChildren.length}/${childSDs.length}`);

    if (incompleteChildren.length > 0) {
      console.log('   ❌ Incomplete children:');
      incompleteChildren.forEach(c => {
        console.log(`      - ${c.sd_key || c.id}: ${c.status}`);
      });
      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: [`Parent SD has ${incompleteChildren.length} incomplete children`],
        warnings: [],
        remediation: `Complete all child SDs before finalizing parent: ${incompleteChildren.map(c => c.sd_key || c.id).join(', ')}`
      };
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
