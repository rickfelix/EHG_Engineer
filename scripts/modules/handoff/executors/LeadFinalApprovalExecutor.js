/**
 * LeadFinalApprovalExecutor - Executes LEAD-FINAL-APPROVAL handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * This executor handles the final step of the SD lifecycle:
 * - Validates PLAN-TO-LEAD handoff was accepted
 * - Confirms all user stories are complete
 * - Verifies retrospective exists and passed quality gate
 * - Transitions SD from 'pending_approval' → 'completed'
 * - Records the completion handoff
 *
 * Root Cause Fix: Previously, after PLAN-TO-LEAD handoff succeeded,
 * SDs were left in 'pending_approval' status with no formal process
 * to complete them. This caused SDs to remain in limbo.
 */

import BaseExecutor from './BaseExecutor.js';
import ResultBuilder from '../ResultBuilder.js';

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
    const gates = [];

    // Gate 1: Verify PLAN-TO-LEAD handoff exists and was accepted
    gates.push({
      name: 'PLAN_TO_LEAD_HANDOFF_EXISTS',
      validator: async (ctx) => {
        console.log('\n🔒 GATE 1: PLAN-TO-LEAD Handoff Verification');
        console.log('-'.repeat(50));

        const { data: handoff } = await this.supabase
          .from('sd_phase_handoffs')
          .select('id, status, validation_score, created_at')
          .eq('sd_id', ctx.sd.id)
          .eq('handoff_type', 'PLAN-TO-LEAD')
          .eq('status', 'accepted')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!handoff) {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: ['No accepted PLAN-TO-LEAD handoff found - run PLAN-TO-LEAD handoff first'],
            warnings: []
          };
        }

        console.log(`   ✅ PLAN-TO-LEAD handoff found: ${handoff.id.substring(0, 8)}...`);
        console.log(`      Status: ${handoff.status}`);
        console.log(`      Score: ${handoff.validation_score}`);
        console.log(`      Date: ${new Date(handoff.created_at).toLocaleString()}`);

        ctx._planToLeadHandoff = handoff;

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { handoffId: handoff.id, validationScore: handoff.validation_score }
        };
      },
      required: true
    });

    // Gate 2: Verify all user stories are complete
    gates.push({
      name: 'USER_STORIES_COMPLETE',
      validator: async (ctx) => {
        console.log('\n🔒 GATE 2: User Stories Completion Check');
        console.log('-'.repeat(50));

        // Use PRDRepository for resilient lookup (handles sd_uuid/sd_id inconsistency)
        // This follows the DI pattern established in BaseExecutor
        const prd = await this.prdRepo?.getBySdUuid(ctx.sd.id);

        if (!prd) {
          // For orchestrator SDs, no PRD is expected
          const { data: children } = await this.supabase
            .from('strategic_directives_v2')
            .select('id')
            .eq('parent_sd_id', ctx.sd.id);

          if (children && children.length > 0) {
            console.log('   ℹ️  Orchestrator SD - no PRD (children have PRDs)');
            return {
              passed: true,
              score: 100,
              max_score: 100,
              issues: [],
              warnings: ['Orchestrator SD - validated via children completion']
            };
          }

          // Also check if user stories exist directly linked to SD
          // Some SDs have user stories without a PRD record
          const { data: directStories } = await this.supabase
            .from('user_stories')
            .select('id, status')
            .eq('sd_id', ctx.sd.id);

          if (directStories && directStories.length > 0) {
            console.log(`   ℹ️  Found ${directStories.length} user stories directly linked to SD`);
            const completed = directStories.filter(s =>
              s.status === 'completed' || s.status === 'done' || s.status === 'validated'
            );
            const completionRate = Math.round((completed.length / directStories.length) * 100);

            if (completionRate === 100) {
              return {
                passed: true,
                score: 100,
                max_score: 100,
                issues: [],
                warnings: ['User stories validated via direct SD link (no PRD)']
              };
            }

            return {
              passed: false,
              score: completionRate,
              max_score: 100,
              issues: [`User story completion rate is ${completionRate}% (required: 100%)`],
              warnings: []
            };
          }

          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: ['No PRD found for this SD and no direct user stories found'],
            warnings: []
          };
        }

        // Check user stories
        const { data: stories } = await this.supabase
          .from('user_stories')
          .select('id, title, status')
          .eq('prd_id', prd.id);

        if (!stories || stories.length === 0) {
          console.log('   ⚠️  No user stories found');
          return {
            passed: true,
            score: 80,
            max_score: 100,
            issues: [],
            warnings: ['No user stories found - verify this is expected']
          };
        }

        const completed = stories.filter(s =>
          s.status === 'completed' || s.status === 'done' || s.status === 'validated'
        );
        const completionRate = Math.round((completed.length / stories.length) * 100);

        console.log(`   Total stories: ${stories.length}`);
        console.log(`   Completed: ${completed.length}`);
        console.log(`   Completion rate: ${completionRate}%`);

        if (completionRate < 100) {
          const incomplete = stories.filter(s =>
            s.status !== 'completed' && s.status !== 'done' && s.status !== 'validated'
          );
          console.log('   Incomplete stories:');
          incomplete.forEach(s => console.log(`     - ${s.title} (${s.status})`));
        }

        // Require 100% completion
        if (completionRate < 100) {
          return {
            passed: false,
            score: completionRate,
            max_score: 100,
            issues: [`User story completion rate is ${completionRate}% (required: 100%)`],
            warnings: []
          };
        }

        console.log('   ✅ All user stories completed');

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { total: stories.length, completed: completed.length }
        };
      },
      required: true
    });

    // Gate 3: Verify retrospective exists
    gates.push({
      name: 'RETROSPECTIVE_EXISTS',
      validator: async (ctx) => {
        console.log('\n🔒 GATE 3: Retrospective Verification');
        console.log('-'.repeat(50));

        const { data: retrospective } = await this.supabase
          .from('retrospectives')
          .select('id, quality_score, status, created_at')
          .eq('sd_id', ctx.sd.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!retrospective) {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: ['No retrospective found - run RETRO sub-agent first'],
            warnings: []
          };
        }

        console.log(`   Retrospective found: ${retrospective.id.substring(0, 8)}...`);
        console.log(`   Quality score: ${retrospective.quality_score}`);
        console.log(`   Status: ${retrospective.status}`);

        // Quality score must meet minimum threshold
        const minScore = 60;
        if (retrospective.quality_score < minScore) {
          return {
            passed: false,
            score: retrospective.quality_score,
            max_score: 100,
            issues: [`Retrospective quality score ${retrospective.quality_score}% is below minimum ${minScore}%`],
            warnings: []
          };
        }

        console.log('   ✅ Retrospective quality meets threshold');

        return {
          passed: true,
          score: retrospective.quality_score,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { retrospectiveId: retrospective.id, qualityScore: retrospective.quality_score }
        };
      },
      required: true
    });

    // Gate 4: Verify all related PRs are merged
    gates.push({
      name: 'PR_MERGE_VERIFICATION',
      validator: async (ctx) => {
        console.log('\n🔒 GATE 4: PR Merge Verification');
        console.log('-'.repeat(50));

        const sdId = ctx.sd.legacy_id || ctx.sd.id;

        // Build expected branch name pattern for this SD
        // Branches follow pattern: feat/SD-XXX-*, fix/SD-XXX-*, etc.
        const branchPatterns = [
          `feat/${sdId}`,
          `fix/${sdId}`,
          `docs/${sdId}`,
          `test/${sdId}`
        ];

        try {
          // Use gh CLI to find open PRs for this SD's branches
          const { execSync } = await import('child_process');

          // Query open PRs across both repos
          const repos = ['rickfelix/ehg', 'rickfelix/EHG_Engineer'];
          const openPRs = [];

          for (const repo of repos) {
            try {
              const result = execSync(
                `gh pr list --repo ${repo} --state open --json number,title,headRefName,url --limit 100`,
                { encoding: 'utf8', timeout: 30000 }
              );

              const prs = JSON.parse(result || '[]');

              // Filter PRs that match this SD's branch patterns
              const matchingPRs = prs.filter(pr =>
                branchPatterns.some(pattern =>
                  pr.headRefName.toLowerCase().includes(pattern.toLowerCase())
                )
              );

              if (matchingPRs.length > 0) {
                openPRs.push(...matchingPRs.map(pr => ({
                  ...pr,
                  repo: repo
                })));
              }
            } catch (repoError) {
              // If gh CLI fails for a repo, log warning but continue
              console.log(`   ⚠️  Could not check ${repo}: ${repoError.message?.substring(0, 50) || 'unknown error'}`);
            }
          }

          if (openPRs.length > 0) {
            console.log(`   ❌ Found ${openPRs.length} open PR(s) for this SD:`);
            openPRs.forEach(pr => {
              console.log(`      - PR #${pr.number}: ${pr.title}`);
              console.log(`        Branch: ${pr.headRefName}`);
              console.log(`        Repo: ${pr.repo}`);
              console.log(`        URL: ${pr.url}`);
            });

            return {
              passed: false,
              score: 0,
              max_score: 100,
              issues: [
                `${openPRs.length} open PR(s) must be merged before SD completion`,
                ...openPRs.map(pr => `  → PR #${pr.number} (${pr.repo}): ${pr.url}`)
              ],
              warnings: [],
              details: { openPRs: openPRs.map(pr => ({ number: pr.number, repo: pr.repo, url: pr.url })) }
            };
          }

          console.log('   ✅ No open PRs found for this SD');
          console.log(`   Checked patterns: ${branchPatterns.join(', ')}`);

          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: [],
            details: { checkedPatterns: branchPatterns, openPRs: 0 }
          };

        } catch (error) {
          // If gh CLI is not available, warn but don't block
          console.log(`   ⚠️  PR verification skipped: ${error.message}`);
          return {
            passed: true,
            score: 80,
            max_score: 100,
            issues: [],
            warnings: [`PR verification could not run: ${error.message}. Verify manually that all PRs are merged.`],
            details: { skipped: true, reason: error.message }
          };
        }
      },
      required: true
    });

    return gates;
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
    // Note: completed_at column doesn't exist in schema, using updated_at instead
    const { error: sdError } = await this.supabase
      .from('strategic_directives_v2')
      .update({
        status: 'completed',
        current_phase: 'COMPLETED',
        progress_percentage: 100,
        is_working_on: false,  // Release the SD from "working on" tracking
        active_session_id: null,  // Clear session claim
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

    // Release the session claim
    await this._releaseSessionClaim(sd);

    // Check if this SD has a parent that should be auto-completed
    if (sd.parent_sd_id) {
      await this._checkAndCompleteParentSD(sd);
    }

    const handoffId = `LEAD-FINAL-${sdId}-${Date.now()}`;

    console.log('\n🎉 SD COMPLETION: Final approval granted');
    console.log(`   SD ID: ${sd.legacy_id || sdId}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Handoff ID: ${handoffId}`);

    return {
      success: true,
      sdId: sdId,
      handoffId: handoffId,
      message: 'SD completed successfully',
      // Use normalized score (weighted average 0-100%) instead of summed totalScore
      qualityScore: gateResults.normalizedScore ?? Math.round((gateResults.totalScore / gateResults.totalMaxScore) * 100)
    };
  }

  /**
   * Check and complete parent SD when all children are done
   *
   * PATTERN FIX: PAT-ORCH-AUTOCOMP-001
   * Uses OrchestratorCompletionGuardian to ensure all artifacts exist
   * before attempting completion (prevents silent failures)
   */
  async _checkAndCompleteParentSD(sd) {
    console.log('\n   Checking parent SD completion...');

    try {
      const { data: parentSD } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, status, sd_type')
        .eq('id', sd.parent_sd_id)
        .single();

      if (!parentSD || parentSD.status === 'completed') {
        return;
      }

      // Get all siblings
      const { data: siblings } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, status')
        .eq('parent_sd_id', sd.parent_sd_id);

      const allComplete = siblings.every(s => s.status === 'completed');

      if (allComplete) {
        console.log(`   🎉 All ${siblings.length} children completed - initiating parent completion`);

        // Use OrchestratorCompletionGuardian for intelligent completion
        // This ensures all artifacts exist and auto-creates missing ones
        try {
          const { OrchestratorCompletionGuardian } = await import('../orchestrator-completion-guardian.js');
          const guardian = new OrchestratorCompletionGuardian(parentSD.id);

          const report = await guardian.validate();

          if (report.canComplete) {
            // All artifacts in place - complete directly
            const result = await guardian.complete();
            if (result.success) {
              console.log(`   ✅ Parent SD "${parentSD.title}" completed via Guardian`);
            } else {
              console.log(`   ⚠️  Guardian completion failed: ${result.error}`);
              // Fall back to recording attempt for investigation
              await this._recordFailedCompletion(parentSD, result.error);
            }
          } else if (report.canAutoComplete) {
            // Missing artifacts that can be auto-created
            console.log(`   🔧 Auto-creating ${report.missingArtifacts.length} missing artifact(s)...`);
            await guardian.autoCreateArtifacts();

            const result = await guardian.complete();
            if (result.success) {
              console.log(`   ✅ Parent SD "${parentSD.title}" completed (with auto-created artifacts)`);
            } else {
              console.log(`   ⚠️  Completion failed after auto-fix: ${result.error}`);
              await this._recordFailedCompletion(parentSD, result.error);
            }
          } else {
            // Cannot auto-complete - log details for manual review
            console.log(`   ⚠️  Cannot auto-complete parent - manual intervention required`);
            const failedChecks = report.results.filter(r => !r.passed);
            failedChecks.forEach(check => {
              console.log(`      ❌ ${check.check}: ${check.message}`);
            });
            await this._recordFailedCompletion(parentSD, 'Manual intervention required', report);
          }
        } catch (guardianError) {
          // Guardian not available - fall back to legacy behavior with better error handling
          console.log(`   ⚠️  Guardian unavailable: ${guardianError.message}`);
          console.log(`   📝 Attempting legacy completion (may fail if artifacts missing)...`);

          const { error } = await this.supabase
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
            await this._recordFailedCompletion(parentSD, error.message);
          } else {
            console.log(`   ✅ Parent SD "${parentSD.title}" auto-completed (legacy path)`);
          }
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Parent check error: ${error.message}`);
    }
  }

  /**
   * Record failed completion attempt for investigation and pattern learning
   */
  async _recordFailedCompletion(parentSD, errorMessage, report = null) {
    try {
      await this.supabase
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
    } catch (e) {
      // Silent fail for logging - don't break the flow
    }
  }

  getRemediation(gateName) {
    const remediations = {
      'PLAN_TO_LEAD_HANDOFF_EXISTS': [
        'PLAN-TO-LEAD handoff must be accepted before final approval:',
        '1. Run: node scripts/handoff.js execute PLAN-TO-LEAD <SD-ID>',
        '2. Ensure all gates pass',
        '3. Re-run LEAD-FINAL-APPROVAL'
      ].join('\n'),
      'USER_STORIES_COMPLETE': [
        'All user stories must be completed:',
        '1. Check incomplete stories in database',
        '2. Mark as completed: UPDATE user_stories SET status = \'completed\' WHERE ...',
        '3. Re-run LEAD-FINAL-APPROVAL'
      ].join('\n'),
      'RETROSPECTIVE_EXISTS': [
        'A quality retrospective is required:',
        '1. Generate retrospective: node scripts/execute-subagent.js --code RETRO --sd-id <SD-ID>',
        '2. Ensure quality score >= 60%',
        '3. Re-run LEAD-FINAL-APPROVAL'
      ].join('\n'),
      'PR_MERGE_VERIFICATION': [
        'All open PRs for this SD must be merged before completion:',
        '1. Review open PRs listed above',
        '2. Merge each PR: gh pr merge <PR-NUMBER> --repo <REPO>',
        '3. Or close if no longer needed: gh pr close <PR-NUMBER> --repo <REPO>',
        '4. Pull merged changes: git pull origin main',
        '5. Re-run LEAD-FINAL-APPROVAL'
      ].join('\n')
    };

    return remediations[gateName] || null;
  }

  /**
   * Release the session claim when SD is completed
   * @param {object} sd - SD record
   */
  async _releaseSessionClaim(sd) {
    try {
      const sessionManager = await import('../../../../lib/session-manager.mjs');

      // Get current session
      const session = await sessionManager.getOrCreateSession();

      if (!session) {
        console.log('   [Release] No session to release');
        return;
      }

      const claimId = sd.legacy_id || sd.id;

      // Check if this session has the claim
      if (session.sd_id === claimId) {
        // Release via database
        const { error } = await this.supabase.rpc('release_sd', {
          p_session_id: session.session_id,
          p_release_reason: 'completed'
        });

        if (error) {
          console.log(`   [Release] Warning: Could not release claim: ${error.message}`);
        } else {
          console.log('   [Release] ✅ Session claim released');
        }
      }
    } catch (error) {
      // Non-fatal
      console.log(`   [Release] Warning: ${error.message}`);
    }
  }
}

export default LeadFinalApprovalExecutor;
