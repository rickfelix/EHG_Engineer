/**
 * Completion Validation Module
 *
 * SD-REFACTOR-VERIFY-001: Unified Completion Validation
 *
 * This module consolidates handoff verification logic into a single
 * CompletionValidator facade backed by a VerificationRules engine.
 *
 * Usage:
 *   import { validateCompletion, validateForHandoff } from './completion';
 *
 *   // Single API for all handoff types
 *   const result = await validateCompletion({
 *     sdId: 'SD-XXX-001',
 *     handoffType: 'PLAN-TO-EXEC',
 *     supabase
 *   });
 *
 *   // Check result
 *   if (result.isValid) {
 *     console.log('Validation passed!');
 *   } else {
 *     console.log('Errors:', result.errors);
 *   }
 *
 * For backward compatibility with legacy code:
 *   import { adapters } from './completion';
 *
 *   // Use legacy wrapper for OrchestratorCompletionGuardian
 *   const guardian = new adapters.LegacyGuardianWrapper(sdId, supabase);
 *   const result = await guardian.validate();
 *
 * @module completion
 */

// Main facade
export {
  validateCompletion,
  validateForHandoff,
  validateOrchestratorCompletion,
  getAvailableRules,
  SCORE_THRESHOLDS
} from './CompletionValidator.js';

// Input normalization
export {
  createValidationInput,
  validateInputCompleteness,
  DEFAULT_OPTIONS
} from './ValidationInput.js';

// Rule engine
export {
  getRule,
  getAllRules,
  getRulesForHandoff,
  executeRule,
  executeRules,
  RULE_ORDER
} from './VerificationRules.js';

// Backward-compatible adapters
import * as adapters from './adapters/index.js';
export { adapters };

// Default export for convenience
export { default as CompletionValidator } from './CompletionValidator.js';
export { default as VerificationRules } from './VerificationRules.js';
export { default as ValidationInput } from './ValidationInput.js';
