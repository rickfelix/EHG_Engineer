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
  createSmokeTestSpecificationGate
} from './gates/index.js';

// Helper modules
import { transitionSdToPlan } from './state-transitions.js';
import { displayPreHandoffWarnings } from './pre-handoff-warnings.js';
import { createHandoffRetrospective } from './retrospective.js';
import { autoGeneratePRDScript } from './prd-generation.js';

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

  getRequiredGates(_sd, _options) {
    const gates = [];

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

    // LEO v4.4.1: Proactive Branch Creation Gate (DISABLED)
    // See: ./gates/branch-preparation.js for code preserved for reference
    // Branches are now created on-demand when /ship is invoked.

    return gates;
  }

  async executeSpecific(sdId, sd, _options, _gateResults) {
    // Display pre-handoff warnings from recent retrospectives
    await displayPreHandoffWarnings('LEAD_TO_PLAN', this.supabase);

    // Delegate to existing LeadToPlanVerifier
    const verifier = this.verifier || new LeadToPlanVerifier();
    const result = await verifier.verifyHandoff(sdId);

    if (!result.success) {
      return result;
    }

    // Gap #7 Fix (2026-01-01): Update SD current_phase to PLAN_PRD
    await transitionSdToPlan(sdId, sd, this.supabase);

    // Auto-generate PRD script on successful LEAD→PLAN handoff
    await autoGeneratePRDScript(sdId, sd);

    // Create handoff retrospective after successful handoff
    await createHandoffRetrospective(sdId, sd, result, 'LEAD_TO_PLAN', this.supabase);

    // Merge additional context
    return {
      success: true,
      ...result,
      qualityScore: result.qualityScore || 100
    };
  }

  getRemediation(_gateName) {
    return 'Review LEAD validation requirements. Ensure SD has all required fields and approvals.';
  }

  async _loadVerifier() {
    if (!LeadToPlanVerifier) {
      const { default: Verifier } = await import('../../../../verify-handoff-lead-to-plan.js');
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
