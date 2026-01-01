#!/usr/bin/env node
/**
 * Add user stories for SD-STAGE-ARCH-001-P8 (Stage Component Test Suite)
 * E2E tests for all V2 stage components
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-STAGE-ARCH-001-P8';
const PRD_ID = 'PRD-SD-STAGE-ARCH-001-P8';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Stage Navigation E2E Tests',
    user_role: 'QA Engineer',
    user_want: 'E2E tests that verify navigation between all 25 stages',
    user_benefit: 'Can catch navigation regressions early',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Forward navigation works',
        given: 'User is on stage N',
        when: 'User clicks Next',
        then: 'Stage N+1 loads successfully'
      },
      {
        id: 'AC-001-2',
        scenario: 'Back navigation works',
        given: 'User is on stage N',
        when: 'User clicks Back',
        then: 'Stage N-1 loads successfully'
      },
      {
        id: 'AC-001-3',
        scenario: 'Direct navigation works',
        given: 'User is on any stage',
        when: 'User clicks stage in sidebar',
        then: 'Selected stage loads successfully'
      }
    ],
    definition_of_done: [
      'Playwright test for forward navigation through all 25 stages',
      'Playwright test for back navigation',
      'Playwright test for sidebar direct navigation',
      'Tests run in CI pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use page object pattern. May need test venture fixture.',
    implementation_approach: 'Create navigation test suite with comprehensive coverage.',
    implementation_context: 'Foundation test - navigation must work for all other tests.'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Kill Gate E2E Tests',
    user_role: 'QA Engineer',
    user_want: 'E2E tests that verify kill gates at stages 13 and 23',
    user_benefit: 'Can ensure kill gates properly block advancement',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Kill gate blocks when criteria not met',
        given: 'User is at kill gate stage with unmet criteria',
        when: 'User attempts to advance',
        then: 'System blocks advancement with clear message'
      },
      {
        id: 'AC-002-2',
        scenario: 'Kill gate allows when criteria met',
        given: 'User is at kill gate stage with all criteria met',
        when: 'User advances',
        then: 'System allows advancement to next stage'
      },
      {
        id: 'AC-002-3',
        scenario: 'Kill option available',
        given: 'User is at kill gate with unmet criteria',
        when: 'User views options',
        then: 'Kill venture option is available'
      }
    ],
    definition_of_done: [
      'Playwright tests for Stage 13 kill gate',
      'Playwright tests for Stage 23 kill gate',
      'Tests verify blocking behavior',
      'Tests verify kill option is available'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Need to setup venture state to trigger kill gate conditions.',
    implementation_approach: 'Create kill gate test fixtures with pass/fail scenarios.',
    implementation_context: 'Critical business logic - kill gates must work correctly.'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Promotion Gate E2E Tests',
    user_role: 'QA Engineer',
    user_want: 'E2E tests that verify promotion gates at stages 16, 17, and 22',
    user_benefit: 'Can ensure promotion gates properly unlock production path',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Promotion blocked when criteria not met',
        given: 'User is at promotion gate with unmet criteria',
        when: 'User views promotion status',
        then: 'Promotion is blocked with criteria list'
      },
      {
        id: 'AC-003-2',
        scenario: 'Promotion unlocked when criteria met',
        given: 'User is at promotion gate with all criteria met',
        when: 'User views promotion status',
        then: 'Production path is unlocked'
      }
    ],
    definition_of_done: [
      'Playwright tests for Stage 16 promotion gate',
      'Playwright tests for Stage 17 promotion gate',
      'Playwright tests for Stage 22 promotion gate',
      'Tests verify promotion unlock behavior'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Similar pattern to kill gates but different outcome.',
    implementation_approach: 'Create promotion gate test fixtures with pass/fail scenarios.',
    implementation_context: 'Promotion gates unlock production - must work correctly.'
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Stage Data Persistence E2E Tests',
    user_role: 'QA Engineer',
    user_want: 'E2E tests that verify data entered in stages persists correctly',
    user_benefit: 'Can ensure user data is not lost between stages',
    story_points: 8,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Data persists after navigation',
        given: 'User enters data in stage N',
        when: 'User navigates away and returns',
        then: 'Previously entered data is still present'
      },
      {
        id: 'AC-004-2',
        scenario: 'Data persists after page refresh',
        given: 'User enters data in stage N',
        when: 'User refreshes the page',
        then: 'Data is restored from database'
      }
    ],
    definition_of_done: [
      'Playwright tests for data persistence in each phase',
      'Tests for navigation persistence',
      'Tests for refresh persistence',
      'Coverage for all 6 Vision V2 phases'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Need to test representative stages from each phase.',
    implementation_approach: 'Create persistence tests for key stages in each phase.',
    implementation_context: 'Data integrity is critical for user trust.'
  },
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Stage Component Visual Regression Tests',
    user_role: 'QA Engineer',
    user_want: 'Visual regression tests for stage components',
    user_benefit: 'Can catch unintended UI changes',
    story_points: 5,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Visual baseline captured',
        given: 'Stage component renders correctly',
        when: 'Running visual snapshot',
        then: 'Baseline screenshot is stored'
      },
      {
        id: 'AC-005-2',
        scenario: 'Visual diff detected',
        given: 'Stage component UI changes',
        when: 'Running visual comparison',
        then: 'Diff is detected and reported'
      }
    ],
    definition_of_done: [
      'Playwright visual comparison configured',
      'Baseline screenshots for each stage',
      'CI reports visual diffs',
      'Update process documented'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use Playwright toHaveScreenshot(). May need viewport standardization.',
    implementation_approach: 'Configure visual testing with Playwright screenshot comparison.',
    implementation_context: 'Catch UI regressions that functional tests miss.'
  }
];

const deliverables = [
  {
    sd_id: SD_ID,
    deliverable_name: 'Stage Navigation E2E Test Suite',
    deliverable_type: 'TEST',
    completion_status: 'pending',
    acceptance_criteria: 'Playwright tests for all navigation paths'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Kill Gate E2E Test Suite',
    deliverable_type: 'TEST',
    completion_status: 'pending',
    acceptance_criteria: 'Tests for stages 13 and 23 kill gates'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Promotion Gate E2E Test Suite',
    deliverable_type: 'TEST',
    completion_status: 'pending',
    acceptance_criteria: 'Tests for stages 16, 17, 22 promotion gates'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Data Persistence E2E Test Suite',
    deliverable_type: 'TEST',
    completion_status: 'pending',
    acceptance_criteria: 'Tests for data persistence across navigation and refresh'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Visual Regression Test Suite',
    deliverable_type: 'TEST',
    completion_status: 'pending',
    acceptance_criteria: 'Visual baselines and comparison for all stages'
  }
];

async function addUserStoriesAndDeliverables() {
  console.log(`📋 Adding ${userStories.length} User Stories to ${SD_ID}...`);
  console.log('='.repeat(70));

  for (const story of userStories) {
    console.log(`\n  Adding: ${story.story_key} - ${story.title}`);

    const { data: existing } = await supabase
      .from('user_stories')
      .select('id')
      .eq('story_key', story.story_key)
      .single();

    if (existing) {
      const { error } = await supabase.from('user_stories').update(story).eq('story_key', story.story_key);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Updated');
    } else {
      const { error } = await supabase.from('user_stories').insert(story);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Created');
    }
  }

  console.log('\n📦 Adding Deliverables...');

  for (const deliverable of deliverables) {
    console.log(`  Adding: ${deliverable.deliverable_name}`);

    const { data: existing } = await supabase
      .from('sd_scope_deliverables')
      .select('id')
      .eq('sd_id', deliverable.sd_id)
      .eq('deliverable_name', deliverable.deliverable_name)
      .single();

    if (existing) {
      const { error } = await supabase.from('sd_scope_deliverables').update(deliverable).eq('id', existing.id);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Updated');
    } else {
      const { error } = await supabase.from('sd_scope_deliverables').insert(deliverable);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Created');
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ P8 User stories and deliverables complete!');
  console.log(`   Stories: ${userStories.length}, Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
}

addUserStoriesAndDeliverables().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
