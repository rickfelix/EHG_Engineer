/**
 * Prerequisite Handoff Check Gate
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * ROOT CAUSE FIX: Validates LEAD-TO-PLAN handoff exists before PLAN-TO-EXEC (SD-VISION-V2-009)
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
      console.log('\n🔐 PREREQUISITE CHECK: LEAD-TO-PLAN Handoff Required');
      console.log('-'.repeat(50));

      // Use UUID (ctx.sd.id) not legacy_id (ctx.sdId) - handoffs are stored by UUID
      const sdUuid = ctx.sd?.id || ctx.sdId;

      // Auto-resolve previous failed PLAN-TO-EXEC attempts on retry
      const resolveResult = await autoResolveFailedHandoffs(supabase, sdUuid, 'PLAN-TO-EXEC');
      if (resolveResult.resolved > 0) {
        console.log(`   ✅ Auto-resolved ${resolveResult.resolved} previous PLAN-TO-EXEC failure(s)`);
      } else if (resolveResult.error) {
        console.log(`   ⚠️  Could not check previous failures: ${resolveResult.error}`);
      }

      // Query for an accepted LEAD-TO-PLAN handoff for this SD
      const { data: leadToPlanHandoff, error } = await supabase
        .from('sd_phase_handoffs')
        .select('id, status, created_at, validation_score')
        .eq('sd_id', sdUuid)
        .eq('handoff_type', 'LEAD-TO-PLAN')
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

      // SD-LEARN-010:US-002 + SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-122:
      // Enhanced chain diagnostic — check both UUID and sd_key, report status mismatches
      if (!leadToPlanHandoff || leadToPlanHandoff.length === 0) {
        console.log('   ❌ ERR_CHAIN_INCOMPLETE: Missing accepted LEAD-TO-PLAN handoff');
        console.log('   ⚠️  LEO Protocol requires LEAD-TO-PLAN before PLAN-TO-EXEC');

        // Diagnostic: check if handoff exists with non-accepted status
        const sdKey = ctx.sd?.sd_key || ctx.sdId;
        const { data: anyHandoffs } = await supabase
          .from('sd_phase_handoffs')
          .select('id, status, sd_id, handoff_type, created_at')
          .or(`sd_id.eq.${sdUuid},sd_id.eq.${sdKey}`)
          .eq('handoff_type', 'LEAD-TO-PLAN')
          .order('created_at', { ascending: false })
          .limit(3);

        if (anyHandoffs && anyHandoffs.length > 0) {
          console.log('');
          console.log('   🔍 DIAGNOSTIC: LEAD-TO-PLAN handoff(s) found but not accepted:');
          for (const h of anyHandoffs) {
            console.log(`      - ID: ${h.id.substring(0, 8)}... | status: ${h.status} | sd_id: ${h.sd_id.substring(0, 12)}... | ${new Date(h.created_at).toLocaleString()}`);
          }
          console.log(`      Expected: status='accepted', sd_id='${sdUuid}'`);
          console.log('');
          console.log('   💡 The handoff may have failed to persist its artifact.');
          console.log('      Re-run: CLAUDE_SESSION_ID=<session> node scripts/handoff.js execute LEAD-TO-PLAN ' + sdKey);
        } else {
          console.log('');
          console.log('   🔍 DIAGNOSTIC: No LEAD-TO-PLAN handoff found at all');
          console.log(`      Searched: sd_id='${sdUuid}' AND sd_id='${sdKey}'`);
          console.log('');
          console.log('   LEO Protocol handoff sequence:');
          console.log('   1. LEAD-TO-PLAN  (approval to plan)   ← MISSING');
          console.log('   2. PLAN-TO-EXEC  (approval to execute) ← blocked');
          console.log('   3. EXEC-TO-PLAN  (execution complete)');
          console.log('   4. PLAN-TO-LEAD  (final approval)');
        }

        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`ERR_CHAIN_INCOMPLETE: No accepted LEAD-TO-PLAN handoff for sd_id=${sdUuid}. Found ${anyHandoffs?.length || 0} non-accepted record(s).`],
          warnings: [],
          remediation: `Re-run LEAD-TO-PLAN: CLAUDE_SESSION_ID=<session> node scripts/handoff.js execute LEAD-TO-PLAN ${sdKey}`
        };
      }

      const handoff = leadToPlanHandoff[0];
      console.log('   ✅ Prerequisite satisfied: LEAD-TO-PLAN handoff found');
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
