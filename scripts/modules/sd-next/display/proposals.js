/**
 * Proposals Display for SD-Next
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

import { colors } from '../colors.js';

/**
 * Display pending proposals (LEO Protocol v4.4)
 *
 * @param {Array} proposals - Pending proposals to display
 */
export function displayProposals(proposals) {
  if (!proposals || proposals.length === 0) return;

  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}SUGGESTED (Proactive Proposals):${colors.reset}\n`);

  for (const p of proposals) {
    const urgencyIcon = getUrgencyIcon(p.urgency_level);
    const triggerLabel = getTriggerLabel(p.trigger_type);
    const confidence = (p.confidence_score * 100).toFixed(0);
    const shortId = p.id.substring(0, 8);

    console.log(`  ${urgencyIcon} [${triggerLabel}]${colors.reset} ${p.title.substring(0, 50)}...`);
    console.log(`${colors.dim}    Confidence: ${confidence}% | ID: ${shortId} | approve: npm run proposal:approve ${shortId}${colors.reset}`);
  }

  console.log(`\n${colors.dim}  Dismiss: npm run proposal:dismiss <id> <reason>${colors.reset}`);
  console.log(`${colors.dim}  Reasons: not_relevant, wrong_timing, duplicate, too_small, too_large, already_fixed${colors.reset}`);
}

/**
 * Get urgency icon based on level
 *
 * @param {string} urgencyLevel - Urgency level
 * @returns {string} Colored icon string
 */
function getUrgencyIcon(urgencyLevel) {
  switch (urgencyLevel) {
    case 'critical':
      return `${colors.red}🔴`;
    case 'medium':
      return `${colors.yellow}🟡`;
    default:
      return `${colors.green}🟢`;
  }
}

/**
 * Get trigger label for display
 *
 * @param {string} triggerType - Trigger type
 * @returns {string} Short label for display
 */
function getTriggerLabel(triggerType) {
  const labels = {
    'dependency_update': 'DEP',
    'retrospective_pattern': 'RETRO',
    'code_health': 'HEALTH'
  };
  return labels[triggerType] || triggerType.substring(0, 5).toUpperCase();
}
