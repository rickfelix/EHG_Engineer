/**
 * Complete Quick-Fix Module Index
 * Part of quick-fix modularization
 *
 * This module provides the complete-quick-fix functionality broken down
 * into focused modules for maintainability.
 */

// Main orchestrator
export { completeQuickFix } from './orchestrator.js';

// Constants
export {
  EHG_ENGINEER_ROOT,
  EHG_ROOT,
  MAX_REFINEMENT_ATTEMPTS,
  MIN_PASS_SCORE,
  MIN_WARN_SCORE,
  TEST_TIMEOUT_UNIT,
  TEST_TIMEOUT_E2E,
  REPO_PATHS
} from './constants.js';

// Test runner
export {
  runTests,
  extractTestSummary,
  runTypeScriptCheck,
  displayTestResults
} from './test-runner.js';

// Git operations
export {
  autoDetectGitInfo,
  analyzeGitDiff,
  commitAndPushChanges,
  mergeToMain
} from './git-operations.js';

// Verification utilities
export {
  validateLOC,
  validateTests,
  validateTypeScript,
  validateUAT,
  validatePR,
  verifyTestCoverage,
  validateSelfVerification,
  validateCompliance
} from './verification.js';

// Compliance loop
export {
  runComplianceWithRefinement,
  getRefinementSuggestion
} from './compliance-loop.js';

// CLI utilities
export {
  prompt,
  parseArguments,
  displayHelp,
  displayCompletionSummary
} from './cli.js';
