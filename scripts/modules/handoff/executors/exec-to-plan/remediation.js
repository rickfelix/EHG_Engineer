/**
 * Remediation Messages for EXEC-TO-PLAN Gates
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 * Enhanced with Task tool invocations (SD-LEO-INFRA-ACTIONABLE-REJECTION-TEMPLATES-001)
 */

import { getRemediation as getMappedRemediation } from '../../rejection-subagent-mapping.js';

/**
 * Get remediation guidance for a specific gate
 *
 * @param {string} gateName - Name of the gate
 * @param {Object} context - Optional { sdId, gateName, details, score }
 * @returns {string|null} Remediation guidance or null if not found
 */
export function getRemediation(gateName, context = {}) {
  const mapped = getMappedRemediation(gateName, context);
  if (mapped) return mapped.message;
  return null;
}

/**
 * Get all available remediations
 *
 * @returns {Object} Map of gate names to remediation messages
 */
export function getAllRemediations() {
  const gates = [
    'SUB_AGENT_ORCHESTRATION',
    'BMAD_EXEC_TO_PLAN',
    'GATE2_IMPLEMENTATION_FIDELITY',
    'RCA_GATE',
    'MANDATORY_TESTING_VALIDATION',
    'TEST_EVIDENCE_AUTO_CAPTURE',
    'PREREQUISITE_HANDOFF_CHECK',
    'HUMAN_VERIFICATION_GATE'
  ];
  const result = {};
  for (const gate of gates) {
    const mapped = getMappedRemediation(gate, {});
    result[gate] = mapped ? mapped.message : null;
  }
  return result;
}
