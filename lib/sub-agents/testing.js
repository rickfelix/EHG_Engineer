/**
 * TESTING Sub-Agent (QA Engineering Director v3.0 - Intelligence Enhanced)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Mission-Critical Testing Automation - Comprehensive E2E validation
 * Code: TESTING
 * Priority: 5
 *
 * Philosophy: "Do it right, not fast." E2E testing is MANDATORY, not optional.
 *
 * This file is a thin re-export wrapper.
 * All implementation is in lib/sub-agents/modules/testing/
 *
 * Refactored: 2026-01-21 - Modularized for maintainability
 */

export {
  execute,
  preflightChecks,
  generateTestCases,
  executeE2ETests,
  collectEvidence,
  generateVerdict,
  suggestTroubleshootingTactics
} from './modules/testing/index.js';
