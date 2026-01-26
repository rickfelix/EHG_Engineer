#!/usr/bin/env node

/**
 * Orchestrator Decision Handler
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-12
 *
 * Handles user decisions for ALL_BLOCKED orchestrator SDs:
 * - resume: Re-evaluate and continue if possible
 * - cancel: Stop all execution
 * - override: Force continue despite blockers
 *
 * Usage:
 *   node scripts/orchestrator-decision.js <orchestrator-id> <decision> [options]
 *
 * Examples:
 *   node scripts/orchestrator-decision.js SD-XYZ-001 resume
 *   node scripts/orchestrator-decision.js SD-XYZ-001 cancel
 *   node scripts/orchestrator-decision.js SD-XYZ-001 override --reason "Manual review completed"
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  detectAllBlockedState,
  recordUserDecision,
  persistAllBlockedState
} from './modules/sd-next/blocked-state-detector.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Colors for CLI output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  white: '\x1b[37m'
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    showUsage();
    process.exit(1);
  }

  const orchestratorId = args[0];
  const decision = args[1].toLowerCase();

  // Parse options
  const options = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--reason' && args[i + 1]) {
      options.reason = args[i + 1];
      i++;
    }
    if (args[i] === '--user' && args[i + 1]) {
      options.userId = args[i + 1];
      i++;
    }
    if (args[i] === '--blocker-ids' && args[i + 1]) {
      options.affectedBlockerIds = args[i + 1].split(',');
      i++;
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('');
  console.log(`${colors.bold}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}║           ORCHESTRATOR DECISION HANDLER                        ║${colors.reset}`);
  console.log(`${colors.bold}╚════════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');

  // Validate orchestrator exists and is blocked
  const blockedState = await detectAllBlockedState(orchestratorId, supabase);

  if (blockedState.error) {
    console.log(`${colors.red}Error: ${blockedState.error}${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.cyan}Orchestrator:${colors.reset} ${orchestratorId}`);
  console.log(`${colors.cyan}Decision:${colors.reset} ${decision.toUpperCase()}`);
  console.log('');

  // Check if currently blocked
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('title, metadata')
    .eq('id', orchestratorId)
    .single();

  const isCurrentlyBlocked = sd?.metadata?.all_blocked_state?.is_blocked;

  if (!isCurrentlyBlocked && decision !== 'check') {
    // If not currently marked as blocked, check if it should be
    if (blockedState.isAllBlocked) {
      console.log(`${colors.yellow}Orchestrator is in ALL_BLOCKED state but not yet persisted.${colors.reset}`);
      console.log(`${colors.dim}Persisting blocked state...${colors.reset}`);
      await persistAllBlockedState(orchestratorId, blockedState, supabase);
    } else {
      console.log(`${colors.green}✓ Orchestrator is not blocked.${colors.reset}`);
      console.log(`  Runnable children: ${blockedState.runnableChildren}`);
      console.log(`  Blocked children: ${blockedState.blockedChildren}`);
      console.log(`  Terminal children: ${blockedState.terminalChildren}`);
      process.exit(0);
    }
  }

  // Handle the decision
  switch (decision) {
    case 'resume':
      await handleResume(orchestratorId, blockedState, supabase);
      break;

    case 'cancel':
      await handleCancel(orchestratorId, options, supabase);
      break;

    case 'override':
      await handleOverride(orchestratorId, options, supabase);
      break;

    case 'check':
    case 'status':
      await handleStatusCheck(orchestratorId, blockedState, sd);
      break;

    default:
      console.log(`${colors.red}Unknown decision: ${decision}${colors.reset}`);
      console.log('Valid decisions: resume, cancel, override, check');
      process.exit(1);
  }
}

/**
 * Handle resume decision - re-evaluate and continue if possible
 */
async function handleResume(orchestratorId, blockedState, supabase) {
  console.log(`${colors.bold}Attempting to RESUME orchestrator...${colors.reset}`);
  console.log('');

  // Re-check blocked state
  const currentState = await detectAllBlockedState(orchestratorId, supabase);

  if (currentState.runnableChildren > 0) {
    // Has runnable children now - can proceed
    console.log(`${colors.green}✓ Found ${currentState.runnableChildren} runnable children!${colors.reset}`);

    const result = await recordUserDecision(orchestratorId, 'resume', {}, supabase);

    if (result.success) {
      console.log(`${colors.green}✓ Orchestrator resumed successfully.${colors.reset}`);
      console.log(`  Decision recorded at: ${result.decision.timestamp}`);
      console.log('');
      console.log(`${colors.cyan}Next step: Run 'npm run sd:next' to see available work.${colors.reset}`);
    } else {
      console.log(`${colors.red}Failed to record decision: ${result.error}${colors.reset}`);
    }
  } else {
    // Still blocked
    console.log(`${colors.yellow}⚠ Still blocked - no runnable children found.${colors.reset}`);
    console.log('');
    console.log(`${colors.dim}Blocked children: ${currentState.blockedChildren}${colors.reset}`);

    if (currentState.blockers && currentState.blockers.length > 0) {
      console.log('');
      console.log(`${colors.bold}Active blockers:${colors.reset}`);
      currentState.blockers.forEach((b, i) => {
        console.log(`  ${i + 1}. ${b.title} [${b.severity}]`);
      });
    }

    console.log('');
    console.log(`${colors.dim}Options:${colors.reset}`);
    console.log('  - Resolve the blocking dependencies manually');
    console.log('  - Use \'override\' to force continue');
    console.log('  - Use \'cancel\' to stop execution');
  }
}

/**
 * Handle cancel decision - stop all execution
 */
async function handleCancel(orchestratorId, options, supabase) {
  console.log(`${colors.bold}${colors.yellow}CANCELLING orchestrator...${colors.reset}`);
  console.log('');

  // Require confirmation
  if (!options.confirmed && !options.reason) {
    console.log(`${colors.red}⚠ Cancel requires confirmation.${colors.reset}`);
    console.log(`${colors.dim}Add --reason "your reason" to confirm cancellation.${colors.reset}`);
    process.exit(1);
  }

  const result = await recordUserDecision(orchestratorId, 'cancel', options, supabase);

  if (result.success) {
    console.log(`${colors.yellow}✓ Orchestrator CANCELLED.${colors.reset}`);
    console.log(`  Decision recorded at: ${result.decision.timestamp}`);
    console.log(`  Reason: ${options.reason || 'No reason provided'}`);
    console.log('');
    console.log(`${colors.dim}No further child executions will occur.${colors.reset}`);
  } else {
    console.log(`${colors.red}Failed to cancel: ${result.error}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Handle override decision - force continue despite blockers
 */
async function handleOverride(orchestratorId, options, supabase) {
  console.log(`${colors.bold}${colors.red}OVERRIDE: Forcing continue despite blockers...${colors.reset}`);
  console.log('');

  if (!options.reason || options.reason.length < 10) {
    console.log(`${colors.red}⚠ Override requires a reason of at least 10 characters.${colors.reset}`);
    console.log(`${colors.dim}Use: --reason "Your detailed reason for override"${colors.reset}`);
    process.exit(1);
  }

  const result = await recordUserDecision(orchestratorId, 'override', options, supabase);

  if (result.success) {
    console.log(`${colors.green}✓ Override recorded successfully.${colors.reset}`);
    console.log(`  Decision recorded at: ${result.decision.timestamp}`);
    console.log(`  Reason: ${options.reason}`);
    console.log('');
    console.log(`${colors.yellow}⚠ Warning: Blockers have been overridden. Children may still fail.${colors.reset}`);
    console.log(`${colors.cyan}Next step: Run 'npm run sd:next' to continue work.${colors.reset}`);
  } else {
    console.log(`${colors.red}Failed to override: ${result.error}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Handle status check - show current blocked state
 */
async function handleStatusCheck(orchestratorId, blockedState, sd) {
  console.log(`${colors.bold}Blocked State Status:${colors.reset}`);
  console.log('');

  const storedState = sd?.metadata?.all_blocked_state;

  console.log(`${colors.cyan}SD Title:${colors.reset} ${sd?.title || 'Unknown'}`);
  console.log(`${colors.cyan}Is Blocked:${colors.reset} ${blockedState.isAllBlocked ? colors.red + 'YES' : colors.green + 'NO'}${colors.reset}`);
  console.log(`${colors.cyan}Awaiting Decision:${colors.reset} ${storedState?.awaiting_decision ? 'Yes' : 'No'}`);
  console.log('');

  console.log(`${colors.bold}Children Status:${colors.reset}`);
  console.log(`  Total:     ${blockedState.totalChildren}`);
  console.log(`  Completed: ${blockedState.terminalChildren}`);
  console.log(`  Blocked:   ${blockedState.blockedChildren}`);
  console.log(`  Runnable:  ${blockedState.runnableChildren}`);

  if (blockedState.blockers && blockedState.blockers.length > 0) {
    console.log('');
    console.log(`${colors.bold}Blockers (${blockedState.blockers.length}):${colors.reset}`);
    blockedState.blockers.forEach((b, i) => {
      const severityColor = b.severity === 'HIGH' ? colors.red : b.severity === 'MEDIUM' ? colors.yellow : colors.blue;
      console.log(`  ${i + 1}. ${b.title}`);
      console.log(`     ${severityColor}[${b.severity}]${colors.reset} ${b.type}`);
      console.log(`     ${colors.dim}${b.description}${colors.reset}`);
      if (b.occurrences > 1) {
        console.log(`     ${colors.dim}Affects ${b.occurrences} children${colors.reset}`);
      }
    });
  }

  if (storedState?.resolution_decision) {
    console.log('');
    console.log(`${colors.bold}Last Resolution:${colors.reset}`);
    console.log(`  Decision: ${storedState.resolution_decision.decision}`);
    console.log(`  At: ${storedState.resolution_decision.timestamp}`);
    if (storedState.resolution_decision.reason) {
      console.log(`  Reason: ${storedState.resolution_decision.reason}`);
    }
  }
}

function showUsage() {
  console.log(`
${colors.bold}Orchestrator Decision Handler${colors.reset}
Part of SD-LEO-ENH-AUTO-PROCEED-001-12

${colors.bold}Usage:${colors.reset}
  node scripts/orchestrator-decision.js <orchestrator-id> <decision> [options]

${colors.bold}Decisions:${colors.reset}
  resume    Re-evaluate children and continue if any become runnable
  cancel    Stop all execution (requires --reason)
  override  Force continue despite blockers (requires --reason)
  check     Show current blocked state status

${colors.bold}Options:${colors.reset}
  --reason <text>        Required for cancel/override (min 10 chars)
  --user <id>            User ID for audit trail
  --blocker-ids <ids>    Comma-separated blocker IDs for override

${colors.bold}Examples:${colors.reset}
  node scripts/orchestrator-decision.js SD-XYZ-001 check
  node scripts/orchestrator-decision.js SD-XYZ-001 resume
  node scripts/orchestrator-decision.js SD-XYZ-001 cancel --reason "Project deprioritized"
  node scripts/orchestrator-decision.js SD-XYZ-001 override --reason "Manual review completed, safe to proceed"
`);
}

main().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
