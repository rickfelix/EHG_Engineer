#!/usr/bin/env node

/**
 * LEO Protocol Master Orchestrator
 * Enforces complete protocol compliance with zero skipped steps
 * Version: 2.2.0 - Evidence Pack Integration
 *
 * This is the SINGLE ENTRY POINT for all Strategic Directive executions
 * It ensures every step is followed and nothing is missed
 *
 * Extracted from leo-protocol-orchestrator.js for modularity
 * SD-LEO-REFACTOR-ORCH-002
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { createSessionGuardian } from '../lib/session-guardian.js';
import { createEvidencePackGenerator } from '../lib/evidence-pack-generator.js';

import { PHASES, PHASE_REQUIREMENTS } from './constants.js';
import { SessionDecisionLogger } from './session-decision-logger.js';
import { _validateRequirement, enforcePhaseGate } from './validation.js';
import { executePhase } from './phase-execution.js';
import { generatePRD } from './prd-generation.js';
import {
  checkPhaseCompletion,
  recordPhaseCompletion,
  generateComplianceReport,
  handleExecutionFailure,
  enforceRetrospective
} from './compliance.js';
import {
  initializeExecution,
  safeExec,
  trackOperation,
  enforceSessionPrologue,
  verifySDEligibility
} from './helpers.js';

dotenv.config();

class LEOProtocolOrchestrator {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    this.phases = PHASES;
    this.phaseRequirements = PHASE_REQUIREMENTS;
    this.decisionLogger = null;
    this.sessionGuardian = null;
    this.evidencePack = null;

    this.executionState = {
      sdId: null,
      currentPhase: null,
      completedPhases: [],
      skippedSteps: [],
      violations: [],
      startTime: null,
      sessionId: null
    };
  }

  /**
   * Safe command execution with guardian checks
   */
  safeExec(command, options = {}) {
    return safeExec(this.sessionGuardian, command, options);
  }

  /**
   * Track an operation for loop detection
   */
  trackOperation(operation) {
    trackOperation(this.sessionGuardian, operation);
  }

  /**
   * Generate PRD from Strategic Directive
   */
  async generatePRD(sd) {
    return generatePRD(this.supabase, sd);
  }

  /**
   * Main execution entry point
   * v2.2.0: Evidence Pack integration for post-session audit
   */
  async executeSD(sdId, options = {}) {
    console.log(chalk.blue.bold('\n🚀 LEO PROTOCOL ORCHESTRATOR v2.2.0 (Evidence Pack)'));
    console.log(chalk.blue('━'.repeat(50)));

    try {
      // Initialize execution
      this.executionState = await initializeExecution(this.supabase, sdId);

      // Initialize decision logger
      this.decisionLogger = new SessionDecisionLogger(this.executionState.sessionId);
      await this.decisionLogger.init();

      // Initialize session guardian
      this.sessionGuardian = await createSessionGuardian(this.executionState.sessionId);
      this.sessionGuardian.setCurrentSD(sdId);

      // Initialize evidence pack generator
      this.evidencePack = await createEvidencePackGenerator(this.executionState.sessionId);
      this.evidencePack.recordSD(sdId, 'started');

      // Check for existing checkpoint to resume from
      const existingCheckpoint = await this.sessionGuardian.loadCheckpoint();
      if (existingCheckpoint && !options.force) {
        console.log(chalk.yellow(`\n📍 Found checkpoint from ${existingCheckpoint.timestamp}`));
        console.log(chalk.yellow(`   Last phase: ${existingCheckpoint.state?.currentPhase || 'unknown'}`));
        console.log(chalk.yellow(`   Gates completed: ${existingCheckpoint.state?.gatesCompleted?.length || 0}`));
        this.sessionGuardian.restoreFromCheckpoint(existingCheckpoint);
        this.decisionLogger.log({
          type: 'CHECKPOINT_RESTORE',
          action: 'resumed',
          reason: `Resuming from checkpoint at ${existingCheckpoint.timestamp}`,
          lastPhase: existingCheckpoint.state?.currentPhase
        });
      }

      // Step 1: Mandatory session prologue
      await enforceSessionPrologue();

      // Step 2: Verify SD exists and is eligible
      this.currentSD = await verifySDEligibility(this.supabase, sdId, this.decisionLogger);

      // Step 3: Execute each phase with strict gates
      let previousPhase = null;
      for (const phase of this.phases) {
        console.log(chalk.yellow(`\n📋 Phase: ${phase}`));
        console.log(chalk.gray('─'.repeat(40)));

        // Check resource limits before each phase
        const resourceCheck = this.sessionGuardian.checkResourceLimits();
        if (resourceCheck.exceeded) {
          throw new Error(`RESOURCE_LIMIT: ${resourceCheck.reason}`);
        }

        // Check if phase can be skipped (only if already complete)
        const canSkip = await checkPhaseCompletion(this.supabase, sdId, phase);
        if (canSkip && !options.force) {
          console.log(chalk.green(`✓ ${phase} already complete`));
          this.decisionLogger.log({
            type: 'PHASE_SKIP',
            phase,
            action: 'skipped',
            reason: 'Phase already completed'
          });
          continue;
        }

        // Record phase transition
        if (previousPhase) {
          await this.sessionGuardian.recordPhaseTransition(previousPhase, phase);
        }

        // Create context for phase execution
        const context = {
          supabase: this.supabase,
          currentSD: this.currentSD,
          decisionLogger: this.decisionLogger
        };

        // Execute the phase
        await executePhase(context, phase, sdId, this.executionState);

        // Enforce phase gate (blocking)
        await enforcePhaseGate(context, phase, sdId, this.executionState);

        // Record gate passed and save checkpoint
        await this.sessionGuardian.recordGatePassed(`${phase}_GATE`, {
          sdId,
          phase,
          timestamp: new Date().toISOString()
        });

        // Record gate in evidence pack
        this.evidencePack.recordGate(`${phase}_GATE`, true, { sdId, phase });

        // Record phase completion
        await recordPhaseCompletion(this.supabase, phase, sdId, this.executionState);
        previousPhase = phase;
      }

      // Mark SD as completed in evidence pack
      this.evidencePack.recordSD(sdId, 'completed');

      // Step 4: Mandatory retrospective
      await enforceRetrospective(this.supabase, sdId, this.decisionLogger);

      // Step 5: Final compliance report
      await generateComplianceReport(this.supabase, sdId, this.executionState);

      // Save decision log
      const logFile = await this.decisionLogger.save();
      console.log(chalk.gray(`\n📝 Decisions logged to: ${logFile}`));

      // Copy decisions to evidence pack
      for (const decision of this.decisionLogger.getDecisions()) {
        this.evidencePack.recordDecision(decision);
      }

      // Mark session guardian as complete (clears checkpoint)
      await this.sessionGuardian.complete();
      console.log(chalk.gray('\n🛡️  Session guardian summary:'));
      const summary = this.sessionGuardian.getSummary();
      console.log(chalk.gray(`   Duration: ${summary.durationMinutes} minutes`));
      console.log(chalk.gray(`   Operations: ${summary.totalOperations}`));
      console.log(chalk.gray(`   Gates: ${summary.gatesCompleted}`));

      // Generate evidence pack
      const packPath = await this.evidencePack.generate();
      console.log(chalk.gray(`\n📦 Evidence pack: ${packPath}`));

      console.log(chalk.green.bold('\n✅ SD EXECUTION COMPLETE WITH 100% COMPLIANCE'));

    } catch (error) {
      console.error(chalk.red.bold('\n❌ EXECUTION FAILED:'), error.message);

      // Log failure decision
      if (this.decisionLogger) {
        this.decisionLogger.log({
          type: 'EXECUTION_FAILURE',
          action: 'halted',
          reason: error.message,
          phase: this.executionState.currentPhase
        });
        await this.decisionLogger.save();
      }

      // Record failure in evidence pack and generate it
      if (this.evidencePack) {
        this.evidencePack.recordSD(this.executionState.sdId, 'failed');
        this.evidencePack.recordViolation({
          type: 'EXECUTION_FAILURE',
          description: error.message,
          phase: this.executionState.currentPhase
        });

        // Copy decisions to evidence pack before generating
        if (this.decisionLogger) {
          for (const decision of this.decisionLogger.getDecisions()) {
            this.evidencePack.recordDecision(decision);
          }
        }

        try {
          const packPath = await this.evidencePack.generate();
          console.log(chalk.gray(`\n📦 Evidence pack (failure): ${packPath}`));
        } catch (packError) {
          console.warn('⚠️  Could not generate evidence pack:', packError.message);
        }
      }

      // Save guardian checkpoint for recovery
      if (this.sessionGuardian) {
        await this.sessionGuardian.fail(error.message);
        console.log(chalk.yellow('\n📍 Checkpoint saved for recovery'));
        console.log(chalk.yellow('   Restart orchestrator to resume from last checkpoint'));
      }

      await handleExecutionFailure(this.supabase, error, this.executionState);
      throw error;
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);

  // Handle --help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
LEO Protocol Orchestrator v2.2.0

Usage: node leo-orchestrator/index.js <SD-ID> [options]

Arguments:
  SD-ID           Strategic Directive ID to execute (e.g., SD-UAT-001)

Options:
  --force         Force re-execution of completed phases
  --help, -h      Show this help message

Features (v2.2.0):
  - Non-interactive mode (no prompts)
  - Session Guardian (checkpoint, safe-stop, loop detection)
  - Evidence Pack generation for post-session audit
  - Decision audit trail

Examples:
  node scripts/leo-orchestrator/index.js SD-UAT-001
  node scripts/leo-orchestrator/index.js SD-UAT-001 --force

Related Commands:
  npm run sd:next        Show SD queue and recommendations
  npm run sd:status      Show progress vs baseline
  node scripts/handoff.js LEAD-TO-PLAN <SD-ID>
`);
    process.exit(0);
  }

  const orchestrator = new LEOProtocolOrchestrator();

  const sdId = args[0];
  const options = {
    force: args.includes('--force')
  };

  if (!sdId) {
    console.error(chalk.red('Usage: node leo-orchestrator/index.js <SD-ID>'));
    console.error(chalk.gray('       Run with --help for more information'));
    process.exit(1);
  }

  orchestrator.executeSD(sdId, options)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default LEOProtocolOrchestrator;
export { LEOProtocolOrchestrator };
