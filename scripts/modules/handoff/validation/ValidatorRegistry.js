/**
 * ValidatorRegistry - Dynamic mapping of database rule_name to validator functions
 * Part of LEO Protocol Validation System
 *
 * REFACTORED: SD-LEO-REFACTOR-VALIDATOR-REG-001
 * Original 1,234 LOC monolith refactored into focused modules.
 * See: scripts/modules/handoff/validation/validator-registry/
 *
 * Created for SD-VALIDATION-REGISTRY-001
 *
 * @module ValidatorRegistry
 * @version 2.0.0
 */

// Re-export everything from the modular structure
export * from './validator-registry/index.js';

// Named exports for backward compatibility
export { ValidatorRegistry, validatorRegistry } from './validator-registry/index.js';

export default (await import('./validator-registry/index.js')).default;
