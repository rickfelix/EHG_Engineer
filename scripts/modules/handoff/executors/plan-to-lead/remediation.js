/**
 * Remediation Messages for PLAN-TO-LEAD Gates
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
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
    'PREREQUISITE_HANDOFF_CHECK',
    'SUB_AGENT_ORCHESTRATION',
    'RETROSPECTIVE_QUALITY_GATE',
    'GATE5_GIT_COMMIT_ENFORCEMENT',
    'GATE3_TRACEABILITY',
    'GATE4_WORKFLOW_ROI',
    'USER_STORY_EXISTENCE_GATE'
  ];
  const result = {};
  for (const gate of gates) {
    const mapped = getMappedRemediation(gate, {});
    result[gate] = mapped ? mapped.message : null;
  }
  return result;
}
