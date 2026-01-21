/**
 * PRD Generation
 * Generate PRD from Strategic Directive and backlog items
 *
 * Extracted from leo-protocol-orchestrator.js for modularity
 * SD-LEO-REFACTOR-ORCH-002
 */

import chalk from 'chalk';
import { PRIORITY_MAP } from './constants.js';

/**
 * Check if SD is consolidated (has backlog items)
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<boolean>}
 */
export async function isConsolidatedSD(supabase, sdId) {
  const { data: items } = await supabase
    .from('sd_backlog_map')
    .select('backlog_id')
    .eq('sd_id', sdId)
    .limit(1);

  return items && items.length > 0;
}

/**
 * Fetch backlog items for consolidated SD
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Array>}
 */
export async function fetchBacklogItems(supabase, sdId) {
  const { data: items, error } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', sdId)
    .order('stage_number', { ascending: true });

  if (error) {
    console.log(chalk.yellow(`⚠️  No backlog items found for ${sdId}`));
    return [];
  }

  return items || [];
}

/**
 * Generate backlog evidence appendix
 *
 * @param {Array} backlogItems - Backlog items
 * @returns {Object}
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
 * Generate acceptance criteria from a backlog item
 *
 * @param {Object} item - Backlog item
 * @returns {Array<string>}
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

/**
 * Generate user stories from backlog items (for consolidated SDs)
 *
 * @param {Array} backlogItems - Backlog items
 * @param {Object} sd - Strategic Directive
 * @returns {Array}
 */
export function generateUserStoriesFromBacklog(backlogItems, sd) {
  const stories = [];

  backlogItems.forEach((item, index) => {
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
    console.log(chalk.yellow(`⚠️  Story count mismatch: ${stories.length} stories from ${backlogItems.length} items`));
  }

  return stories;
}

/**
 * Generate user stories from SD objectives
 *
 * @param {Object} sd - Strategic Directive
 * @returns {Array}
 */
export function generateUserStories(sd) {
  const stories = [];
  const objectives = sd.objectives || [];

  const objectiveList = typeof objectives === 'string'
    ? objectives.split('\n').filter(o => o.trim())
    : objectives;

  objectiveList.forEach((objective, index) => {
    stories.push({
      id: `US-${sd.id}-${index + 1}`,
      title: objective.trim(),
      description: `As a user, I want ${objective.trim().toLowerCase()}`,
      acceptance_criteria: [
        `${objective.trim()} is implemented`,
        'Feature is tested and verified',
        'Documentation is updated'
      ],
      priority: 'HIGH'
    });
  });

  // Add default story if no objectives
  if (stories.length === 0) {
    stories.push({
      id: `US-${sd.id}-001`,
      title: 'Implement strategic directive',
      description: `As a stakeholder, I want ${sd.title} to be implemented`,
      acceptance_criteria: [
        'All requirements are met',
        'Solution is tested and verified',
        'Documentation is complete'
      ],
      priority: 'HIGH'
    });
  }

  return stories;
}

/**
 * Generate acceptance criteria from SD
 *
 * @param {Object} _sd - Strategic Directive (unused)
 * @returns {Array<string>}
 */
export function generateAcceptanceCriteria(_sd) {
  return [
    'All user stories are implemented and tested',
    'Code passes all quality checks (linting, type checking)',
    'Unit test coverage meets minimum requirements',
    'Integration tests pass successfully',
    'Documentation is updated',
    'Performance requirements are met',
    'Security requirements are satisfied',
    'User acceptance criteria are validated'
  ];
}

/**
 * Generate PRD from Strategic Directive
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive
 * @returns {Promise<Object>}
 */
export async function generatePRD(supabase, sd) {
  const prdId = `PRD-${sd.id}-${Date.now()}`;

  // Check if this is a consolidated SD
  const isConsolidated = await isConsolidatedSD(supabase, sd.id);
  let backlogItems = [];

  if (isConsolidated) {
    console.log(chalk.cyan('   Detected consolidated SD - fetching backlog items...'));
    backlogItems = await fetchBacklogItems(supabase, sd.id);
    console.log(chalk.green(`   Found ${backlogItems.length} backlog items`));
  }

  // Generate PRD content structure
  const prdContent = {
    version: '1.0.0',
    product_overview: {
      name: sd.title,
      description: sd.description || 'Implementation of strategic directive objectives',
      target_users: ['Internal stakeholders', 'End users'],
      business_value: sd.business_value || 'Achieve strategic objectives'
    },
    user_stories: isConsolidated ?
      generateUserStoriesFromBacklog(backlogItems, sd) :
      generateUserStories(sd),
    technical_requirements: {
      architecture: 'To be defined based on requirements',
      technology_stack: 'Existing stack',
      integrations: [],
      performance_requirements: {
        response_time: '< 2s',
        availability: '99.9%'
      }
    },
    acceptance_criteria: generateAcceptanceCriteria(sd),
    test_plan: {
      unit_tests: 'Required for all new functionality',
      integration_tests: 'Required for API endpoints',
      user_acceptance_tests: 'Required before deployment',
      performance_tests: 'As needed based on requirements'
    },
    metadata: {
      generated_by: 'LEO Protocol Orchestrator',
      generation_method: 'automated_from_sd',
      sd_priority: sd.priority || 'medium',
      is_consolidated: isConsolidated,
      backlog_item_count: backlogItems.length
    }
  };

  // Add backlog evidence appendix if consolidated
  if (isConsolidated) {
    prdContent.backlog_evidence = generateBacklogEvidence(backlogItems);

    // Validate all items are included
    const expectedCount = sd.metadata?.item_count || sd.total_items || 0;
    if (expectedCount > 0 && backlogItems.length !== expectedCount) {
      console.log(chalk.yellow(`⚠️  Item count mismatch: Found ${backlogItems.length}, expected ${expectedCount}`));
    }
  }

  // Return PRD record with content as JSON string
  return {
    id: prdId,
    sd_id: sd.id,
    title: `PRD: ${sd.title}`,
    content: JSON.stringify(prdContent, null, 2),
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      generated_by: 'LEO Protocol Orchestrator',
      sd_priority: sd.priority || 'medium',
      is_consolidated: isConsolidated,
      backlog_items: isConsolidated ? backlogItems.map(i => i.backlog_id) : []
    }
  };
}
