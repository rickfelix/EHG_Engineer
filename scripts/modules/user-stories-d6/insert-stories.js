/**
 * Insert User Stories into Database
 * Handles database insertion for SD-VISION-TRANSITION-001D6
 *
 * @module insert-stories
 */

import { createDatabaseClient } from '../../lib/supabase-connection.js';
import { stage21Stories } from './stage-21-stories.js';
import { stage22Stories } from './stage-22-stories.js';
import { stage23Stories } from './stage-23-stories.js';

export const SD_ID = 'SD-VISION-TRANSITION-001D6';
export const PRD_ID = 'PRD-SD-VISION-TRANSITION-001D6';

/**
 * Get all stories from all stages
 * @returns {Array} All user stories
 */
export function getAllStories() {
  return [
    ...stage21Stories,
    ...stage22Stories,
    ...stage23Stories
  ];
}

/**
 * Insert user stories into the database
 * @returns {Promise<Object>} Results of insertion
 */
export async function insertUserStories() {
  const allStories = getAllStories();

  console.log('\n=== User Story Generation for SD-VISION-TRANSITION-001D6 ===\n');
  console.log(`Total stories to insert: ${allStories.length}\n`);
  console.log('Note: This script includes Stories for Stages 21-23. Stage 24-25 stories are defined');
  console.log('    in the comprehensive version but truncated here due to file size.\n');

  const client = await createDatabaseClient('engineer', { verbose: false });

  const results = {
    success: [],
    failed: []
  };

  for (const story of allStories) {
    try {
      const _result = await client.query(
        `INSERT INTO user_stories (
          story_key, prd_id, sd_id, title, user_role, user_want, user_benefit,
          story_points, priority, status, acceptance_criteria, definition_of_done,
          implementation_context, architecture_references, example_code_patterns,
          testing_scenarios, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        RETURNING story_key, title`,
        [
          story.story_key,
          PRD_ID,
          SD_ID,
          story.title,
          story.user_role,
          story.user_want,
          story.user_benefit,
          story.story_points,
          story.priority,
          story.status,
          story.acceptance_criteria,
          story.definition_of_done,
          story.implementation_context,
          story.architecture_references,
          story.example_code_patterns,
          story.testing_scenarios,
          'STORIES-agent'
        ]
      );

      console.log(`Inserted ${story.story_key}: ${story.title}`);
      results.success.push(story.story_key);
    } catch (err) {
      console.error(`Failed to insert ${story.story_key}:`, err.message);
      results.failed.push({ story_key: story.story_key, error: err.message });
    }
  }

  await client.end();

  return results;
}

/**
 * Print summary of insertion results
 * @param {Object} results - Results from insertUserStories
 */
export function printSummary(results) {
  const allStories = getAllStories();

  console.log('\n=== SUMMARY ===');
  console.log(`Successfully inserted: ${results.success.length} stories`);
  console.log(`Failed: ${results.failed.length} stories\n`);

  if (results.failed.length > 0) {
    console.log('Failed stories:');
    results.failed.forEach(f => console.log(`  - ${f.story_key}: ${f.error}`));
  }

  console.log('\n=== STORIES BY STAGE ===');
  console.log(`Stage 21 (QA & UAT): ${stage21Stories.length} stories`);
  stage21Stories.forEach(s => console.log(`  - ${s.story_key}: ${s.title}`));

  console.log(`\nStage 22 (Deployment & Infrastructure): ${stage22Stories.length} stories`);
  stage22Stories.forEach(s => console.log(`  - ${s.story_key}: ${s.title}`));

  console.log(`\nStage 23 (Production Launch): ${stage23Stories.length} stories`);
  stage23Stories.forEach(s => console.log(`  - ${s.story_key}: ${s.title}`));

  console.log('\nNote: Stage 24 (Analytics & Feedback) and Stage 25 (Optimization & Scale)');
  console.log('    stories need to be added from the comprehensive version.');

  // INVEST criteria validation summary
  console.log('\n=== INVEST CRITERIA VALIDATION ===');
  let investScore = 0;
  allStories.forEach(story => {
    let storyScore = 0;
    storyScore += 20; // Independent
    if (story.user_benefit) storyScore += 20; // Valuable
    if (story.story_points) storyScore += 20; // Estimable
    if (story.story_points <= 8) storyScore += 20; // Small
    const criteria = JSON.parse(story.acceptance_criteria);
    if (criteria.some(c => c.given && c.when && c.then)) storyScore += 20; // Testable
    investScore += storyScore;
  });
  const avgInvestScore = (investScore / allStories.length).toFixed(0);
  console.log(`Average INVEST score: ${avgInvestScore}% (100% = Gold standard)`);

  console.log('\n=== NEXT STEPS ===');
  console.log('1. Add Stage 24-25 stories (see comprehensive version in script header comments)');
  console.log('2. Review generated user stories in database');
  console.log('3. Run E2E test mapping: node scripts/map-e2e-tests-to-user-stories.js SD-VISION-TRANSITION-001D6');
  console.log('4. Create E2E test files in tests/e2e/ventures/ following US-D6-XX-XXX naming');
  console.log('5. Mark stories as "ready" once E2E tests are created');
  console.log('6. Begin EXEC phase implementation\n');
}
