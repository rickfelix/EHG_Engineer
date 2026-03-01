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
  createBranchEnforcementGate,
  createInfrastructureConsumerCheckGate,
  createIntegrationSectionValidationGate,
  createMigrationDataVerificationGate,
  createArchitecturalPatternChecklistGate
} from './gates/index.js';

// Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
import { createProtocolFileReadGate } from '../../gates/protocol-file-read-gate.js';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';

// DFE Escalation Gate (SD-MAN-GEN-CORRECTIVE-VISION-GAP-003)
import { createDFEEscalationGate } from '../../gates/dfe-escalation-gate.js';

// Helper modules
import { transitionPrdToExec, transitionSdToExec } from './state-transitions.js';
import { createHandoffRetrospective } from './retrospective.js';
import { displayPreHandoffWarnings, displayExecPhaseRequirements } from './display-helpers.js';
import { getParentOrchestratorGates, isParentOrchestrator } from './parent-orchestrator.js';
import { getRemediation } from './remediation.js';

// Worktree integration (SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001)
import { createWorktree, symlinkNodeModules, getRepoRoot } from '../../../../../lib/worktree-manager.js';

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
    // Ensures CLAUDE_CORE.md AND CLAUDE_EXEC.md (destination phase) are read before handoff
    gates.push(createSdStartGate(sd?.sd_key || sd?.id || 'unknown', 'PLAN-TO-EXEC'));

    // Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
    // Validates CLAUDE_EXEC.md was read (destination phase file)
    gates.push(createProtocolFileReadGate('PLAN-TO-EXEC'));

    // Prerequisite handoff check (always first after protocol read)
    gates.push(createPrerequisiteCheckGate(this.supabase));

    // PRD existence check
    gates.push(createPrdExistsGate(this.prdRepo));

    // Architecture verification
    gates.push(createArchitectureVerificationGate(this.prdRepo, this.determineTargetRepository.bind(this)));

    // Infrastructure Consumer Check (SD-LEO-INFRA-PLAN-PHASE-COMPLETENESS-001)
    // Validates infrastructure components have corresponding consumer code planned
    gates.push(createInfrastructureConsumerCheckGate(this.prdRepo, this.supabase));

    // Integration Section Validation (SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001)
    // Validates PRD has complete Integration & Operationalization section
    gates.push(createIntegrationSectionValidationGate(this.prdRepo, this.supabase));

    // Migration Data Verification (SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-A)
    // After migration executes, verifies data was inserted. BLOCKING for database SDs.
    gates.push(createMigrationDataVerificationGate(this.supabase));

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

    // Architectural Pattern Checklist (SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-C)
    // ADVISORY: Scans PRD for state management, error handling, observability patterns
    // Only runs for complex SDs (story_points >= 8 OR LOC >= 500 OR hasChildren)
    gates.push(createArchitecturalPatternChecklistGate(this.prdRepo, sd, this.supabase));

    // DFE Escalation advisory gate (SD-MAN-GEN-CORRECTIVE-VISION-GAP-003)
    // Routes ESCALATE decisions to chairman_decisions for governance
    gates.push(createDFEEscalationGate(this.supabase, 'plan-to-exec-gate'));

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

    // V03: AnalysisStep — Synthesize prior LEAD phase evaluation data (SD-MAN-GEN-CORRECTIVE-VISION-GAP-010)
    const analysisStep = await this._synthesizeLeadAnalysis(sdId, sd, prd);
    if (analysisStep) {
      options._analysisStep = analysisStep;
    }

    // AI Quality Assessment (Russian Judge) - PRD & User Stories
    await this._runRussianJudgeAssessment(prd, sd);

    // Standard PLAN-to-EXEC verification
    console.log('🔍 Step 2: Standard PLAN→EXEC Verification');
    console.log('-'.repeat(50));

    let verificationResult;
    if (options.bypassValidation) {
      console.log('   ⚠️  BYPASS ACTIVE: Skipping PlanToExecVerifier (legacy validation)');
      console.log(`   📝 Reason: ${options.bypassReason || 'No reason provided'}`);
      verificationResult = { success: true, bypassed: true };
    } else {
      const verifier = new PlanToExecVerifier();
      verificationResult = await verifier.verifyHandoff(sdId, options.prdId);

      if (!verificationResult.success) {
        return verificationResult;
      }
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

    // Merge validation details (needed for worktree creation)
    const branchResults = gateResults.gateResults.GATE6_BRANCH_ENFORCEMENT?.details || {};

    // SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001: Create worktree after state transitions
    let worktreeResult = null;
    const sdKey = sd.sd_key || sdId;
    const worktreeBranch = branchResults.expectedBranch;

    if (worktreeBranch) {
      try {
        console.log('\n🌲 Step 4: Worktree Creation');
        console.log('-'.repeat(50));
        worktreeResult = createWorktree({ sdKey, branch: worktreeBranch });

        if (worktreeResult.reused) {
          console.log(`   ℹ️  Worktree already exists: .worktrees/${sdKey}`);
        } else {
          console.log(`   ✅ Worktree created: .worktrees/${sdKey}`);
        }
        console.log(`   📂 Path: ${worktreeResult.path}`);
        console.log(`   🌿 Branch: ${worktreeResult.branch}`);

        // Symlink node_modules for convenience
        try {
          symlinkNodeModules(worktreeResult.path, getRepoRoot());
          console.log('   ✅ node_modules linked');
        } catch (symlinkError) {
          console.warn(`   ⚠️  Could not link node_modules: ${symlinkError.message}`);
        }
      } catch (worktreeError) {
        console.warn(`   ⚠️  Worktree creation failed (non-blocking): ${worktreeError.message}`);
        console.warn(`   📝 SD Key: ${sdKey}, Branch: ${worktreeBranch}`);
        console.warn('   💡 Create manually: npm run session:worktree -- --sd-key ' + sdKey + ' --branch ' + worktreeBranch);
      }
    } else {
      console.log('\n   ℹ️  Worktree creation skipped: no branch resolved from gate results');
    }

    // Display EXEC phase requirements (proactive guidance)
    // PAT-E2E-STATUS-001: Pass SD type so E2E requirements are skipped for infra SDs
    await displayExecPhaseRequirements(this.supabase, sdId, prd, {
      sdType: sd?.sd_type,
      worktreePath: worktreeResult?.path || null,
      sdKey
    });

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
      worktree: worktreeResult ? {
        path: worktreeResult.path,
        sdKey: worktreeResult.sdKey,
        created: worktreeResult.created,
        reused: worktreeResult.reused
      } : null,
      repository: options._appPath
    };
  }

  /**
   * V03: Synthesize prior LEAD phase evaluation data into an analysisStep.
   * Produces compounding intelligence for the EXEC phase by reading the
   * LEAD-TO-PLAN handoff artifact and PRD context.
   * (SD-MAN-GEN-CORRECTIVE-VISION-GAP-010)
   */
  async _synthesizeLeadAnalysis(sdId, sd, prd) {
    try {
      console.log('\n📊 Step 1.75: AnalysisStep — LEAD Phase Intelligence Synthesis');
      console.log('-'.repeat(50));

      // Fetch LEAD-TO-PLAN handoff for this SD
      const { data: leadHandoff } = await this.supabase
        .from('sd_phase_handoffs')
        .select('score, validation_details, output_artifact, created_at')
        .eq('sd_id', sd.id)
        .eq('handoff_type', 'LEAD-TO-PLAN')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!leadHandoff) {
        console.log('   ℹ️  No LEAD-TO-PLAN handoff found — skipping analysisStep');
        return null;
      }

      // Extract key evaluation data from LEAD phase
      const leadScore = leadHandoff.score;
      const validationDetails = leadHandoff.validation_details || {};
      const outputArtifact = leadHandoff.output_artifact || {};

      // Build compounding intelligence from prior phase
      const analysisStep = {
        phase: 'PLAN-TO-EXEC',
        synthesizedFrom: 'LEAD-TO-PLAN',
        leadEvaluationScore: leadScore,
        leadTimestamp: leadHandoff.created_at,
        keyFindings: [],
        riskFactors: [],
        recommendations: []
      };

      // Extract gate results from LEAD phase
      if (validationDetails.gateResults) {
        const gateNames = Object.keys(validationDetails.gateResults);
        const failedGates = gateNames.filter(g => {
          const r = validationDetails.gateResults[g];
          return r && r.score !== undefined && r.score < 70;
        });
        if (failedGates.length > 0) {
          analysisStep.keyFindings.push(`LEAD phase had ${failedGates.length} low-scoring gate(s): ${failedGates.join(', ')}`);
          analysisStep.riskFactors.push('Prior phase gate weaknesses may compound during EXEC');
        }
      }

      // Extract PRD quality signals
      if (prd) {
        if (prd.risks && prd.risks.length > 0) {
          analysisStep.riskFactors.push(...prd.risks.map(r => r.risk || r.description || String(r)).slice(0, 3));
        }
        if (prd.functional_requirements) {
          const criticalFRs = prd.functional_requirements.filter(fr => fr.priority === 'critical');
          if (criticalFRs.length > 0) {
            analysisStep.recommendations.push(`Focus on ${criticalFRs.length} critical FR(s) first`);
          }
        }
      }

      // Summary
      analysisStep.summary = `LEAD phase passed at ${leadScore}%. ${analysisStep.keyFindings.length} finding(s), ${analysisStep.riskFactors.length} risk(s) carried forward.`;

      console.log(`   ✅ AnalysisStep synthesized from LEAD evaluation (score: ${leadScore}%)`);
      console.log(`   📋 Findings: ${analysisStep.keyFindings.length}, Risks: ${analysisStep.riskFactors.length}, Recommendations: ${analysisStep.recommendations.length}`);

      return analysisStep;
    } catch (error) {
      console.log(`   ⚠️  AnalysisStep synthesis failed (non-blocking): ${error.message}`);
      return null;
    }
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

      const prdThreshold = prdAssessment.threshold || 70;
      console.log(`   PRD Score: ${prdAssessment.score}% (threshold: ${prdThreshold}%)`);
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
      const { PlanToExecVerifier: Verifier } = await import('../../verifiers/plan-to-exec/PlanToExecVerifier.js');
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
