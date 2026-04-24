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
  createArchitecturalPatternChecklistGate,
  createPlanningCompletenessGate,
  // Semantic Validation Gates (SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002)
  createVisionDimensionCompletenessGate,
  createArchitectureRequirementTraceGate,
  // Wireframe Gates (SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001)
  createWireframeRequiredGate,
  // Translation Fidelity Gate — second invocation (SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001)
  createTranslationFidelityGate,
  // Bugfix Coverage Preflight — advisory (SD-LEARN-FIX-ADDRESS-PAT-EXECTOPLAN-001, FR-3)
  createBugfixCoveragePreflightGate,
  // Cross-SD File-Overlap Temporal Gate (SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 FR-2a)
  createCrossSdFileOverlapTemporalGate
} from './gates/index.js';

// Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
import { createProtocolFileReadGate } from '../../gates/protocol-file-read-gate.js';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';

// DFE Escalation Gate (SD-MAN-GEN-CORRECTIVE-VISION-GAP-003)
import { createDFEEscalationGate } from '../../gates/dfe-escalation-gate.js';

// Sub-Agent Evidence Gate (SD-LEO-INFRA-OPUS-MODULE-SUB-001) — Module C DB-enforced evidence
import { createSubagentEvidenceGate } from '../../gates/subagent-evidence-gate.js';

// Helper modules
import { transitionPrdToExec, transitionSdToExec } from './state-transitions.js';
import { createHandoffRetrospective } from './retrospective.js';
import { displayPreHandoffWarnings, displayExecPhaseRequirements } from './display-helpers.js';
import { getParentOrchestratorGates, isParentOrchestrator } from './parent-orchestrator.js';
import { getRemediation } from './remediation.js';

// Worktree integration (SD-LEO-INFRA-INTEGRATE-WORKTREE-CREATION-001)
import { createWorktree, symlinkNodeModules, getRepoRoot } from '../../../../../lib/worktree-manager.js';
import { getVenturePath, validateVentureRepo } from '../../../../../lib/venture-resolver.js';

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

    // Sub-Agent Evidence Gate (SD-LEO-INFRA-OPUS-MODULE-SUB-001)
    // DB-enforced: requires fresh sub_agent_execution_results rows for the required set
    gates.push(createSubagentEvidenceGate(this.supabase));

    // Parent orchestrators get simplified gates
    if (parentOrchestrator) {
      console.log('\n   📋 PARENT ORCHESTRATOR GATE SET (simplified)');
      return getParentOrchestratorGates(this.supabase, this.prdRepo, sd, options);
    }

    // Orchestrator CHILDREN get a reduced gate set — heavy gates like
    // DESIGN/DATABASE sub-agents, integration section, and architectural
    // pattern checklists run at the orchestrator level, not per-child.
    // Children keep: protocol, prerequisites, PRD exists, architecture,
    // BMAD, contract compliance, branch enforcement, planning completeness.
    const isOrchestratorChild = sd?.metadata?.parent_orchestrator || sd?.metadata?.auto_generated || sd?.parent_sd_id;
    if (isOrchestratorChild) {
      console.log('\n   📋 ORCHESTRATOR CHILD GATE SET (reduced — heavy gates run at parent level)');
      console.log(`      Parent: ${sd.metadata.parent_orchestrator || 'auto_generated'}`);

      // PRD existence check
      gates.push(createPrdExistsGate(this.prdRepo));

      // Architecture verification
      gates.push(createArchitectureVerificationGate(this.prdRepo, this.determineTargetRepository.bind(this)));

      // BMAD
      gates.push({
        name: 'BMAD_PLAN_TO_EXEC',
        validator: async (ctx) => {
          const bmadResult = await validateBMADForPlanToExec(ctx.sdId, this.supabase);
          ctx._bmadResult = bmadResult;
          return bmadResult;
        },
        required: true
      });

      // Contract Compliance
      gates.push(createContractComplianceGate(this.prdRepo, sd));

      // Planning Completeness
      gates.push(createPlanningCompletenessGate(this.supabase, sd));

      // Branch Enforcement
      gates.push(createBranchEnforcementGate(sd, appPath));

      // DFE Escalation
      gates.push(createDFEEscalationGate(this.supabase, 'plan-to-exec-gate'));

      return gates;
    }

    // --- Full gate set for standalone SDs ---

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

    // Planning Completeness (SD-LEO-INFRA-UNIVERSAL-PLANNING-COMPLETENESS-003)
    // 3-ring validation: Individual SD, Orchestrator coherence, Venture foundation
    // BLOCKING for feature/infrastructure/database/security; ADVISORY for fix/docs/enhancement
    gates.push(createPlanningCompletenessGate(this.supabase, sd));

    // Branch Enforcement
    gates.push(createBranchEnforcementGate(sd, appPath));

    // Architectural Pattern Checklist (SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-C)
    // ADVISORY: Scans PRD for state management, error handling, observability patterns
    // Only runs for complex SDs (story_points >= 8 OR LOC >= 500 OR hasChildren)
    gates.push(createArchitecturalPatternChecklistGate(this.prdRepo, sd, this.supabase));

    // DFE Escalation advisory gate (SD-MAN-GEN-CORRECTIVE-VISION-GAP-003)
    // Routes ESCALATE decisions to chairman_decisions for governance
    gates.push(createDFEEscalationGate(this.supabase, 'plan-to-exec-gate'));

    // Semantic Validation Gates (SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002)
    gates.push(createVisionDimensionCompletenessGate(this.supabase));
    gates.push(createArchitectureRequirementTraceGate(this.supabase));

    // Wireframe Gates (SD-LEO-INFRA-LEO-PROTOCOL-WIREFRAME-001)
    gates.push(createWireframeRequiredGate(this.prdRepo, this.supabase));

    // Translation Fidelity Gate — second invocation (SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001)
    // Re-evaluates architecture→SD alignment after PRD/planning work to catch drift
    gates.push(createTranslationFidelityGate(this.supabase));

    // Bugfix Coverage Preflight (SD-LEARN-FIX-ADDRESS-PAT-EXECTOPLAN-001, FR-3)
    // Advisory — shifts EXEC-TO-PLAN discovery left by enumerating upcoming requirements
    // (user story AC coverage + TESTING sub-agent) at PLAN-TO-EXEC time. Never blocks.
    gates.push(createBugfixCoveragePreflightGate(this.supabase));

    // Cross-SD File-Overlap Temporal Gate — PLAN oracle (SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 FR-2a)
    // Detects file overlap with SDs shipped within the configured 48h window
    // using PRD target_files as the comparison oracle. High-risk = FAIL, medium = WARN unless ack'd.
    gates.push(createCrossSdFileOverlapTemporalGate(this.supabase));

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
    // QF-20260423-200: Wrap in diagnostic catch — any exception gets a structured
    // reason code (ANALYSIS_SYNTHESIS_FAILED) so ResultBuilder.systemError surfaces
    // the specific failure step in REASON= instead of generic SYSTEM_ERROR.
    let analysisStep;
    try {
      analysisStep = await this._synthesizeLeadAnalysis(sdId, sd, prd);
    } catch (error) {
      const wrapped = new Error(`ANALYSIS_SYNTHESIS_FAILED: ${error.message || error.constructor?.name || 'unknown'}`);
      wrapped.name = 'ANALYSIS_SYNTHESIS_FAILED';
      wrapped.cause = error;
      if (error.stack) wrapped.stack = `${wrapped.message}\nCaused by: ${error.stack}`;
      throw wrapped;
    }
    if (analysisStep) {
      options._analysisStep = analysisStep;
    }

    // AI Quality Assessment (Russian Judge) - PRD & User Stories
    // QF-20260423-200: Wrap in diagnostic catch (see above)
    try {
      await this._runRussianJudgeAssessment(prd, sd);
    } catch (error) {
      const wrapped = new Error(`RUSSIAN_JUDGE_FAILED: ${error.message || error.constructor?.name || 'unknown'}`);
      wrapped.name = 'RUSSIAN_JUDGE_FAILED';
      wrapped.cause = error;
      if (error.stack) wrapped.stack = `${wrapped.message}\nCaused by: ${error.stack}`;
      throw wrapped;
    }

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
      // QF-20260423-200: Wrap in diagnostic catch (see above)
      try {
        verificationResult = await verifier.verifyHandoff(sdId, options.prdId);
      } catch (error) {
        const wrapped = new Error(`VERIFIER_EXCEPTION: ${error.message || error.constructor?.name || 'unknown'}`);
        wrapped.name = 'VERIFIER_EXCEPTION';
        wrapped.cause = error;
        if (error.stack) wrapped.stack = `${wrapped.message}\nCaused by: ${error.stack}`;
        throw wrapped;
      }

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

    // SD-LEO-INFRA-AUTO-WORKTREE-START-001: Worktree creation moved to sd:start
    // sd:start is the single entry point for worktree lifecycle. Branch creation
    // remains here via GATE6_BRANCH_ENFORCEMENT; worktree creation is handled by
    // resolve-sd-workdir.js mode=claim when sd:start runs.
    const branchResults = gateResults.gateResults.GATE6_BRANCH_ENFORCEMENT?.details || {};
    const sdKey = sd.sd_key || sdId;
    const worktreeResult = null;
    if (branchResults.expectedBranch) {
      console.log(`\n   ℹ️  Branch created: ${branchResults.expectedBranch}`);
      console.log('   ℹ️  Worktree will be created by sd:start (single entry point)');
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

  // QF-20260424-806: forward context so promptFn(ctx) can interpolate sdId.
  getRemediation(gateName, context = {}) {
    return getRemediation(gateName, context);
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
