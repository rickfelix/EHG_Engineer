/**
 * LEO Protocol Helpers
 * Initialization, prologue, eligibility, and utility functions
 *
 * Extracted from leo-protocol-orchestrator.js for modularity
 * SD-LEO-REFACTOR-ORCH-002
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { VALID_STATUSES } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize execution tracking
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Execution state
 */
export async function initializeExecution(supabase, sdId) {
  const executionState = {
    sdId,
    currentPhase: null,
    completedPhases: [],
    skippedSteps: [],
    violations: [],
    startTime: new Date(),
    sessionId: `LEO-${Date.now()}`
  };

  // Store in database for audit
  await supabase.from('leo_execution_sessions').insert({
    id: executionState.sessionId,
    sd_id: sdId,
    started_at: executionState.startTime,
    status: 'in_progress'
  });

  return executionState;
}

/**
 * Execute a command with session guardian checks
 * Validates safe-stop patterns and tracks for loop detection
 *
 * @param {Object} sessionGuardian - Session guardian instance
 * @param {string} command - Command to execute
 * @param {Object} options - execSync options
 * @returns {Buffer|string} Command output
 * @throws {Error} If command matches safe-stop pattern or loop detected
 */
export function safeExec(sessionGuardian, command, options = {}) {
  // Check safe-stop patterns
  if (sessionGuardian) {
    sessionGuardian.validateCommand(command);
    sessionGuardian.checkLoop(`exec:${command.substring(0, 50)}`);
  }

  // Execute the command
  return execSync(command, {
    encoding: 'utf-8',
    ...options
  });
}

/**
 * Track an operation for loop detection
 *
 * @param {Object} sessionGuardian - Session guardian instance
 * @param {string} operation - Operation identifier
 */
export function trackOperation(sessionGuardian, operation) {
  if (sessionGuardian) {
    sessionGuardian.checkLoop(operation);
  }
}

/**
 * Enforce session prologue
 *
 * @returns {Promise<void>}
 */
export async function enforceSessionPrologue() {
  console.log(chalk.cyan('\n📖 SESSION PROLOGUE CHECK'));

  const prologuePath = path.join(__dirname, '..', '..', '.session-prologue-completed');

  try {
    await fs.access(prologuePath);
    console.log(chalk.green('✓ Session prologue completed'));
  } catch {
    console.log(chalk.yellow('⚠️  Session prologue not found'));

    // Generate and display prologue
    console.log(chalk.gray('\n' + '='.repeat(50)));
    console.log(chalk.white.bold('LEO PROTOCOL SESSION PROLOGUE'));
    console.log(chalk.gray('='.repeat(50)));
    console.log('1. Follow LEAD→PLAN→EXEC - Target ≥85% gate pass rate');
    console.log('2. Use sub-agents - Architect, QA, Reviewer');
    console.log('3. Database-first - No markdown files as source');
    console.log('4. Small PRs - Keep diffs ≤100 lines');
    console.log('5. 7-element handoffs required');
    console.log('6. Priority-first - Use npm run prio:top3');
    console.log(chalk.gray('='.repeat(50) + '\n'));

    // Mark as completed
    await fs.writeFile(prologuePath, new Date().toISOString());
  }
}

/**
 * Verify SD is eligible for execution
 * Non-interactive - logs decision and proceeds or fails based on rules
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} decisionLogger - Decision logger instance
 * @returns {Promise<Object>} The SD if eligible
 * @throws {Error} If SD not found or not eligible
 */
export async function verifySDEligibility(supabase, sdId, decisionLogger) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    throw new Error(`SD ${sdId} not found. Remediation: Verify the SD ID exists in strategic_directives_v2 table.`);
  }

  // Check priority justification
  console.log(chalk.cyan('\n🎯 PRIORITY JUSTIFICATION'));
  console.log(`Priority: ${sd.priority || 'not set'}`);
  console.log(`Status: ${sd.status}`);
  console.log(`SD Type: ${sd.sd_type || 'not set'}`);

  // Non-interactive priority handling
  // Low/no priority SDs are allowed but logged for audit
  if (!sd.priority || sd.priority === 'low') {
    decisionLogger.log({
      type: 'LOW_PRIORITY_SD',
      sdId,
      action: 'proceed',
      reason: 'Low/no priority SD allowed in non-interactive mode. Review in post-session audit.',
      priority: sd.priority || 'not set'
    });
    console.log(chalk.yellow('⚠️  Low/no priority SD - proceeding (logged for audit)'));
  }

  // Check if SD is in valid status for execution
  if (!VALID_STATUSES.includes(sd.status)) {
    throw new Error(`SD ${sdId} has status '${sd.status}' which is not valid for execution. Valid statuses: ${VALID_STATUSES.join(', ')}. Remediation: Update SD status or select a different SD.`);
  }

  return sd;
}
