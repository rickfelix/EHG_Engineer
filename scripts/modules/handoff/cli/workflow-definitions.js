/**
 * Workflow Definitions for SD Types
 *
 * SD Type-aware workflow definitions for LEO Protocol handoffs.
 * Defines required/optional handoffs and skipped validation per SD type.
 *
 * Extracted from scripts/handoff.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 *
 * @see SD-LEO-PROTOCOL-V435-001
 */

/**
 * SD Type-aware workflow definitions
 * SD-LEO-PROTOCOL-V435-001: Added all 9 SD types with type-specific requirements
 */
export const WORKFLOW_BY_SD_TYPE = {
  feature: {
    name: 'Full LEO Workflow',
    description: 'Complete workflow with all gates and sub-agents',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: [],
    note: 'Feature SDs require full E2E testing and all verification gates'
  },
  infrastructure: {
    name: 'Modified LEO Workflow (Infrastructure)',
    description: 'Reduced validation - no E2E tests, skips TESTING/GITHUB sub-agents',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: ['EXEC-TO-PLAN'],
    skippedValidation: ['TESTING', 'GITHUB', 'E2E tests', 'Gates 3 & 4'],
    note: 'Infrastructure SDs can skip EXEC-TO-PLAN if no code validation needed'
  },
  documentation: {
    name: 'Quick LEO Workflow (Documentation)',
    description: 'Minimal workflow for docs-only changes',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: ['EXEC-TO-PLAN'],
    skippedValidation: ['TESTING', 'GITHUB', 'E2E tests', 'Gates 3 & 4', 'Implementation Fidelity'],
    note: 'Documentation SDs have no code to validate'
  },
  database: {
    name: 'Modified LEO Workflow (Database)',
    description: 'Reduced E2E validation, DATABASE sub-agent required',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: ['Some E2E tests (UI-dependent)'],
    note: 'Database SDs require DATABASE sub-agent validation'
  },
  security: {
    name: 'Modified LEO Workflow (Security)',
    description: 'Full validation with SECURITY sub-agent required',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: [],
    note: 'Security SDs require SECURITY sub-agent validation'
  },
  refactor: {
    name: 'Refactoring LEO Workflow (Intensity-Aware)',
    description: 'Workflow varies by intensity level (cosmetic/structural/architectural)',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
    optional: ['LEAD-FINAL-APPROVAL'],
    skippedValidation: [],
    note: 'Refactor SDs require REGRESSION sub-agent. Intensity level REQUIRED.',
    intensityOverrides: {
      cosmetic: {
        required: ['LEAD-TO-PLAN', 'PLAN-TO-LEAD'],
        skippedValidation: ['E2E tests', 'REGRESSION (optional)', 'Full PRD']
      },
      structural: {
        required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
        skippedValidation: ['Retrospective (optional)']
      },
      architectural: {
        required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
        skippedValidation: []
      }
    }
  },
  // SD-LEO-PROTOCOL-V435-001: New type definitions
  bugfix: {
    name: 'Bugfix LEO Workflow',
    description: 'Streamlined workflow for bug fixes with regression testing',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: [],
    note: 'Bugfix SDs require regression testing to verify fix and prevent regressions'
  },
  performance: {
    name: 'Performance LEO Workflow',
    description: 'Full validation with PERFORMANCE sub-agent and benchmarks',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: [],
    skippedValidation: [],
    note: 'Performance SDs require PERFORMANCE sub-agent with baseline/comparison metrics'
  },
  orchestrator: {
    name: 'Orchestrator LEO Workflow',
    description: 'Parent SD workflow - completion driven by child SDs',
    required: ['LEAD-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
    optional: ['PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    skippedValidation: ['E2E tests', 'Implementation Fidelity', 'Deliverables Gate'],
    note: 'Orchestrator SDs complete when all children complete. No direct implementation.'
  }
};

/**
 * Get workflow for SD type
 *
 * @param {string} sdType - SD type (feature, infrastructure, etc.)
 * @returns {Object} - Workflow definition
 */
export function getWorkflowForType(sdType) {
  return WORKFLOW_BY_SD_TYPE[sdType] || WORKFLOW_BY_SD_TYPE.feature;
}

/**
 * Check if handoff is required for SD type
 *
 * @param {string} sdType - SD type
 * @param {string} handoffType - Handoff type (e.g., 'EXEC-TO-PLAN')
 * @returns {boolean} - Whether handoff is required
 */
export function isHandoffRequired(sdType, handoffType) {
  const workflow = getWorkflowForType(sdType);
  return workflow.required.includes(handoffType.toUpperCase());
}

/**
 * Check if handoff is optional for SD type
 *
 * @param {string} sdType - SD type
 * @param {string} handoffType - Handoff type (e.g., 'EXEC-TO-PLAN')
 * @returns {boolean} - Whether handoff is optional
 */
export function isHandoffOptional(sdType, handoffType) {
  const workflow = getWorkflowForType(sdType);
  return workflow.optional.includes(handoffType.toUpperCase());
}
