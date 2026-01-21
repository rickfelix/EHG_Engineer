/**
 * DESIGN Sub-Agent (Senior Design Sub-Agent)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: UI/UX design compliance and accessibility validation
 * Code: DESIGN
 * Priority: 70
 *
 * Philosophy: "Design compliance = 100%, not 80%. Consistency matters."
 *
 * REFACTORED: This file now re-exports from the modular structure.
 * Original 2569 LOC split into focused modules (~300-400 LOC each):
 * - design/index.js: Main entry point and execute function
 * - design/utils.js: Helper functions, thresholds, risk context
 * - design/checks.js: Design system, accessibility, responsive checks
 * - design/patterns.js: Codebase pattern analysis
 * - design/workflow-analyzer.js: Main workflow review capability
 * - design/workflow-detection.js: Issue detection, graph building
 * - design/workflow-scoring.js: Severity, confidence, UX scoring
 *
 * SD-LEO-REFACTOR-DESIGN-SUB-001: Refactor design.js from 2569 LOC
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

// Re-export everything from modular structure
export { execute } from './design/index.js';

// Default export for backward compatibility
import { execute } from './design/index.js';
export default { execute };
