/**
 * Model Routing
 * Phase-aware model selection for sub-agents
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import { PHASE_MODEL_OVERRIDES, DEFAULT_MODEL_ASSIGNMENTS } from './phase-model-config.js';

/**
 * Determine thinking effort level for a sub-agent based on phase context
 * Returns effort level: 'low', 'medium', or 'high'
 *
 * @param {string} code - Sub-agent code (e.g., 'DATABASE', 'TESTING')
 * @param {string|null} phase - Current SD phase (LEAD, PLAN, EXEC) or null
 * @returns {string} Effort level (low, medium, high)
 */
export function getEffortForAgentAndPhase(code, phase) {
  const upperCode = code.toUpperCase();

  // If we have phase context, check for phase-specific override
  if (phase && PHASE_MODEL_OVERRIDES[phase]) {
    const phaseOverride = PHASE_MODEL_OVERRIDES[phase][upperCode];
    if (phaseOverride) {
      console.log(`   Effort routing: ${upperCode} in ${phase} -> ${phaseOverride} (phase-specific)`);
      return phaseOverride;
    }
  }

  // Fall back to default assignment
  const defaultEffort = DEFAULT_MODEL_ASSIGNMENTS[upperCode] || 'medium';
  console.log(`   Effort routing: ${upperCode} -> ${defaultEffort} (default)`);
  return defaultEffort;
}

/**
 * @deprecated Use getEffortForAgentAndPhase instead
 * Kept for backward compatibility during migration
 */
export const getModelForAgentAndPhase = getEffortForAgentAndPhase;
