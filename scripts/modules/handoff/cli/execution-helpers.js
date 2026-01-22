/**
 * Execution Helper Functions for Handoff CLI
 *
 * Helper functions for execute command processing.
 * Extracted from cli-main.js for modularization.
 *
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeSDId } from '../../sd-id-normalizer.js';

/**
 * Check bypass rate limits and log to audit
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} handoffType - Type of handoff
 * @param {string} bypassReason - Reason for bypass
 * @returns {Promise<Object>} Result with success boolean
 */
export async function checkBypassRateLimits(sdId, handoffType, bypassReason) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const canonicalSdId = await normalizeSDId(supabase, sdId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check bypasses for this SD (max 3)
  const { data: sdBypasses, error: sdError } = await supabase
    .from('audit_log')
    .select('id')
    .eq('action_type', 'VALIDATION_BYPASS')
    .eq('target_id', canonicalSdId || sdId)
    .gte('timestamp', today.toISOString());

  if (!sdError && sdBypasses && sdBypasses.length >= 3) {
    console.error('');
    console.error('❌ BYPASS RATE LIMIT: Max 3 bypasses per SD reached');
    console.error(`   SD: ${sdId} has ${sdBypasses.length} bypasses today`);
    console.error('');
    console.error('   Request LEAD approval for additional bypasses.');
    console.error('');
    return { success: false };
  }

  // Check global bypasses today (max 10)
  const { data: globalBypasses, error: globalError } = await supabase
    .from('audit_log')
    .select('id')
    .eq('action_type', 'VALIDATION_BYPASS')
    .gte('timestamp', today.toISOString());

  if (!globalError && globalBypasses && globalBypasses.length >= 10) {
    console.error('');
    console.error('❌ BYPASS RATE LIMIT: Max 10 global bypasses per day reached');
    console.error(`   ${globalBypasses.length} bypasses have been used today`);
    console.error('');
    return { success: false };
  }

  // Log bypass to audit_log
  const { error: logError } = await supabase
    .from('audit_log')
    .insert({
      action_type: 'VALIDATION_BYPASS',
      target_type: 'handoff',
      target_id: canonicalSdId || sdId,
      severity: 'warning',
      description: `Bypass validation for ${handoffType} handoff`,
      metadata: {
        handoff_type: handoffType,
        sd_id: sdId,
        canonical_sd_id: canonicalSdId,
        bypass_reason: bypassReason,
        sd_bypasses_today: (sdBypasses?.length || 0) + 1,
        global_bypasses_today: (globalBypasses?.length || 0) + 1
      },
      timestamp: new Date().toISOString()
    });

  if (logError) {
    console.warn(`   ⚠️  Could not log bypass to audit_log: ${logError.message}`);
  } else {
    console.log('');
    console.log('⚠️  BYPASS MODE ENABLED (SD-LEARN-010:US-005)');
    console.log('─'.repeat(50));
    console.log(`   Reason: ${bypassReason}`);
    console.log(`   SD Bypasses Today: ${(sdBypasses?.length || 0) + 1}/3`);
    console.log(`   Global Bypasses Today: ${(globalBypasses?.length || 0) + 1}/10`);
    console.log('   ⚠️  Bypass logged to audit_log for review');
    console.log('─'.repeat(50));
  }

  return { success: true };
}

/**
 * Display execution result
 *
 * @param {Object} result - Execution result
 * @param {string} handoffType - Type of handoff
 * @param {string} sdId - Strategic Directive ID
 */
export async function displayExecutionResult(result, handoffType, sdId) {
  if (result.success) {
    console.log('');
    console.log('✅ HANDOFF SUCCESSFUL');
    console.log('='.repeat(50));
    console.log(`   Type: ${handoffType.toUpperCase()}`);
    console.log(`   SD: ${sdId}`);

    const displayScore = result.normalizedScore ?? result.qualityScore ?? Math.round((result.totalScore / result.maxScore) * 100) ?? 'N/A';
    console.log(`   Score: ${displayScore}%`);

    if (result.gateResults && Object.keys(result.gateResults).length > 0) {
      console.log(`   Gates: ${Object.keys(result.gateResults).length} evaluated`);
      for (const [gateName, gateResult] of Object.entries(result.gateResults)) {
        const gatePercent = gateResult.maxScore > 0 ? Math.round((gateResult.score / gateResult.maxScore) * 100) : 0;
        const status = gateResult.passed ? '✓' : '✗';
        console.log(`      ${status} ${gateName}: ${gatePercent}%`);
      }
    }

    if (result.warnings?.length > 0) {
      console.log(`   Warnings: ${result.warnings.length}`);
    }

    // Show next step in workflow
    const nextStepMap = {
      'LEAD-TO-PLAN': { next: 'PLAN-TO-EXEC', status: 'planning', message: 'Create PRD, then run PLAN-TO-EXEC' },
      'PLAN-TO-EXEC': { next: 'EXEC-TO-PLAN', status: 'in_progress', message: 'Implement features, then run EXEC-TO-PLAN' },
      'EXEC-TO-PLAN': { next: 'PLAN-TO-LEAD', status: 'review', message: 'Verify implementation, then run PLAN-TO-LEAD' },
      'PLAN-TO-LEAD': { next: 'LEAD-FINAL-APPROVAL', status: 'pending_approval', message: '⚠️  SD is NOT complete! Run LEAD-FINAL-APPROVAL to finish' },
      'LEAD-FINAL-APPROVAL': { next: null, status: 'completed', message: '🎉 SD is now COMPLETE!' }
    };

    const nextStep = nextStepMap[handoffType.toUpperCase()];
    if (nextStep) {
      // Update SD status in database
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const canonicalId = await normalizeSDId(supabase, sdId);

      if (canonicalId) {
        const { data: updateData, error: updateError } = await supabase
          .from('strategic_directives_v2')
          .update({ status: nextStep.status, updated_at: new Date().toISOString() })
          .eq('id', canonicalId)
          .select('id')
          .single();

        if (updateError) {
          console.warn(`   ⚠️  Failed to update SD status: ${updateError.message}`);
        } else if (!updateData) {
          console.warn('   ⚠️  SD status update returned no data - possible silent failure');
        } else if (sdId !== canonicalId) {
          console.log(`   ℹ️  ID normalized: "${sdId}" -> "${canonicalId}"`);
        }
      }

      console.log('');
      console.log('─'.repeat(50));
      console.log(`   📍 SD Status: ${nextStep.status.toUpperCase()}`);
      if (nextStep.next) {
        console.log(`   ➡️  NEXT STEP: ${nextStep.next}`);
        console.log(`      ${nextStep.message}`);
        console.log('');
        console.log('   ⚠️  DO NOT claim completion until LEAD-FINAL-APPROVAL is done');
      } else {
        console.log(`   ${nextStep.message}`);
      }
    }
  } else {
    console.log('');
    console.log('❌ HANDOFF FAILED');
    console.log('='.repeat(50));
    console.log(`   Reason: ${result.reasonCode || 'VALIDATION_FAILED'}`);
    console.log(`   Message: ${result.message || 'See details above'}`);
    if (result.remediation) {
      console.log('');
      console.log('   REMEDIATION:');
      result.remediation.split('\n').forEach(line => {
        console.log(`   ${line}`);
      });
    }
  }
}
