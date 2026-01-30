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

// Protocol File Read Gate (SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001)
import { createProtocolFileReadGate } from '../../gates/protocol-file-read-gate.js';

// Core Protocol Gate - SD Start Gate (SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001)
import { createSdStartGate } from '../../gates/core-protocol-gate.js';

// Helper modules
import { transitionSdToPlan } from './state-transitions.js';
import { displayPreHandoffWarnings } from './pre-handoff-warnings.js';
import { createHandoffRetrospective } from './retrospective.js';
import { autoGeneratePRDScript } from './prd-generation.js';
import { autoApprovePRD } from '../../auto-approve-prd.js';

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

    // Auto-approve PRD if it meets quality thresholds (SD-LEO-FIX-PRD-STATUS-001)
    // This enables full automation - PRDs that pass validation are auto-approved
    try {
      const approvalResult = await autoApprovePRD(sdId);
      if (approvalResult.approved) {
        console.log(`   ✅ PRD auto-approved with score: ${approvalResult.score}%`);
      } else {
        console.log(`   ℹ️  PRD not auto-approved: ${approvalResult.reason}`);
      }
    } catch (err) {
      // Non-blocking - log error but don't fail the handoff
      console.log(`   ⚠️  Auto-approve error: ${err.message}`);
    }

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
