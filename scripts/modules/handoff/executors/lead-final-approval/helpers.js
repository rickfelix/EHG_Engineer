/**
 * Helper Methods Domain
 * Utility functions for LEAD-FINAL-APPROVAL executor
 *
 * @module lead-final-approval/helpers
 */

import { executeOrchestratorCompletionHook } from '../../orchestrator-completion-hook.js';

/**
 * Check and complete parent SD when all children are done
 *
 * PATTERN FIX: PAT-ORCH-AUTOCOMP-001
 * Uses OrchestratorCompletionGuardian to ensure all artifacts exist
 * before attempting completion (prevents silent failures)
 *
 * Returns chaining information if orchestrator chaining is enabled
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-05 (Configurable Orchestrator Chaining)
 *
 * @param {Object} sd - SD record
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{ orchestratorCompleted: boolean, chainContinue?: boolean, nextOrchestrator?: string }>}
 */
export async function checkAndCompleteParentSD(sd, supabase) {
  console.log('\n   Checking parent SD completion...');

  // Default return for non-completion cases
  const noCompletionResult = { orchestratorCompleted: false };

  try {
    const { data: parentSD } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, sd_type')
      .eq('id', sd.parent_sd_id)
      .single();

    if (!parentSD || parentSD.status === 'completed') {
      return noCompletionResult;
    }

    // Get all siblings
    const { data: siblings } = await supabase
      .from('strategic_directives_v2')
      .select('id, status')
      .eq('parent_sd_id', sd.parent_sd_id);

    const allComplete = siblings.every(s => s.status === 'completed');

    if (allComplete) {
      console.log(`   🎉 All ${siblings.length} children completed - initiating parent completion`);

      // Use OrchestratorCompletionGuardian for intelligent completion
      try {
        const { OrchestratorCompletionGuardian } = await import('../../orchestrator-completion-guardian.js');
        const guardian = new OrchestratorCompletionGuardian(parentSD.id);

        const report = await guardian.validate();

        if (report.canComplete) {
          const result = await guardian.complete();
          if (result.success) {
            console.log(`   ✅ Parent SD "${parentSD.title}" completed via Guardian`);

            // SD-LEO-ENH-AUTO-PROCEED-001-03: Trigger orchestrator completion hook
            // SD-LEO-ENH-AUTO-PROCEED-001-05: Returns chaining info if enabled
            const hookResult = await executeOrchestratorCompletionHook(
              parentSD.id,
              parentSD.title,
              siblings.length,
              { supabase }
            );

            return {
              orchestratorCompleted: true,
              chainContinue: hookResult?.chainContinue || false,
              nextOrchestrator: hookResult?.nextOrchestrator || null,
              nextOrchestratorSdKey: hookResult?.nextOrchestratorSdKey || null
            };
          } else {
            console.log(`   ⚠️  Guardian completion failed: ${result.error}`);
            await recordFailedCompletion(parentSD, result.error, null, supabase);
          }
        } else if (report.canAutoComplete) {
          console.log(`   🔧 Auto-creating ${report.missingArtifacts.length} missing artifact(s)...`);
          await guardian.autoCreateArtifacts();

          const result = await guardian.complete();
          if (result.success) {
            console.log(`   ✅ Parent SD "${parentSD.title}" completed (with auto-created artifacts)`);

            // SD-LEO-ENH-AUTO-PROCEED-001-03: Trigger orchestrator completion hook
            // SD-LEO-ENH-AUTO-PROCEED-001-05: Returns chaining info if enabled
            const hookResult = await executeOrchestratorCompletionHook(
              parentSD.id,
              parentSD.title,
              siblings.length,
              { supabase }
            );

            return {
              orchestratorCompleted: true,
              chainContinue: hookResult?.chainContinue || false,
              nextOrchestrator: hookResult?.nextOrchestrator || null,
              nextOrchestratorSdKey: hookResult?.nextOrchestratorSdKey || null
            };
          } else {
            console.log(`   ⚠️  Completion failed after auto-fix: ${result.error}`);
            await recordFailedCompletion(parentSD, result.error, null, supabase);
          }
        } else {
          console.log('   ⚠️  Cannot auto-complete parent - manual intervention required');
          const failedChecks = report.results.filter(r => !r.passed);
          failedChecks.forEach(check => {
            console.log(`      ❌ ${check.check}: ${check.message}`);
          });
          await recordFailedCompletion(parentSD, 'Manual intervention required', report, supabase);
        }
      } catch (guardianError) {
        console.log(`   ⚠️  Guardian unavailable: ${guardianError.message}`);
        console.log('   📝 Attempting legacy completion (may fail if artifacts missing)...');

        const { error } = await supabase
          .from('strategic_directives_v2')
          .update({
            status: 'completed',
            progress_percentage: 100,
            current_phase: 'COMPLETED',
            updated_at: new Date().toISOString()
          })
          .eq('id', parentSD.id);

        if (error) {
          console.log(`   ❌ Legacy completion FAILED: ${error.message}`);
          console.log(`   💡 Run: node scripts/modules/orchestrator-completion-guardian.js ${parentSD.id} --auto-fix --complete`);
          await recordFailedCompletion(parentSD, error.message, null, supabase);
        } else {
          console.log(`   ✅ Parent SD "${parentSD.title}" auto-completed (legacy path)`);

          // SD-LEO-ENH-AUTO-PROCEED-001-03: Trigger orchestrator completion hook
          // SD-LEO-ENH-AUTO-PROCEED-001-05: Returns chaining info if enabled
          const hookResult = await executeOrchestratorCompletionHook(
            parentSD.id,
            parentSD.title,
            siblings.length,
            { supabase }
          );

          return {
            orchestratorCompleted: true,
            chainContinue: hookResult?.chainContinue || false,
            nextOrchestrator: hookResult?.nextOrchestrator || null,
            nextOrchestratorSdKey: hookResult?.nextOrchestratorSdKey || null
          };
        }
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Parent check error: ${error.message}`);
  }

  return noCompletionResult;
}

/**
 * Record failed completion attempt for investigation and pattern learning
 * @param {Object} parentSD - Parent SD record
 * @param {string} errorMessage - Error message
 * @param {Object|null} report - Validation report (optional)
 * @param {Object} supabase - Supabase client
 */
export async function recordFailedCompletion(parentSD, errorMessage, report = null, supabase) {
  try {
    await supabase
      .from('system_events')
      .insert({
        event_type: 'ORCHESTRATOR_COMPLETION_FAILED',
        entity_type: 'strategic_directive',
        entity_id: parentSD.id,
        details: {
          sd_id: parentSD.id,
          title: parentSD.title,
          error: errorMessage,
          validation_report: report,
          timestamp: new Date().toISOString(),
          remediation: `node scripts/modules/orchestrator-completion-guardian.js ${parentSD.id} --auto-fix --complete`
        },
        severity: 'warning',
        created_by: 'LEAD-FINAL-APPROVAL-EXECUTOR'
      });
  } catch (_e) {
    // Silent fail for logging - don't break the flow
  }
}

/**
 * Resolve patterns and improvements that were assigned to this SD via /learn
 * This completes the /learn → SD → implementation → resolution cycle
 * @param {Object} sd - SD record
 * @param {Object} supabase - Supabase client
 */
export async function resolveLearningItems(sd, supabase) {
  try {
    const metadata = sd.metadata || {};
    if (metadata.source !== 'learn_command') {
      return; // Not a /learn-created SD
    }

    console.log('\n   📚 Resolving /learn items...');

    const sdId = sd.sd_key || sd.id;
    const now = new Date().toISOString();

    // Resolve assigned patterns
    const { data: patterns, error: patternQueryError } = await supabase
      .from('issue_patterns')
      .select('pattern_id, status')
      .eq('assigned_sd_id', sdId)
      .eq('status', 'assigned');

    if (!patternQueryError && patterns && patterns.length > 0) {
      const { error: patternUpdateError } = await supabase
        .from('issue_patterns')
        .update({
          status: 'resolved',
          resolution_date: now,
          resolution_notes: `Resolved by ${sdId} via /learn workflow`
        })
        .eq('assigned_sd_id', sdId)
        .eq('status', 'assigned');

      if (!patternUpdateError) {
        console.log(`   ✅ Resolved ${patterns.length} pattern(s)`);
      } else {
        console.log(`   ⚠️  Pattern resolution error: ${patternUpdateError.message}`);
      }
    }

    // Resolve assigned improvements
    const { data: improvements, error: impQueryError } = await supabase
      .from('protocol_improvement_queue')
      .select('id, status')
      .eq('assigned_sd_id', sdId)
      .eq('status', 'SD_CREATED');

    if (!impQueryError && improvements && improvements.length > 0) {
      const { error: impUpdateError } = await supabase
        .from('protocol_improvement_queue')
        .update({
          status: 'APPLIED',
          applied_at: now
        })
        .eq('assigned_sd_id', sdId)
        .eq('status', 'SD_CREATED');

      if (!impUpdateError) {
        console.log(`   ✅ Applied ${improvements.length} improvement(s)`);
      } else {
        console.log(`   ⚠️  Improvement application error: ${impUpdateError.message}`);
      }
    }

    if ((!patterns || patterns.length === 0) && (!improvements || improvements.length === 0)) {
      console.log('   ℹ️  No pending items to resolve');
    }
  } catch (error) {
    console.log(`   ⚠️  Learning item resolution error: ${error.message}`);
  }
}

/**
 * Release the session claim when SD is completed
 * SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001: Also stops heartbeat interval
 * @param {Object} sd - SD record
 * @param {Object} supabase - Supabase client
 */
export async function releaseSessionClaim(sd, supabase) {
  try {
    const sessionManager = await import('../../../../../lib/session-manager.mjs');
    // FR-5: Import heartbeat manager to stop heartbeat on release
    const heartbeatManager = await import('../../../../../lib/heartbeat-manager.mjs');

    const session = await sessionManager.getOrCreateSession();

    if (!session) {
      console.log('   [Release] No session to release');
      return;
    }

    const claimId = sd.sd_key || sd.id;

    if (session.sd_id === claimId) {
      const { error } = await supabase.rpc('release_sd', {
        p_session_id: session.session_id,
        p_release_reason: 'completed'
      });

      if (error) {
        console.log(`   [Release] Warning: Could not release claim: ${error.message}`);
      } else {
        console.log('   [Release] ✅ Session claim released');
      }

      // FR-5: Stop heartbeat interval on SD completion
      const heartbeatStatus = heartbeatManager.isHeartbeatActive();
      if (heartbeatStatus.active && heartbeatStatus.sessionId === session.session_id) {
        heartbeatManager.stopHeartbeat();
        console.log('   [Release] Heartbeat stopped');
      }
    }
  } catch (error) {
    console.log(`   [Release] Warning: ${error.message}`);
  }
}

export default {
  checkAndCompleteParentSD,
  recordFailedCompletion,
  resolveLearningItems,
  releaseSessionClaim
};
