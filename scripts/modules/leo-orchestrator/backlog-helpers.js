/**
 * Backlog Helpers for LEO Protocol Orchestrator
 * Part of SD-LEO-REFACTOR-ORCH-MAIN-001
 *
 * Functions for handling backlog items in consolidated SDs
 */

/**
 * Generate backlog evidence appendix
 *
 * @param {Array} backlogItems - Backlog items
 * @returns {Object} Evidence object keyed by backlog_id
 */
export function generateBacklogEvidence(backlogItems) {
  const evidence = {};

  backlogItems.forEach(item => {
    evidence[item.backlog_id] = {
      title: item.backlog_title,
      priority: item.priority,
      stage: item.stage_number,
      category: item.extras?.Category || 'General',
      description: item.extras?.Description_1 || item.item_description || '',
      new_module: item.new_module || false,
      completion_status: item.completion_status || 'NOT_STARTED',
      raw_data: {
        description_raw: item.description_raw,
        my_comments: item.my_comments,
        extras: item.extras || {}
      }
    };
  });

  return evidence;
}

/**
 * Priority mapping from backlog to user story
 */
const PRIORITY_MAP = {
  'Very High': 'CRITICAL',
  'High': 'HIGH',
  'Medium': 'MEDIUM',
  'Low': 'LOW',
  'Very Low': 'LOW'
};

/**
 * Generate user stories from backlog items (for consolidated SDs)
 *
 * @param {Array} backlogItems - Backlog items
 * @param {Object} sd - Strategic Directive
 * @returns {Array} User stories
 */
export function generateUserStoriesFromBacklog(backlogItems, sd) {
  const stories = [];

  backlogItems.forEach((item, index) => {
    // Extract description from extras if available
    const description = item.extras?.Description_1 || item.item_description || item.description_raw || '';
    const category = item.extras?.Category || 'General';

    stories.push({
      id: `US-${sd.id}-${String(index + 1).padStart(3, '0')}`,
      title: item.backlog_title,
      description: description,
      acceptance_criteria: generateAcceptanceCriteriaFromBacklogItem(item),
      priority: PRIORITY_MAP[item.priority] || 'MEDIUM',
      metadata: {
        backlog_id: item.backlog_id,
        stage: item.stage_number,
        category: category,
        new_module: item.new_module || false,
        completion_status: item.completion_status || 'NOT_STARTED'
      }
    });
  });

  // Validate we got all items
  if (stories.length !== backlogItems.length) {
    console.log(`\u26a0\ufe0f  Story count mismatch: ${stories.length} stories from ${backlogItems.length} items`);
  }

  return stories;
}

/**
 * Generate acceptance criteria from a backlog item
 *
 * @param {Object} item - Backlog item
 * @returns {Array<string>} Acceptance criteria
 */
export function generateAcceptanceCriteriaFromBacklogItem(item) {
  const criteria = [];

  // Basic implementation criteria
  criteria.push(`${item.backlog_title} is fully implemented`);

  // Add specific criteria based on item details
  if (item.new_module) {
    criteria.push('New module is created and integrated');
  }

  if (item.extras?.Description_1) {
    // Extract key requirements from description
    if (item.extras.Description_1.includes('integration') || item.extras.Description_1.includes('integrate')) {
      criteria.push('Integration is tested and working');
    }
    if (item.extras.Description_1.includes('API')) {
      criteria.push('API endpoints are documented and tested');
    }
    if (item.extras.Description_1.includes('sync')) {
      criteria.push('Synchronization is verified bi-directionally');
    }
  }

  // Standard criteria
  criteria.push('Feature passes all tests');
  criteria.push('Documentation is updated');

  if (item.priority === 'Very High' || item.priority === 'High') {
    criteria.push('Performance benchmarks are met');
    criteria.push('Security review completed');
  }

  return criteria;
}
