/**
 * Model Routing
 * Phase-aware model selection for sub-agents
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import { PHASE_MODEL_OVERRIDES, DEFAULT_MODEL_ASSIGNMENTS } from './phase-model-config.js';

/**
 * Determine optimal model for a sub-agent based on phase context
 * @param {string} code - Sub-agent code (e.g., 'DATABASE', 'TESTING')
 * @param {string|null} phase - Current SD phase (LEAD, PLAN, EXEC) or null
 * @returns {string} Model to use (haiku, sonnet, opus)
 */
export function getModelForAgentAndPhase(code, phase) {
  const upperCode = code.toUpperCase();

  // If we have phase context, check for phase-specific override
  if (phase && PHASE_MODEL_OVERRIDES[phase]) {
    const phaseOverride = PHASE_MODEL_OVERRIDES[phase][upperCode];
    if (phaseOverride) {
      console.log(`   Model routing: ${upperCode} in ${phase} -> ${phaseOverride} (phase-specific)`);
      return phaseOverride;
    }
  }

  // Fall back to default assignment
  const defaultModel = DEFAULT_MODEL_ASSIGNMENTS[upperCode] || 'sonnet';
  console.log(`   Model routing: ${upperCode} -> ${defaultModel} (default)`);
  return defaultModel;
}
