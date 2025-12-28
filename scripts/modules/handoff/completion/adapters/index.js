/**
 * Completion Adapters Index
 *
 * SD-REFACTOR-VERIFY-001 Phase 1
 *
 * Re-exports all adapters for backward compatibility.
 * Import adapters from here to migrate legacy code gradually.
 *
 * @module completion/adapters
 */

export {
  validateOrchestratorLegacy,
  LegacyGuardianWrapper
} from './orchestrator-adapter.js';

export {
  validateGatesLegacy,
  LegacyValidationOrchestrator
} from './handoff-adapter.js';

export {
  validateExecChecklistLegacy,
  validateExecChecklistEnhanced
} from './checklist-adapter.js';
