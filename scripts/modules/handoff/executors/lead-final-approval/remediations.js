/**
 * Remediations Domain
 * Defines remediation messages for failed gates
 * Enhanced with Task tool invocations (SD-LEO-INFRA-ACTIONABLE-REJECTION-TEMPLATES-001)
 *
 * @module lead-final-approval/remediations
 */

import { getRemediation as getMappedRemediation } from '../../rejection-subagent-mapping.js';

const GATE_NAMES = [
  'PLAN_TO_LEAD_HANDOFF_EXISTS',
  'USER_STORIES_COMPLETE',
  'RETROSPECTIVE_EXISTS',
  'PR_MERGE_VERIFICATION'
];

/**
 * Remediation messages (delegated to centralized mapping)
 */
export const REMEDIATIONS = Object.fromEntries(
  GATE_NAMES.map(gate => {
    const mapped = getMappedRemediation(gate, {});
    return [gate, mapped ? mapped.message : null];
  })
);

/**
 * Get remediation message for a specific gate
 * @param {string} gateName - Name of the failed gate
 * @param {Object} context - Optional { sdId, gateName, details, score }
 * @returns {string|null} Remediation message or null
 */
export function getRemediation(gateName, context = {}) {
  const mapped = getMappedRemediation(gateName, context);
  if (mapped) return mapped.message;
  return null;
}

export default {
  REMEDIATIONS,
  getRemediation
};
