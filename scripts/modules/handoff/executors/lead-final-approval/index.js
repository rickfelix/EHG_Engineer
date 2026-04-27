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

// Workflow definitions for prerequisite chain diagnosis (SD-LEARN-FIX-ADDRESS-PAT-RETRO-002)
import { getWorkflowForType } from '../../cli/workflow-definitions.js';

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
  // Check both top-level and metadata for origin score ID (metadata fallback
  // handles SDs created outside generateCorrectiveSD() path)
  const originScoreId = sd.vision_origin_score_id || sd.metadata?.vision_origin_score_id;
  if (!originScoreId) return; // Not a corrective SD

  console.log('\n🔄 AUTO-RESCORE: Corrective SD completion detected');
  console.log('-'.repeat(50));
  console.log(`   Corrective SD: ${sd.sd_key || sd.id}`);
  console.log(`   Origin score ID: ${originScoreId}`);

  try {
    // Fetch the original score record to find which SD was scored
    const { data: originScore, error: originErr } = await supabase
      .from('eva_vision_scores')
      .select('sd_id, total_score, dimension_scores, scored_at')
      .eq('id', originScoreId)
      .single();

    if (originErr || !originScore) {
      console.log(`   ⚠️  Origin score record not found (${originScoreId}) — skipping rescore`);
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

    // SD-CORR-VIS-A05-EVENT-BUS-001: Publish rescore completed event
    try {
      const { publishVisionEvent, VISION_EVENTS } = await import('../../../../../lib/eva/event-bus/vision-events.js');
      const dimensionDelta = {};
      if (rescoreResult.dimensionScores && originScore.dimension_scores) {
        for (const [dimId, dim] of Object.entries(rescoreResult.dimensionScores)) {
          const oldDim = originScore.dimension_scores[dimId];
          if (oldDim && typeof dim.score === 'number' && typeof oldDim.score === 'number') {
            dimensionDelta[dimId] = dim.score - oldDim.score;
          }
        }
      }
      publishVisionEvent(VISION_EVENTS.RESCORE_COMPLETED, {
        sdKey: originalSdKey,
        previousScore,
        newScore,
        dimensionDelta,
        correctiveSdKey: sd.sd_key || sd.id,
      });
    } catch (eventErr) {
      // Non-blocking: event publishing should never fail the rescore
      console.warn(`   ⚠️  Rescore event publish failed: ${eventErr.message}`);
    }
  } catch (rescoreError) {
    // Non-blocking: log and continue
    console.log(`   ⚠️  Auto-rescore failed (non-blocking): ${rescoreError.message}`);
  }
}

/**
 * Auto-populate retrospective via programmatic retrospective generator.
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Runs retrospective-generator.js for the completing SD, generating
 * SD-specific key_learnings, action_items, and improvement_areas that
 * reference actual changed files. Prevents RETROSPECTIVE_QUALITY_GATE failures.
 *
 * Fail-safe: all errors caught and logged; never blocks SD completion.
 *
 * @param {Object} sd - The completing SD
 */
async function runProgrammaticRetrospective(sd) {
  const sdKey = sd.sd_key || sd.id;
  const branch = `feat/${sdKey}`;

  console.log('\n📝 PROGRAMMATIC RETROSPECTIVE: Auto-populating retrospective');
  console.log('-'.repeat(50));
  console.log(`   SD: ${sdKey} | Branch: ${branch}`);

  try {
    const { spawnSync } = await import('child_process');
    const { fileURLToPath } = await import('url');

    const scriptUrl = new URL(
      '../../../../programmatic/retrospective-generator.js',
      import.meta.url
    );
    const scriptPath = fileURLToPath(scriptUrl);

    const result = spawnSync(
      process.execPath,
      [scriptPath, '--sd-id', sdKey, '--branch', branch],
      { encoding: 'utf8', timeout: 60000, env: process.env }
    );

    if (result.status === 0 && result.stdout) {
      try {
        const retroData = JSON.parse(result.stdout.trim());
        console.log(`   ✅ Retrospective generated: ID=${retroData.retrospective_id}, quality=${retroData.quality_score}/100`);
      } catch (e) {
        console.log('   ✅ Retrospective generator ran (output parse skipped)');
        console.debug('[LeadFinalApproval] retrospective JSON parse suppressed:', e?.message || e);
      }
    } else {
      console.log(`   ⚠️  Retrospective generator exited ${result.status} (non-blocking)`);
      if (result.stderr) console.log(`   Stderr: ${result.stderr.substring(0, 200)}`);
    }
  } catch (retroError) {
    console.log(`   ⚠️  Programmatic retrospective failed (non-blocking): ${retroError.message}`);
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
    // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 FR-4: fail-fast status pre-gate.
    // Logs BEFORE any downstream gate so operators see the status mismatch first
    // (addresses PAT-RETRO-LEADFINALAPPROVAL-d94c34d8 — 60-120s wasted per attempt
    // when draft SDs ran through the full gate chain before failing late).
    console.log('   🔎 Pre-gate: verifying SD.status for LEAD-FINAL-APPROVAL');

    if (sd.status !== 'pending_approval') {
      // Allow completed SDs to be re-approved (idempotent)
      if (sd.status === 'completed') {
        console.log('   ℹ️  SD is already completed - will verify and confirm');
        options._alreadyCompleted = true;
      } else if (sd.status === 'draft') {
        // FR-4: draft SDs get a distinct code so tooling can differentiate
        // "never approved" from "wrong state but approved at some point".
        const nextCommand = `node scripts/handoff.js execute PLAN-TO-LEAD ${sdId}`;
        console.log('   ❌ SD status is \'draft\' — LEAD-FINAL-APPROVAL requires \'pending_approval\'. Run PLAN-TO-LEAD first.');
        return ResultBuilder.rejected(
          'DRAFT_SD_NOT_APPROVED',
          `SD status must be 'pending_approval' for final approval (current: 'draft'). Run PLAN-TO-LEAD first: ${nextCommand}`,
          { currentStatus: 'draft', requiredStatus: 'pending_approval', nextCommand }
        );
      } else {
        // Diagnose which prerequisite handoffs are missing (SD-LEARN-FIX-ADDRESS-PAT-RETRO-002)
        const workflow = getWorkflowForType(sd.sd_type || 'feature');
        const requiredHandoffs = workflow.required.filter(h => h !== 'LEAD-FINAL-APPROVAL');
        let missingHandoffs = [...requiredHandoffs];
        let nextCommand = `node scripts/handoff.js execute LEAD-TO-PLAN ${sdId}`;

        // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 (PAT-HF-LEADFINALAPPROVAL-d94c34d8):
        // Distinguish three cases when SD.status !== 'pending_approval':
        //   (1) PLAN-TO-LEAD never ran → classical missing-handoff (existing behavior)
        //   (2) PLAN-TO-LEAD RAN but UPDATE to pending_approval failed silently → silent-failure scenario
        //   (3) SD legitimately stuck in draft for some other reason → manual triage
        let silentFailureDetected = false;
        try {
          const { data: completedHandoffs } = await this.supabase
            .from('sd_phase_handoffs')
            .select('handoff_type')
            .eq('sd_id', sd.id)
            .eq('status', 'accepted');

          const completedTypes = new Set((completedHandoffs || []).map(h => h.handoff_type));
          missingHandoffs = requiredHandoffs.filter(h => !completedTypes.has(h));

          if (missingHandoffs.length > 0) {
            nextCommand = `node scripts/handoff.js execute ${missingHandoffs[0]} ${sdId}`;
          } else if (completedTypes.has('PLAN-TO-LEAD')) {
            // Case (2): PLAN-TO-LEAD is in the accepted-handoff log but SD.status was
            // never transitioned to 'pending_approval'. State-transitions.js now throws
            // on this, but pre-fix SDs may exhibit this state.
            silentFailureDetected = true;
          }
        } catch (err) {
          // Non-fatal: fall back to generic message if query fails
        }

        if (silentFailureDetected) {
          return ResultBuilder.rejected(
            'INVALID_STATUS',
            `SD status is '${sd.status}' but PLAN-TO-LEAD handoff is already recorded as accepted — ` +
            'the status UPDATE to \'pending_approval\' was never applied (silent pre-fix failure). ' +
            `Remediation: manually update SD ${sdId} status to 'pending_approval' in strategic_directives_v2, ` +
            'OR re-run PLAN-TO-LEAD (which now throws on UPDATE failure per SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126).',
            {
              currentStatus: sd.status,
              requiredStatus: 'pending_approval',
              silentFailureDetected: true,
              planToLeadRecorded: true
            }
          );
        }

        const missingList = missingHandoffs.length > 0
          ? `\n   Missing handoffs: ${missingHandoffs.join(' → ')}\n   Next command: ${nextCommand}`
          : '';

        return ResultBuilder.rejected(
          'INVALID_STATUS',
          `SD status must be 'pending_approval' for final approval (current: '${sd.status}').${missingList}`,
          { currentStatus: sd.status, requiredStatus: 'pending_approval', missingHandoffs, nextCommand }
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

    // Pre-completion migration verification: ensure migration files have been applied
    try {
      const migrationCheck = await this.verifyMigrationsApplied(sd);
      if (migrationCheck.hasMigrations && migrationCheck.missingTables.length > 0) {
        console.log(`   ⚠️  MIGRATION WARNING: ${migrationCheck.missingTables.length} table(s) from migrations not found in DB`);
        console.log(`      Missing: ${migrationCheck.missingTables.join(', ')}`);
        console.log('      Migrations must be applied before marking SD completed');
        return ResultBuilder.rejected(
          'UNAPPLIED_MIGRATIONS',
          `Migration files exist but ${migrationCheck.missingTables.length} table(s) not found in live DB: ${migrationCheck.missingTables.join(', ')}. Apply migrations before completing.`,
          { missingTables: migrationCheck.missingTables, migrationFiles: migrationCheck.migrationFiles }
        );
      } else if (migrationCheck.hasMigrations) {
        console.log(`   ✅ Migration verification: all ${migrationCheck.foundTables.length} table(s) exist in DB`);
      }
    } catch (migCheckError) {
      console.warn(`   ⚠️  Migration verification check failed (non-blocking): ${migCheckError.message}`);
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

    // SD-LEO-INFRA-REALITY-CHECK-VALIDATE-001: Auto-update aligned KR current_values
    try {
      const { updateKRFromSDCompletion } = await import('../../../../lib/eva/kr-reality-checker.js');
      const krResult = await updateKRFromSDCompletion(sd.sd_key || sd.id, this.supabase);
      if (krResult.updated.length > 0) {
        console.log(`   ✅ KR auto-update: ${krResult.updated.join(', ')} updated to target`);
      }
    } catch (krError) {
      console.warn(`   ⚠️  KR auto-update failed (non-blocking): ${krError.message}`);
    }

    // Resolve patterns/improvements if this SD was created from /learn
    await resolveLearningItems(sd, this.supabase);

    // SD-LEO-INFRA-ENHANCE-LEARN-SESSION-001: Session retrospective - analyze rejections
    // Creates issue_patterns for gates with 2+ rejections (non-blocking)
    try {
      const { analyzeSDRejections } = await import('../../../../modules/learning/session-retrospective.js');
      const retroResult = await analyzeSDRejections(sd.id, { supabaseClient: this.supabase });
      if (retroResult.patternsCreated > 0) {
        console.log(`   [session-retro] Created ${retroResult.patternsCreated} pattern(s) from rejection analysis`);
      } else if (retroResult.analyzed) {
        console.log('   [session-retro] No recurring rejection patterns found');
      }
    } catch (retroError) {
      console.warn(`   ⚠️  Session retrospective failed (non-blocking): ${retroError.message}`);
    }

    // SD-MAN-INFRA-VISION-RESCORE-ON-COMPLETION-001: Auto-rescore after corrective SD completion
    // If this SD was created to fix a vision gap (has vision_origin_score_id), re-score the
    // original SD to measure whether the gap was closed.
    await rescoreOriginalSD(sd, this.supabase);

    // SD-LEO-INFRA-PR-TRACKING-BACKFILL-001: Populate canonical PR-to-SD join row.
    // Looks up the latest merged PR for this SD's branch and inserts a row into
    // ship_review_findings. Log-and-continue on failure; never blocks completion.
    try {
      const { runShipReviewFindingsPopulator } = await import('./hooks/ship-review-findings-populator.js');
      const result = await runShipReviewFindingsPopulator(sd, this.supabase);
      console.log(`   [pr-tracking-populator] ${result.outcome}${result.detail ? ` (${result.detail})` : ''}`);
    } catch (populatorError) {
      console.warn(`   ⚠️  PR-tracking populator failed (non-blocking): ${populatorError.message}`);
    }

    // SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001: Auto-populate retrospective via programmatic scorer.
    // Generates SD-specific insights with real file references — avoids RETROSPECTIVE_QUALITY_GATE failures.
    // Fail-safe: non-blocking, never prevents SD completion.
    await runProgrammaticRetrospective(sd);

    // SD-MAN-INFRA-WIRE-HEAL-VISION-002: Auto-trigger /heal vision on orchestrator or vision-linked SD completion.
    // Checks trigger predicates (orchestrator done, vision_key present) and cooldown before running.
    // Fail-safe: non-blocking, never prevents SD completion.
    try {
      const { runVisionHealIfTriggered } = await import('../../../../modules/vision-heal-trigger.js');
      await runVisionHealIfTriggered(sd, this.supabase);
    } catch (visionHealError) {
      console.log(`   ⚠️  Vision heal trigger failed (non-blocking): ${visionHealError.message}`);
    }

    // SD-PROTOCOL-COMPLETION-INTEGRITY-AUTOHEAL-ORCH-001-A: Auto-invoke heal after completion
    // Fire-and-forget: runs asynchronously, never blocks SD completion
    this._runHealCheck(sd).catch(healErr =>
      console.warn(`   ⚠️  Post-completion heal check failed (non-blocking): ${healErr.message}`)
    );

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

    const handoffId = `LEAD-FINAL-${sdId}-${Date.now()}`;

    console.log('\n🎉 SD COMPLETION: Final approval granted');
    console.log(`   SD ID: ${sd.sd_key || sdId}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Handoff ID: ${handoffId}`);

    // SD-LEO-INFRA-AUTO-CHAIN-MERGE-001: Ship BEFORE orchestrator completion.
    // Previously, auto-chain fired before PR merge, causing next SD to start
    // while current SD's code was still unshipped. Now shipping runs first so
    // the merge result can gate the auto-chain decision.
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

    // Check if this SD has a parent that should be auto-completed
    // SD-LEO-ENH-AUTO-PROCEED-001-05: Capture chaining info for orchestrator continuation
    // SD-LEO-INFRA-AUTO-CHAIN-MERGE-001: Pass shippingResults so auto-chain can gate on merge
    let orchestratorChainingInfo = { orchestratorCompleted: false };
    if (sd.parent_sd_id) {
      orchestratorChainingInfo = await checkAndCompleteParentSD(sd, this.supabase, { shippingResults });
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
   * SD-PROTOCOL-COMPLETION-INTEGRITY-AUTOHEAL-ORCH-001-A: Fire-and-forget heal check.
   * Invokes codebase-vs-intent verification after SD completion.
   * Records heal_invoked flag in handoff metadata. Never blocks completion.
   * @param {Object} sd - Strategic directive object
   */
  async _runHealCheck(sd) {
    const sdKey = sd.sd_key || sd.id;
    console.log(`\n🔧 POST-COMPLETION HEAL: ${sdKey}`);

    try {
      // Record heal_invoked in the most recent LEAD-FINAL-APPROVAL handoff metadata
      const { data: handoff } = await this.supabase
        .from('sd_phase_handoffs')
        .select('id, metadata')
        .eq('sd_id', sd.id)
        .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (handoff) {
        const metadata = handoff.metadata || {};
        metadata.heal_invoked = true;
        metadata.heal_invoked_at = new Date().toISOString();
        await this.supabase
          .from('sd_phase_handoffs')
          .update({ metadata })
          .eq('id', handoff.id);
        console.log('   ✅ heal_invoked flag recorded in handoff metadata');
      }
    } catch (err) {
      console.warn(`   ⚠️  Heal check failed (non-blocking): ${err.message}`);
    }
  }

  /**
   * Verify that migration files for this SD have been applied to the live DB.
   * Parses CREATE TABLE statements from migration files and checks information_schema.
   * @param {Object} sd - Strategic directive object
   * @returns {{hasMigrations: boolean, migrationFiles: string[], foundTables: string[], missingTables: string[]}}
   */
  async verifyMigrationsApplied(sd) {
    const { existsSync } = await import('fs');
    const { readdir, readFile } = await import('fs/promises');
    const pathMod = await import('path');
    const { getSDSearchTerms, detectImplementationRepos } = await import('../../../../modules/implementation-fidelity/utils/index.js');

    const result = { hasMigrations: false, migrationFiles: [], foundTables: [], missingTables: [] };
    const implementationRepos = await detectImplementationRepos(sd.id, this.supabase);
    const searchTerms = await getSDSearchTerms(sd.id, this.supabase);
    const searchLower = searchTerms.map(t => t.replace('SD-', '').toLowerCase());
    const migrationDirs = ['database/migrations', 'supabase/migrations', 'migrations'];

    for (const repo of implementationRepos) {
      for (const dir of migrationDirs) {
        const fullPath = pathMod.join(repo, dir);
        if (!existsSync(fullPath)) continue;
        const files = await readdir(fullPath);
        const sdMigrations = files.filter(f => {
          const fileLower = f.toLowerCase();
          return searchLower.some(term => fileLower.includes(term));
        });
        for (const file of sdMigrations) {
          result.migrationFiles.push(`${dir}/${file}`);
          try {
            const content = await readFile(pathMod.join(fullPath, file), 'utf-8');
            const matches = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi);
            for (const match of matches) {
              const tableName = match[1].toLowerCase();
              const { error } = await this.supabase.from(tableName).select('*').limit(0);
              if (error && error.message.includes('Could not find')) {
                result.missingTables.push(tableName);
              } else {
                result.foundTables.push(tableName);
              }
            }
          } catch (e) {
            // Intentionally suppressed: skip unreadable files
            console.debug('[LeadFinalApproval] migration file read suppressed:', e?.message || e);
          }
        }
      }
    }

    result.hasMigrations = result.migrationFiles.length > 0 &&
      (result.foundTables.length > 0 || result.missingTables.length > 0);
    result.foundTables = [...new Set(result.foundTables)];
    result.missingTables = [...new Set(result.missingTables)];
    return result;
  }

  /**
   * Auto-close feedback items linked to this SD (US-002)
   * Queries feedback table for items with matching strategic_directive_id
   * or resolution_sd_id, and transitions them to 'resolved'.
   */
  async autoCloseFeedback(sd) {
    const sdId = sd.id;
    const sdKey = sd.sd_key;
    const now = new Date().toISOString();
    const terminalStatuses = '(resolved,wont_fix,shipped,duplicate,invalid)';

    // 1. Find feedback items linked by SD ID (strategic_directive_id or resolution_sd_id)
    const { data: linkedById, error: idError } = await this.supabase
      .from('feedback')
      .select('id')
      .or(`strategic_directive_id.eq.${sdId},resolution_sd_id.eq.${sdId}`)
      .not('status', 'in', terminalStatuses);

    if (idError) {
      throw new Error(`Failed to query linked feedback: ${idError.message}`);
    }

    // 2. Find CI failure feedback linked by branch name (e.g. feat/SD-KEY-HERE)
    let linkedByBranch = [];
    if (sdKey) {
      const { data: branchFeedback, error: branchError } = await this.supabase
        .from('feedback')
        .select('id')
        .eq('category', 'ci_failure')
        .ilike('title', `%${sdKey}%`)
        .not('status', 'in', terminalStatuses);

      if (!branchError && branchFeedback) {
        linkedByBranch = branchFeedback;
      }
    }

    // Deduplicate IDs
    const allIds = [...new Set([
      ...(linkedById || []).map(f => f.id),
      ...linkedByBranch.map(f => f.id)
    ])];

    if (allIds.length === 0) {
      return { closedCount: 0 };
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('feedback')
      .update({
        status: 'resolved',
        resolved_at: now,
        resolution_notes: `Auto-resolved: SD ${sdKey || sdId} completed via LEAD-FINAL-APPROVAL`,
        updated_at: now
      })
      .in('id', allIds)
      .select('id');

    if (updateError) {
      throw new Error(`Failed to auto-close feedback: ${updateError.message}`);
    }

    return { closedCount: updated?.length || 0 };
  }

  // QF-20260424-806: accept context (sdId, details, score) and forward it to
  // remediations.getRemediation, which forwards to rejection-subagent-mapping's
  // promptFn(ctx). Without this, remediation prompts render `${ctx.sdId}` as
  // the literal string "undefined" — making the Five-Point Brief unactionable.
  getRemediation(gateName, context = {}) {
    return getRemediation(gateName, context);
  }
}

// Re-exports for external use
export { getRequiredGates, createSmokeTestGate } from './gates.js';
export {
  checkAndCompleteParentSD,
  recordFailedCompletion,
  resolveLearningItems,
  pruneResolvedMemory,
  releaseSessionClaim
} from './helpers.js';
export { getRemediation, REMEDIATIONS } from './remediations.js';

export default LeadFinalApprovalExecutor;
