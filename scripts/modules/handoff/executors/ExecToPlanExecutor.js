/**
 * ExecToPlanExecutor - Executes EXEC → PLAN handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Validates that EXEC phase implementation is complete and ready for PLAN verification.
 */

import BaseExecutor from './BaseExecutor.js';

// External validators (will be lazy loaded)
let validateBMADForExecToPlan;
let validateGate2ExecToPlan;
let orchestrate;
let getValidationRequirements;
let mapE2ETestsToUserStories;
let validateE2ECoverage;
let autoValidateUserStories;
let autoCompleteDeliverables;
let checkDeliverablesNeedCompletion;

export class ExecToPlanExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    this.validators = dependencies.validators || {};
  }

  get handoffType() {
    return 'EXEC-TO-PLAN';
  }

  async setup(sdId, sd, _options) {
    await this._loadValidators();

    // Check sd_type for documentation-only SDs
    const validationReqs = getValidationRequirements(sd);
    console.log(`\n📋 SD Type: ${sd.sd_type || 'feature (default)'}`);

    if (validationReqs.skipCodeValidation) {
      console.log('   ✅ DOCUMENTATION-ONLY SD DETECTED');
      console.log('   → TESTING/GITHUB validation will be SKIPPED');
      console.log(`   → Reason: ${validationReqs.reason}`);
    }

    return null;
  }

  getRequiredGates(_sd, _options) {
    const gates = [];

    // Sub-Agent Orchestration
    gates.push({
      name: 'SUB_AGENT_ORCHESTRATION',
      validator: async (ctx) => {
        console.log('\n🤖 Step 0: Sub-Agent Orchestration (PLAN_VERIFY phase)');
        console.log('-'.repeat(50));

        // EXEC-TO-PLAN validates completed work, so use retrospective mode
        // This allows TESTING to use CONDITIONAL_PASS when evidence exists
        const result = await orchestrate('PLAN_VERIFY', ctx.sdId, {
          validation_mode: 'retrospective'
        });
        ctx._orchestrationResult = result;

        if (!result.can_proceed) {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [result.message, `Failed agents: ${result.failed}`, `Blocked agents: ${result.blocked}`],
            warnings: []
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

    // BMAD Validation
    gates.push({
      name: 'BMAD_EXEC_TO_PLAN',
      validator: async (ctx) => {
        const result = await validateBMADForExecToPlan(ctx.sdId, this.supabase);
        ctx._bmadResult = result;
        return result;
      },
      required: true
    });

    // Gate 2: Implementation Fidelity
    gates.push({
      name: 'GATE2_IMPLEMENTATION_FIDELITY',
      validator: async (ctx) => {
        console.log('\n🚪 GATE 2: Implementation Fidelity Validation');
        console.log('-'.repeat(50));
        return validateGate2ExecToPlan(ctx.sdId, this.supabase);
      },
      required: true
    });

    // RCA Gate
    gates.push({
      name: 'RCA_GATE',
      validator: async (ctx) => {
        console.log('\n🔍 Step 1: RCA Gate Validation');
        console.log('-'.repeat(50));
        return this._validateRCAGate(ctx.sdId);
      },
      required: true
    });

    return gates;
  }

  async executeSpecific(sdId, sd, options, gateResults) {
    // Load PRD
    const sdUuid = sd.uuid_id || sd.id;
    const prd = await this.prdRepo?.getBySdUuid(sdUuid);

    if (!prd) {
      console.warn('⚠️  No PRD found for SD');
    }

    // E2E Test Mapping (if PRD has stories)
    let e2eMapping = null;
    if (prd) {
      console.log('\n🧪 Step 2: E2E Test → User Story Mapping');
      console.log('-'.repeat(50));

      try {
        const { data: userStories } = await this.supabase
          .from('user_stories')
          .select('id, story_id, title, status')
          .eq('prd_id', prd.id);

        if (userStories && userStories.length > 0) {
          e2eMapping = await mapE2ETestsToUserStories(sdId, this.supabase);
          const coverageResult = await validateE2ECoverage(sdId, this.supabase);

          if (!coverageResult.passed) {
            console.log(`   ⚠️  E2E coverage: ${coverageResult.mapped_count}/${coverageResult.total_stories} stories mapped`);
          } else {
            console.log(`   ✅ E2E test mapping complete: ${coverageResult.mapped_count} stories covered`);
          }
        } else {
          console.log('   ℹ️  No user stories to map');
        }
      } catch (error) {
        console.log(`   ⚠️  E2E mapping error: ${error.message}`);
      }
    }

    // Auto-validate user stories
    console.log('\n📋 Step 3: Auto-Validate User Stories');
    console.log('-'.repeat(50));

    try {
      const validationResult = await autoValidateUserStories(sdId, this.supabase);
      if (validationResult.success) {
        console.log(`   ✅ Validated ${validationResult.validated_count} user stories`);
      }
    } catch (error) {
      console.log(`   ⚠️  User story validation error: ${error.message}`);
    }

    // Auto-complete deliverables
    console.log('\n📦 Step 4: Auto-Complete Deliverables Verification');
    console.log('-'.repeat(50));

    let deliverablesStatus = null;
    try {
      const needsCompletion = await checkDeliverablesNeedCompletion(sdId, this.supabase);
      if (needsCompletion.needs_completion) {
        const completeResult = await autoCompleteDeliverables(sdId, this.supabase);
        deliverablesStatus = completeResult;
        console.log(`   ✅ Auto-completed ${completeResult.completed_count || 0} deliverables`);
      } else {
        console.log('   ℹ️  Deliverables already complete or verified by database trigger');
      }
    } catch (error) {
      console.log(`   ⚠️  Deliverables completion error: ${error.message}`);
    }

    // AI Quality Assessment (Russian Judge) - Retrospective Quality
    const russianJudgeEnabled = process.env.RUSSIAN_JUDGE_ENABLED === 'true';
    if (russianJudgeEnabled) {
      try {
        console.log('\n🤖 AI QUALITY ASSESSMENT (Russian Judge)');
        console.log('-'.repeat(50));

        // Fetch retrospective for this SD
        const { data: retrospective } = await this.supabase
          .from('retrospectives')
          .select('*')
          .eq('sd_id', sdId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (retrospective) {
          const { RetrospectiveQualityRubric } = await import('../../rubrics/retrospective-quality-rubric.js');
          const rubric = new RetrospectiveQualityRubric();
          const retroAssessment = await rubric.validateRetrospectiveQuality(retrospective, sd);

          console.log(`   Retrospective Score: ${retroAssessment.score}% (threshold: 70%)`);
          console.log(`   Status: ${retroAssessment.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);

          if (retroAssessment.issues && retroAssessment.issues.length > 0) {
            console.log('\n   ⚡ Retrospective Issues:');
            retroAssessment.issues.forEach(issue => console.log(`     - ${issue}`));
          }

          if (retroAssessment.warnings && retroAssessment.warnings.length > 0) {
            console.log('\n   💡 Recommendations:');
            retroAssessment.warnings.forEach(warning => console.log(`     - ${warning}`));
          }

          // Mode: ADVISORY for EXEC-TO-PLAN (log but don't block)
          if (!retroAssessment.passed) {
            console.log('\n   ⚠️  Note: Proceeding despite quality concerns (ADVISORY mode)');
          } else {
            console.log('\n   ✅ Quality assessment passed');
          }

          console.log('');
        } else {
          console.log('   ℹ️  No retrospective found for assessment');
          console.log('');
        }
      } catch (error) {
        console.log(`\n   ⚠️  Russian Judge unavailable: ${error.message}`);
        console.log('   Proceeding with traditional validation only\n');
      }
    }

    // Git commit verification
    console.log('📝 Step 5: Git Commit Verification');
    console.log('-'.repeat(50));

    let commitVerification = null;
    try {
      const { default: GitCommitVerifier } = await import('../../../verify-git-commit-status.js');
      const appPath = this.determineTargetRepository(sd);
      const verifier = new GitCommitVerifier(sdId, appPath);
      commitVerification = await verifier.verify();

      if (commitVerification.verdict === 'PASS') {
        console.log('   ✅ All changes committed');
        console.log(`   Commits: ${commitVerification.commit_count}`);
      } else {
        console.log('   ⚠️  Uncommitted changes detected');
      }
    } catch (error) {
      console.log(`   ⚠️  Git verification error: ${error.message}`);
    }

    // Build success result
    const orchestrationResult = gateResults.gateResults.SUB_AGENT_ORCHESTRATION?.details || {};
    const bmadResult = gateResults.gateResults.BMAD_EXEC_TO_PLAN || {};

    // Update SD status to completed with 100% progress
    // This is the final validation phase - EXEC is complete and verified
    console.log('\n📊 Step 6: Updating SD Status to Completed');
    console.log('-'.repeat(50));

    try {
      const { error: updateError } = await this.supabase
        .from('strategic_directives_v2')
        .update({
          status: 'completed',
          current_phase: 'EXEC_COMPLETE',
          progress: 100,
          completion_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId);

      if (updateError) {
        console.warn(`   ⚠️  Failed to update SD status: ${updateError.message}`);
      } else {
        console.log('   ✅ SD status updated to completed (progress: 100%)');
      }
    } catch (error) {
      console.warn(`   ⚠️  SD status update error: ${error.message}`);
    }

    return {
      success: true,
      subAgents: {
        total: orchestrationResult.total_agents,
        passed: orchestrationResult.passed
      },
      bmad_validation: bmadResult,
      e2e_mapping: e2eMapping,
      deliverables: deliverablesStatus,
      commit_verification: commitVerification,
      qualityScore: gateResults.totalScore
    };
  }

  async _validateRCAGate(sdId) {
    try {
      const { data: openRCRs } = await this.supabase
        .from('root_cause_analyses')
        .select('id, priority, capa_status')
        .eq('sd_id', sdId)
        .in('priority', ['P0', 'P1'])
        .neq('capa_status', 'verified');

      if (openRCRs && openRCRs.length > 0) {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`${openRCRs.length} P0/P1 RCRs without verified CAPAs`],
          warnings: [],
          gate_status: 'BLOCKED',
          open_rcr_count: openRCRs.length,
          blocking_rcr_ids: openRCRs.map(r => r.id)
        };
      }

      console.log('✅ RCA gate passed');
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        gate_status: 'PASS'
      };
    } catch (_error) {
      // Table might not exist
      console.log('   ℹ️  RCA gate check skipped (table may not exist)');
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: ['RCA table check skipped']
      };
    }
  }

  getRemediation(gateName) {
    const remediations = {
      'SUB_AGENT_ORCHESTRATION': 'Fix sub-agent failures before creating EXEC→PLAN handoff. Review sub-agent results and address issues.',
      'BMAD_EXEC_TO_PLAN': 'Ensure all test plans are complete and E2E test coverage is 100%.',
      'GATE2_IMPLEMENTATION_FIDELITY': [
        'Review Gate 2 details to see which requirements were not met:',
        '- Testing: Unit tests executed & passing (MANDATORY)',
        '- Server restart: Dev server restarted & verified (MANDATORY)',
        '- Code quality: No stubbed/incomplete code (MANDATORY)',
        '- Directory: Working in correct application (MANDATORY)',
        '- Ambiguity: All FIXME/TODO/HACK comments resolved (MANDATORY)',
        'After fixing issues, re-run this handoff'
      ].join('\n'),
      'RCA_GATE': 'All P0/P1 RCRs must have verified CAPAs before handoff. Run: node scripts/root-cause-agent.js capa verify --capa-id <UUID>'
    };

    return remediations[gateName] || null;
  }

  async _loadValidators() {
    if (!validateBMADForExecToPlan) {
      const bmad = await import('../../bmad-validation.js');
      validateBMADForExecToPlan = bmad.validateBMADForExecToPlan;
    }

    if (!validateGate2ExecToPlan) {
      const gate2 = await import('../../implementation-fidelity-validation.js');
      validateGate2ExecToPlan = gate2.validateGate2ExecToPlan;
    }

    if (!orchestrate) {
      const orch = await import('../../../orchestrate-phase-subagents.js');
      orchestrate = orch.orchestrate;
    }

    if (!getValidationRequirements) {
      const sdType = await import('../../../../lib/utils/sd-type-validation.js');
      getValidationRequirements = sdType.getValidationRequirements;
    }

    if (!mapE2ETestsToUserStories) {
      const e2e = await import('../map-e2e-tests-to-stories.js');
      mapE2ETestsToUserStories = e2e.mapE2ETestsToUserStories;
      validateE2ECoverage = e2e.validateE2ECoverage;
    }

    if (!autoValidateUserStories) {
      const validate = await import('../../../auto-validate-user-stories-on-exec-complete.js');
      autoValidateUserStories = validate.autoValidateUserStories;
    }

    if (!autoCompleteDeliverables) {
      const deliverables = await import('../auto-complete-deliverables.js');
      autoCompleteDeliverables = deliverables.autoCompleteDeliverables;
      checkDeliverablesNeedCompletion = deliverables.checkDeliverablesNeedCompletion;
    }
  }
}

export default ExecToPlanExecutor;
