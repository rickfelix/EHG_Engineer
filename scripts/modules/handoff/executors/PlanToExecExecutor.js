/**
 * PlanToExecExecutor - PLAN → EXEC Handoff Executor
 *
 * REFACTORED: This file now re-exports from the modular plan-to-exec/ directory.
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * Original: 1,610 LOC monolithic file
 * Refactored: 11 focused modules totaling ~1,450 LOC
 *
 * Module structure:
 * - plan-to-exec/
 *   - gates/
 *     - prerequisite-check.js    (~85 LOC)  - LEAD-TO-PLAN prerequisite validation
 *     - prd-gates.js             (~195 LOC) - PRD existence and architecture verification
 *     - contract-gates.js        (~65 LOC)  - Parent contract compliance
 *     - design-database-gates.js (~80 LOC)  - DESIGN/DATABASE workflow validation
 *     - exploration-audit.js     (~165 LOC) - Codebase exploration audit
 *     - deliverables-planning.js (~110 LOC) - Deliverables planning check
 *     - branch-enforcement.js    (~50 LOC)  - Git branch enforcement
 *     - index.js                 (~15 LOC)  - Gate exports
 *   - state-transitions.js       (~90 LOC)  - PRD and SD state transitions
 *   - retrospective.js           (~225 LOC) - Handoff retrospective creation
 *   - display-helpers.js         (~125 LOC) - Pre-handoff warnings, EXEC requirements
 *   - parent-orchestrator.js     (~110 LOC) - Parent orchestrator gate handling
 *   - remediation.js             (~90 LOC)  - Gate remediation messages
 *   - index.js                   (~250 LOC) - Main executor class
 */

// Re-export everything from the modular implementation
export * from './plan-to-exec/index.js';
export { default } from './plan-to-exec/index.js';
