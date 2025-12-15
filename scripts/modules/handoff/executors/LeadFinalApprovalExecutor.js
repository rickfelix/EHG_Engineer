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
    console.log('   ✅ Completion timestamp recorded');

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
   */
  async _checkAndCompleteParentSD(sd) {
    console.log('\n   Checking parent SD completion...');

    try {
      const { data: parentSD } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, status')
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
        console.log(`   🎉 All ${siblings.length} children completed - auto-completing parent`);

        await this.supabase
          .from('strategic_directives_v2')
          .update({
            status: 'completed',
            progress_percentage: 100,
            current_phase: 'COMPLETED',
            updated_at: new Date().toISOString()
          })
          .eq('id', parentSD.id);

        console.log(`   ✅ Parent SD "${parentSD.title}" auto-completed`);
      }
    } catch (error) {
      console.log(`   ⚠️  Parent check error: ${error.message}`);
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
      ].join('\n')
    };

    return remediations[gateName] || null;
  }
}

export default LeadFinalApprovalExecutor;
