#!/usr/bin/env node

/**
 * Universal Phase Execution Template
 * Replaces all SD-specific phase execution scripts
 * Usage: node templates/execute-phase.js [PHASE] [SD-ID] [--options]
 *
 * REFACTORED: This file is now a thin wrapper around the domain modules.
 * See templates/execute-phase/ for the extracted domain architecture.
 *
 * Domains:
 * - phase-executors.js: Individual phase execution logic (LEAD, PLAN, EXEC, etc.)
 * - validators.js: Phase validation and evidence checking
 * - sub-agents.js: Sub-agent activation and execution
 * - phase-utils.js: Utility functions for phase flow and marking
 * - index.js: Main orchestrator with re-exports
 */

// Re-export everything from the domain modules for backward compatibility
export { default } from './execute-phase/index.js';

export {
  // Phase executors
  executeLEADPhase,
  executePLANPhase,
  executeEXECPhase,
  executeVERIFICATIONPhase,
  executeAPPROVALPhase,

  // Validators
  validatePhase,
  validateGitEvidence,
  validateCompletionTiming,
  validatePRDExists,
  validateApprovalTiming,
  isPhaseComplete,

  // Sub-agents
  activateRequiredSubAgents,
  executeSubAgent,
  REQUIRED_SUB_AGENTS,

  // Phase utilities
  loadPhaseRequirements,
  getNextPhase,
  markPhaseComplete,
  markSDComplete,
  showNextSteps,
  getSDDetails,
  displaySDStatus,
  PHASE_FLOW,
  PHASE_COMPLETE_MAP
} from './execute-phase/index.js';

// CLI execution - delegate to the domain module
import chalk from 'chalk';

if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: UniversalPhaseExecutor } = await import('./execute-phase/index.js');

  const executor = new UniversalPhaseExecutor();
  const [,, phase, sdId] = process.argv;
  const force = process.argv.includes('--force');

  if (!phase || !sdId) {
    console.error(chalk.red('Usage: node templates/execute-phase.js <PHASE> <SD-ID> [--force]'));
    console.error('Examples:');
    console.error('  node templates/execute-phase.js LEAD SD-008');
    console.error('  node templates/execute-phase.js PLAN SD-009');
    console.error('  node templates/execute-phase.js EXEC SD-010 --force');
    console.error('\nValid phases: LEAD, PLAN, EXEC, VERIFICATION, APPROVAL');
    process.exit(1);
  }

  executor.executePhase(phase.toUpperCase(), sdId, { force })
    .then(() => {
      console.log(chalk.green.bold('\n✨ Done!\n'));
      process.exit(0);
    })
    .catch(error => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
}
