/**
 * LeadToPlanExecutor - Executes LEAD → PLAN handoffs
 * Part of LEO Protocol Unified Handoff System
 *
 * This file re-exports from the modular lead-to-plan directory structure.
 * Refactored as part of SD-LEO-REFACTOR-LEADTOPLAN-001.
 *
 * @see ./lead-to-plan/index.js for main implementation
 */

// Re-export everything from the modular structure
export * from './lead-to-plan/index.js';
export { LeadToPlanExecutor } from './lead-to-plan/index.js';
export { default } from './lead-to-plan/index.js';
