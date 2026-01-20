/**
 * LEO Orchestrator Module Index
 * Part of SD-LEO-REFACTOR-ORCH-MAIN-001
 *
 * This module provides the LEO Protocol Orchestrator components,
 * broken down into focused modules for maintainability.
 */

// Session Decision Logger
export { SessionDecisionLogger } from './session-decision-logger.js';

// Phase Requirements and Constants
export { PHASES, PHASE_REQUIREMENTS, VALID_EXECUTION_STATUSES } from './phase-requirements.js';

// Requirement Validators
export { validateRequirement, getSessionProloguePath } from './requirement-validators.js';

// Phase Executors
export {
  enforceSessionPrologue,
  verifySDEligibility,
  executeLEADPhase,
  executePLANPhase,
  executeEXECPhase,
  executeVERIFICATIONPhase,
  executeAPPROVALPhase
} from './phase-executors.js';

// Compliance and Reporting
export {
  enforceRetrospective,
  generateComplianceReport,
  checkPhaseCompletion,
  recordPhaseCompletion,
  handleExecutionFailure,
  initializeExecution
} from './compliance.js';

// PRD Generation
export {
  isConsolidatedSD,
  fetchBacklogItems,
  generatePRD,
  generateUserStories,
  generateAcceptanceCriteria
} from './prd-helpers.js';

// Backlog Helpers
export {
  generateBacklogEvidence,
  generateUserStoriesFromBacklog,
  generateAcceptanceCriteriaFromBacklogItem
} from './backlog-helpers.js';
