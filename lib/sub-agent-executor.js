/**
 * Generic Sub-Agent Executor Framework
 * LEO Protocol v4.3.2 - Sub-Agent Performance Enhancement
 *
 * Purpose: Standardized execution framework that automatically loads
 * sub-agent instructions from database and ensures they're always read.
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 * Updated: 2025-11-07 - Fixed RLS access using service role key (SD-CREWAI-ARCHITECTURE-001)
 * Updated: 2025-11-26 - Added on-demand loading support for Opus 4.5 optimization
 * Updated: 2025-11-28 - Added pattern injection from issue_patterns table (LEO Protocol v4.3.2)
 *
 * REFACTORED: This file now re-exports from modular structure
 * See lib/sub-agent-executor/ directory for implementation:
 *   - constants.js - Configuration values and thresholds
 *   - phase-model-config.js - Model routing configuration
 *   - supabase-client.js - Supabase client management
 *   - sd-resolver.js - SD key/UUID resolution
 *   - model-routing.js - Phase-aware model selection
 *   - pattern-loader.js - Pattern injection
 *   - instruction-loader.js - Sub-agent instruction loading
 *   - executor.js - Main executeSubAgent function
 *   - results-storage.js - Database storage functions
 *   - history.js - History and query functions
 *   - index.js - Main exports and helpers
 *
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

// Re-export everything from modular structure
export {
  // Constants
  VALIDATION_SCORE_THRESHOLD,
  VALIDATION_MAX_RETRIES,
  ENABLE_FULL_VALIDATION,
  USE_TASK_CONTRACTS,
  INSTRUCTION_ARTIFACT_THRESHOLD,
  RESULT_COMPRESSION_THRESHOLD,
  PRD_LINKABLE_SUBAGENTS,

  // Phase model configuration
  loadPhaseModelConfig,
  PHASE_MODEL_OVERRIDES,
  DEFAULT_MODEL_ASSIGNMENTS,
  SUB_AGENT_CATEGORY_MAPPING,

  // Supabase client
  getSupabaseClient,

  // SD resolution
  resolveSdKeyToUUID,
  getSDPhase,

  // Model routing
  getModelForAgentAndPhase,

  // Pattern loading
  loadRelevantPatterns,

  // Instruction loading
  loadSubAgentInstructions,
  formatInstructionsForClaude,

  // Main executor
  executeSubAgent,

  // Results storage
  storeSubAgentResults,
  storeValidationResults,

  // History functions
  getValidationHistory,
  getSubAgentHistory,
  getAllSubAgentResultsForSD,
  listAllSubAgents,

  // On-demand loading
  getSubAgentCatalog,
  loadSubAgentDocumentation,
  searchRelevantSubAgents,
  loadMultipleSubAgentDocs,

  // Task contract helpers
  readArtifactContent,
  claimPendingContract,
  storeOutputArtifact,
  isContractModeEnabled,
  executeSubAgentWithFullContext,
  executeSubAgentWithContract
} from './sub-agent-executor/index.js';
