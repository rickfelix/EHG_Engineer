/**
 * Orchestrator Module - Entry Point
 *
 * Re-exports all orchestrator-related modules for convenient importing.
 * Part of SD-LEO-REFACTOR-ORCH-001 refactoring.
 */

// Session decision logging
export { SessionDecisionLogger } from './session-decision-logger.js';

// Phase requirements and validation
export {
  PHASES,
  PHASE_REQUIREMENTS,
  VALID_EXECUTION_STATUSES,
  validateRequirement,
  verifySDEligibility
} from './phase-requirements.js';

// PRD generation functions
export {
  isConsolidatedSD,
  fetchBacklogItems,
  generateBacklogEvidence,
  generateAcceptanceCriteriaFromBacklogItem,
  generateUserStoriesFromBacklog,
  generateUserStories,
  generateAcceptanceCriteria,
  generatePRD
} from './prd-generator.js';

// Phase sub-agent configuration
export {
  PHASE_SUBAGENT_MAP,
  PLAN_PRD_BY_SD_TYPE,
  PLAN_VERIFY_BY_SD_TYPE,
  REFACTOR_INTENSITY_SUBAGENTS,
  MANDATORY_SUBAGENTS_BY_PHASE,
  REFACTOR_INTENSITY_MANDATORY,
  ALWAYS_REQUIRED_BY_PHASE,
  SCHEMA_KEYWORDS,
  INFRASTRUCTURE_KEYWORDS,
  CONDITIONAL_REQUIREMENTS,
  getPhaseSubAgentCodes,
  getMandatorySubAgents
} from './phase-subagent-config.js';

// Sub-agent selection functions
export {
  getSDDetails,
  getPhaseSubAgents,
  getPhaseSubAgentsForSd,
  isSubAgentRequired
} from './subagent-selection.js';

// Sub-agent execution functions
export {
  normalizeDetailedAnalysis,
  executeSubAgent,
  verifyExecutionRecorded,
  storeSubAgentResult,
  updatePRDMetadataFromSubAgents
} from './subagent-execution.js';

// Result aggregation functions
export {
  aggregateResults,
  calculateConfidence,
  getResultsSummary,
  canProceed,
  getBlockingIssues,
  formatResultsOutput
} from './result-aggregation.js';
