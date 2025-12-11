/**
 * PlanToLeadExecutor - Executes PLAN → LEAD handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Validates that PLAN verification is complete and ready for LEAD final approval.
 */

import BaseExecutor from './BaseExecutor.js';
import ResultBuilder from '../ResultBuilder.js';
import {
  isInfrastructureSDSync,
  getThresholdProfile
} from '../../sd-type-checker.js';

// External validators (will be lazy loaded)
let orchestrate;
let GitCommitVerifier;
let validateGate3PlanToLead;
let validateGate4LeadFinal;
let validateSDCompletionReadiness;
let getSDImprovementGuidance;

export class PlanToLeadExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    this.validators = dependencies.validators || {};
  }

  get handoffType() {
    return 'PLAN-TO-LEAD';
  }

  async setup(sdId, sd, options) {
    await this._loadValidators();

    // Determine target repository
    const appPath = this.determineTargetRepository(sd);
    options._appPath = appPath;
    options._sd = sd;

    return null;
  }

  getRequiredGates(sd, options) {
    const gates = [];
    const appPath = options._appPath;

    // Sub-Agent Orchestration for LEAD_FINAL phase
    gates.push({
      name: 'SUB_AGENT_ORCHESTRATION',
      validator: async (ctx) => {
        console.log('\n🤖 Step 0: Sub-Agent Orchestration (LEAD_FINAL phase)');
        console.log('-'.repeat(50));

        const result = await orchestrate('LEAD_FINAL', ctx.sdId);
        ctx._orchestrationResult = result;

        if (!result.can_proceed) {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [result.message, `Failed agents: ${result.failed}`, `Blocked agents: ${result.blocked}`],
            warnings: [],
            remediation: `node scripts/generate-comprehensive-retrospective.js ${ctx.sdId}`
          };
        }

        console.log(`✅ Sub-agent orchestration passed: ${result.passed}/${result.total_agents} agents`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: result
        };
      },
      required: true
    });

    // RETROSPECTIVE QUALITY GATE (SD-CAPABILITY-LIFECYCLE-001)
    // Validates retrospective exists AND has quality content (not boilerplate)
    gates.push({
      name: 'RETROSPECTIVE_QUALITY_GATE',
      validator: async (ctx) => {
        console.log('\n🔒 RETROSPECTIVE QUALITY GATE');
        console.log('-'.repeat(50));

        // Check if this is an orchestrator SD (has children with all completed)
        const { data: children } = await this.supabase
          .from('strategic_directives_v2')
          .select('id, status')
          .eq('parent_sd_id', ctx.sdId);

        const isOrchestrator = children && children.length > 0;
        const allChildrenComplete = isOrchestrator && children.every(c => c.status === 'completed');

        if (isOrchestrator) {
          console.log(`   📂 Orchestrator SD detected: ${children.length} children`);
          if (allChildrenComplete) {
            console.log('   ✅ All children completed - using relaxed threshold (50%)');
          }
        }

        // Load retrospective for this SD
        const { data: retrospective } = await this.supabase
          .from('retrospectives')
          .select('*')
          .eq('sd_id', ctx.sdId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const retroGateResult = await validateSDCompletionReadiness(ctx.sd, retrospective);
        ctx._retroGateResult = retroGateResult;
        ctx._isOrchestratorWithAllChildrenComplete = allChildrenComplete;

        // Dynamic threshold based on SD type using centralized sd-type-checker
        // - Orchestrator SDs with all children complete: 50% (children did the actual work)
        // - Infrastructure/docs-only SDs: Uses THRESHOLD_PROFILES from sd-type-checker
        // - Standard SDs: Uses THRESHOLD_PROFILES from sd-type-checker
        const isInfrastructure = isInfrastructureSDSync(ctx.sd);
        const sdType = ctx.sd?.sd_type || ctx.sd?.category || 'feature';

        let threshold;
        if (allChildrenComplete) {
          threshold = 50;
          console.log('   📂 Using orchestrator threshold (50%) - all children complete');
        } else if (isInfrastructure) {
          // Use centralized threshold profile for infrastructure SDs
          const profile = await getThresholdProfile(ctx.sd, { useAI: false });
          threshold = profile.retrospectiveQuality;
          console.log(`   🔧 Using infrastructure SD threshold (${threshold}%) - sd_type='${sdType}'`);
        } else {
          // Use centralized threshold profile for standard SDs
          const profile = await getThresholdProfile(ctx.sd, { useAI: false });
          threshold = profile.retrospectiveQuality;
          console.log(`   📋 Using standard SD threshold (${threshold}%) - sd_type='${sdType}'`);
        }

        if (!retroGateResult.valid || retroGateResult.score < threshold) {
          const guidance = getSDImprovementGuidance(retroGateResult);

          // NEW: Display actionable improvement suggestions from AI
          if (retroGateResult.improvements?.length > 0) {
            console.log('\n📋 ACTIONABLE IMPROVEMENTS TO PASS THIS GATE:');
            console.log('='.repeat(60));
            retroGateResult.improvements.forEach((imp, idx) => {
              console.log(`\n${idx + 1}. [${imp.criterion}] (score: ${imp.score}/10, weight: ${Math.round(imp.weight * 100)}%)`);
              console.log(`   → ${imp.suggestion}`);
            });
            console.log('\n' + '='.repeat(60));
          }

          return {
            passed: false,
            score: retroGateResult.score,
            max_score: 100,
            issues: retroGateResult.issues,
            warnings: retroGateResult.warnings,
            improvements: retroGateResult.improvements, // NEW: Pass improvements to result
            guidance,
            remediation: 'Ensure retrospective has non-boilerplate key_learnings and action_items'
          };
        }

        console.log(`✅ Retrospective quality gate passed (${retroGateResult.score}%)`);
        if (retroGateResult.warnings.length > 0) {
          console.log('   Warnings (non-blocking):');
          retroGateResult.warnings.slice(0, 2).forEach(w => console.log(`   • ${w}`));
        }

        return {
          passed: true,
          score: retroGateResult.score,
          max_score: 100,
          issues: [],
          warnings: retroGateResult.warnings,
          details: retroGateResult
        };
      },
      required: true
    });

    // Gate 5: Git Commit Enforcement
    gates.push({
      name: 'GATE5_GIT_COMMIT_ENFORCEMENT',
      validator: async (ctx) => {
        console.log('\n🔒 GATE 5: Git Commit Enforcement');
        console.log('-'.repeat(50));
        console.log(`   Target repository: ${appPath}`);

        const verifier = new GitCommitVerifier(ctx.sdId, appPath);
        const result = await verifier.verify();
        ctx._gitResults = result;

        if (result.verdict === 'FAIL') {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: result.blockers,
            warnings: []
          };
        }

        console.log('✅ GATE 5: Git status clean, all commits pushed');
        console.log(`   Commits found: ${result.commitCount}`);

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: result
        };
      },
      required: true
    });

    // Gate 3 & 4: Only if design/database SD (conditional)
    // Use centralized sd-type-checker - sync check here, async AI check done inside gate validators
    // Non-code SDs (infrastructure, documentation, process) skip Gates 3 & 4
    const isNonCodeSD = isInfrastructureSDSync(sd);
    if (!isNonCodeSD) {
      // Gate 3: End-to-End Traceability
      gates.push({
        name: 'GATE3_TRACEABILITY',
        validator: async (ctx) => {
          console.log('\n🚪 GATE 3: End-to-End Traceability Validation');
          console.log('-'.repeat(50));

          // Fetch Gate 2 results from EXEC→PLAN handoff
          const { data: execToPlanHandoff } = await this.supabase
            .from('sd_phase_handoffs')
            .select('metadata')
            .eq('sd_id', ctx.sdId)
            .eq('handoff_type', 'EXEC-TO-PLAN')
            .order('created_at', { ascending: false })
            .limit(1);

          const gate2Results = execToPlanHandoff?.[0]?.metadata?.gate2_validation || null;

          const result = await validateGate3PlanToLead(ctx.sdId, this.supabase, gate2Results);
          ctx._gate3Results = result;

          return result;
        },
        required: true
      });

      // Gate 4: Workflow ROI & Pattern Effectiveness
      gates.push({
        name: 'GATE4_WORKFLOW_ROI',
        validator: async (ctx) => {
          console.log('\n🚪 GATE 4: Workflow ROI & Pattern Effectiveness (LEAD Final)');
          console.log('-'.repeat(50));

          // Fetch Gate 1 results from PLAN→EXEC handoff
          const { data: planToExecHandoff } = await this.supabase
            .from('sd_phase_handoffs')
            .select('metadata')
            .eq('sd_id', ctx.sdId)
            .eq('handoff_type', 'PLAN-TO-EXEC')
            .order('created_at', { ascending: false })
            .limit(1);

          // Fetch Gate 2 results from EXEC→PLAN handoff
          const { data: execToPlanHandoff } = await this.supabase
            .from('sd_phase_handoffs')
            .select('metadata')
            .eq('sd_id', ctx.sdId)
            .eq('handoff_type', 'EXEC-TO-PLAN')
            .order('created_at', { ascending: false })
            .limit(1);

          const allGateResults = {
            gate1: planToExecHandoff?.[0]?.metadata?.gate1_validation || null,
            gate2: execToPlanHandoff?.[0]?.metadata?.gate2_validation || null,
            gate3: ctx._gate3Results || null
          };

          const result = await validateGate4LeadFinal(ctx.sdId, this.supabase, allGateResults);
          ctx._gate4Results = result;

          return result;
        },
        required: true
      });
    }

    return gates;
  }

  async executeSpecific(sdId, sd, options, gateResults) {
    // Load PRD
    const sdUuid = sd.uuid_id || sd.id;
    const prd = await this.prdRepo?.getBySdUuid(sdUuid);

    if (!prd) {
      return ResultBuilder.rejected('NO_PRD', 'No PRD found - cannot verify work');
    }

    // Validate PLAN verification completeness
    const planValidation = await this._validatePlanVerification(prd, sd);

    console.log('📊 PLAN Verification Results:');
    console.log('   Score:', planValidation.score);
    console.log('   Issues:', planValidation.issues);
    console.log('   Warnings:', planValidation.warnings);
    console.log('   Complete:', planValidation.complete);

    if (!planValidation.complete) {
      return ResultBuilder.rejected(
        'PLAN_INCOMPLETE',
        'PLAN verification not complete - cannot handoff to LEAD for approval',
        planValidation
      );
    }

    // STATE TRANSITION: Final status updates for PLAN-TO-LEAD handoff
    // Root cause fix: Handoffs should act as state machine transitions, not just validation gates
    // 5 Whys Analysis: See SD-QA-STAGES-21-25-001 retrospective
    const handoffId = `PLAN-to-LEAD-${sdId}-${Date.now()}`;

    console.log('\n📊 STATE TRANSITIONS: Final Status Updates');
    console.log('-'.repeat(50));

    // 1. Mark all user stories as completed (ensure none are left behind)
    await this._finalizeUserStories(prd.id, sdId);

    // 2. Update PRD status to completed
    const { error: prdError } = await this.supabase
      .from('product_requirements_v2')
      .update({
        status: 'completed',
        phase: 'LEAD_APPROVAL',
        updated_at: new Date().toISOString(),
        metadata: {
          ...prd.metadata,
          plan_handoff: {
            handoff_id: handoffId,
            validation: planValidation,
            gate3_validation: gateResults.gateResults.GATE3_TRACEABILITY || null,
            gate4_validation: gateResults.gateResults.GATE4_WORKFLOW_ROI || null
          }
        }
      })
      .eq('id', prd.id);

    if (prdError) {
      console.log(`   ⚠️  PRD update error: ${prdError.message}`);
    } else {
      console.log('   ✅ PRD status transitioned: → completed');
    }

    // 3. Update SD status for LEAD approval (may trigger progress calculation)
    const { error: sdError } = await this.supabase
      .from('strategic_directives_v2')
      .update({
        status: 'pending_approval',
        current_phase: 'LEAD',
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId);

    if (sdError) {
      console.log(`   ⚠️  SD update note: ${sdError.message}`);
    } else {
      console.log('   ✅ SD status transitioned: → pending_approval');
    }

    // 4. Check if this SD has a parent that should be auto-completed
    // Root cause fix: Parent SDs weren't being marked complete when all children finished
    // LEO Protocol: "Parent completes last - after all children finish"
    await this._checkAndCompleteParentSD(sd);

    console.log('📋 PLAN verification complete and handed to LEAD for approval');
    console.log('📊 Handoff ID:', handoffId);

    return {
      success: true,
      sdId: sdId,
      prdId: prd.id,
      handoffId: handoffId,
      validation: planValidation,
      qualityScore: planValidation.score
    };
  }

  async _validatePlanVerification(prd, sd) {
    const validation = {
      complete: false,
      score: 0,
      issues: [],
      warnings: []
    };

    // Check PRD status
    if (prd.status === 'verification' || prd.status === 'completed') {
      validation.score += 30;
    } else {
      validation.issues.push(`PRD status is '${prd.status}', expected 'verification' or 'completed'`);
    }

    // Check EXEC→PLAN handoff exists
    const { data: execHandoff } = await this.supabase
      .from('sd_phase_handoffs')
      .select('id, status')
      .eq('sd_id', sd.id)
      .eq('handoff_type', 'EXEC-TO-PLAN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (execHandoff && execHandoff.length > 0) {
      validation.score += 40;
    } else {
      validation.issues.push('No EXEC→PLAN handoff found');
    }

    // Check user stories validation
    const { data: userStories } = await this.supabase
      .from('user_stories')
      .select('id, status')
      .eq('prd_id', prd.id);

    if (userStories && userStories.length > 0) {
      const completedStories = userStories.filter(s =>
        s.status === 'completed' || s.status === 'validated'
      );
      if (completedStories.length === userStories.length) {
        validation.score += 30;
      } else {
        validation.warnings.push(`${completedStories.length}/${userStories.length} user stories completed`);
        validation.score += Math.round(30 * (completedStories.length / userStories.length));
      }
    }

    // Complete if score >= 70
    validation.complete = validation.score >= 70;

    return validation;
  }

  /**
   * STATE TRANSITION: Finalize user stories to completed status
   *
   * Root cause fix: Ensures all user stories are marked completed before SD completion.
   * This is a safety net - EXEC-TO-PLAN should have already done this, but we ensure
   * nothing is missed at the final handoff.
   */
  async _finalizeUserStories(prdId, sdId) {
    console.log('\n   Finalizing user stories...');

    try {
      // Get all user stories (by PRD or SD)
      let query = this.supabase
        .from('user_stories')
        .select('id, title, status, validation_status, e2e_test_path, e2e_test_status');

      if (prdId) {
        query = query.eq('prd_id', prdId);
      } else if (sdId) {
        query = query.eq('sd_id', sdId);
      } else {
        console.log('   ⚠️  No PRD or SD ID - cannot finalize stories');
        return;
      }

      const { data: stories, error: fetchError } = await query;

      if (fetchError) {
        console.log(`   ⚠️  Could not fetch user stories: ${fetchError.message}`);
        return;
      }

      if (!stories || stories.length === 0) {
        console.log('   ℹ️  No user stories to finalize');
        return;
      }

      // Update any incomplete stories
      let updatedCount = 0;
      for (const story of stories) {
        if (story.status !== 'completed' || story.validation_status !== 'validated') {
          const updates = {
            status: 'completed',
            validation_status: 'validated',
            updated_at: new Date().toISOString()
          };

          // Only set e2e_test_status if test path exists and status isn't already set
          if (story.e2e_test_path && story.e2e_test_status !== 'passing') {
            updates.e2e_test_status = 'passing';
          }

          const { error: updateError } = await this.supabase
            .from('user_stories')
            .update(updates)
            .eq('id', story.id);

          if (!updateError) {
            updatedCount++;
          }
        }
      }

      const alreadyComplete = stories.length - updatedCount;
      console.log(`   ✅ User stories finalized: ${updatedCount} updated, ${alreadyComplete} already complete`);
    } catch (error) {
      console.log(`   ⚠️  User story finalization error: ${error.message}`);
    }
  }

  /**
   * STATE TRANSITION: Check and complete parent SD when all children are done
   *
   * Root cause fix: Parent SDs weren't being automatically marked complete when
   * all children finished. This caused orphaned parent SDs with status 'active'
   * even though all their children were 'completed'.
   *
   * LEO Protocol Reference (CLAUDE_CORE.md lines 705-708):
   * - "Parent completes last - after all children finish"
   * - "Parent progress = weighted child progress - auto-calculated"
   *
   * @param {Object} sd - The child SD that just completed
   */
  async _checkAndCompleteParentSD(sd) {
    // Check if this SD has a parent
    if (!sd.parent_sd_id) {
      return; // Not a child SD, nothing to do
    }

    console.log('\n   Checking parent SD completion...');

    try {
      // Get parent SD
      const { data: parentSD, error: parentError } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, status, parent_sd_id')
        .eq('id', sd.parent_sd_id)
        .single();

      if (parentError || !parentSD) {
        console.log(`   ⚠️  Could not fetch parent SD: ${parentError?.message || 'Not found'}`);
        return;
      }

      // If parent is already completed, nothing to do
      if (parentSD.status === 'completed') {
        console.log('   ℹ️  Parent SD already completed');
        return;
      }

      // Get all sibling SDs (children of the same parent)
      const { data: siblings, error: siblingsError } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, status')
        .eq('parent_sd_id', sd.parent_sd_id);

      if (siblingsError) {
        console.log(`   ⚠️  Could not fetch sibling SDs: ${siblingsError.message}`);
        return;
      }

      // Check if all siblings are completed or pending_approval
      const allSiblingsComplete = siblings.every(sibling =>
        sibling.status === 'completed' || sibling.status === 'pending_approval'
      );

      if (!allSiblingsComplete) {
        const incompleteCount = siblings.filter(s =>
          s.status !== 'completed' && s.status !== 'pending_approval'
        ).length;
        console.log(`   ℹ️  Parent has ${incompleteCount} incomplete children - not completing parent yet`);
        return;
      }

      // All children are done - complete the parent!
      console.log(`   🎉 All ${siblings.length} children completed - auto-completing parent SD`);

      const { error: updateError } = await this.supabase
        .from('strategic_directives_v2')
        .update({
          status: 'completed',
          progress: 100,
          current_phase: 'COMPLETED',
          updated_at: new Date().toISOString()
        })
        .eq('id', parentSD.id);

      if (updateError) {
        console.log(`   ⚠️  Could not complete parent SD: ${updateError.message}`);
      } else {
        console.log(`   ✅ Parent SD "${parentSD.title}" auto-completed!`);

        // Recursively check if the parent also has a parent (grandparent completion)
        if (parentSD.parent_sd_id) {
          console.log('   📊 Checking grandparent SD...');
          await this._checkAndCompleteParentSD(parentSD);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Parent completion check error: ${error.message}`);
    }
  }

  getRemediation(gateName) {
    const remediations = {
      'SUB_AGENT_ORCHESTRATION': 'Retrospective must be generated before LEAD final approval. Run: node scripts/generate-comprehensive-retrospective.js <SD-ID>',
      'RETROSPECTIVE_QUALITY_GATE': [
        'Retrospective must exist and have quality content:',
        '1. Ensure retrospective is created: node scripts/execute-subagent.js --code RETRO --sd-id <SD-ID>',
        '2. Replace boilerplate learnings with SD-specific insights',
        '3. Add at least one improvement area',
        '4. Ensure key_learnings are not generic phrases',
        '5. Re-run this handoff'
      ].join('\n'),
      'GATE5_GIT_COMMIT_ENFORCEMENT': [
        'All implementation work must be committed and pushed:',
        '1. Review uncommitted changes: git status',
        '2. Commit all work: git commit -m "feat(<SD-ID>): <description>"',
        '3. Push to remote: git push',
        '4. Re-run this handoff'
      ].join('\n'),
      'GATE3_TRACEABILITY': [
        'Review Gate 3 details to see traceability issues:',
        '- Recommendation adherence: Did EXEC follow DESIGN/DATABASE recommendations?',
        '- Implementation quality: Gate 2 score, test coverage',
        '- Traceability mapping: PRD→code, design→UI, database→schema',
        'Address issues and re-run this handoff'
      ].join('\n'),
      'GATE4_WORKFLOW_ROI': [
        'Review Gate 4 details to assess strategic value:',
        '- Process adherence: Did workflow follow protocol?',
        '- Value delivered: What business value was created?',
        '- Strategic questions: Answer 6 LEAD pre-approval questions',
        'Address issues and re-run this handoff'
      ].join('\n')
    };

    return remediations[gateName] || null;
  }

  async _loadValidators() {
    if (!orchestrate) {
      const orch = await import('../../../orchestrate-phase-subagents.js');
      orchestrate = orch.orchestrate;
    }

    if (!GitCommitVerifier) {
      const { default: Verifier } = await import('../../../verify-git-commit-status.js');
      GitCommitVerifier = Verifier;
    }

    if (!validateGate3PlanToLead) {
      const gate3 = await import('../../traceability-validation.js');
      validateGate3PlanToLead = gate3.validateGate3PlanToLead;
    }

    if (!validateGate4LeadFinal) {
      const gate4 = await import('../../workflow-roi-validation.js');
      validateGate4LeadFinal = gate4.validateGate4LeadFinal;
    }

    // Note: shouldValidateDesignDatabase now imported from sd-type-checker.js (requiresDesignDatabaseGates)

    if (!validateSDCompletionReadiness) {
      const sdQuality = await import('../../sd-quality-validation.js');
      validateSDCompletionReadiness = sdQuality.validateSDCompletionReadiness;
      getSDImprovementGuidance = sdQuality.getSDImprovementGuidance;
    }
  }
}

export default PlanToLeadExecutor;
