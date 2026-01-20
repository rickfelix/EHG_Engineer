/**
 * PlanToLeadExecutor - Executes PLAN → LEAD handoffs
 * Part of LEO Protocol Unified Handoff System
 *
 * This file re-exports from the modular plan-to-lead directory structure.
 * Refactored as part of SD-LEO-REFACTOR-PLANTOLEAD-001.
 *
 * @see ./plan-to-lead/index.js for main implementation
 */

// Re-export everything from the modular structure
export * from './plan-to-lead/index.js';
export { PlanToLeadExecutor } from './plan-to-lead/index.js';
export { default } from './plan-to-lead/index.js';
