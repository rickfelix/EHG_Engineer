/**
 * ExecToPlanExecutor - Executes EXEC → PLAN handoffs
 * Part of LEO Protocol Unified Handoff System
 *
 * This file re-exports from the modular exec-to-plan directory structure.
 * Refactored as part of SD-LEO-REFACTOR-EXECTOPLAN-001.
 *
 * @see ./exec-to-plan/index.js for main implementation
 */

// Re-export everything from the modular structure
export * from './exec-to-plan/index.js';
export { ExecToPlanExecutor } from './exec-to-plan/index.js';
export { default } from './exec-to-plan/index.js';
