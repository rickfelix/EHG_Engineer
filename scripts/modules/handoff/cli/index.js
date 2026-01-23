/**
 * Handoff CLI Modules Index
 *
 * Re-exports all CLI-related handoff utilities.
 *
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

// Main CLI entry point
export {
  main,
  displayHelp,
  handleWorkflowCommand,
  handleVerifyCommand,
  handlePendingCommand,
  handlePrecheckCommand,
  handleExecuteCommand,
  handleListCommand,
  handleStatsCommand
} from './cli-main.js';

// Workflow definitions
export {
  WORKFLOW_BY_SD_TYPE,
  getWorkflowForType,
  isHandoffRequired,
  isHandoffOptional
} from './workflow-definitions.js';

// SD workflow functions
export {
  getSDWorkflow,
  displayWorkflowRecommendation
} from './sd-workflow.js';

// Completion verification
export {
  verifySDCompletion,
  getPendingApprovalSDs,
  displayPendingSDs,
  displayCompletionVerification
} from './completion-verification.js';

// Multi-repo status check
export {
  checkMultiRepoStatus,
  displayMultiRepoStatus
} from './multi-repo-check.js';

// Execution helpers
export {
  checkBypassRateLimits,
  displayExecutionResult
} from './execution-helpers.js';

// LEO 5.0 commands
export {
  handleWallsCommand,
  handleRetryGateCommand,
  handleKickbackCommand,
  handleInvalidateCommand,
  handleResumeCommand,
  handleFailuresCommand,
  handleSubagentsCommand,
  displayLeo5Help
} from './leo5-commands.js';
