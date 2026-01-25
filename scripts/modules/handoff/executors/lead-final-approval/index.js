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

  getRequiredGates(_sd, _options) {
    return getRequiredGates(this.supabase, this.prdRepo);
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

    // Resolve patterns/improvements if this SD was created from /learn
    await resolveLearningItems(sd, this.supabase);

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
    if (sd.parent_sd_id) {
      await checkAndCompleteParentSD(sd, this.supabase);
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
      qualityScore: gateResults.normalizedScore ?? Math.round((gateResults.totalScore / gateResults.totalMaxScore) * 100)
    };
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
