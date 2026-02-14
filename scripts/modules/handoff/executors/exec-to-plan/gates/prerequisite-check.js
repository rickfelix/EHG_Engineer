/**
 * Prerequisite Handoff Check Gate for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * ROOT CAUSE FIX: Validates PLAN-TO-EXEC handoff exists before EXEC-TO-PLAN (SD-VISION-V2-009)
 */

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
      console.log('\n🔐 PREREQUISITE CHECK: PLAN-TO-EXEC Handoff Required');
      console.log('-'.repeat(50));

      // Use UUID (ctx.sd.id) not legacy_id (ctx.sdId) - handoffs are stored by UUID
      const sdUuid = ctx.sd?.id || ctx.sdId;

      // Auto-resolve previous failed EXEC-TO-PLAN attempts on retry
      const resolveResult = await autoResolveFailedHandoffs(supabase, sdUuid, 'EXEC-TO-PLAN');
      if (resolveResult.resolved > 0) {
        console.log(`   ✅ Auto-resolved ${resolveResult.resolved} previous EXEC-TO-PLAN failure(s)`);
      } else if (resolveResult.error) {
        console.log(`   ⚠️  Could not check previous failures: ${resolveResult.error}`);
      }

      const { data: allHandoffs, error } = await supabase
        .from('sd_phase_handoffs')
        .select('id, status, created_at, validation_score, rejection_reason')
        .eq('sd_id', sdUuid)
        .eq('handoff_type', 'PLAN-TO-EXEC')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.log(`   ⚠️  Error checking prerequisite: ${error.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`Failed to verify PLAN-TO-EXEC prerequisite: ${error.message}`],
          warnings: []
        };
      }

      // ROOT CAUSE FIX (2026-01-01): Check for ACCEPTED handoff FIRST before checking blocked
      const acceptedHandoffs = allHandoffs?.filter(h => h.status === 'accepted') || [];
      const blockedHandoffs = allHandoffs?.filter(h => h.status === 'blocked') || [];

      // If we have at least one accepted handoff, the prerequisite is satisfied
      if (acceptedHandoffs.length > 0) {
        const latestAccepted = acceptedHandoffs[0];
        console.log('   ✅ Prerequisite satisfied: PLAN-TO-EXEC handoff found');
        console.log(`      Handoff ID: ${latestAccepted.id.slice(0, 8)}...`);
        console.log(`      Status: ${latestAccepted.status}`);
        console.log(`      Score: ${latestAccepted.validation_score}`);
        console.log(`      Date: ${new Date(latestAccepted.created_at).toLocaleString()}`);

        if (blockedHandoffs.length > 0) {
          console.log(`   ⚠️  Note: ${blockedHandoffs.length} earlier blocked handoff(s) exist (ignored - accepted handoff takes precedence)`);
        }

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: blockedHandoffs.length > 0 ? [`${blockedHandoffs.length} blocked handoff(s) exist from earlier attempts`] : []
        };
      }

      // No accepted handoff - check if there are blocked handoffs to provide guidance
      if (blockedHandoffs.length > 0) {
        const latestBlocked = blockedHandoffs[0];
        console.log('   ⚠️  BLOCKED PLAN-TO-EXEC handoff found (no accepted handoff exists)');
        console.log(`      ID: ${latestBlocked.id.slice(0, 8)}...`);
        console.log(`      Score: ${latestBlocked.validation_score}% (required: 85%)`);
        console.log(`      Reason: ${latestBlocked.rejection_reason || 'Below threshold'}`);
        console.log('\n   REMEDIATION:');
        console.log('   1. Address validation failures to raise score to 85%+');
        console.log(`   2. Use: SELECT * FROM retry_blocked_handoff('${latestBlocked.id}', <new_score>);`);
        console.log('   3. Or create new handoff after fixing issues');

        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`BLOCKED: PLAN-TO-EXEC handoff blocked with score ${latestBlocked.validation_score}%`],
          warnings: [],
          remediation: 'Fix validation issues and retry blocked handoff or create new one'
        };
      }

      // No handoffs at all
      console.log('   ❌ ERR_CHAIN_INCOMPLETE: Missing PLAN-TO-EXEC handoff');
      console.log('   ⚠️  LEO Protocol requires PLAN-TO-EXEC before EXEC-TO-PLAN');
      console.log('\n   REMEDIATION:');
      console.log('   1. Complete PLAN phase prerequisites (PRD, user stories, design analysis)');
      console.log('   2. Run: node scripts/handoff.js execute PLAN-TO-EXEC <SD-ID>');
      console.log('   3. Address any validation failures');
      console.log('   4. Retry EXEC-TO-PLAN after PLAN-TO-EXEC is accepted');

      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: ['ERR_CHAIN_INCOMPLETE: Missing PLAN-TO-EXEC handoff - complete prerequisite before EXEC-TO-PLAN'],
        warnings: [],
        remediation: 'Complete PLAN-TO-EXEC handoff before attempting EXEC-TO-PLAN'
      };
    },
    required: true
  };
}
