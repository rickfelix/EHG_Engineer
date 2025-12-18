#!/usr/bin/env node

/**
 * CREATE CHECKPOINT PLAN for SD-FOUNDATION-V3-007
 * BMAD Validation Requirement: SDs with >8 stories need checkpoint plan
 *
 * Creates checkpoint plan for Chairman Dashboard E2E Test Suite (12 user stories)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createCheckpointPlan() {
  const sdId = 'SD-FOUNDATION-V3-007';

  console.log('\n🎯 CHECKPOINT PLAN GENERATOR');
  console.log('═'.repeat(60));
  console.log(`Creating checkpoint plan for ${sdId}\n`);

  // Check if SD exists and if checkpoint plan already exists
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, checkpoint_plan')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
    .single();

  if (sdError || !sd) {
    console.error(`❌ SD not found: ${sdId}`);
    return { success: false, error: sdError?.message };
  }

  if (sd.checkpoint_plan && sd.checkpoint_plan.total_checkpoints) {
    console.log(`⚠️  Checkpoint plan already exists (${sd.checkpoint_plan.total_checkpoints} checkpoints)`);
    return {
      success: true,
      existed: true
    };
  }

  // Define checkpoint plan for SD-FOUNDATION-V3-007
  const checkpointPlan = {
    sd_id: sdId,
    plan_name: 'Chairman Dashboard E2E Test Suite - Checkpoint Plan',
    total_stories: 12,
    total_story_points: 43, // Sum of all story points
    estimated_duration_hours: 20,

    checkpoints: [
      {
        checkpoint_number: 1,
        name: 'Authentication E2E Tests',
        description: 'Implement auth flow tests (login, session, logout)',
        story_keys: [
          `${sdId}:US-001`,
          `${sdId}:US-002`
        ],
        story_points: 5,
        acceptance_criteria: [
          'E2E test file created: tests/e2e/chairman/auth.spec.ts',
          'Login flow tests pass (valid/invalid credentials)',
          'Session persistence tests pass',
          'Logout and session cleanup tests pass'
        ],
        validation_method: 'npx playwright test tests/e2e/chairman/auth.spec.ts',
        dependencies: [],
        estimated_hours: 4
      },
      {
        checkpoint_number: 2,
        name: 'Briefing Dashboard E2E Tests',
        description: 'Implement EVA greeting and dashboard component tests',
        story_keys: [
          `${sdId}:US-003`,
          `${sdId}:US-004`,
          `${sdId}:US-005`
        ],
        story_points: 11,
        acceptance_criteria: [
          'E2E test file created: tests/e2e/chairman/briefing.spec.ts',
          'EVA greeting renders with correct time-of-day greeting',
          'Dashboard metrics display real data',
          'All components render without console errors',
          'Responsive design tests pass'
        ],
        validation_method: 'npx playwright test tests/e2e/chairman/briefing.spec.ts',
        dependencies: ['Checkpoint 1'],
        estimated_hours: 5
      },
      {
        checkpoint_number: 3,
        name: 'Decision Workflow E2E Tests',
        description: 'Implement decision stack and approval/rejection flow tests',
        story_keys: [
          `${sdId}:US-006`,
          `${sdId}:US-007`,
          `${sdId}:US-008`
        ],
        story_points: 13,
        acceptance_criteria: [
          'E2E test file created: tests/e2e/chairman/decisions.spec.ts',
          'Decision stack displays pending decisions',
          'Approve workflow tests pass with confirmation',
          'Reject workflow tests pass with reason validation',
          'Empty state handled correctly'
        ],
        validation_method: 'npx playwright test tests/e2e/chairman/decisions.spec.ts',
        dependencies: ['Checkpoint 1'],
        estimated_hours: 5
      },
      {
        checkpoint_number: 4,
        name: 'Portfolio Navigation E2E Tests',
        description: 'Implement portfolio and stage timeline tests',
        story_keys: [
          `${sdId}:US-009`,
          `${sdId}:US-010`
        ],
        story_points: 6,
        acceptance_criteria: [
          'E2E test file created: tests/e2e/chairman/portfolio.spec.ts',
          'Portfolio ventures list displays correctly',
          'Stage filtering works',
          'Stage timeline shows all 25 stages',
          'Navigation between stages works'
        ],
        validation_method: 'npx playwright test tests/e2e/chairman/portfolio.spec.ts',
        dependencies: ['Checkpoint 1'],
        estimated_hours: 3
      },
      {
        checkpoint_number: 5,
        name: 'CI/CD Integration',
        description: 'Configure GitHub Actions workflow and parallel execution',
        story_keys: [
          `${sdId}:US-011`,
          `${sdId}:US-012`
        ],
        story_points: 10,
        acceptance_criteria: [
          'GitHub Actions workflow updated: .github/workflows/e2e-tests.yml',
          'Test environment secrets configured',
          'Playwright reports uploaded as artifacts',
          'Parallel test execution configured',
          'All E2E tests run successfully in CI'
        ],
        validation_method: 'GitHub Actions workflow passes on feature branch',
        dependencies: ['Checkpoint 1', 'Checkpoint 2', 'Checkpoint 3', 'Checkpoint 4'],
        estimated_hours: 3
      }
    ],

    risk_assessment: {
      high_risk_stories: ['US-001', 'US-011'],
      mitigation: 'Auth tests depend on test credentials configuration. CI/CD requires proper secrets setup.',
      contingency: 'If auth setup blocks testing, use mocked auth for dashboard tests.'
    },

    parallel_execution: {
      can_parallelize: ['Checkpoint 2', 'Checkpoint 3', 'Checkpoint 4'],
      sequential_required: ['Checkpoint 1', 'Checkpoint 5'],
      reason: 'Auth checkpoint must complete first. CI/CD checkpoint depends on all tests.'
    },

    success_criteria: [
      'All 12 user stories have passing E2E tests',
      'Tests run in CI/CD pipeline without failures',
      'Total test suite runtime < 5 minutes',
      'No flaky tests (> 3 consecutive passes required)'
    ],

    // Required fields for BMAD validation
    total_checkpoints: 5,
    total_user_stories: 12
  };

  // Update SD record with checkpoint plan
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ checkpoint_plan: checkpointPlan })
    .eq('id', sd.id);

  if (error) {
    console.error('❌ Failed to update SD with checkpoint plan:', error.message);
    return { success: false, error: error.message };
  }

  console.log('✅ Checkpoint plan saved to SD successfully!');
  console.log(`   Checkpoints: ${checkpointPlan.checkpoints.length}`);
  console.log(`   Total Stories: ${checkpointPlan.total_stories}`);
  console.log(`   Estimated Hours: ${checkpointPlan.estimated_duration_hours}`);

  console.log('\n📋 Checkpoints:');
  checkpointPlan.checkpoints.forEach(cp => {
    console.log(`   ${cp.checkpoint_number}. ${cp.name} (${cp.story_points} pts, ${cp.estimated_hours}h)`);
  });

  console.log('\n✨ Next steps:');
  console.log('   1. Retry PLAN-TO-EXEC handoff: node scripts/handoff.js execute PLAN-TO-EXEC SD-FOUNDATION-V3-007');
  console.log('   2. Implement E2E tests per checkpoint');

  return {
    success: true,
    existed: false,
    checkpoint_plan_id: data.id
  };
}

createCheckpointPlan().catch(console.error);
