/**
 * Unified Handoff System - Module Index
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * This module provides a fully refactored, modular handoff system with:
 * - Dependency injection for testability
 * - Separation of concerns (executors, validation, recording, content)
 * - Consistent error handling via ResultBuilder
 * - ~57% reduction in main orchestrator size
 *
 * Usage:
 *   import { createHandoffSystem } from './modules/handoff/index.js';
 *   const system = createHandoffSystem();
 *   const result = await system.executeHandoff('PLAN-TO-EXEC', 'SD-XXX-001');
 */

// Main orchestrator
export { HandoffOrchestrator, createHandoffSystem } from './HandoffOrchestrator.js';

// Result builder
export { ResultBuilder } from './ResultBuilder.js';

// Database layer
export { SDRepository } from './db/SDRepository.js';
export { PRDRepository } from './db/PRDRepository.js';
export { HandoffRepository } from './db/HandoffRepository.js';

// Validation layer
export { ValidationOrchestrator } from './validation/ValidationOrchestrator.js';

// Recording layer
export { HandoffRecorder } from './recording/HandoffRecorder.js';

// Content builder
export { ContentBuilder } from './content/ContentBuilder.js';

// Executors
export { BaseExecutor } from './executors/BaseExecutor.js';
export { PlanToExecExecutor } from './executors/PlanToExecExecutor.js';
export { ExecToPlanExecutor } from './executors/ExecToPlanExecutor.js';
export { PlanToLeadExecutor } from './executors/PlanToLeadExecutor.js';
export { LeadToPlanExecutor } from './executors/LeadToPlanExecutor.js';
export { LeadFinalApprovalExecutor } from './executors/LeadFinalApprovalExecutor.js';

// Re-export existing modules for compatibility
export { autoCompleteDeliverables, checkDeliverablesNeedCompletion } from './auto-complete-deliverables.js';
export { extractAndPopulateDeliverables } from './extract-deliverables-from-prd.js';
export { mapE2ETestsToUserStories, validateE2ECoverage } from './map-e2e-tests-to-stories.js';

// ============================================================================
// SD-LEO-ENH-AUTO-PROCEED-001-02: AUTO-PROCEED Resolver
// ============================================================================
export {
  resolveAutoProceed,
  parseCliFlags,
  parseEnvVar,
  readFromSession,
  writeToSession,
  createHandoffMetadata,
  RESOLUTION_SOURCES,
  DEFAULT_AUTO_PROCEED
} from './auto-proceed-resolver.js';

// ============================================================================
// SD-LEO-ENH-AUTO-PROCEED-001-03: Orchestrator Completion Hook
// ============================================================================
export {
  executeOrchestratorCompletionHook,
  hasHookFired,
  recordHookEvent,
  invokeLearnSkill,
  displayQueue
} from './orchestrator-completion-hook.js';

// ============================================================================
// SD-LEO-REFACTOR-HANDOFF-001: Extracted CLI utilities
// ============================================================================

// CLI workflow definitions and utilities
export {
  WORKFLOW_BY_SD_TYPE,
  getWorkflowForType,
  isHandoffRequired,
  isHandoffOptional,
  getSDWorkflow,
  displayWorkflowRecommendation,
  verifySDCompletion,
  getPendingApprovalSDs,
  displayPendingSDs,
  displayCompletionVerification,
  checkMultiRepoStatus,
  displayMultiRepoStatus
} from './cli/index.js';

// ============================================================================
// SD-LEO-REFACTOR-HANDOFF-001: Verifier helper modules
// ============================================================================

// LEAD-TO-PLAN verifier helpers
export {
  SD_REQUIREMENTS,
  validateStrategicDirective,
  validateTargetApplicationAlignment,
  validateSmartObjectives,
  validatePRDReadiness,
  validateVisionDocumentReferences,
  validateScopeStructure,
  validateSuccessCriteriaActionability,
  validateImplementationContext,
  validateDependencyStructure,
  validateDependenciesExist,
  validateFeasibility,
  checkEnvironmentReadiness,
  TYPE_PATTERNS,
  autoDetectSdType,
  validateSdTypeClassification
} from './verifiers/lead-to-plan/index.js';

// Re-export with alias to avoid collision
export { generateImprovementGuidance as generateLeadToPlanGuidance } from './verifiers/lead-to-plan/improvement-guidance.js';

// PLAN-TO-EXEC verifier helpers
export {
  PRD_REQUIREMENTS,
  basicPRDValidation,
  validateParentOrchestratorPRD,
  validatePlanPresentation,
  CATEGORY_THRESHOLDS,
  getStoryMinimumScoreByCategory
} from './verifiers/plan-to-exec/index.js';

// Re-export with alias to avoid collision
export { generateImprovementGuidance as generatePlanToExecGuidance } from './verifiers/plan-to-exec/improvement-guidance.js';
