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

// Re-export existing modules for compatibility
export { autoCompleteDeliverables, checkDeliverablesNeedCompletion } from './auto-complete-deliverables.js';
export { extractAndPopulateDeliverables } from './extract-deliverables-from-prd.js';
export { mapE2ETestsToUserStories, validateE2ECoverage } from './map-e2e-tests-to-stories.js';
