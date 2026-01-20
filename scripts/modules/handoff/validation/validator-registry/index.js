/**
 * ValidatorRegistry - Dynamic mapping of database rule_name to validator functions
 * Part of LEO Protocol Validation System
 *
 * REFACTORED: SD-LEO-REFACTOR-VALIDATOR-REG-001
 * Original 1,234 LOC monolith refactored into focused modules.
 *
 * Created for SD-VALIDATION-REGISTRY-001
 *
 * This registry maps rule_name values from leo_validation_rules table to actual
 * validator functions in the codebase. Used by ValidationOrchestrator to execute
 * database-driven validation rules.
 *
 * @module ValidatorRegistry
 * @version 2.0.0
 */

import { ValidatorRegistry } from './core.js';
import {
  registerGateLValidators,
  registerGate1Validators,
  registerGate2Validators,
  registerGate3Validators,
  registerGate4Validators,
  registerGateQValidators,
  registerAdditionalValidators
} from './gates/index.js';

/**
 * Create and initialize a ValidatorRegistry with all built-in validators
 * @returns {ValidatorRegistry}
 */
export function createValidatorRegistry() {
  const registry = new ValidatorRegistry();

  // Register all gate validators
  registerGateLValidators(registry);
  registerGate1Validators(registry);
  registerGate2Validators(registry);
  registerGate3Validators(registry);
  registerGate4Validators(registry);
  registerGateQValidators(registry);
  registerAdditionalValidators(registry);

  console.log(`ValidatorRegistry: Registered ${registry.validators.size} validators`);

  return registry;
}

// Export singleton instance
export const validatorRegistry = createValidatorRegistry();

// Re-export core class for direct instantiation
export { ValidatorRegistry } from './core.js';

// Re-export gate registration functions for custom registries
export {
  registerGateLValidators,
  registerGate1Validators,
  registerGate2Validators,
  registerGate3Validators,
  registerGate4Validators,
  registerGateQValidators,
  registerAdditionalValidators
} from './gates/index.js';

export default ValidatorRegistry;
