/**
 * Phase 0 Intent Discovery Module
 *
 * Part of SD-LEO-INFRA-PHASE-INTENT-DISCOVERY-001
 *
 * Exports:
 * - engine: Core Phase 0 state machine and scoring logic
 * - integration: LEO /leo create integration functions
 */

export * from './engine.js';
export * as engine from './engine.js';
export * as integration from './leo-integration.js';

// Default export for convenience
import engine from './engine.js';
import integration from './leo-integration.js';

export default {
  engine,
  integration
};
