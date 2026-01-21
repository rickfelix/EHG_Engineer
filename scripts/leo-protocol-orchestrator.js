#!/usr/bin/env node

/**
 * LEO Protocol Master Orchestrator
 * Enforces complete protocol compliance with zero skipped steps
 * Version: 2.2.0 - Evidence Pack Integration
 *
 * This is the SINGLE ENTRY POINT for all Strategic Directive executions
 * It ensures every step is followed and nothing is missed
 *
 * REFACTORED: This file now re-exports from modular structure
 * See leo-orchestrator/ directory for implementation:
 *   - constants.js - Phase definitions and requirements
 *   - session-decision-logger.js - Audit trail for decisions
 *   - validation.js - Requirement validation and phase gates
 *   - phase-execution.js - Individual phase execution methods
 *   - prd-generation.js - PRD and user story generation
 *   - compliance.js - Compliance reporting and retrospectives
 *   - helpers.js - Initialization and utility functions
 *   - index.js - Main orchestrator class
 *
 * SD-LEO-REFACTOR-ORCH-002
 */

// Re-export everything from modular structure
export { default, LEOProtocolOrchestrator } from './leo-orchestrator/index.js';

// Re-export constants for direct access
export {
  PHASES,
  PHASE_REQUIREMENTS,
  VALID_STATUSES,
  PRIORITY_MAP
} from './leo-orchestrator/constants.js';

// Re-export session decision logger
export { SessionDecisionLogger } from './leo-orchestrator/session-decision-logger.js';

// Re-export validation functions
export {
  validateRequirement,
  enforcePhaseGate
} from './leo-orchestrator/validation.js';

// Re-export phase execution functions
export {
  executePhase,
  executeLEADPhase,
  executePLANPhase,
  executeEXECPhase,
  executeVERIFICATIONPhase,
  executeAPPROVALPhase
} from './leo-orchestrator/phase-execution.js';

// Re-export PRD generation functions
export {
  generatePRD,
  isConsolidatedSD,
  fetchBacklogItems,
  generateBacklogEvidence,
  generateUserStoriesFromBacklog,
  generateUserStories,
  generateAcceptanceCriteria,
  generateAcceptanceCriteriaFromBacklogItem
} from './leo-orchestrator/prd-generation.js';

// Re-export compliance functions
export {
  checkPhaseCompletion,
  recordPhaseCompletion,
  generateComplianceReport,
  handleExecutionFailure,
  enforceRetrospective
} from './leo-orchestrator/compliance.js';

// Re-export helper functions
export {
  initializeExecution,
  safeExec,
  trackOperation,
  enforceSessionPrologue,
  verifySDEligibility
} from './leo-orchestrator/helpers.js';

// CLI execution - delegate to modular index
if (import.meta.url === `file://${process.argv[1]}`) {
  import('./leo-orchestrator/index.js').then(_module => {
    // CLI handled by index.js
  }).catch(_err => {
    // Error handled by index.js
  });
}
