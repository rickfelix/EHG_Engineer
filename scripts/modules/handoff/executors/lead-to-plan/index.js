/**
 * LeadToPlanExecutor Module Index
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * Main executor class and re-exports for LEAD-TO-PLAN handoff functionality.
 * Refactored from 1,372 LOC monolithic file into focused modules.
 */

import BaseExecutor from '../BaseExecutor.js';

// Gate creators
import {
  createTransitionReadinessGate,
  createTargetApplicationGate,
  createSdTypeValidationGate,
  createBaselineDebtGate,
  createSmokeTestSpecificationGate,
  createPlaceholderContentGate,
  createVisionScoreGate,
  createLeadEvaluationGate,
  createCrossRepoConsumerImpactGate,
  // Pre-PLAN Adversarial Critique Gate (SD-LEO-INFRA-PRE-PLAN-ADVERSARIAL-001)
  createPrePlanCritiqueGate,
  // Semantic Validation Gates (SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002)
  createScopeReductionVerificationGate,
  createSdTypeCompatibilityGate,
  createOverlappingScopeDetectionGate,
  // Architecture Phase Coverage Gate (SD-LEO-INFRA-ARCHITECTURE-PHASE-COVERAGE-001)
  createPhaseCoverageGate,
  // SD Quality Gate (SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001-A)
  createSdQualityGate,
  // Translation Fidelity Gate (SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001)
  createTranslationFidelityGate
} from './gates/index.js';

// Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
import { createProtocolFileReadGate } from '../../gates/protocol-file-read-gate.js';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';

// DFE Escalation Gate (SD-MAN-GEN-CORRECTIVE-VISION-GAP-003)
import { createDFEEscalationGate } from '../../gates/dfe-escalation-gate.js';

// Helper modules
import { transitionSdToPlan } from './state-transitions.js';
import { displayPreHandoffWarnings } from './pre-handoff-warnings.js';
import { createHandoffRetrospective } from './retrospective.js';

// External verifier (will be lazy loaded)
let LeadToPlanVerifier;

/**
 * LeadToPlanExecutor - Executes LEAD → PLAN handoffs
 *
 * Validates that LEAD approval is complete and ready for PLAN phase.
 * Note: This mostly delegates to the existing LeadToPlanVerifier.
 *
 * ENHANCED: Creates handoff retrospectives for continuous improvement
 */
export class LeadToPlanExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    this.verifier = dependencies.verifier || null;
  }

  get handoffType() {
    return 'LEAD-TO-PLAN';
  }

  async setup(_sdId, _sd, _options) {
    await this._loadVerifier();
    return null;
  }

  getRequiredGates(sd, _options) {
    const gates = [];

    // SD Start Gate - FIRST (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
    // Ensures CLAUDE_CORE.md AND CLAUDE_PLAN.md (destination phase) are read before handoff
    gates.push(createSdStartGate(sd?.sd_key || sd?.id || 'unknown', 'LEAD-TO-PLAN'));

    // Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
    // Validates CLAUDE_PLAN.md was read (destination phase file)
    gates.push(createProtocolFileReadGate('LEAD-TO-PLAN'));

    // SD Transition Readiness Gate
    gates.push(createTransitionReadinessGate(this.supabase));

    // Target Application Validation Gate
    gates.push(createTargetApplicationGate(this.supabase));

    // SD Type Validation Gate
    gates.push(createSdTypeValidationGate(this.supabase));

    // Baseline Debt Check Gate
    gates.push(createBaselineDebtGate(this.supabase));

    // Smoke Test Specification Gate (LEO v4.4.0)
    gates.push(createSmokeTestSpecificationGate());

    // Placeholder Content Detection Gate (SD-LEO-INFRA-PROTOCOL-FILE-STATE-001)
    // Warning-only: detects default template text from leo-create-sd.js
    gates.push(createPlaceholderContentGate());

    // SD Quality Gate (SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001-A)
    // BLOCKING: validates field completeness, content depth, structural correctness
    gates.push(createSdQualityGate());

    // LEO v4.4.1: Proactive Branch Creation Gate (DISABLED)
    // See: ./gates/branch-preparation.js for code preserved for reference
    // Branches are now created on-demand when /ship is invoked.

    // Vision Score Gate (SD-MAN-INFRA-VISION-SCORE-GATE-001)
    // Hard enforcement — blocks when vision score below sd_type threshold or absent
    // Corrective SDs (with vision_origin_score_id) are exempt (PAT-CORR-VISION-GATE-001)
    gates.push(createVisionScoreGate(this.supabase));

    // Lead Evaluation Check Gate (SD-MAN-ORCH-IMPROVE-STEP-LEAD-002-A)
    // Warning-only: checks for structured lead_evaluations record
    gates.push(createLeadEvaluationGate(this.supabase));

    // Cross-Repo Consumer Impact Gate (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-048)
    // Advisory-only: warns when SD may affect consumers in other repos
    gates.push(createCrossRepoConsumerImpactGate());

    // Pre-PLAN Adversarial Critique Gate (SD-LEO-INFRA-PRE-PLAN-ADVERSARIAL-001)
    // Advisory-only: runs critiquePlanProposal and persists to plan_critiques
    gates.push(createPrePlanCritiqueGate(this.supabase));

    // DFE Escalation advisory gate (SD-MAN-GEN-CORRECTIVE-VISION-GAP-003)
    // Routes ESCALATE decisions to chairman_decisions for governance
    gates.push(createDFEEscalationGate(this.supabase, 'lead-to-plan-gate'));

    // Semantic Validation Gates (SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002)
    gates.push(createScopeReductionVerificationGate(this.supabase));
    gates.push(createSdTypeCompatibilityGate(this.supabase));
    gates.push(createOverlappingScopeDetectionGate(this.supabase));

    // Architecture Phase Coverage Gate (SD-LEO-INFRA-ARCHITECTURE-PHASE-COVERAGE-001)
    // Blocks when an architecture plan has uncovered phases
    gates.push(createPhaseCoverageGate(this.supabase));

    // Translation Fidelity Gate (SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001)
    // LLM-powered: verifies SD captures architecture plan and vision intent
    // Skips when no arch plan linked; caches results for 1 hour
    gates.push(createTranslationFidelityGate(this.supabase));

    return gates;
  }

  async executeSpecific(sdId, sd, _options, _gateResults) {
    // Display pre-handoff warnings from recent retrospectives
    // PAT-LATE-REQ-001: Pass SD to surface type-specific requirements early
    await displayPreHandoffWarnings('LEAD_TO_PLAN', this.supabase, sd);

    // Delegate to existing LeadToPlanVerifier
    const verifier = this.verifier || new LeadToPlanVerifier();
    const result = await verifier.verifyHandoff(sdId);

    if (!result.success) {
      return result;
    }

    // Gap #7 Fix (2026-01-01): Update SD current_phase to PLAN_PRD
    await transitionSdToPlan(sdId, sd, this.supabase);

    // Create handoff retrospective after successful handoff
    await createHandoffRetrospective(sdId, sd, result, 'LEAD_TO_PLAN', this.supabase);

    // SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001B-RCA: Return success BEFORE PRD generation
    // PRD generation is deferred to post-handoff phase in HandoffOrchestrator
    // This ensures handoff is recorded even if PRD generation times out
    return {
      success: true,
      ...result,
      qualityScore: result.qualityScore || 100,
      // Flag for orchestrator to trigger PRD generation after recording
      _deferredPrdGeneration: { sdId, sd }
    };
  }

  getRemediation(_gateName) {
    return 'Review LEAD validation requirements. Ensure SD has all required fields and approvals.';
  }

  async _loadVerifier() {
    if (!LeadToPlanVerifier) {
      const { default: Verifier } = await import('../../../../verify-l2p/index.js');
      LeadToPlanVerifier = Verifier;
    }
  }
}

export default LeadToPlanExecutor;

// Re-export all modules for direct access
export * from './gates/index.js';
export { transitionSdToPlan } from './state-transitions.js';
export { displayPreHandoffWarnings } from './pre-handoff-warnings.js';
export { createHandoffRetrospective } from './retrospective.js';
export { autoGeneratePRDScript } from './prd-generation.js';
export { getRepoPath } from './utils.js';
