/**
 * LeadFinalApprovalExecutor - Main Orchestrator
 * Executes LEAD-FINAL-APPROVAL handoffs
 *
 * REFACTORED: This module orchestrates the domain modules.
 * See lead-final-approval/ for domain architecture.
 *
 * @module lead-final-approval
 */

import BaseExecutor from '../BaseExecutor.js';
import ResultBuilder from '../../ResultBuilder.js';

// Domain imports
import { getRequiredGates } from './gates.js';
import {
  checkAndCompleteParentSD,
  resolveLearningItems,
  releaseSessionClaim
} from './helpers.js';
import { getRemediation } from './remediations.js';
import { clearState as clearAutoProceedState } from '../../auto-proceed-state.js';
import { recordSdCompleted } from '../../../../../lib/learning/outcome-tracker.js';

// Worktree cleanup (SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001)
import { cleanupWorktree, validateSdKey } from '../../../../../lib/worktree-manager.js';

/**
 * Auto-rescore the original SD after a corrective SD completes.
 * SD-MAN-INFRA-VISION-RESCORE-ON-COMPLETION-001
 *
 * Only fires when the completing SD has a vision_origin_score_id — indicating
 * it was created by the EVA corrective-sd-generator to address a vision gap.
 * Fail-safe: all errors are caught and logged; never blocks SD completion.
 *
 * @param {Object} sd - The completing SD (must have vision_origin_score_id field)
 * @param {Object} supabase - Supabase client
 */
async function rescoreOriginalSD(sd, supabase) {
  if (!sd.vision_origin_score_id) return; // Not a corrective SD

  console.log('\n🔄 AUTO-RESCORE: Corrective SD completion detected');
  console.log('-'.repeat(50));
  console.log(`   Corrective SD: ${sd.sd_key || sd.id}`);
  console.log(`   Origin score ID: ${sd.vision_origin_score_id}`);

  try {
    // Fetch the original score record to find which SD was scored
    const { data: originScore, error: originErr } = await supabase
      .from('eva_vision_scores')
      .select('sd_id, total_score, dimension_scores, scored_at')
      .eq('id', sd.vision_origin_score_id)
      .single();

    if (originErr || !originScore) {
      console.log(`   ⚠️  Origin score record not found (${sd.vision_origin_score_id}) — skipping rescore`);
      return;
    }

    const originalSdKey = originScore.sd_id;
    const previousScore = originScore.total_score;
    console.log(`   Original SD: ${originalSdKey} (previous score: ${previousScore}/100)`);

    // Import scoreSD lazily to avoid circular dep issues at module load time
    const { scoreSD } = await import('../../../../eva/vision-scorer.js').catch(() => {
      // Fallback: try absolute path structure
      return import('../../../../../scripts/eva/vision-scorer.js').catch(() => null);
    });

    if (!scoreSD) {
      console.log('   ⚠️  Could not import scoreSD — skipping rescore');
      return;
    }

    console.log('   🔍 Running vision re-score...');
    const rescoreResult = await scoreSD({
      sdKey: originalSdKey,
      supabase,
    });

    if (!rescoreResult || !rescoreResult.totalScore) {
      console.log('   ⚠️  Rescore returned no result — skipping persistence');
      return;
    }

    const newScore = rescoreResult.totalScore;

    // Persist new score with corrective_sd_id link
    const { error: insertErr } = await supabase
      .from('eva_vision_scores')
      .insert({
        sd_id: originalSdKey,
        total_score: newScore,
        threshold_action: rescoreResult.thresholdAction || null,
        dimension_scores: rescoreResult.dimensionScores || null,
        rubric_snapshot: {
          ...(rescoreResult.rubricSnapshot || {}),
          corrective_sd_id: sd.sd_key || sd.id,
          rescore_triggered_by: 'LEAD-FINAL-APPROVAL-HOOK',
        },
        created_by: 'auto-rescore-hook',
        scored_at: new Date().toISOString(),
      });

    if (insertErr) {
      // Try without corrective_sd_id in rubric_snapshot if column missing
      console.log(`   ⚠️  Score persist failed: ${insertErr.message}`);
      return;
    }

    const delta = newScore - previousScore;
    if (delta > 0) {
      console.log(`   ✅ Vision gap closed: ${previousScore} → ${newScore}/100 (+${delta})`);
      console.log(`   📊 SD ${originalSdKey} improved by corrective SD ${sd.sd_key || sd.id}`);
    } else if (delta === 0) {
      console.log(`   ℹ️  Score unchanged: ${newScore}/100 (no improvement detected)`);
    } else {
      console.log(`   ⚠️  Score decreased: ${previousScore} → ${newScore}/100 (${delta})`);
    }
  } catch (rescoreError) {
    // Non-blocking: log and continue
    console.log(`   ⚠️  Auto-rescore failed (non-blocking): ${rescoreError.message}`);
  }
}

export class LeadFinalApprovalExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
  }

  get handoffType() {
    return 'LEAD-FINAL-APPROVAL';
  }

  async setup(sdId, sd, options) {
    // Verify SD is in the correct state for final approval
    if (sd.status !== 'pending_approval') {
      // Allow completed SDs to be re-approved (idempotent)
      if (sd.status === 'completed') {
        console.log('   ℹ️  SD is already completed - will verify and confirm');
        options._alreadyCompleted = true;
      } else {
        return ResultBuilder.rejected(
          'INVALID_STATUS',
          `SD status must be 'pending_approval' for final approval (current: '${sd.status}'). Run PLAN-TO-LEAD handoff first.`,
          { currentStatus: sd.status, requiredStatus: 'pending_approval' }
        );
      }
    }

    // Store SD for use in gates
    options._sd = sd;
    return null;
  }

  getRequiredGates(sd, _options) {
    // Pass SD for SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
    return getRequiredGates(this.supabase, this.prdRepo, sd);
  }

  async executeSpecific(sdId, sd, options, gateResults) {
    // If already completed, just return success
    if (options._alreadyCompleted) {
      console.log('\n✅ SD already completed - verification passed');
      return {
        success: true,
        sdId: sdId,
        message: 'SD already completed - all gates verified',
        alreadyCompleted: true
      };
    }

    console.log('\n📊 STATE TRANSITION: Final Approval');
    console.log('-'.repeat(50));

    // Pre-insert accepted LEAD-FINAL-APPROVAL into leo_handoff_executions BEFORE updating SD.
    // The progress enforcement trigger calls get_progress_breakdown() which checks this table
    // (after migration 20260213_fix_lead_final_progress_check.sql). Without this pre-insert,
    // progress stays at 90% and the trigger blocks the SD update. HandoffRecorder would normally
    // create this record, but it runs AFTER executeSpecific, creating a chicken-and-egg.
    // Note: leo_handoff_executions has no enforce_handoff_system trigger (unlike sd_phase_handoffs).
    const normalizedScore = gateResults.normalizedScore ?? Math.round((gateResults.totalScore / gateResults.totalMaxScore) * 100);
    const { error: preInsertError } = await this.supabase
      .from('leo_handoff_executions')
      .insert({
        sd_id: sd.id,
        handoff_type: 'LEAD-FINAL-APPROVAL',
        from_agent: 'LEAD',
        to_agent: 'LEAD',
        status: 'accepted',
        validation_score: normalizedScore,
        validation_passed: true,
        validation_details: { pre_inserted: true, verifier: 'LeadFinalApprovalExecutor' },
        accepted_at: new Date().toISOString(),
        created_by: 'UNIFIED-HANDOFF-SYSTEM'
      });

    if (preInsertError) {
      console.log(`   ⚠️  Pre-insert into leo_handoff_executions failed: ${preInsertError.message}`);
    } else {
      console.log('   ✅ Pre-inserted LEAD-FINAL-APPROVAL into leo_handoff_executions');
    }

    // Transition SD to completed status
    const { error: sdError } = await this.supabase
      .from('strategic_directives_v2')
      .update({
        status: 'completed',
        current_phase: 'COMPLETED',
        progress_percentage: 100,
        is_working_on: false,
        active_session_id: null,
        completion_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sd.id);

    if (sdError) {
      console.log(`   ❌ Failed to update SD: ${sdError.message}`);
      return ResultBuilder.rejected(
        'SD_UPDATE_FAILED',
        `Failed to update SD to completed: ${sdError.message}`
      );
    }

    console.log('   ✅ SD status transitioned: pending_approval → completed');
    console.log('   ✅ Progress set to 100%');
    console.log('   ✅ is_working_on released (set to false)');
    console.log('   ✅ Completion timestamp recorded');

    try {
      const outcomeResult = await recordSdCompleted({
        supabase: this.supabase,
        sdId: sd.id,
        actor: options.actor || options.executedBy || 'LeadFinalApprovalExecutor',
        completionTime: new Date().toISOString()
      });
      console.log(`   ✅ Outcome loop closure recorded (${outcomeResult.resolvedCount} resolved, ${outcomeResult.backfilledCount} backfilled)`);
    } catch (outcomeError) {
      console.warn(`   ⚠️  Outcome loop closure failed: ${outcomeError.message}`);
    }

    // US-002: Auto-close feedback items linked to this SD
    try {
      const feedbackCloseResult = await this.autoCloseFeedback(sd);
      if (feedbackCloseResult.closedCount > 0) {
        console.log(`   ✅ Auto-closed ${feedbackCloseResult.closedCount} linked feedback item(s)`);
      }
    } catch (feedbackError) {
      console.warn(`   ⚠️  Feedback auto-close failed (non-blocking): ${feedbackError.message}`);
    }

    // Resolve patterns/improvements if this SD was created from /learn
    await resolveLearningItems(sd, this.supabase);

    // SD-MAN-INFRA-VISION-RESCORE-ON-COMPLETION-001: Auto-rescore after corrective SD completion
    // If this SD was created to fix a vision gap (has vision_origin_score_id), re-score the
    // original SD to measure whether the gap was closed.
    await rescoreOriginalSD(sd, this.supabase);

    // Release the session claim
    await releaseSessionClaim(sd, this.supabase);

    // SD-LEO-ENH-AUTO-PROCEED-001-04: Clear AUTO-PROCEED state on SD completion
    // Only clear for top-level SDs; child SDs retain state for continuation
    if (!sd.parent_sd_id) {
      try {
        clearAutoProceedState(true); // Keep resume count history
        console.log('   ✅ AUTO-PROCEED state cleared (top-level SD)');
      } catch (apError) {
        console.warn(`   ⚠️  Could not clear AUTO-PROCEED state: ${apError.message}`);
      }
    } else {
      console.log('   ℹ️  AUTO-PROCEED state retained (child SD - continuation possible)');
    }

    // Check if this SD has a parent that should be auto-completed
    // SD-LEO-ENH-AUTO-PROCEED-001-05: Capture chaining info for orchestrator continuation
    let orchestratorChainingInfo = { orchestratorCompleted: false };
    if (sd.parent_sd_id) {
      orchestratorChainingInfo = await checkAndCompleteParentSD(sd, this.supabase);
    }

    const handoffId = `LEAD-FINAL-${sdId}-${Date.now()}`;

    console.log('\n🎉 SD COMPLETION: Final approval granted');
    console.log(`   SD ID: ${sd.sd_key || sdId}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Handoff ID: ${handoffId}`);

    // Automated Shipping: PR Merge & Branch Cleanup
    let shippingResults = { merge: null, cleanup: null };
    try {
      console.log('\n🚢 [AUTO-SHIP] Merge & Cleanup Decisions');
      console.log('-'.repeat(50));

      const { runFinalApprovalShipping } = await import('../../../shipping/index.js');
      const repoPath = this.determineTargetRepository(sd);

      shippingResults = await runFinalApprovalShipping(
        sd.sd_key || sdId,
        repoPath
      );

      if (shippingResults.merge?.executionResult?.success) {
        console.log('\n   ✅ PR Merged successfully');
      } else if (shippingResults.merge?.shouldEscalate) {
        console.log('\n   ⚠️  PR merge escalated to human - run /ship manually');
      } else if (shippingResults.merge?.executionResult?.deferred) {
        console.log('\n   ⏸️  PR merge deferred - fix issues first');
      }

      if (shippingResults.cleanup?.executionResult?.success) {
        console.log(`   ✅ Branch ${shippingResults.cleanup.executionResult.branchDeleted} deleted`);
      } else if (shippingResults.cleanup?.shouldEscalate) {
        console.log('   ⚠️  Branch cleanup escalated to human');
      }
    } catch (shippingError) {
      console.warn(`   ⚠️  Auto-shipping error (non-blocking): ${shippingError.message}`);
    }

    // SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001: Cleanup worktree on SD completion
    let worktreeCleanupResult = null;
    const sdKey = sd.sd_key || sdId;
    try {
      validateSdKey(sdKey);
      console.log('\n🌲 Worktree Cleanup');
      console.log('-'.repeat(50));
      worktreeCleanupResult = cleanupWorktree(sdKey);
      if (worktreeCleanupResult.cleaned) {
        console.log(`   ✅ Worktree .worktrees/${sdKey} removed`);
      } else if (worktreeCleanupResult.reason === 'worktree_not_found') {
        console.log(`   ℹ️  No worktree found for ${sdKey} (may not have been created)`);
      } else if (worktreeCleanupResult.reason === 'dirty_worktree') {
        console.warn('   ⚠️  Worktree has uncommitted changes — run /ship first, then re-run LEAD-FINAL-APPROVAL');
      } else {
        console.warn(`   ⚠️  Worktree cleanup incomplete: ${worktreeCleanupResult.reason}`);
      }
    } catch (worktreeError) {
      console.warn(`   ⚠️  Worktree cleanup failed (non-blocking): ${worktreeError.message}`);
    }

    return {
      success: true,
      sdId: sdId,
      handoffId: handoffId,
      message: 'SD completed successfully',
      automated_shipping: {
        merge: shippingResults.merge ? {
          decision: shippingResults.merge.decision,
          confidence: shippingResults.merge.confidence,
          merged: shippingResults.merge.executionResult?.merged,
          escalated: shippingResults.merge.shouldEscalate
        } : null,
        cleanup: shippingResults.cleanup ? {
          decision: shippingResults.cleanup.decision,
          confidence: shippingResults.cleanup.confidence,
          branch_deleted: shippingResults.cleanup.executionResult?.branchDeleted,
          escalated: shippingResults.cleanup.shouldEscalate
        } : null
      },
      worktree_cleanup: worktreeCleanupResult,
      qualityScore: gateResults.normalizedScore ?? Math.round((gateResults.totalScore / gateResults.totalMaxScore) * 100),
      // SD-LEO-ENH-AUTO-PROCEED-001-05: Orchestrator chaining info
      orchestratorChaining: orchestratorChainingInfo.orchestratorCompleted ? {
        orchestratorCompleted: true,
        chainContinue: orchestratorChainingInfo.chainContinue || false,
        nextOrchestrator: orchestratorChainingInfo.nextOrchestrator || null,
        nextOrchestratorSdKey: orchestratorChainingInfo.nextOrchestratorSdKey || null
      } : null
    };
  }

  /**
   * Auto-close feedback items linked to this SD (US-002)
   * Queries feedback table for items with matching strategic_directive_id
   * or resolution_sd_id, and transitions them to 'resolved'.
   */
  async autoCloseFeedback(sd) {
    const sdId = sd.id;
    const now = new Date().toISOString();

    // Find feedback items linked to this SD that aren't already terminal
    const { data: linkedFeedback, error: queryError } = await this.supabase
      .from('feedback')
      .select('id, status, strategic_directive_id, resolution_sd_id')
      .or(`strategic_directive_id.eq.${sdId},resolution_sd_id.eq.${sdId}`)
      .not('status', 'in', '(resolved,wont_fix,shipped,duplicate,invalid)');

    if (queryError) {
      throw new Error(`Failed to query linked feedback: ${queryError.message}`);
    }

    if (!linkedFeedback || linkedFeedback.length === 0) {
      return { closedCount: 0 };
    }

    const feedbackIds = linkedFeedback.map(f => f.id);

    const { data: updated, error: updateError } = await this.supabase
      .from('feedback')
      .update({
        status: 'resolved',
        resolved_at: now,
        resolution_notes: `Auto-resolved: linked SD ${sd.sd_key || sdId} completed via LEAD-FINAL-APPROVAL`,
        updated_at: now
      })
      .in('id', feedbackIds)
      .select('id');

    if (updateError) {
      throw new Error(`Failed to auto-close feedback: ${updateError.message}`);
    }

    return { closedCount: updated?.length || 0 };
  }

  getRemediation(gateName) {
    return getRemediation(gateName);
  }
}

// Re-exports for external use
export { getRequiredGates } from './gates.js';
export {
  checkAndCompleteParentSD,
  recordFailedCompletion,
  resolveLearningItems,
  releaseSessionClaim
} from './helpers.js';
export { getRemediation, REMEDIATIONS } from './remediations.js';

export default LeadFinalApprovalExecutor;
