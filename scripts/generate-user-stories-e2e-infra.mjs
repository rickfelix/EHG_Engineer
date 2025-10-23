#!/usr/bin/env node
/**
 * Generate User Stories for SD-E2E-INFRASTRUCTURE-001
 * Based on PRD functional requirements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-E2E-INFRASTRUCTURE-001';
const PRD_ID = `PRD-${SD_ID}`;

const userStories = [
  {
    story_key: `${SD_ID}-US-1`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Standardized Selector Utilities',
    user_role: 'developer writing E2E tests',
    user_want: 'standardized selector utilities that prioritize data-testid',
    user_benefit: 'my tests don\'t break when DOM structure changes',
    acceptance_criteria: [
      'getByTestId() utility created with auto-wait',
      'getByRoleFallback() utility for semantic selectors',
      'getByTextFallback() utility for text content',
      'Smart retry logic (3 attempts, 1s intervals)',
      '100% TypeScript with JSDoc comments',
      'Unit tests for each utility (80%+ coverage)'
    ],
    story_points: 5,
    priority: 'high',
    status: 'pending',
    created_by: 'PLAN'
  },
  {
    story_key: `${SD_ID}-US-2`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Reliable Auth Fixture',
    user_role: 'developer running E2E tests',
    user_want: 'reliable authentication that doesn\'t require manual intervention',
    user_benefit: 'tests can run unattended in CI',
    acceptance_criteria: [
      'authenticateUser() refactored with error handling',
      'Auto-retry on auth failure (3 attempts)',
      'Auth state verification (waitForAuthState)',
      'Persists to .auth/user.json reliably',
      'Eliminates need for 6 manual-login debug tests',
      'Unit tests for auth fixture (80%+ coverage)'
    ],
    story_points: 5,
    priority: 'high',
    status: 'pending',
    created_by: 'PLAN'
  },
  {
    story_key: `${SD_ID}-US-3`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Standardized Wait Patterns',
    user_role: 'developer writing E2E tests',
    user_want: 'clear guidance on wait patterns',
    user_benefit: 'I use the right approach and tests aren\'t flaky due to timing issues',
    acceptance_criteria: [
      'Remove hardcoded 500ms delay from waitForPageReady()',
      'Document when to use each wait pattern (JSDoc)',
      'Use Playwright auto-waiting by default',
      'Consistent wait strategy across all tests',
      'Update 5 existing tests as examples'
    ],
    story_points: 3,
    priority: 'medium',
    status: 'pending',
    created_by: 'PLAN'
  },
  {
    story_key: `${SD_ID}-US-4`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Documentation',
    user_role: 'developer new to the E2E test suite',
    user_want: 'clear documentation on selector and wait patterns',
    user_benefit: 'I write tests correctly the first time',
    acceptance_criteria: [
      'README.md in tests/ directory',
      'Examples of correct selector usage',
      'Examples of correct wait patterns',
      'Migration guide for .or() chain removal',
      'Best practices checklist'
    ],
    story_points: 2,
    priority: 'medium',
    status: 'pending',
    created_by: 'PLAN'
  },
  {
    story_key: `${SD_ID}-US-5`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Verification',
    user_role: 'PLAN agent',
    user_want: 'comprehensive verification that these utilities work',
    user_benefit: 'I can approve handoff to LEAD with confidence',
    acceptance_criteria: [
      'All utilities have unit tests (80%+ coverage)',
      '5 existing tests refactored to use new patterns',
      'Test failure rate reduced (measured in next CI run)',
      'No new test framework dependencies added',
      'Component sizing within 300-600 LOC'
    ],
    story_points: 3,
    priority: 'high',
    status: 'pending',
    created_by: 'PLAN'
  }
];

console.log('📝 GENERATING USER STORIES');
console.log('═══════════════════════════════════════════════════════════\n');

for (const story of userStories) {
  const { data, error } = await supabase
    .from('user_stories')
    .insert(story)
    .select()
    .single();

  if (error) {
    console.error(`❌ Error creating ${story.story_id}:`, error.message);
    continue;
  }

  console.log(`✅ ${story.story_id}: ${story.title}`);
}

console.log('\n✅ USER STORIES CREATED');
console.log('═══════════════════════════════════════════════════════════');
console.log('   Total Stories:', userStories.length);
console.log('   HIGH Priority:', userStories.filter(s => s.priority === 'high').length);
console.log('   MEDIUM Priority:', userStories.filter(s => s.priority === 'medium').length);
console.log('\n📌 Next: Create PLAN→EXEC handoff\n');
