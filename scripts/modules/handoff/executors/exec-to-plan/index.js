/**
 * ExecToPlanExecutor Module Index
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * Main executor class and re-exports for EXEC-TO-PLAN handoff functionality.
 * Refactored from 1,271 LOC monolithic file into focused modules.
 */

import BaseExecutor from '../BaseExecutor.js';

// Gate creators
import {
  createPrerequisiteCheckGate,
  createTestEvidenceAutoCaptureGate,
  createSubAgentOrchestrationGate,
  createMandatoryTestingValidationGate,
  createBMADValidationGate,
  createGate2ImplementationFidelityGate,
  createRCAGate,
  createHumanVerificationGate,
  createSubAgentEnforcementValidationGate,
  createLOCThresholdValidationGate,
  createPerformanceCriticalGate
} from './gates/index.js';

// Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
import { createProtocolFileReadGate } from '../../gates/protocol-file-read-gate.js';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';

// Helper modules
import {
  transitionUserStoriesToValidated,
  transitionPrdToVerification,
  transitionSDToExecComplete
} from './state-transitions.js';

// Atomic transitions (SD-LEO-INFRA-HARDENING-001)
import {
  executeAtomicExecToPlanTransition,
  isAtomicTransitionAvailable
} from './atomic-transitions.js';
import {
  validateTestEvidence,
  autoValidateStories,
  autoCompleteDeliverablesForSD
} from './test-evidence.js';
import { verifyGitCommits, runAutomatedShippingForSD } from './git-verification.js';
import { runRussianJudgeAssessment } from './russian-judge.js';
import { getRemediation } from './remediation.js';

// External validators (will be lazy loaded)
let getValidationRequirements;

/**
 * ExecToPlanExecutor - Executes EXEC → PLAN handoffs
 *
 * Validates that EXEC phase implementation is complete and ready for PLAN verification.
 */
export class ExecToPlanExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    this.validators = dependencies.validators || {};
  }

  get handoffType() {
    return 'EXEC-TO-PLAN';
  }

  async setup(sdId, sd, _options) {
    // Load validation requirements
    if (!getValidationRequirements) {
      const sdType = await import('../../../../../lib/utils/sd-type-validation.js');
      getValidationRequirements = sdType.getValidationRequirements;
    }

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

  getRequiredGates(sd, _options) {
    const gates = [];

    // SD Start Gate - FIRST (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
    // Ensures CLAUDE_CORE.md is read before any SD work
    gates.push(createSdStartGate(sd?.sd_key || sd?.id || 'unknown'));

    // Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
    // Ensures agent has read CLAUDE_EXEC.md before proceeding
    gates.push(createProtocolFileReadGate('EXEC-TO-PLAN'));

    // Prerequisite handoff check
    gates.push(createPrerequisiteCheckGate(this.supabase));

    // Test evidence auto-capture (LEO v4.4.2)
    gates.push(createTestEvidenceAutoCaptureGate());

    // Sub-agent orchestration
    gates.push(createSubAgentOrchestrationGate(this.supabase));

    // Mandatory testing validation (LEO v4.4.2)
    gates.push(createMandatoryTestingValidationGate(this.supabase));

    // BMAD validation
    gates.push(createBMADValidationGate(this.supabase));

    // Gate 2: Implementation Fidelity
    gates.push(createGate2ImplementationFidelityGate(this.supabase));

    // RCA gate
    gates.push(createRCAGate(this.supabase));

    // Human verification gate (LEO v4.4.0)
    gates.push(createHumanVerificationGate());

    // Sub-agent enforcement validation (LEO v4.4.3 - advisory)
    gates.push(createSubAgentEnforcementValidationGate(this.supabase));

    // LOC threshold validation (LEO v4.4.3 - advisory for infrastructure/refactor)
    gates.push(createLOCThresholdValidationGate(this.supabase));

    // Performance critical gate (SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001)
    // Blocks feature/performance/enhancement SDs with new barrel imports
    gates.push(createPerformanceCriticalGate(this.supabase));

    return gates;
  }

  async executeSpecific(sdId, sd, options, gateResults) {
    // Load PRD
    const prd = await this.prdRepo?.getBySdId(sd.id);

    if (!prd) {
      console.warn('⚠️  No PRD found for SD');
    }

    // LEO v4.3.4: Unified Test Evidence Validation
    console.log('\n🧪 Step 2: Unified Test Evidence Validation (LEO v4.3.4)');
    console.log('-'.repeat(50));
    const testEvidenceResult = await validateTestEvidence(this.supabase, sdId, sd, prd);

    // Auto-validate user stories
    await autoValidateStories(this.supabase, sdId);

    // Auto-complete deliverables
    const deliverablesStatus = await autoCompleteDeliverablesForSD(this.supabase, sdId);

    // AI Quality Assessment (Russian Judge)
    await runRussianJudgeAssessment(this.supabase, sdId, sd);

    // Git commit verification
    const commitVerification = await verifyGitCommits(sdId, sd, this.determineTargetRepository.bind(this));

    // Build success result
    const orchestrationResult = gateResults.gateResults.SUB_AGENT_ORCHESTRATION?.details || {};
    const bmadResult = gateResults.gateResults.BMAD_EXEC_TO_PLAN || {};

    // STATE TRANSITIONS (SD-LEO-INFRA-HARDENING-001: Atomic mode)
    console.log('\n📊 Step 6: STATE TRANSITIONS');
    console.log('-'.repeat(50));

    // Get PRD for transition
    const prdForTransition = await this.prdRepo?.getBySdId(sd.id);

    // Try atomic transition first (advisory lock + single transaction)
    const atomicAvailable = await isAtomicTransitionAvailable(this.supabase);

    if (atomicAvailable) {
      const atomicResult = await executeAtomicExecToPlanTransition(
        this.supabase,
        sdId,
        prdForTransition?.prd_id || prdForTransition?.uuid_id,
        { sessionId: process.env.CLAUDE_SESSION_ID }
      );

      if (!atomicResult.success) {
        throw new Error(`Atomic transition failed: ${atomicResult.error}`);
      }
    } else {
      // Fallback to legacy sequential transitions (non-atomic)
      console.log('   ⚠️  Atomic RPC not available, using legacy mode');

      // 6a. Update user stories to validated/completed status
      await transitionUserStoriesToValidated(this.supabase, sdId);

      // 6b. Update PRD status to verification
      await transitionPrdToVerification(this.supabase, prdForTransition);

      // 6c. Update SD phase to EXEC_COMPLETE
      await transitionSDToExecComplete(this.supabase, sdId);
    }

    // Automated shipping: PR Creation (LEO v4.3.5)
    const shippingResult = await runAutomatedShippingForSD(sdId, sd, this.determineTargetRepository.bind(this));

    return {
      success: true,
      subAgents: {
        total: orchestrationResult.total_agents,
        passed: orchestrationResult.passed
      },
      bmad_validation: bmadResult,
      test_evidence: testEvidenceResult,
      deliverables: deliverablesStatus,
      commit_verification: commitVerification,
      automated_shipping: shippingResult ? {
        decision: shippingResult.decision,
        confidence: shippingResult.confidence,
        pr_url: shippingResult.executionResult?.prUrl,
        pr_number: shippingResult.executionResult?.prNumber,
        escalated: shippingResult.shouldEscalate
      } : null,
      qualityScore: gateResults.normalizedScore ?? Math.round((gateResults.totalScore / gateResults.totalMaxScore) * 100)
    };
  }

  getRemediation(gateName) {
    return getRemediation(gateName);
  }
}

export default ExecToPlanExecutor;

// Re-export all modules for direct access
export * from './gates/index.js';
export {
  transitionUserStoriesToValidated,
  transitionPrdToVerification,
  transitionSDToExecComplete
} from './state-transitions.js';
export {
  validateTestEvidence,
  autoValidateStories,
  autoCompleteDeliverablesForSD
} from './test-evidence.js';
export { verifyGitCommits, runAutomatedShippingForSD } from './git-verification.js';
export { runRussianJudgeAssessment } from './russian-judge.js';
export { getRemediation, getAllRemediations } from './remediation.js';
