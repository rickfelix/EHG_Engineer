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

// Gate creators
import {
  createPrerequisiteCheckGate,
  createSubAgentOrchestrationGate,
  createRetrospectiveQualityGate,
  createGitCommitEnforcementGate,
  createTraceabilityGate,
  createWorkflowROIGate,
  createUserStoryExistenceGate
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
    return null;
  }

  getRequiredGates(sd, options) {
    const gates = [];
    const appPath = options._appPath;

    // Prerequisite handoff check (always first)
    gates.push(createPrerequisiteCheckGate(this.supabase));

    // Sub-agent orchestration
    gates.push(createSubAgentOrchestrationGate());

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
      const { getParentFinalizationCommands } = await import('./state-transitions.js');
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
      return ResultBuilder.rejected('NO_PRD', 'No PRD found - cannot verify work');
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
