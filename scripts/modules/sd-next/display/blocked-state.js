/**
 * Blocked State Display for Orchestrator SDs
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-12
 *
 * Displays ALL_BLOCKED state information for orchestrator SDs
 * including blocker details and user action options.
 */

import { colors } from '../colors.js';

/**
 * Display ALL_BLOCKED state banner and blocker details
 * @param {object} blockedState - The blocked state detection result
 * @param {object} options - Display options
 */
export function displayBlockedStateBanner(blockedState, options = {}) {
  if (!blockedState?.isAllBlocked) {
    return;
  }

  const { verbose = false } = options;

  console.log('');
  console.log(`${colors.bgRed}${colors.white}${colors.bold}`);
  console.log('  ╔════════════════════════════════════════════════════════════════╗');
  console.log('  ║           ⚠️  ALL CHILDREN BLOCKED - EXECUTION PAUSED           ║');
  console.log('  ╚════════════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}`);
  console.log('');

  // Summary stats
  console.log(`${colors.yellow}  Orchestrator Status:${colors.reset}`);
  console.log(`    Total Children:    ${blockedState.totalChildren}`);
  console.log(`    Completed:         ${colors.green}${blockedState.terminalChildren}${colors.reset}`);
  console.log(`    Blocked:           ${colors.red}${blockedState.blockedChildren}${colors.reset}`);
  console.log(`    Runnable:          ${blockedState.runnableChildren}`);
  console.log(`    Detected At:       ${blockedState.detectedAt || 'Just now'}`);
  console.log('');

  // Display blockers
  if (blockedState.blockers && blockedState.blockers.length > 0) {
    displayBlockersList(blockedState.blockers, verbose);
  }

  // Display available actions
  displayAvailableActions(blockedState);
}

/**
 * Display the list of blockers with deduplication info
 * @param {array} blockers - Aggregated blockers
 * @param {boolean} verbose - Show detailed info
 */
function displayBlockersList(blockers, verbose = false) {
  console.log(`${colors.bold}  📋 Blockers (${blockers.length} unique):${colors.reset}`);
  console.log('  ' + '─'.repeat(62));

  for (let i = 0; i < blockers.length; i++) {
    const blocker = blockers[i];
    const severityColor = getSeverityColor(blocker.severity);
    const occurrenceText = blocker.occurrences > 1
      ? ` ${colors.dim}(${blocker.occurrences} occurrences)${colors.reset}`
      : '';

    console.log('');
    console.log(`  ${colors.bold}${i + 1}. ${blocker.title}${colors.reset}${occurrenceText}`);
    console.log(`     ${severityColor}[${blocker.severity}]${colors.reset} ${blocker.type.replace(/_/g, ' ')}`);
    console.log(`     ${colors.dim}${blocker.description}${colors.reset}`);

    if (blocker.occurrences > 1 && verbose) {
      console.log(`     ${colors.dim}Affects: ${blocker.affectedChildTitles.slice(0, 3).join(', ')}${blocker.affectedChildTitles.length > 3 ? '...' : ''}${colors.reset}`);
    }

    // Show recommended actions
    if (blocker.recommendedActions && blocker.recommendedActions.length > 0) {
      console.log(`     ${colors.cyan}→ ${blocker.recommendedActions[0]}${colors.reset}`);
    }
  }

  console.log('');
  console.log('  ' + '─'.repeat(62));
}

/**
 * Display available user actions for resolving blocked state
 * @param {object} blockedState - The blocked state info
 */
function displayAvailableActions(blockedState) {
  console.log('');
  console.log(`${colors.bold}  🎯 Available Actions:${colors.reset}`);
  console.log('');

  console.log(`  ${colors.green}[1] RESUME${colors.reset}`);
  console.log('      Re-evaluate children and continue if any become runnable.');
  console.log(`      ${colors.dim}node scripts/orchestrator-decision.js ${blockedState.orchestratorId} resume${colors.reset}`);
  console.log('');

  console.log(`  ${colors.yellow}[2] CANCEL RUN${colors.reset}`);
  console.log('      Stop all children and cancel the orchestrator.');
  console.log(`      ${colors.dim}node scripts/orchestrator-decision.js ${blockedState.orchestratorId} cancel${colors.reset}`);
  console.log('');

  console.log(`  ${colors.red}[3] OVERRIDE BLOCKER${colors.reset}`);
  console.log('      Force continue despite blockers (requires reason).');
  console.log(`      ${colors.dim}node scripts/orchestrator-decision.js ${blockedState.orchestratorId} override --reason "..."${colors.reset}`);
  console.log('');

  console.log(`  ${colors.dim}Waiting for your decision...${colors.reset}`);
  console.log('');
}

/**
 * Get color for severity level
 */
function getSeverityColor(severity) {
  switch (severity) {
    case 'HIGH':
      return colors.red;
    case 'MEDIUM':
      return colors.yellow;
    case 'LOW':
      return colors.blue;
    default:
      return colors.dim;
  }
}

/**
 * Display a compact blocked state indicator for queue listings
 * @param {object} sd - The SD with metadata
 * @returns {string} Compact indicator string
 */
export function getBlockedStateIndicator(sd) {
  const blockedState = sd?.metadata?.all_blocked_state;

  if (!blockedState?.is_blocked) {
    return '';
  }

  const blockerCount = blockedState.blockers?.length || 0;
  return `${colors.bgRed}${colors.white} ALL_BLOCKED (${blockerCount} blockers) ${colors.reset}`;
}

/**
 * Check if an orchestrator SD has ALL_BLOCKED state
 * @param {object} sd - The SD record
 * @returns {boolean} True if blocked
 */
export function isOrchestratorBlocked(sd) {
  return sd?.metadata?.all_blocked_state?.is_blocked === true;
}

export default {
  displayBlockedStateBanner,
  getBlockedStateIndicator,
  isOrchestratorBlocked
};
