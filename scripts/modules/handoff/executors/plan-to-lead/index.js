/**
 * PlanToLeadExecutor Module Index
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * Main executor class and re-exports for PLAN-TO-LEAD handoff functionality.
 * Refactored from 1,427 LOC monolithic file into focused modules.
 */

import BaseExecutor from '../BaseExecutor.js';
import ResultBuilder from '../../ResultBuilder.js';
import { isInfrastructureSDSync } from '../../../sd-type-checker.js';
import { enrichRetrospectivePreGate } from '../../retrospective-enricher.js';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';

// Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
import { createProtocolFileReadGate } from '../../gates/protocol-file-read-gate.js';

// DFE Escalation Gate (SD-MAN-GEN-CORRECTIVE-VISION-GAP-003)
import { createDFEEscalationGate } from '../../gates/dfe-escalation-gate.js';

// Gate creators
import {
  createPrerequisiteCheckGate,
  createSubAgentOrchestrationGate,
  createRetrospectiveQualityGate,
  createGitCommitEnforcementGate,
  createTraceabilityGate,
  createWorkflowROIGate,
  createUserStoryExistenceGate,
  createDocumentationLinkValidationGate,
  createHealBeforeCompleteGate,
  createAcceptanceCriteriaValidationGate,
  createSuccessMetricsAchievementGate,
  createVisionCompletionScoreGate,
  createArchitecturePlanValidationGate,
  createSuccessMetricsVerificationGate,
  createSmokeTestEvidenceGate,
  createFailureChainOrderingGate,
  // Semantic Validation Gates (SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002)
  createScopeAuditGate,
  createChildScopeCoverageGate
} from './gates/index.js';
// Note: requiresTraceabilityGates is re-exported via 'export * from ./gates/index.js'

// Helper modules
import {
  finalizeUserStories,
  checkAndCompleteParentSD,
  completeOrchestratorSD,
  completeStandardSD
} from './state-transitions.js';
import { validatePlanVerification } from './plan-verification.js';
import { getRemediation } from './remediation.js';

/**
 * Pre-validate success_metrics format before gates run.
 * PAT-AUTO-41b51e4d
 * @param {Object} sd
 * @returns {string[]} issues
 */
function validateSuccessMetricsFormat(sd) {
  const issues = [];
  const metrics = sd?.success_metrics;
  if (!metrics || !Array.isArray(metrics) || metrics.length === 0) return issues;
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (typeof m === 'string') {
      issues.push(`   ❌ [${i}] Plain string metric: "${m.substring(0, 60)}${m.length > 60 ? '...' : ''}"`);
      issues.push('      Expected: { name: "...", target: "...", actual: "...", met: true/false }');
    } else if (typeof m === 'object' && m !== null) {
      const name = m.name || m.metric;
      if (!name) {
        issues.push(`   ⚠️  [${i}] Missing 'name' field in metric object`);
      }
      if (!m.actual && m.actual !== 0 && m.actual !== false) {
        issues.push(`   ℹ️  [${i}] Empty 'actual' in "${name || 'unknown'}" — gate will score 0`);
      }
    }
  }
  return issues;
}

/**
 * Pre-check smoke test readiness for pipeline SDs.
 * PAT-AUTO-77fe50e3
 * @param {Object} supabase
 * @param {Object} sd
 * @param {string} sdId
 */
const PIPELINE_KEYWORDS = [
  'pipeline', 'orchestrat', 'stage-execution', 'stage_execution',
  'eva-orchestrator', 'reality-gate', 'lifecycle',
  'venture_artifact', 'venture-artifact', 'stage-template',
  'handoff-system',
];

async function preCheckSmokeTestReadiness(supabase, sd, sdId) {
  const sdKey = (sd.sd_key || '').toUpperCase();
  if (sdKey.startsWith('SD-LEARN-')) return;

  const searchText = [sd.sd_key || '', sd.title || '', sd.description || ''].join(' ').toLowerCase();
  const isPipeline = PIPELINE_KEYWORDS.some(kw => searchText.includes(kw));
  if (!isPipeline) return;

  const archKey = sd.metadata?.architecture_key || sd.metadata?.arch_key;
  if (!archKey) {
    console.log('\n   ⚠️  SMOKE TEST READINESS PRE-CHECK');
    console.log('   Pipeline SD detected but no architecture plan linked (metadata.arch_key)');
    return;
  }

  try {
    const { data: plan } = await supabase
      .from('eva_architecture_plans')
      .select('content, sections')
      .eq('plan_key', archKey)
      .single();

    if (!plan) return;

    const contentStr = typeof plan.content === 'string' ? plan.content : JSON.stringify(plan.content || '');
    const sectionsStr = JSON.stringify(plan.sections || {});
    const hasBaseline = /baseline.?observation/i.test(contentStr + sectionsStr);

    if (!hasBaseline) {
      console.log('\n   ⚠️  SMOKE TEST READINESS PRE-CHECK');
      console.log(`   Architecture plan "${archKey}" missing "Baseline Observation" section.`);
      console.log('   Add: ## Baseline Observation with actual runtime output.');
    }
  } catch (_err) {
    // Intentionally suppressed: non-fatal, gate handles actual validation
    console.debug('[PlanToLeadExecutor] smoke test readiness pre-check suppressed:', _err?.message || _err);
  }
}

/**
 * PlanToLeadExecutor - Executes PLAN → LEAD handoffs
 *
 * Validates that PLAN verification is complete and ready for LEAD final approval.
 */
export class PlanToLeadExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    this.validators = dependencies.validators || {};
  }

  get handoffType() {
    return 'PLAN-TO-LEAD';
  }

  async setup(sdId, sd, options) {
    const appPath = this.determineTargetRepository(sd);
    options._appPath = appPath;
    options._sd = sd;

    // RCA-PAT-WORKFLOW-GAP-001: Auto-generate retrospective if missing
    // Gates validate retrospective existence but workflow never generated one.
    // Generate here (before gates run) to prevent "Validation Without Generation" gap.
    const { data: existingRetro } = await this.supabase
      .from('retrospectives')
      .select('id')
      .eq('sd_id', sd.id || sdId)
      .limit(1);

    if (!existingRetro || existingRetro.length === 0) {
      console.log('   🔄 No retrospective found - invoking RETRO sub-agent...');
      try {
        const { executeSubAgent } = await import('../../../../lib/sub-agent-executor.js');
        const retroResult = await executeSubAgent('RETRO', sd.id || sdId, { mode: 'completion' });
        if (retroResult?.verdict === 'FAIL') {
          console.warn(`   ⚠️  RETRO sub-agent returned FAIL: ${retroResult.findings?.[0]?.detail || 'unknown'}`);
        } else {
          console.log('   ✅ Retrospective generated via RETRO sub-agent');
        }
      } catch (retroErr) {
        console.warn(`   ⚠️  RETRO sub-agent invocation failed (non-fatal): ${retroErr.message}`);
        console.warn('   📝 Run manually: node scripts/execute-subagent.js --code RETRO --sd-id <SD_UUID>');
      }
    }

    // PAT-AUTO-19335057: Pre-gate retrospective enrichment
    // Re-enrich the newest retrospective with git context, handoff scores,
    // and pattern details before RETROSPECTIVE_QUALITY_GATE evaluates.
    try {
      const enrichResult = await enrichRetrospectivePreGate(this.supabase, sd.id || sdId, sd);
      if (enrichResult.enriched) {
        console.log(`   ✅ Pre-gate enrichment: updated ${enrichResult.fieldsUpdated.join(', ')}`);
      }
    } catch (enrichErr) {
      console.warn(`   ⚠️  Pre-gate enrichment failed (non-fatal): ${enrichErr.message}`);
    }

    // PAT-AUTO-41b51e4d: Pre-validate success_metrics format before gates run
    const metricsIssues = validateSuccessMetricsFormat(sd);
    if (metricsIssues.length > 0) {
      console.log('\n   ⚠️  SUCCESS_METRICS FORMAT PRE-VALIDATION');
      for (const issue of metricsIssues) {
        console.log(`   ${issue}`);
      }
    }

    // PAT-AUTO-77fe50e3: Pre-check smoke test readiness for pipeline SDs
    await preCheckSmokeTestReadiness(this.supabase, sd, sdId);

    return null;
  }

  getRequiredGates(sd, options) {
    const gates = [];
    const appPath = options._appPath;

    // SD Start Gate - FIRST (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
    // Ensures CLAUDE_CORE.md AND CLAUDE_LEAD.md (destination phase) are read before handoff
    gates.push(createSdStartGate(sd?.sd_key || sd?.id || 'unknown', 'PLAN-TO-LEAD'));

    // Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
    // Validates CLAUDE_LEAD.md was read (destination phase file)
    gates.push(createProtocolFileReadGate('PLAN-TO-LEAD'));

    // Prerequisite handoff check
    gates.push(createPrerequisiteCheckGate(this.supabase));

    // Orchestrator children get a reduced gate set — they are tactical decompositions
    // that should not face standalone SD requirements like heal scoring, retrospective
    // quality, traceability, or architecture plan validation.
    const isOrchestratorChild = sd?.metadata?.parent_orchestrator || sd?.metadata?.auto_generated;
    if (isOrchestratorChild) {
      console.log('\n   📋 ORCHESTRATOR CHILD GATE SET (reduced) for PLAN-TO-LEAD');
      console.log(`   Parent: ${sd.metadata.parent_orchestrator || 'auto_generated'}`);

      // Git commit enforcement
      gates.push(createGitCommitEnforcementGate(this.supabase, sd, appPath));

      return gates;
    }

    // Heal-before-complete gate (SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-03 FR-004)
    // SD heal score must meet threshold (93) before final approval
    gates.push(createHealBeforeCompleteGate(this.supabase));

    // Vision completion re-score (advisory — detects vision regression)
    gates.push(createVisionCompletionScoreGate(this.supabase));

    // Sub-agent orchestration
    gates.push(createSubAgentOrchestrationGate(this.supabase));

    // Retrospective quality gate
    gates.push(createRetrospectiveQualityGate(this.supabase));

    // Git commit enforcement
    gates.push(createGitCommitEnforcementGate(this.supabase, sd, appPath));

    // Traceability gates (conditional)
    const isNonCodeSD = isInfrastructureSDSync(sd);
    const sdType = (sd.sd_type || '').toLowerCase();
    const isBugfixSD = sdType === 'bugfix' || sdType === 'bug_fix';

    if (!isNonCodeSD && !isBugfixSD) {
      gates.push(createTraceabilityGate(this.supabase));
      gates.push(createWorkflowROIGate(this.supabase));
    }

    // User story existence gate
    gates.push(createUserStoryExistenceGate(this.supabase));

    // Acceptance criteria validation (blocking — every story must have criteria)
    gates.push(createAcceptanceCriteriaValidationGate(this.supabase));

    // Success metrics achievement (blocking — actuals must be recorded)
    gates.push(createSuccessMetricsAchievementGate(this.supabase));

    // Success metrics verification (Gap 2 — independently measures verifiable metrics)
    gates.push(createSuccessMetricsVerificationGate(this.supabase));

    // Documentation link validation gate (SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-D)
    gates.push(createDocumentationLinkValidationGate(this.supabase));

    // Architecture plan validation (advisory — checks dimension coverage)
    gates.push(createArchitecturePlanValidationGate(this.supabase));

    // Smoke Test Evidence gate (blocking for pipeline SDs)
    // Prevents architecture plans from missing runtime observation of the actual failure.
    // RCA: SD-LEO-INFRA-EVA-STAGE-PIPELINE-002 fixed downstream symptoms while the
    // root cause (loadStageTemplate queries non-existent table) was upstream and unfixed.
    gates.push(createSmokeTestEvidenceGate(this.supabase));

    // Failure Chain Ordering gate (blocking for pipeline orchestrators)
    // Ensures orchestrator children are ordered from root cause to symptoms.
    // Prevents fixing downstream layers while upstream layers remain broken.
    gates.push(createFailureChainOrderingGate(this.supabase));

    // DFE Escalation advisory gate (SD-MAN-GEN-CORRECTIVE-VISION-GAP-003)
    // Routes ESCALATE decisions to chairman_decisions for governance
    gates.push(createDFEEscalationGate(this.supabase, 'plan-to-lead-gate'));

    // Semantic Validation Gates (SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002)
    gates.push(createScopeAuditGate(this.supabase));
    gates.push(createChildScopeCoverageGate(this.supabase));

    return gates;
  }

  async executeSpecific(sdId, sd, options, gateResults) {
    // Check if orchestrator with all children complete
    const retroGateDetails = gateResults.gateResults?.RETROSPECTIVE_QUALITY_GATE?.details;
    const orchestratorAutoPass = retroGateDetails?.orchestrator_auto_pass;

    let children = retroGateDetails?.children || [];
    let isOrchestrator = orchestratorAutoPass || retroGateDetails?.is_orchestrator || children.length > 0;
    let allChildrenComplete = orchestratorAutoPass || retroGateDetails?.all_children_complete ||
      (isOrchestrator && children.every(c => c.status === 'completed'));

    // Fallback query if gate didn't cache children
    if (!orchestratorAutoPass && children.length === 0) {
      const { data: queriedChildren } = await this.supabase
        .from('strategic_directives_v2')
        .select('id, title, status')
        .eq('parent_sd_id', sdId);

      children = queriedChildren || [];
      isOrchestrator = children.length > 0;
      allChildrenComplete = isOrchestrator && children.every(c => c.status === 'completed');

      if (isOrchestrator) {
        console.log(`   ℹ️  Orchestrator detected via fallback query: ${children.length} children`);
      }
    }

    // ORCHESTRATOR PATH
    if (isOrchestrator && allChildrenComplete) {
      console.log('\n📂 ORCHESTRATOR SD COMPLETION PATH');
      console.log('═'.repeat(50));
      console.log(`   This is a PARENT ORCHESTRATOR with ${children.length} child SDs`);
      console.log('   All children completed - orchestrator validates via children');
      console.log('   Skipping PRD/user story validation (orchestrators coordinate, not produce)');
      console.log('\n   Child SDs:');
      children.forEach(c => console.log(`   ✅ ${c.sd_id || c.id}: ${c.title} [${c.status}]`));

      const result = await completeOrchestratorSD(this.supabase, sdId, children.length);

      if (!result.success) {
        return ResultBuilder.rejected('ID_NORMALIZATION_FAILED', result.error);
      }

      // SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E: Parent orchestrator completion
      // When all children complete, parent gets finalization commands
      // PAT-PRD-DUP-001: Import from source module (state-transitions.js doesn't re-export this)
      const { getParentFinalizationCommands } = await import('../../../../../lib/utils/orchestrator-child-completion.js');
      const parentCommands = getParentFinalizationCommands({ sd_key: sd.sd_key || sd.id });

      return {
        success: true,
        sdId: sdId,
        handoffId: result.handoffId,
        orchestrator: true,
        childCount: result.childrenCount,
        validation: {
          complete: true,
          score: 100,
          issues: [],
          warnings: [],
          orchestrator_completion: true
        },
        qualityScore: 100,
        // SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E: Orchestrator finalization flow
        orchestratorFlow: {
          isOrchestrator: true,
          allChildrenComplete: true,
          commandsToRun: parentCommands,
          childCommands: [],
          parentCommands: parentCommands
        }
      };
    }

    // STANDARD SD PATH
    const prd = await this.prdRepo?.getBySdId(sd.id);

    if (!prd) {
      if (isOrchestrator && !allChildrenComplete) {
        const incomplete = children.filter(c => c.status !== 'completed');
        return ResultBuilder.rejected(
          'ORCHESTRATOR_CHILDREN_INCOMPLETE',
          `Orchestrator SD has ${incomplete.length} incomplete child SDs - complete children first`,
          { incompleteChildren: incomplete.map(c => ({ sd_id: c.sd_id || c.id, title: c.title, status: c.status })) }
        );
      }

      // Check if this SD type requires a PRD via validation profile
      const sdType = (sd.sd_type || '').toLowerCase();
      let requiresPrd = true;
      if (sdType && this.supabase) {
        const { data: profile } = await this.supabase
          .from('sd_type_validation_profiles')
          .select('requires_prd')
          .eq('sd_type', sdType)
          .single();
        if (profile && profile.requires_prd === false) {
          requiresPrd = false;
        }
      }

      if (requiresPrd) {
        return ResultBuilder.rejected('NO_PRD', 'No PRD found - cannot verify work');
      }

      // NO-PRD PATH: SD type does not require a PRD (e.g., uat, infrastructure)
      console.log(`\n📋 NO-PRD COMPLETION PATH (sd_type="${sdType}" does not require PRD)`);
      console.log('═'.repeat(50));

      // Finalize user stories by SD ID (no PRD ID available)
      await finalizeUserStories(this.supabase, null, sdId);

      // Complete SD without PRD validation
      const handoffId = `PLAN-to-LEAD-noPRD-${sdId}-${Date.now()}`;
      const sdCanonicalId = (await import('../../../sd-id-normalizer.js')).normalizeSDId
        ? await (await import('../../../sd-id-normalizer.js')).normalizeSDId(this.supabase, sdId)
        : sdId;

      const { error: sdError } = await this.supabase
        .from('strategic_directives_v2')
        .update({
          status: 'pending_approval',
          current_phase: 'LEAD',
          updated_at: new Date().toISOString()
        })
        .eq('id', sdCanonicalId || sdId);

      if (sdError) {
        console.log(`   ⚠️  SD update error: ${sdError.message}`);
      } else {
        console.log('   ✅ SD status transitioned: → pending_approval (no PRD required)');
      }

      console.log('📊 Handoff ID:', handoffId);

      const orchestratorResult = await checkAndCompleteParentSD(this.supabase, sd);

      return {
        success: true,
        sdId: sdId,
        prdId: null,
        handoffId,
        validation: { complete: true, score: 100, issues: [], warnings: [], noPrdRequired: true },
        qualityScore: 100,
        orchestratorFlow: {
          isChild: !!sd.parent_sd_id,
          parentCompleted: orchestratorResult.parentCompleted,
          commandsToRun: orchestratorResult.commandsToRun,
          childCommands: orchestratorResult.childCommands,
          parentCommands: orchestratorResult.parentCommands
        }
      };
    }

    // Finalize user stories BEFORE validation
    await finalizeUserStories(this.supabase, prd.id, sdId);

    // Validate PLAN verification completeness
    const planValidation = await validatePlanVerification(this.supabase, prd, sd);

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

    // Safety net: Ensure all user stories are completed
    await finalizeUserStories(this.supabase, prd.id, sdId);

    // Complete the standard SD
    const stateResult = await completeStandardSD(this.supabase, sdId, prd, planValidation, gateResults);

    // Check if parent SD should be auto-completed
    // SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E: Now returns orchestrator completion flow commands
    const orchestratorResult = await checkAndCompleteParentSD(this.supabase, sd);

    return {
      success: true,
      sdId: sdId,
      prdId: prd.id,
      handoffId: stateResult.handoffId,
      validation: planValidation,
      qualityScore: planValidation.score,
      // SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E: Orchestrator child completion flow
      orchestratorFlow: {
        isChild: !!sd.parent_sd_id,
        parentCompleted: orchestratorResult.parentCompleted,
        commandsToRun: orchestratorResult.commandsToRun,
        childCommands: orchestratorResult.childCommands,
        parentCommands: orchestratorResult.parentCommands
      }
    };
  }

  getRemediation(gateName) {
    return getRemediation(gateName);
  }
}

export default PlanToLeadExecutor;

// Re-export all modules for direct access
export * from './gates/index.js';
export { finalizeUserStories, checkAndCompleteParentSD, completeOrchestratorSD, completeStandardSD } from './state-transitions.js';
export { validatePlanVerification } from './plan-verification.js';
export { getRemediation, getAllRemediations } from './remediation.js';
