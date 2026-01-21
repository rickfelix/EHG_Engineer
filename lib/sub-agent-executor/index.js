/**
 * Sub-Agent Executor Index
 * Main entry point with re-exports for backward compatibility
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

// Re-export constants
export {
  VALIDATION_SCORE_THRESHOLD,
  VALIDATION_MAX_RETRIES,
  ENABLE_FULL_VALIDATION,
  USE_TASK_CONTRACTS,
  INSTRUCTION_ARTIFACT_THRESHOLD,
  RESULT_COMPRESSION_THRESHOLD,
  PRD_LINKABLE_SUBAGENTS
} from './constants.js';

// Re-export phase model configuration
export {
  loadPhaseModelConfig,
  PHASE_MODEL_OVERRIDES,
  DEFAULT_MODEL_ASSIGNMENTS,
  SUB_AGENT_CATEGORY_MAPPING
} from './phase-model-config.js';

// Re-export supabase client
export { getSupabaseClient } from './supabase-client.js';

// Re-export SD resolution
export { resolveSdKeyToUUID, getSDPhase } from './sd-resolver.js';

// Re-export model routing
export { getModelForAgentAndPhase } from './model-routing.js';

// Re-export pattern loading
export { loadRelevantPatterns } from './pattern-loader.js';

// Re-export instruction loading
export { loadSubAgentInstructions, formatInstructionsForClaude } from './instruction-loader.js';

// Re-export main executor
export { executeSubAgent } from './executor.js';

// Re-export results storage
export { storeSubAgentResults, storeValidationResults } from './results-storage.js';

// Re-export history functions
export {
  getValidationHistory,
  getSubAgentHistory,
  getAllSubAgentResultsForSD,
  listAllSubAgents
} from './history.js';

// ============================================================================
// ON-DEMAND LOADING (Opus 4.5 Optimization)
// Re-export on-demand loader functions for easy access
// ============================================================================

import {
  getSubAgentCatalog,
  loadSubAgentDocumentation,
  searchRelevantSubAgents,
  loadMultipleSubAgentDocs
} from '../utils/on-demand-loader.js';

/**
 * Get lightweight catalog of available sub-agents
 * Use this instead of listAllSubAgents() for better token efficiency
 */
export { getSubAgentCatalog };

/**
 * Load full documentation for a specific sub-agent ON-DEMAND
 * Call this only when you need the full instructions
 */
export { loadSubAgentDocumentation };

/**
 * Search for relevant sub-agents based on keywords
 * Returns list without loading full documentation
 */
export { searchRelevantSubAgents };

/**
 * Load documentation for multiple sub-agents in batch
 * More efficient than loading one at a time
 */
export { loadMultipleSubAgentDocs };

// ============================================================================
// TASK CONTRACT HELPERS (Agentic Context Engineering v3.0)
// Re-export artifact tools for sub-agent module use
// ============================================================================

import {
  createArtifact,
  readArtifact,
  claimTaskContract
} from '../artifact-tools.js';

import { USE_TASK_CONTRACTS as _USE_TASK_CONTRACTS } from './constants.js';
import { executeSubAgent as _executeSubAgent } from './executor.js';

/**
 * Read artifact content by ID
 * Sub-agent modules should use this to load input artifacts on-demand
 *
 * @example
 * // In a sub-agent module:
 * import { readArtifactContent, claimPendingContract } from '../sub-agent-executor.js';
 *
 * export async function execute(sdId, subAgent, options) {
 *   // If contract mode, read from artifacts
 *   if (options.inputArtifacts?.length > 0) {
 *     const instructions = await readArtifactContent(options.inputArtifacts[0]);
 *     // ... process instructions
 *   }
 * }
 */
export { readArtifact as readArtifactContent };

/**
 * Claim a pending task contract
 * Sub-agents can use this to pick up work from the queue
 */
export { claimTaskContract as claimPendingContract };

/**
 * Create a new artifact from content
 * Sub-agents can store their output as artifacts
 */
export { createArtifact as storeOutputArtifact };

/**
 * Check if task contracts are enabled
 * @returns {boolean} Whether contract mode is active
 */
export function isContractModeEnabled() {
  return _USE_TASK_CONTRACTS;
}

/**
 * Execute sub-agent with contract mode explicitly disabled
 * Use this when you want full context inheritance
 *
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution results
 */
export async function executeSubAgentWithFullContext(code, sdId, options = {}) {
  return _executeSubAgent(code, sdId, { ...options, useContract: false });
}

/**
 * Execute sub-agent with contract mode explicitly enabled
 * Use this when you want minimal context (contract-based handoff)
 *
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution results
 */
export async function executeSubAgentWithContract(code, sdId, options = {}) {
  return _executeSubAgent(code, sdId, { ...options, useContract: true });
}
