#!/usr/bin/env node

/**
 * Create User Stories for SD-TEST-MOCK-001
 * Standardize Venture Workflow Mock Mode Testing
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createUserStories() {
  console.log('📝 Creating User Stories for SD-TEST-MOCK-001');
  console.log('================================================================\n');

  // USER_STORIES TABLE SCHEMA:
  // Required: story_key, sd_id, user_role, title, user_want, user_benefit, acceptance_criteria (array)
  // Optional: priority, story_points, e2e_test_path, e2e_test_status, status, implementation_context
  // IMPORTANT: story_key format MUST be "{SD_ID}:US-{DIGITS}" where DIGITS are numeric only

  const userStories = [
    {
      story_key: 'SD-TEST-MOCK-001:US-001',
      sd_id: 'SD-TEST-MOCK-001',
      user_role: 'QA Engineer',
      title: 'Add mock handlers to ventures-authenticated tests',
      user_want: 'explicit page.route() mock handlers in ventures-authenticated.spec.ts',
      user_benefit: 'tests pass consistently in mock project without requiring real database data',
      acceptance_criteria: [
        'Mock handler added following ventures.spec.ts pattern',
        'Test passes in mock project',
        'Mock data includes venture list with realistic attributes',
        'No API calls reach actual backend'
      ],
      priority: 'high',
      story_points: 3,
      e2e_test_path: 'tests/dev/ventures-authenticated.spec.ts',
      e2e_test_status: 'not_created',
      status: 'ready',
      implementation_context: {
        files: ['tests/dev/ventures-authenticated.spec.ts'],
        reference_files: ['tests/e2e/ventures.spec.ts'],
        dependencies: [],
        apis: ['**/api/ventures** (mocked)'],
        patterns: ['page.route() handler', 'Mock data generation', 'beforeEach setup']
      }
    },
    {
      story_key: 'SD-TEST-MOCK-001:US-002',
      sd_id: 'SD-TEST-MOCK-001',
      user_role: 'QA Engineer',
      title: 'Add mock handlers to ventures-crud tests',
      user_want: 'page.route() mock handlers for CRUD operations in ventures-crud.spec.ts',
      user_benefit: 'CRUD tests (create, read, update, delete) work reliably in mock project',
      acceptance_criteria: [
        'Mock handlers for GET, POST, PUT, DELETE endpoints',
        'Each operation has appropriate mock response',
        'Test validates UI updates after CRUD operations',
        'All tests pass in mock project'
      ],
      priority: 'high',
      story_points: 5,
      e2e_test_path: 'tests/dev/ventures-crud.spec.ts',
      e2e_test_status: 'not_created',
      status: 'ready',
      implementation_context: {
        files: ['tests/dev/ventures-crud.spec.ts'],
        reference_files: ['tests/e2e/ventures.spec.ts'],
        dependencies: [],
        apis: ['**/api/ventures** (GET/POST/PUT/DELETE mocked)'],
        patterns: ['Multi-method mocking', 'Request body validation', 'Response status codes']
      }
    },
    {
      story_key: 'SD-TEST-MOCK-001:US-003',
      sd_id: 'SD-TEST-MOCK-001',
      user_role: 'QA Engineer',
      title: 'Add mock handler to new-venture tests',
      user_want: 'page.route() mock handler for venture creation in new-venture.spec.ts',
      user_benefit: 'venture creation form tests work in mock project',
      acceptance_criteria: [
        'POST mock handler for venture creation endpoint',
        'Mock validates form data structure',
        'Returns realistic created venture response',
        'Test passes in mock project'
      ],
      priority: 'high',
      story_points: 3,
      e2e_test_path: 'tests/e2e/new-venture.spec.ts',
      e2e_test_status: 'not_created',
      status: 'ready',
      implementation_context: {
        files: ['tests/e2e/new-venture.spec.ts'],
        reference_files: ['tests/e2e/ventures.spec.ts'],
        dependencies: [],
        apis: ['**/api/ventures** (POST mocked)'],
        patterns: ['Form submission mocking', 'POST response handling', 'Success state validation']
      }
    },
    {
      story_key: 'SD-TEST-MOCK-001:US-004',
      sd_id: 'SD-TEST-MOCK-001',
      user_role: 'Developer',
      title: 'Create mock handler patterns documentation',
      user_want: 'comprehensive documentation of mock handler patterns at docs/testing/mock-handler-patterns.md',
      user_benefit: 'team has clear reference for implementing mocks in new tests',
      acceptance_criteria: [
        'Pattern A: Basic mock handler (with code example)',
        'Pattern B: Feature-specific with flags (with code example)',
        'Pattern C: Authenticated tests documentation',
        'Playwright project annotation guide',
        'When to use each pattern decision tree'
      ],
      priority: 'high',
      story_points: 3,
      e2e_test_status: 'not_created',
      status: 'ready',
      implementation_context: {
        files: ['docs/testing/mock-handler-patterns.md'],
        reference_files: ['tests/e2e/ventures.spec.ts', 'tests/e2e/calibration.spec.ts'],
        dependencies: [],
        apis: [],
        patterns: ['Documentation structure', 'Code examples', 'Decision trees']
      }
    },
    {
      story_key: 'SD-TEST-MOCK-001:US-005',
      sd_id: 'SD-TEST-MOCK-001',
      user_role: 'DevOps Engineer',
      title: 'Verify CI/CD pipeline stability',
      user_want: 'all venture workflow tests passing in both mock and flags-on projects',
      user_benefit: 'CI/CD pipeline shows green for test standardization work',
      acceptance_criteria: [
        'All 3 updated test files pass in mock project',
        'All tests pass in flags-on project',
        'Zero flaky test failures',
        'Test execution time <2 minutes',
        'Documentation reviewed and complete'
      ],
      priority: 'high',
      story_points: 2,
      e2e_test_path: 'tests/e2e/*.spec.ts, tests/dev/*.spec.ts',
      e2e_test_status: 'not_created',
      status: 'ready',
      implementation_context: {
        files: ['playwright.config.ts'],
        reference_files: [],
        dependencies: [],
        apis: [],
        patterns: ['Test validation', 'CI/CD verification', 'Performance benchmarking']
      }
    }
  ];

  console.log(`📊 Inserting ${userStories.length} user stories...\n`);

  for (const story of userStories) {
    const { data, error } = await supabase
      .from('user_stories')
      .upsert(story, { onConflict: 'story_key' })
      .select('story_key, title');

    if (error) {
      console.error(`   ❌ Failed to insert ${story.story_key}:`, error.message);
    } else {
      console.log(`   ✅ ${story.story_key}: ${story.title}`);
    }
  }

  console.log('\n✅ User stories created successfully!');
  console.log(`📈 Total: ${userStories.length} user stories`);
  console.log(`📊 Story points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
  console.log('\n🎯 Ready for PLAN→EXEC handoff');
  console.log('\n📋 Next Step:');
  console.log('   node scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-TEST-MOCK-001');
}

createUserStories();
