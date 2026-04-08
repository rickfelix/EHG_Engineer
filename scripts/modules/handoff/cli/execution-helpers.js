/**
 * Execution Helper Functions for Handoff CLI
 *
 * Helper functions for execute command processing.
 * Extracted from cli-main.js for modularization.
 *
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import { createSupabaseServiceClient } from '../../../../lib/supabase-client.js';
import { normalizeSDId } from '../../sd-id-normalizer.js';
import { createTaskHydrator } from '../../../../lib/tasks/index.js';
import { validateBypassReason } from '../bypass-rubric.js';

/**
 * Check bypass rate limits and log to audit
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} handoffType - Type of handoff
 * @param {string} bypassReason - Reason for bypass
 * @returns {Promise<Object>} Result with success boolean
 */
export async function checkBypassRateLimits(sdId, handoffType, bypassReason) {
  const supabase = createSupabaseServiceClient();

  // CONST-015: Validate bypass reason against rubric before proceeding
  const rubricResult = validateBypassReason(bypassReason);
  if (!rubricResult.allowed) {
    console.error('');
    console.error('❌ BYPASS REJECTED (CONST-015 Bypass Rubric)');
    console.error(`   Category: ${rubricResult.category}`);
    console.error(`   Rule: ${rubricResult.matchedRule}`);
    console.error(`   ${rubricResult.explanation}`);
    console.error('');
    return { success: false, rejected: true, rubricResult };
  }

  if (rubricResult.category === 'UNCLASSIFIED') {
    console.log('');
    console.log('⚠️  BYPASS REASON UNCLASSIFIED — allowed but flagged for review');
    console.log(`   Reason: ${bypassReason}`);
  }

  const canonicalSdId = await normalizeSDId(supabase, sdId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Count bypasses for this SD (audit metadata only, no enforcement)
  const { data: sdBypasses, error: _sdError } = await supabase
    .from('validation_audit_log')
    .select('id')
    .eq('failure_category', 'bypass')
    .eq('sd_id', canonicalSdId || sdId)
    .gte('created_at', today.toISOString());

  // Check global bypasses today
  const { data: globalBypasses, error: globalError } = await supabase
    .from('validation_audit_log')
    .select('id')
    .eq('failure_category', 'bypass')
    .gte('created_at', today.toISOString());

  // SD-LEO-FIX-ID-FORMAT-001: User approved bypass rate limit increase on 2026-01-26
  // Original limit was 10, increased to 2000 to accommodate high-volume automation
  if (!globalError && globalBypasses && globalBypasses.length >= 2000) {
    console.error('');
    console.error('❌ BYPASS RATE LIMIT: Max 2000 global bypasses per day reached');
    console.error(`   ${globalBypasses.length} bypasses have been used today`);
    console.error('');
    return { success: false };
  }

  // Log bypass to validation_audit_log
  const correlationId = `bypass-${Date.now()}`;
  const { error: logError } = await supabase
    .from('validation_audit_log')
    .insert({
      correlation_id: correlationId,
      sd_id: canonicalSdId || sdId,
      validator_name: 'handoff_bypass',
      failure_reason: `Bypass validation for ${handoffType} handoff: ${bypassReason}`,
      failure_category: 'bypass',
      metadata: {
        handoff_type: handoffType,
        original_sd_id: sdId,
        canonical_sd_id: canonicalSdId,
        bypass_reason: bypassReason,
        rubric_category: rubricResult.category,
        rubric_matched_rule: rubricResult.matchedRule,
        sd_bypasses_today: (sdBypasses?.length || 0) + 1,
        global_bypasses_today: (globalBypasses?.length || 0) + 1
      },
      execution_context: 'cli'
    });

  if (logError) {
    console.warn(`   ⚠️  Could not log bypass to validation_audit_log: ${logError.message}`);
  } else {
    console.log('');
    console.log('⚠️  BYPASS MODE ENABLED (SD-LEARN-010:US-005)');
    console.log('─'.repeat(50));
    console.log(`   Reason: ${bypassReason}`);
    console.log(`   SD Bypasses Today: ${(sdBypasses?.length || 0) + 1}`);
    console.log(`   Global Bypasses Today: ${(globalBypasses?.length || 0) + 1}/2000`);
    console.log('   ⚠️  Bypass logged to validation_audit_log for review');
    console.log('─'.repeat(50));
  }

  return { success: true };
}

/**
 * Hydrate and output tasks for the next phase
 * This outputs tasks in a format that Claude will read and create via TaskCreate
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} currentHandoff - Current handoff type (e.g., 'LEAD-TO-PLAN')
 * @param {Object} supabase - Supabase client
 */
async function hydrateAndOutputTasks(sdId, currentHandoff, supabase) {
  // Map handoff types to their target phases
  const handoffToPhase = {
    'LEAD-TO-PLAN': 'PLAN',
    'PLAN-TO-EXEC': 'EXEC',
    'EXEC-TO-PLAN': 'VERIFY',  // Or FINAL depending on track
    'PLAN-TO-LEAD': 'FINAL'
  };

  const targetPhase = handoffToPhase[currentHandoff.toUpperCase()];
  if (!targetPhase) {
    return; // No task hydration for LEAD-FINAL-APPROVAL
  }

  try {
    const hydrator = createTaskHydrator(supabase);
    const result = await hydrator.hydratePhase(sdId, targetPhase);

    if (!result.tasks || result.tasks.length === 0) {
      console.log('');
      console.log('   ℹ️  No tasks to hydrate for this phase');
      return;
    }

    // Output tasks in a format Claude can process
    console.log('');
    console.log('═'.repeat(60));
    console.log('🎯 CLAUDE_TASK_HYDRATION: Tasks for next phase');
    console.log('═'.repeat(60));
    console.log(`   Track: ${result.track}`);
    console.log(`   Phase: ${targetPhase}`);
    console.log(`   Tasks: ${result.tasks.length}`);
    console.log('');
    console.log('   INSTRUCTION: Claude MUST call TaskCreate for each task below.');
    console.log('   Use TaskUpdate to set blockedBy dependencies after creation.');
    console.log('');
    console.log('   ⚠️  IMPORTANT: These are TASKS, not handoffs!');
    console.log('      • DO NOT execute these with handoff.js');
    console.log('      • Use TaskCreate tool to create these tasks');
    console.log('');
    console.log('   Valid HANDOFF types (for handoff.js execute):');
    console.log('      LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN,');
    console.log('      PLAN-TO-LEAD, LEAD-FINAL-APPROVAL');
    console.log('');
    console.log('───────────────────────────────────────────────────────────');

    for (const task of result.tasks) {
      console.log(`   📋 TASK: ${task.id}`);
      console.log(`      Subject: ${task.subject}`);
      console.log(`      ActiveForm: ${task.activeForm}`);
      console.log(`      Description: ${task.description}`);
      if (task.blockedBy && task.blockedBy.length > 0) {
        console.log(`      BlockedBy: ${task.blockedBy.join(', ')}`);
      }
      console.log('');
    }

    console.log('═'.repeat(60));
    console.log('END_CLAUDE_TASK_HYDRATION');
    console.log('═'.repeat(60));

    // Record hydration event
    console.log('');
    console.log(`   ✅ Task hydration recorded (${result.tasks.length} tasks for ${targetPhase})`);

  } catch (err) {
    console.log('');
    console.log(`   ⚠️  Task hydration skipped: ${err.message}`);
    // Non-blocking - handoff continues even if hydration fails
  }
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
    console.log('');
    console.log('   ⚠️  IMPORTANT: Follow the LEO protocol diligently.');

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
      // RCA-FIX: Removed status write — the executor's state-transitions.js is the
      // authoritative state setter. This display function was overwriting the executor's
      // status (e.g., 'in_progress' → 'planning'), which then blocked subsequent handoffs
      // because verify-l2p rejects 'planning'. See PAT-HANDOFF-STATUS-OVERWRITE-001.
      const supabase = createSupabaseServiceClient();
      const canonicalId = await normalizeSDId(supabase, sdId);

      if (canonicalId && sdId !== canonicalId) {
        console.log(`   ℹ️  ID normalized: "${sdId}" -> "${canonicalId}"`);
      }

      console.log('');
      console.log('─'.repeat(50));
      console.log(`   📍 SD Status: ${nextStep.status.toUpperCase()}`);
      if (nextStep.next) {
        console.log(`   ➡️  NEXT STEP: ${nextStep.next}`);
        console.log(`      ${nextStep.message}`);
        console.log('');
        console.log('   ⚠️  DO NOT claim completion until LEAD-FINAL-APPROVAL is done');

        // SD-MAN-FEAT-CORRECTIVE-VISION-GAP-072 US-002: Machine-readable next command
        // Enables auto-chaining in CLI workflows (modeled after HEAL_NEXT_CMD pattern)
        console.log('');
        console.log(`HANDOFF_NEXT_CMD=node scripts/handoff.js execute ${nextStep.next} ${sdId}`);
      } else {
        console.log(`   ${nextStep.message}`);
      }

      // LEO 5.0: Hydrate tasks for next phase
      await hydrateAndOutputTasks(sdId, handoffType, supabase);
    }

    // SD-LEO-INFRA-HANDOFF-RESULT-SUMMARY-001: Machine-readable result summary
    // Emitted LAST so grep/tail can always find it regardless of output size
    const passDisplayScore = result.normalizedScore ?? result.qualityScore ?? Math.round((result.totalScore / result.maxScore) * 100) ?? 0;
    console.log(`\nHANDOFF_RESULT=PASS SD=${sdId} SCORE=${passDisplayScore} PHASE=${handoffType.toUpperCase()}`);
  } else {
    console.log('');
    console.log('❌ HANDOFF FAILED');
    console.log('='.repeat(50));
    console.log('');
    console.log('   ⚠️  IMPORTANT: Follow the LEO protocol diligently.');
    console.log('');
    console.log(`   Reason: ${result.reasonCode || 'VALIDATION_FAILED'}`);
    console.log(`   Message: ${result.message || 'See details above'}`);
    if (result.remediation) {
      console.log('');
      console.log('   REMEDIATION:');
      result.remediation.split('\n').forEach(line => {
        console.log(`   ${line}`);
      });
    }
    // Auto-suggest precheck command for batch gate evaluation
    if (handoffType && sdId) {
      console.log('');
      console.log('   💡 TIP: Run precheck to see ALL gate failures at once:');
      console.log(`      node scripts/handoff.js precheck ${handoffType} ${sdId}`);
    }

    // SD-LEO-INFRA-HANDOFF-RESULT-SUMMARY-001: Machine-readable result summary
    const failScore = result.normalizedScore ?? result.qualityScore ?? Math.round(((result.totalScore || 0) / (result.maxScore || 100)) * 100) ?? 0;
    const reasonCode = result.reasonCode || 'VALIDATION_FAILED';
    console.log(`\nHANDOFF_RESULT=FAIL SD=${sdId} SCORE=${failScore} PHASE=${handoffType.toUpperCase()} REASON=${reasonCode}`);
  }
}
