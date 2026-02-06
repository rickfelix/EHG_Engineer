/**
 * Test Goal Extractor
 * SD: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001 (US-003)
 *
 * Converts SD user stories and acceptance criteria into structured
 * test goals for the Vision QA agent.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Extract structured test goals from user stories.
 *
 * @param {Object[]} userStories - Array of user story objects from database
 * @returns {{ test_goals: Object[], goals_hash: string }}
 */
export function extractTestGoals(userStories) {
  if (!userStories || userStories.length === 0) {
    return { test_goals: [], goals_hash: null };
  }

  const goals = [];

  for (const story of userStories) {
    // Extract from acceptance criteria
    const ac = story.acceptance_criteria || [];
    const criteria = Array.isArray(ac) ? ac : [];

    if (criteria.length > 0) {
      goals.push({
        title: story.title || story.story_key,
        description: story.user_want || story.title,
        source_ref: story.story_key || story.id,
        source_type: 'user_story',
        acceptance_criteria: criteria.map((c, i) => ({
          id: `${story.story_key || story.id}:AC-${i + 1}`,
          text: typeof c === 'string' ? c : (c.description || c.criterion || JSON.stringify(c))
        })),
        priority: story.story_points >= 8 ? 'high' : story.story_points >= 5 ? 'medium' : 'low'
      });
    }

    // Extract from given_when_then scenarios if available
    const gwt = story.given_when_then;
    if (gwt && Array.isArray(gwt) && gwt.length > 0) {
      for (const scenario of gwt) {
        goals.push({
          title: scenario.scenario || `${story.story_key} scenario`,
          description: `Given: ${scenario.given}\nWhen: ${scenario.when}\nThen: ${scenario.then}`,
          source_ref: story.story_key || story.id,
          source_type: 'gwt_scenario',
          priority: 'medium'
        });
      }
    }
  }

  // Generate deterministic hash for reproducibility
  const goalsHash = simpleHash(JSON.stringify(goals));

  return { test_goals: goals, goals_hash: goalsHash };
}

/**
 * Load user stories for an SD and extract test goals.
 *
 * @param {string} sdId - SD UUID
 * @param {Object} supabase - Optional Supabase client
 * @returns {Promise<{ test_goals: Object[], goals_hash: string, story_count: number }>}
 */
export async function extractTestGoalsForSD(sdId, supabase = null) {
  const client = supabase || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: stories, error } = await client
    .from('user_stories')
    .select('id, story_key, title, user_want, user_benefit, acceptance_criteria, given_when_then, story_points')
    .eq('sd_id', sdId);

  if (error) {
    console.error(`Error loading user stories for SD ${sdId}:`, error.message);
    return { test_goals: [], goals_hash: null, story_count: 0, error: error.message };
  }

  const result = extractTestGoals(stories || []);
  return {
    ...result,
    story_count: (stories || []).length
  };
}

/**
 * Simple deterministic hash for goal reproducibility.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export default {
  extractTestGoals,
  extractTestGoalsForSD
};
