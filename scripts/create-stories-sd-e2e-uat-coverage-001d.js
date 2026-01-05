#!/usr/bin/env node

/**
 * Create User Stories for SD-E2E-UAT-COVERAGE-001D
 * Edge Cases & Polish: CI/CD Integration & Documentation (Phase 4)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-E2E-UAT-COVERAGE-001D';

async function createStories() {
  console.log(`\n📝 Creating User Stories for ${SD_ID}`);
  console.log('='.repeat(70));

  // Verify SD exists
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sd) {
    console.error(`❌ SD ${SD_ID} not found`);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sd.title}`);

  // Verify PRD exists
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title')
    .eq('sd_id', SD_ID)
    .single();

  if (prdError || !prd) {
    console.error(`❌ PRD for ${SD_ID} not found`);
    process.exit(1);
  }

  console.log(`✅ Found PRD: ${prd.title}`);

  const stories = [
    {
      story_key: 'E2E-COV-001D:US-001',
      sd_id: SD_ID,
      prd_id: prd.id,
      title: 'CI/CD Pipeline E2E Integration',
      user_role: 'DevOps Engineer',
      user_want: 'run E2E tests automatically in the CI/CD pipeline',
      user_benefit: 'test failures are caught before code reaches production',
      priority: 'critical',
      story_points: 8,
      status: 'ready',
      acceptance_criteria: [
        { id: 'AC-001-1', scenario: 'GitHub Actions workflow', given: 'E2E tests are configured', when: 'PR is opened', then: 'E2E tests run automatically' },
        { id: 'AC-001-2', scenario: 'Test artifacts', given: 'Tests complete', when: 'Reviewing results', then: 'Screenshots and traces are uploaded' },
        { id: 'AC-001-3', scenario: 'Parallel execution', given: 'Multiple test files exist', when: 'Tests run', then: 'Tests execute in parallel shards' }
      ],
      definition_of_done: [
        'GitHub Actions workflow file created',
        'Playwright configured for CI environment',
        'Test artifacts uploaded on failure'
      ],
      implementation_context: 'Create .github/workflows/e2e-tests.yml with Playwright setup. Configure sharding for parallel execution. Upload screenshots and traces as artifacts.',
      e2e_test_path: '.github/workflows/e2e-tests.yml',
      e2e_test_status: 'not_created'
    },
    {
      story_key: 'E2E-COV-001D:US-002',
      sd_id: SD_ID,
      prd_id: prd.id,
      title: 'Edge Case Test Scenarios',
      user_role: 'QA Engineer',
      user_want: 'have E2E tests covering edge cases and boundary conditions',
      user_benefit: 'uncommon user paths are tested and bugs in edge cases are caught',
      priority: 'high',
      story_points: 5,
      status: 'ready',
      acceptance_criteria: [
        { id: 'AC-002-1', scenario: 'Empty state handling', given: 'User has no data', when: 'Viewing list pages', then: 'Empty state message is shown' },
        { id: 'AC-002-2', scenario: 'Large data sets', given: 'User has 1000+ items', when: 'Loading list', then: 'Pagination works correctly' },
        { id: 'AC-002-3', scenario: 'Special characters', given: 'User enters unicode/special chars', when: 'Submitting form', then: 'Data is handled correctly' }
      ],
      definition_of_done: [
        'Edge case test file created',
        'Tests cover empty states, large data, special characters',
        'All edge case tests pass'
      ],
      implementation_context: 'Create tests/e2e/edge-cases/boundary-conditions.spec.ts with scenarios for empty states, large datasets, special characters, and unusual user paths.',
      e2e_test_path: 'tests/e2e/edge-cases/boundary-conditions.spec.ts',
      e2e_test_status: 'not_created'
    },
    {
      story_key: 'E2E-COV-001D:US-003',
      sd_id: SD_ID,
      prd_id: prd.id,
      title: 'E2E Testing Documentation',
      user_role: 'Developer',
      user_want: 'have clear documentation on running and writing E2E tests',
      user_benefit: 'team members can easily run tests and add new ones',
      priority: 'medium',
      story_points: 3,
      status: 'ready',
      acceptance_criteria: [
        { id: 'AC-003-1', scenario: 'Test README', given: 'Developer needs to run tests', when: 'Reading documentation', then: 'Clear instructions are provided' },
        { id: 'AC-003-2', scenario: 'Pattern guide', given: 'Developer writes new test', when: 'Following guide', then: 'Consistent patterns are used' },
        { id: 'AC-003-3', scenario: 'CI/CD guide', given: 'DevOps updates pipeline', when: 'Reading CI docs', then: 'Workflow is documented' }
      ],
      definition_of_done: [
        'Test README created with run instructions',
        'Test pattern guide documented',
        'CI/CD workflow documented'
      ],
      implementation_context: 'Update tests/e2e/README.md with setup, running, and writing tests. Document patterns used across test files. Include CI/CD configuration guide.',
      e2e_test_path: 'tests/e2e/README.md',
      e2e_test_status: 'not_created'
    }
  ];

  console.log(`\n📋 Creating ${stories.length} user stories...`);

  let created = 0;
  let skipped = 0;

  for (const story of stories) {
    const { data: existing } = await supabase
      .from('user_stories')
      .select('story_key')
      .eq('story_key', story.story_key)
      .single();

    if (existing) {
      console.log(`   ⏭️  ${story.story_key} already exists, skipping`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from('user_stories').insert(story);

    if (error) {
      console.error(`   ❌ Failed to create ${story.story_key}: ${error.message}`);
    } else {
      console.log(`   ✅ Created ${story.story_key}: ${story.title}`);
      created++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`📊 Summary: ${created} created, ${skipped} skipped`);
}

createStories().catch(console.error);
