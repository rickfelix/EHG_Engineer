/**
 * Feedback Items Display for SD-Next
 * SD: SD-LEO-INFRA-FEEDBACK-PIPELINE-ACTIVATION-001-C
 *
 * Shows untriaged feedback items from the `feedback` table alongside the SD queue.
 * Omits section when no actionable items exist.
 */

import { colors } from '../colors.js';

const PRIORITY_BADGES = {
  critical: `${colors.red}P0${colors.reset}`,
  high: `${colors.yellow}P1${colors.reset}`,
  medium: `${colors.cyan}P2${colors.reset}`,
  low: `${colors.dim}P3${colors.reset}`,
};

function formatAge(createdAt) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours}h`;
  return '<1h';
}

function getPriorityBadge(item) {
  const key = (item.severity || item.priority || 'low').toLowerCase();
  return PRIORITY_BADGES[key] || PRIORITY_BADGES.low;
}

/**
 * Display feedback items section.
 * Returns high-priority items for recommendations integration.
 *
 * @param {Object[]} feedbackItems - Items from loadFeedbackItems
 * @returns {{ totalCount: number, highPriority: Object[] }}
 */
export function displayFeedbackItems(feedbackItems) {
  const summary = { totalCount: 0, highPriority: [] };

  if (!feedbackItems || feedbackItems.length === 0) return summary;

  summary.totalCount = feedbackItems.length;
  summary.highPriority = feedbackItems.filter(
    i => ['critical', 'high'].includes((i.severity || i.priority || '').toLowerCase())
  );

  console.log(`\n${colors.bold}FEEDBACK ITEMS${colors.reset} (${feedbackItems.length} untriaged)`);
  console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);

  for (const item of feedbackItems) {
    const badge = getPriorityBadge(item);
    const cat = item.category ? `${colors.dim}[${item.category}]${colors.reset}` : '';
    const age = formatAge(item.created_at);
    const title = (item.title || '(no title)').slice(0, 50);
    console.log(`  ${badge} ${cat} ${title} ${colors.dim}(${age})${colors.reset}`);
  }

  if (summary.highPriority.length > 0) {
    console.log(`\n  ${colors.yellow}⚠️  ${summary.highPriority.length} high-priority item(s) need attention${colors.reset}`);
  }

  return summary;
}
