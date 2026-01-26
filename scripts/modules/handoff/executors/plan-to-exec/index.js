/**
 * PlanToExecExecutor Module Index
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * Main executor class and re-exports for PLAN-TO-EXEC handoff functionality.
 * Refactored from 1,610 LOC monolithic file into focused modules.
 */

import BaseExecutor from '../BaseExecutor.js';

// Gate creators
import {
  createPrerequisiteCheckGate,
  createPrdExistsGate,
  createArchitectureVerificationGate,
  createContractComplianceGate,
  createDesignDatabaseGate,
  shouldValidateDesignDatabase,
  createExplorationAuditGate,
  createDeliverablesPlanningGate,
  createBranchEnforcementGate
} from './gates/index.js';

// Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
import { createProtocolFileReadGate } from '../../gates/protocol-file-read-gate.js';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';

// Helper modules
import { transitionPrdToExec, transitionSdToExec } from './state-transitions.js';
import { createHandoffRetrospective } from './retrospective.js';
import { displayPreHandoffWarnings, displayExecPhaseRequirements } from './display-helpers.js';
import { getParentOrchestratorGates, isParentOrchestrator } from './parent-orchestrator.js';
import { getRemediation } from './remediation.js';

// External validators (lazy loaded)
let validateBMADForPlanToExec;
let PlanToExecVerifier;
let extractAndPopulateDeliverables;

/**
 * PlanToExecExecutor - Executes PLAN → EXEC handoffs
 *
 * Validates that PLAN phase is complete and ready for EXEC implementation.
 * Creates handoff retrospectives for continuous improvement.
 */
export class PlanToExecExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    this.validators = dependencies.validators || {};
  }

  get handoffType() {
    return 'PLAN-TO-EXEC';
  }

  async setup(sdId, sd, options) {
    // Lazy load validators
    await this._loadValidators();

    // Determine target repository
    const appPath = this.determineTargetRepository(sd);
    console.log(`   Target repository: ${appPath}`);
    options._appPath = appPath;
    options._sd = sd;

    // PAT-PARENT-DET: Detect parent orchestrator SDs
    const parentOrchestrator = isParentOrchestrator(sd);
    options._isParentOrchestrator = parentOrchestrator;

    if (parentOrchestrator) {
      console.log('\n   🎯 PARENT ORCHESTRATOR DETECTED');
      console.log('      Implementation gates will be SKIPPED (work delegated to children)');

      const { data: children } = await this.supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sd.id);

      console.log(`      Children: ${children?.length || 0}`);
      options._childrenCount = children?.length || 0;
    }

    return null; // Continue execution
  }

  async getRequiredGates(sd, options) {
    // Ensure validators are loaded (SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-003)
    await this._loadValidators();

    const gates = [];
    const appPath = options._appPath;
    const parentOrchestrator = options._isParentOrchestrator;

    // SD Start Gate - FIRST (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
    // Ensures CLAUDE_CORE.md is read before any SD work
    gates.push(createSdStartGate(sd?.sd_key || sd?.id || 'unknown'));

    // Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
    // Ensures agent has read CLAUDE_PLAN.md before proceeding
    gates.push(createProtocolFileReadGate('PLAN-TO-EXEC'));

    // Prerequisite handoff check (always first after protocol read)
    gates.push(createPrerequisiteCheckGate(this.supabase));

    // PRD existence check
    gates.push(createPrdExistsGate(this.prdRepo));

    // Architecture verification
    gates.push(createArchitectureVerificationGate(this.prdRepo, this.determineTargetRepository.bind(this)));

    // Parent orchestrators get simplified gates
    if (parentOrchestrator) {
      console.log('\n   📋 PARENT ORCHESTRATOR GATE SET (simplified)');
      return getParentOrchestratorGates(this.supabase, this.prdRepo, sd, options);
    }

    // BMAD Validation
    gates.push({
      name: 'BMAD_PLAN_TO_EXEC',
      validator: async (ctx) => {
        const bmadResult = await validateBMADForPlanToExec(ctx.sdId, this.supabase);
        ctx._bmadResult = bmadResult;
        return bmadResult;
      },
      required: true
    });

    // Contract Compliance Gate
    gates.push(createContractComplianceGate(this.prdRepo, sd));

    // DESIGN→DATABASE Workflow (conditional)
    if (shouldValidateDesignDatabase(sd)) {
      gates.push(createDesignDatabaseGate(this.supabase));
    } else {
      console.log('\n   ℹ️  GATE1_DESIGN_DATABASE skipped: SD type does not require DESIGN/DATABASE sub-agents');
      console.log(`      SD Type: ${sd.sd_type || 'unknown'}`);
    }

    // Exploration Audit (non-blocking)
    gates.push(createExplorationAuditGate(this.prdRepo, sd));

    // Deliverables Planning (non-blocking)
    gates.push(createDeliverablesPlanningGate(this.supabase, sd));

    // Branch Enforcement
    gates.push(createBranchEnforcementGate(sd, appPath));

    return gates;
  }

  async executeSpecific(sdId, sd, options, gateResults) {
    // Display pre-handoff warnings from recent retrospectives
    await displayPreHandoffWarnings(this.supabase, 'PLAN_TO_EXEC');

    // Auto-populate deliverables from PRD
    console.log('\n📦 Step 1.5: Auto-Populate Deliverables from PRD');
    console.log('-'.repeat(50));

    const prd = await this.prdRepo?.getBySdId(sd.id);

    if (prd) {
      try {
        const deliverablesResult = await extractAndPopulateDeliverables(sd.id, prd, this.supabase, {
          skipIfExists: true
        });

        if (deliverablesResult.success) {
          if (deliverablesResult.skipped) {
            console.log('   ℹ️  Deliverables already exist - skipping');
          } else {
            console.log(`   ✅ Populated ${deliverablesResult.count} deliverables`);
          }
        } else {
          console.log('   ⚠️  Could not extract deliverables from PRD');
        }
      } catch (error) {
        console.log(`   ⚠️  Deliverables extraction error: ${error.message}`);
      }
    } else {
      console.log('   ⚠️  No PRD found - cannot extract deliverables');
    }

    // AI Quality Assessment (Russian Judge) - PRD & User Stories
    await this._runRussianJudgeAssessment(prd, sd);

    // Standard PLAN-to-EXEC verification
    console.log('🔍 Step 2: Standard PLAN→EXEC Verification');
    console.log('-'.repeat(50));

    const verifier = new PlanToExecVerifier();
    const verificationResult = await verifier.verifyHandoff(sdId, options.prdId);

    if (!verificationResult.success) {
      return verificationResult;
    }

    // Create handoff retrospective after successful handoff
    await createHandoffRetrospective(
      this.supabase, sdId, sd, verificationResult, 'PLAN_TO_EXEC',
      { prd, gateResults }
    );

    // STATE TRANSITION: Update PRD status on successful handoff
    await transitionPrdToExec(this.supabase, prd, sdId);

    // STATE TRANSITION: Update SD current_phase to EXEC
    await transitionSdToExec(this.supabase, sdId, sd);

    // Display EXEC phase requirements (proactive guidance)
    await displayExecPhaseRequirements(this.supabase, sdId, prd);

    // Merge validation details
    const branchResults = gateResults.gateResults.GATE6_BRANCH_ENFORCEMENT?.details || {};

    return {
      success: true,
      ...verificationResult,
      bmad_validation: gateResults.gateResults.BMAD_PLAN_TO_EXEC,
      branch_validation: {
        branch: branchResults.expectedBranch,
        created: branchResults.branchCreated,
        switched: branchResults.branchSwitched,
        remote_tracking: branchResults.remoteTrackingSetup
      },
      repository: options._appPath
    };
  }

  /**
   * Run Russian Judge AI Quality Assessment
   */
  async _runRussianJudgeAssessment(prd, sd) {
    const russianJudgeEnabled = process.env.RUSSIAN_JUDGE_ENABLED === 'true';
    if (!russianJudgeEnabled || !prd) return;

    try {
      console.log('\n🤖 AI QUALITY ASSESSMENT (Russian Judge)');
      console.log('-'.repeat(50));

      // Assess PRD Quality
      const { PRDQualityRubric } = await import('../../../rubrics/prd-quality-rubric.js');
      const prdRubric = new PRDQualityRubric();
      const prdAssessment = await prdRubric.validatePRDQuality(prd, sd);

      console.log(`   PRD Score: ${prdAssessment.score}% (threshold: 70%)`);
      console.log(`   Status: ${prdAssessment.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}`);

      if (prdAssessment.issues && prdAssessment.issues.length > 0) {
        console.log('\n   ⚡ PRD Issues:');
        prdAssessment.issues.forEach(issue => console.log(`     - ${issue}`));
      }

      // Assess User Stories Quality (if exist)
      const { data: userStories } = await this.supabase
        .from('user_stories')
        .select('*')
        .eq('prd_id', prd.id)
        .limit(5);

      if (userStories && userStories.length > 0) {
        const { UserStoryQualityRubric } = await import('../../../rubrics/user-story-quality-rubric.js');
        const storyRubric = new UserStoryQualityRubric();

        let totalScore = 0;
        for (const story of userStories) {
          const storyAssessment = await storyRubric.validateUserStoryQuality(story, prd);
          totalScore += storyAssessment.score;
        }
        const avgStoryScore = Math.round(totalScore / userStories.length);

        console.log(`   User Stories Score: ${avgStoryScore}% (${userStories.length} stories sampled)`);
      }

      console.log('');
    } catch (error) {
      console.log(`\n   ⚠️  Russian Judge unavailable: ${error.message}`);
      console.log('   Proceeding with traditional validation only\n');
    }
  }

  getRemediation(gateName) {
    return getRemediation(gateName);
  }

  async _loadValidators() {
    if (!validateBMADForPlanToExec) {
      const bmad = await import('../../../bmad-validation.js');
      validateBMADForPlanToExec = bmad.validateBMADForPlanToExec;
    }

    if (!PlanToExecVerifier) {
      const { default: Verifier } = await import('../../../../verify-handoff-plan-to-exec.js');
      PlanToExecVerifier = Verifier;
    }

    if (!extractAndPopulateDeliverables) {
      const { extractAndPopulateDeliverables: fn } = await import('../../extract-deliverables-from-prd.js');
      extractAndPopulateDeliverables = fn;
    }
  }
}

export default PlanToExecExecutor;

// Re-export all modules for direct access
export * from './gates/index.js';
export { transitionPrdToExec, transitionSdToExec } from './state-transitions.js';
export { createHandoffRetrospective } from './retrospective.js';
export { displayPreHandoffWarnings, displayExecPhaseRequirements } from './display-helpers.js';
export { getParentOrchestratorGates, isParentOrchestrator } from './parent-orchestrator.js';
export { getRemediation, getAllRemediations } from './remediation.js';
