/**
 * Remediation Messages for PLAN-TO-EXEC Gates
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 * Enhanced with Task tool invocations (SD-LEO-INFRA-ACTIONABLE-REJECTION-TEMPLATES-001)
 *
 * Delegates to centralized rejection-subagent-mapping.js for Task tool invocations.
 */

import { getRemediation as getMappedRemediation } from '../../rejection-subagent-mapping.js';

/**
 * Get remediation guidance for a specific gate
 *
 * @param {string} gateName - Name of the gate
 * @param {Object} context - Optional { sdId, gateName, details, score } for richer prompts
 * @returns {string|null} Remediation guidance or null if not found
 */
export function getRemediation(gateName, context = {}) {
  const mapped = getMappedRemediation(gateName, context);
  if (mapped) return mapped.message;
  return null;
}

/**
 * Get all available remediations (code list only, for enumeration)
 *
 * @returns {Object} Map of gate names to remediation messages
 */
export function getAllRemediations() {
  // Return static keys for backward compatibility
  const gates = [
    'GATE_ARCHITECTURE_VERIFICATION',
    'BMAD_PLAN_TO_EXEC',
    'GATE_CONTRACT_COMPLIANCE',
    'GATE1_DESIGN_DATABASE',
    'GATE6_BRANCH_ENFORCEMENT',
    'PREREQUISITE_HANDOFF_CHECK',
    'GATE_PRD_EXISTS',
    'GATE_EXPLORATION_AUDIT',
    'GATE_DELIVERABLES_PLANNING'
  ];
  const result = {};
  for (const gate of gates) {
    const mapped = getMappedRemediation(gate, {});
    result[gate] = mapped ? mapped.message : null;
  }
  return result;
}
