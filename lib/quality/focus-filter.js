/**
 * Focus Filter for Quality Lifecycle System
 *
 * Provides a filtered "My Focus" context view showing only critical items
 * that need immediate attention, without noise from lower-priority items.
 * Part of SD-QUALITY-TRIAGE-001: Triage & Prioritization Engine
 *
 * @module lib/quality/focus-filter
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Default focus context configuration
 */
const DEFAULT_FOCUS_CONFIG = {
  // Priority levels to include in focus view
  priorities: ['P0', 'P1'],
  // Statuses to include
  statuses: ['open', 'triaged', 'in_progress'],
  // Maximum items to return
  limit: 20,
  // Include burst groups
  includeBursts: true,
  // Exclude these source types
  excludeSourceTypes: [],
  // Age threshold - items older than this are deprioritized (in days)
  ageThresholdDays: 7
};

/**
 * Get focus context for a user
 *
 * @param {Object} [options] - Filter options
 * @param {string} [options.userId] - Filter to items assigned to user
 * @param {string[]} [options.priorities] - Priority levels to include
 * @param {string[]} [options.statuses] - Statuses to include
 * @param {number} [options.limit] - Maximum items to return
 * @param {string} [options.application] - Filter to specific application
 * @returns {Object} Focus context with items and summary
 */
async function getMyFocusContext(options = {}) {
  const config = { ...DEFAULT_FOCUS_CONFIG, ...options };

  let query = supabase
    .from('feedback')
    .select('*')
    .in('priority', config.priorities)
    .in('status', config.statuses)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(config.limit);

  // Filter by user if specified
  if (config.userId) {
    query = query.eq('assigned_to', config.userId);
  }

  // Filter by application if specified
  if (config.application) {
    query = query.eq('source_application', config.application);
  }

  // Exclude snoozed items
  query = query.neq('status', 'snoozed');

  // Exclude grouped items (show groups instead)
  query = query.is('burst_group_id', null);

  const { data: items, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch focus context: ${error.message}`);
  }

  // Group items by priority for summary
  const byPriority = items.reduce((acc, item) => {
    const p = item.priority || 'P2';
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});

  // Group items by type
  const byType = items.reduce((acc, item) => {
    const t = item.type || 'issue';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  // Check for aging items
  const ageThreshold = new Date(Date.now() - config.ageThresholdDays * 24 * 60 * 60 * 1000);
  const agingItems = items.filter(item =>
    new Date(item.created_at) < ageThreshold
  );

  return {
    items,
    summary: {
      total: items.length,
      byPriority,
      byType,
      agingCount: agingItems.length,
      oldestItem: items.length > 0 ? items[items.length - 1] : null,
      newestItem: items.length > 0 ? items[0] : null
    },
    filters: {
      priorities: config.priorities,
      statuses: config.statuses,
      userId: config.userId,
      application: config.application
    }
  };
}

/**
 * Get critical-only view (P0 items only)
 *
 * @param {Object} [options] - Additional filter options
 * @returns {Object} Focus context with only P0 items
 */
async function getCriticalItems(options = {}) {
  return getMyFocusContext({
    ...options,
    priorities: ['P0']
  });
}

/**
 * Get urgent view (P0 + P1 items)
 *
 * @param {Object} [options] - Additional filter options
 * @returns {Object} Focus context with P0 and P1 items
 */
async function getUrgentItems(options = {}) {
  return getMyFocusContext({
    ...options,
    priorities: ['P0', 'P1']
  });
}

/**
 * Get items requiring immediate action
 * Combines priority with staleness to surface neglected items
 *
 * @param {Object} [options] - Filter options
 * @returns {Object} Focus context with action items
 */
async function getActionRequired(options = {}) {
  const config = { ...DEFAULT_FOCUS_CONFIG, ...options };

  // Get high-priority items
  const urgentContext = await getUrgentItems(options);

  // Also get aging P2 items that have been open too long
  const ageThreshold = new Date(Date.now() - config.ageThresholdDays * 24 * 60 * 60 * 1000);

  const { data: agingP2Items, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('priority', 'P2')
    .in('status', config.statuses)
    .lt('created_at', ageThreshold.toISOString())
    .is('burst_group_id', null)
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`Failed to fetch aging items: ${error.message}`);
  }

  // Combine and dedupe
  const allItems = [...urgentContext.items];
  const existingIds = new Set(allItems.map(i => i.id));

  for (const item of (agingP2Items || [])) {
    if (!existingIds.has(item.id)) {
      allItems.push({
        ...item,
        _agingEscalation: true
      });
    }
  }

  return {
    items: allItems,
    summary: {
      total: allItems.length,
      urgentCount: urgentContext.items.length,
      agingEscalated: agingP2Items?.length || 0,
      byPriority: allItems.reduce((acc, item) => {
        const p = item.priority || 'P2';
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {})
    },
    filters: urgentContext.filters
  };
}

/**
 * Get items assigned to current user that need attention
 *
 * @param {string} userId - User ID to filter by
 * @param {Object} [options] - Additional filter options
 * @returns {Object} Focus context for the user
 */
async function getMyAssignedItems(userId, options = {}) {
  if (!userId) {
    throw new Error('userId is required for getMyAssignedItems');
  }

  return getMyFocusContext({
    ...options,
    userId
  });
}

/**
 * Get application-specific focus context
 *
 * @param {string} application - Application name to filter by
 * @param {Object} [options] - Additional filter options
 * @returns {Object} Focus context for the application
 */
async function getApplicationFocus(application, options = {}) {
  if (!application) {
    throw new Error('application is required for getApplicationFocus');
  }

  return getMyFocusContext({
    ...options,
    application
  });
}

/**
 * Format focus context as a summary string for display
 *
 * @param {Object} context - Focus context from getMyFocusContext
 * @returns {string} Formatted summary
 */
function formatFocusSummary(context) {
  const { summary, items } = context;
  const lines = [];

  lines.push(`Focus Context: ${summary.total} items`);
  lines.push('');

  // Priority breakdown
  const priorities = Object.entries(summary.byPriority)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, count]) => `${p}: ${count}`)
    .join(' | ');
  lines.push(`Priority: ${priorities}`);

  // Type breakdown
  const types = Object.entries(summary.byType)
    .map(([t, count]) => `${t}: ${count}`)
    .join(' | ');
  lines.push(`Type: ${types}`);

  if (summary.agingCount > 0) {
    lines.push(`Aging: ${summary.agingCount} items older than threshold`);
  }

  lines.push('');
  lines.push('Top Items:');

  // Show first 5 items
  const topItems = items.slice(0, 5);
  for (const item of topItems) {
    const age = getItemAge(item.created_at);
    lines.push(`  [${item.priority}] ${item.title} (${age})`);
  }

  if (items.length > 5) {
    lines.push(`  ... and ${items.length - 5} more`);
  }

  return lines.join('\n');
}

/**
 * Calculate human-readable age of an item
 *
 * @param {string} createdAt - ISO date string
 * @returns {string} Human-readable age
 */
function getItemAge(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

module.exports = {
  getMyFocusContext,
  getCriticalItems,
  getUrgentItems,
  getActionRequired,
  getMyAssignedItems,
  getApplicationFocus,
  formatFocusSummary,
  getItemAge,
  DEFAULT_FOCUS_CONFIG
};
