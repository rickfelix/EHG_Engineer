#!/usr/bin/env node

/**
 * Universal Phase Execution Template
 * Replaces all SD-specific phase execution scripts
 * Usage: node templates/execute-phase/index.js [PHASE] [SD-ID] [--options]
 *
 * @module execute-phase
 */

import UniversalPRDGenerator from '../generate-prd.js';
import UniversalHandoffCreator from '../create-handoff.js';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Domain imports
import {
  executeLEADPhase,
  executePLANPhase,
  executeEXECPhase,
  executeVERIFICATIONPhase,
  executeAPPROVALPhase
} from './phase-executors.js';

import {
  validatePhase,
  validateGitEvidence,
  isPhaseComplete
} from './validators.js';

import {
  activateRequiredSubAgents,
  REQUIRED_SUB_AGENTS
} from './sub-agents.js';

import {
  loadPhaseRequirements,
  getNextPhase,
  markPhaseComplete,
  markSDComplete,
  showNextSteps,
  getSDDetails,
  displaySDStatus
} from './phase-utils.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class UniversalPhaseExecutor {
  constructor() {
    this.prdGenerator = new UniversalPRDGenerator();
    this.handoffCreator = new UniversalHandoffCreator();
    this.phaseRequirements = null;
    this.requiredSubAgents = REQUIRED_SUB_AGENTS;
  }

  async loadPhaseRequirements() {
    if (!this.phaseRequirements) {
      this.phaseRequirements = await loadPhaseRequirements();
    }
    return this.phaseRequirements;
  }

  async executePhase(phase, sdId, options = {}) {
    console.log(chalk.blue.bold(`\n🚀 Universal Phase Executor: ${phase} for ${sdId}\n`));
    console.log(chalk.cyan('Following CLAUDE.md consolidated SD guidelines'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      // 1. Load phase requirements
      const requirements = await this.loadPhaseRequirements();
      const phaseConfig = requirements[phase];

      if (!phaseConfig) {
        throw new Error(`Phase ${phase} not found in configuration`);
      }

      // 2. Get SD details
      const sd = await getSDDetails(supabase, sdId);
      if (!sd) {
        throw new Error(`SD ${sdId} not found`);
      }

      displaySDStatus(sd);

      // 3. Check if phase is already complete
      if (await isPhaseComplete(supabase, sdId, phase)) {
        console.log(chalk.yellow(`\n⚠️  ${phase} phase already completed for ${sdId}`));
        if (!options.force) {
          console.log(chalk.cyan('   Use --force to re-execute'));
          return;
        }
      }

      // 4. Execute phase-specific logic
      console.log(chalk.cyan(`\n🎯 Executing ${phase} Phase`));
      await this.executePhaseLogic(phase, sd, phaseConfig, options);

      // 4.5. Activate required sub-agents
      await activateRequiredSubAgents(supabase, phase, sdId, sd);

      // 5. Validate phase completion
      const validationResult = await validatePhase(supabase, phase, sd, phaseConfig);
      if (!validationResult.valid) {
        throw new Error(`Phase validation failed: ${validationResult.errors.join(', ')}`);
      }

      // 6. Mark phase as complete
      await markPhaseComplete(supabase, sdId, phase);

      // 7. Create handoff to next phase
      const nextPhase = getNextPhase(phase);
      if (nextPhase) {
        console.log(chalk.cyan(`\n🤝 Creating handoff to ${nextPhase}...`));
        await this.handoffCreator.createHandoff(phase, nextPhase, sdId);
      }

      console.log(chalk.green(`\n✅ ${phase} Phase Complete!`));

      // 8. Show next steps
      showNextSteps(phase, nextPhase, sd);

      return { phase, completed: true, nextPhase };

    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error.message);
      console.error(error);
      process.exit(1);
    }
  }

  async executePhaseLogic(phase, sd, phaseConfig, options) {
    const boundMarkSDComplete = (sdId) => markSDComplete(supabase, sdId);
    const boundValidateGitEvidence = validateGitEvidence;

    switch (phase) {
      case 'LEAD':
        await executeLEADPhase(supabase, sd, options);
        break;
      case 'PLAN':
        await executePLANPhase(supabase, sd, this.prdGenerator, options);
        break;
      case 'EXEC':
        await executeEXECPhase(supabase, sd, options);
        break;
      case 'VERIFICATION':
        await executeVERIFICATIONPhase(supabase, sd, options);
        break;
      case 'APPROVAL':
        await executeAPPROVALPhase(supabase, sd, boundValidateGitEvidence, boundMarkSDComplete, options);
        break;
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const executor = new UniversalPhaseExecutor();
  const [,, phase, sdId] = process.argv;
  const force = process.argv.includes('--force');

  if (!phase || !sdId) {
    console.error(chalk.red('Usage: node templates/execute-phase/index.js <PHASE> <SD-ID> [--force]'));
    console.error('Examples:');
    console.error('  node templates/execute-phase/index.js LEAD SD-008');
    console.error('  node templates/execute-phase/index.js PLAN SD-009');
    console.error('  node templates/execute-phase/index.js EXEC SD-010 --force');
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

export default UniversalPhaseExecutor;

// Re-export domain modules for external use
export {
  executeLEADPhase,
  executePLANPhase,
  executeEXECPhase,
  executeVERIFICATIONPhase,
  executeAPPROVALPhase
} from './phase-executors.js';

export {
  validatePhase,
  validateGitEvidence,
  validateCompletionTiming,
  validatePRDExists,
  validateApprovalTiming,
  isPhaseComplete
} from './validators.js';

export {
  activateRequiredSubAgents,
  executeSubAgent,
  REQUIRED_SUB_AGENTS
} from './sub-agents.js';

export {
  loadPhaseRequirements,
  getNextPhase,
  markPhaseComplete,
  markSDComplete,
  showNextSteps,
  getSDDetails,
  displaySDStatus,
  PHASE_FLOW,
  PHASE_COMPLETE_MAP
} from './phase-utils.js';
