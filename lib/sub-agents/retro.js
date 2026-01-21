/**
 * RETRO Sub-Agent (Continuous Improvement Coach)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Generate comprehensive retrospectives and capture learnings
 * Code: RETRO
 * Priority: 85
 *
 * Philosophy: "Every SD is a learning opportunity. Capture it."
 *
 * REFACTORED: This file now re-exports from the modular structure.
 * Original 2836 LOC split into focused modules (~300-500 LOC each):
 * - retro/index.js: Main entry point (execute function)
 * - retro/utils.js: Utility functions
 * - retro/db-operations.js: Database operations
 * - retro/analyzers.js: Data analysis functions
 * - retro/generators.js: Content generation
 * - retro/action-items.js: Action item helpers
 * - retro/lesson-capture.js: Lesson mode functionality
 * - retro/audit-retro.js: Audit retrospective generation
 *
 * SD-LEO-REFACTOR-RETRO-001: Refactor retro.js from 2836 LOC
 */

// Re-export everything from modular structure
export { execute } from './retro/index.js';
