/**
 * UAT Scenario Generator
 *
 * Purpose: Generate and prioritize test scenarios from user stories for /uat command
 * SD: SD-UAT-GEN-001
 *
 * Features:
 * - Generates Given/When/Then scenarios from user stories
 * - Prioritizes by story priority/criticality
 * - Supports Quick Run mode (top 5 scenarios)
 * - Includes PRD acceptance criteria as additional scenarios
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

let supabase = null;

/**
 * Initialize Supabase client
 */
async function getSupabase() {
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }
  return supabase;
}

/**
 * Load user stories for an SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} User stories with count
 */
async function loadUserStories(sdId) {
  const db = await getSupabase();

  const { data: stories, error } = await db
    .from('user_stories')
    .select('*')
    .eq('sd_id', sdId)
    .order('story_points', { ascending: false });

  if (error || !stories) {
    return {
      found: false,
      count: 0,
      stories: [],
      error: error?.message
    };
  }

  return {
    found: true,
    count: stories.length,
    stories: stories
  };
}

/**
 * Load PRD acceptance criteria for an SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Acceptance criteria
 */
async function loadPRDAcceptanceCriteria(sdId) {
  const db = await getSupabase();

  // Try both directive_id and sd_id for backwards compatibility
  const { data: prd, error } = await db
    .from('product_requirements_v2')
    .select('acceptance_criteria, functional_requirements')
    .or(`directive_id.eq.${sdId},sd_id.eq.${sdId}`)
    .limit(1)
    .single();

  if (error || !prd) {
    return {
      found: false,
      criteria_count: 0,
      criteria: []
    };
  }

  // Combine acceptance criteria and functional requirements
  const criteria = [];

  if (Array.isArray(prd.acceptance_criteria)) {
    criteria.push(...prd.acceptance_criteria);
  }

  if (Array.isArray(prd.functional_requirements)) {
    prd.functional_requirements.forEach(req => {
      if (req.acceptance_criteria) {
        if (Array.isArray(req.acceptance_criteria)) {
          criteria.push(...req.acceptance_criteria.map(ac => ({
            text: typeof ac === 'string' ? ac : ac.description,
            source: 'functional_requirement',
            priority: req.priority || 'MEDIUM'
          })));
        }
      }
    });
  }

  return {
    found: true,
    criteria_count: criteria.length,
    criteria: criteria
  };
}

/**
 * Convert story priority to numeric value for sorting
 *
 * @param {string} priority - Priority string (CRITICAL, HIGH, MEDIUM, LOW)
 * @returns {number} Numeric priority (higher = more important)
 */
function priorityToNumber(priority) {
  const map = {
    'CRITICAL': 100,
    'HIGH': 75,
    'MEDIUM': 50,
    'LOW': 25
  };
  return map[(priority || 'MEDIUM').toUpperCase()] || 50;
}

/**
 * Generate a test scenario from a user story
 *
 * @param {Object} story - User story object
 * @returns {Object} Test scenario with Given/When/Then
 */
function storyToScenario(story) {
  // Extract persona from "As a <persona>" pattern
  const personaMatch = (story.description || story.title || '').match(/as a[n]?\s+([^,]+)/i);
  const persona = personaMatch ? personaMatch[1].trim() : 'authenticated user';

  // Extract action from "I want to <action>" pattern
  const actionMatch = (story.description || '').match(/i want to\s+([^,]+)/i);
  const action = actionMatch ? actionMatch[1].trim() : 'perform the feature action';

  // Extract benefit from "so that <benefit>" pattern
  const benefitMatch = (story.description || '').match(/so that\s+(.+)/i);
  const benefit = benefitMatch ? benefitMatch[1].trim() : 'expected outcome is achieved';

  // Build scenario steps
  const scenario = {
    id: story.story_id || story.id,
    source: 'user_story',
    sourceId: story.id,
    title: story.title || `Test: ${story.story_id}`,
    priority: story.priority || (story.story_points > 5 ? 'HIGH' : 'MEDIUM'),
    priorityScore: priorityToNumber(story.priority) + (story.story_points || 0),

    // Given/When/Then structure
    given: `${persona} is on the appropriate page with necessary permissions`,
    when: action,
    then: benefit,

    // Detailed steps for execution
    steps: generateStepsFromStory(story),

    // Pass criteria from acceptance criteria
    passCriteria: extractAcceptanceCriteria(story),

    // Metadata
    storyPoints: story.story_points || 1,
    labels: story.labels || [],
    originalStory: {
      id: story.id,
      story_id: story.story_id,
      title: story.title,
      description: story.description
    }
  };

  return scenario;
}

/**
 * Generate step-by-step instructions from a story
 *
 * @param {Object} story - User story
 * @returns {Array<Object>} Steps to perform
 */
function generateStepsFromStory(story) {
  const steps = [];

  // Step 1: Navigate to feature
  steps.push({
    step: 1,
    action: 'Navigate to the feature location',
    detail: 'Open the application and navigate to the relevant page or component'
  });

  // Step 2: Perform action
  const actionMatch = (story.description || '').match(/i want to\s+([^,]+)/i);
  if (actionMatch) {
    steps.push({
      step: 2,
      action: actionMatch[1].trim(),
      detail: 'Execute the main action described in the user story'
    });
  }

  // Step 3: Verify outcome
  steps.push({
    step: steps.length + 1,
    action: 'Verify the expected outcome',
    detail: 'Check that the result matches the acceptance criteria'
  });

  return steps;
}

/**
 * Extract acceptance criteria from story
 *
 * @param {Object} story - User story
 * @returns {Array<string>} List of acceptance criteria
 */
function extractAcceptanceCriteria(story) {
  if (!story.acceptance_criteria) return ['Verify feature works as expected'];

  if (typeof story.acceptance_criteria === 'string') {
    return story.acceptance_criteria.split('\n').filter(Boolean);
  }

  if (Array.isArray(story.acceptance_criteria)) {
    return story.acceptance_criteria.map(ac =>
      typeof ac === 'string' ? ac : ac.description || ac.text || JSON.stringify(ac)
    );
  }

  return ['Verify feature works as expected'];
}

/**
 * Convert PRD acceptance criterion to scenario
 *
 * @param {Object|string} criterion - Acceptance criterion
 * @param {number} index - Index for ID
 * @returns {Object} Test scenario
 */
function criterionToScenario(criterion, index) {
  const text = typeof criterion === 'string' ? criterion : criterion.text || criterion.description;
  const priority = typeof criterion === 'object' ? criterion.priority : 'MEDIUM';

  return {
    id: `PRD-AC-${index + 1}`,
    source: 'prd_acceptance_criteria',
    sourceId: null,
    title: `PRD Criterion: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`,
    priority: priority,
    priorityScore: priorityToNumber(priority),

    given: 'Feature is implemented per PRD specifications',
    when: 'Feature is tested against acceptance criteria',
    then: text,

    steps: [
      { step: 1, action: 'Navigate to the feature', detail: 'Access the implemented feature' },
      { step: 2, action: 'Test against criterion', detail: text },
      { step: 3, action: 'Verify pass/fail', detail: 'Document whether criterion is satisfied' }
    ],

    passCriteria: [text],
    storyPoints: 1,
    labels: ['prd-criterion']
  };
}

/**
 * Generate test scenarios for an SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Generation options
 * @param {boolean} options.quickRun - Limit to top 5 scenarios
 * @param {boolean} options.includePRD - Include PRD acceptance criteria (default: true)
 * @param {string} options.minPriority - Minimum priority to include (LOW, MEDIUM, HIGH, CRITICAL)
 * @returns {Promise<Object>} Generated scenarios
 */
export async function generateScenarios(sdId, options = {}) {
  const {
    quickRun = false,
    includePRD = true,
    minPriority = 'LOW'
  } = options;

  console.log(`\n   Generating UAT scenarios for ${sdId}...`);

  const scenarios = [];

  // Load user stories
  const userStories = await loadUserStories(sdId);
  if (userStories.found && userStories.count > 0) {
    console.log(`   Found ${userStories.count} user stories`);
    userStories.stories.forEach(story => {
      scenarios.push(storyToScenario(story));
    });
  } else {
    console.log('   No user stories found');
  }

  // Load PRD acceptance criteria
  if (includePRD) {
    const prdCriteria = await loadPRDAcceptanceCriteria(sdId);
    if (prdCriteria.found && prdCriteria.criteria_count > 0) {
      console.log(`   Found ${prdCriteria.criteria_count} PRD acceptance criteria`);
      prdCriteria.criteria.forEach((criterion, i) => {
        scenarios.push(criterionToScenario(criterion, i));
      });
    }
  }

  // If no scenarios, add basic smoke test
  if (scenarios.length === 0) {
    scenarios.push({
      id: 'SMOKE-1',
      source: 'default',
      sourceId: null,
      title: 'Basic Smoke Test',
      priority: 'HIGH',
      priorityScore: 75,

      given: 'Application is deployed and accessible',
      when: 'User navigates to the feature',
      then: 'Feature loads without errors and is functional',

      steps: [
        { step: 1, action: 'Open application', detail: 'Navigate to the deployed application' },
        { step: 2, action: 'Access feature', detail: 'Navigate to the feature being tested' },
        { step: 3, action: 'Verify load', detail: 'Confirm feature loads without errors' }
      ],

      passCriteria: ['No console errors', 'Feature is visible', 'Basic interactions work'],
      storyPoints: 1,
      labels: ['smoke-test']
    });
  }

  // Filter by minimum priority
  const minPriorityScore = priorityToNumber(minPriority);
  let filtered = scenarios.filter(s => s.priorityScore >= minPriorityScore);

  // Sort by priority score (highest first)
  filtered.sort((a, b) => b.priorityScore - a.priorityScore);

  // Apply quick run limit
  if (quickRun) {
    filtered = filtered.slice(0, 5);
    console.log('   Quick Run mode: Limited to top 5 scenarios');
  }

  const result = {
    sdId,
    scenarios: filtered,
    totalGenerated: scenarios.length,
    afterFiltering: filtered.length,
    mode: quickRun ? 'quick' : 'full',
    sources: {
      userStories: userStories.count,
      prdCriteria: includePRD ? (await loadPRDAcceptanceCriteria(sdId)).criteria_count : 0
    },
    estimatedMinutes: filtered.length * 5, // ~5 min per scenario
    generatedAt: new Date().toISOString()
  };

  console.log(`   Generated ${result.afterFiltering} scenarios (${result.mode} mode)`);
  console.log(`   Estimated time: ~${result.estimatedMinutes} minutes`);

  return result;
}

/**
 * Get UAT readiness for an SD
 * Checks if sufficient scenarios can be generated
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Readiness assessment
 */
export async function checkUATReadiness(sdId) {
  const userStories = await loadUserStories(sdId);
  const prdCriteria = await loadPRDAcceptanceCriteria(sdId);

  const hasStories = userStories.found && userStories.count > 0;
  const hasCriteria = prdCriteria.found && prdCriteria.criteria_count > 0;

  let readiness = 'NOT_READY';
  let reason = '';

  if (hasStories && hasCriteria) {
    readiness = 'READY';
    reason = `${userStories.count} stories + ${prdCriteria.criteria_count} criteria available`;
  } else if (hasStories) {
    readiness = 'PARTIAL';
    reason = `${userStories.count} stories available, no PRD criteria`;
  } else if (hasCriteria) {
    readiness = 'PARTIAL';
    reason = `${prdCriteria.criteria_count} PRD criteria available, no user stories`;
  } else {
    readiness = 'NOT_READY';
    reason = 'No user stories or PRD acceptance criteria found';
  }

  return {
    sdId,
    readiness,
    reason,
    details: {
      userStories: {
        found: userStories.found,
        count: userStories.count
      },
      prdCriteria: {
        found: prdCriteria.found,
        count: prdCriteria.criteria_count
      }
    },
    recommendation: readiness === 'NOT_READY'
      ? 'Create user stories with acceptance criteria before running UAT'
      : readiness === 'PARTIAL'
        ? 'Consider adding missing content for comprehensive UAT'
        : 'Ready for UAT execution'
  };
}

export default {
  generateScenarios,
  checkUATReadiness,
  loadUserStories,
  loadPRDAcceptanceCriteria
};
