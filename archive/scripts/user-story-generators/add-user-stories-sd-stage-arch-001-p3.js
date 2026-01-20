#!/usr/bin/env node
/**
 * Add user stories for SD-STAGE-ARCH-001-P3 (Implement Safe Stages)
 * Feature SD for implementing stages 1-10 and 24-25
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-STAGE-ARCH-001-P3';
const PRD_ID = 'PRD-SD-STAGE-ARCH-001-P3';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Foundation Stages 1-5',
    user_role: 'Entrepreneur',
    user_want: 'Functional stages for idea capture, AI review, validation, competitive analysis, and profitability forecasting',
    user_benefit: 'Can create ventures and get initial feedback through the foundation workflow',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Stage 1 captures venture idea',
        given: 'User is on Stage 1',
        when: 'User enters idea text and saves',
        then: 'Venture idea is saved to database'
      },
      {
        id: 'AC-001-2',
        scenario: 'Stage 2 displays AI review',
        given: 'Venture has been reviewed',
        when: 'User views Stage 2',
        then: 'AI review results are displayed'
      }
    ],
    definition_of_done: [
      'Stage01-05 components extended from shells',
      'Each stage fetches and displays venture data',
      'Forms save data to database',
      'TypeScript strict mode passes'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Build on P2 shells. Use existing venture data structure. Integrate with AI services for Stage 2.',
    implementation_approach: 'Extend P2 shells with venture data integration. Add forms for data capture. Display analysis results.',
    implementation_context: 'FR-FOUNDATION: Implement Foundation Stages 1-5 including idea capture in Stage01, AI review display in Stage02, comprehensive validation metrics in Stage03, competitive intelligence analysis in Stage04, and profitability forecasting in Stage05. Each stage extends the V2 shell with venture-specific data integration.'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Validation Stages 6-10',
    user_role: 'Entrepreneur',
    user_want: 'Functional stages for risk evaluation, comprehensive planning, problem decomposition, gap analysis, and technical review',
    user_benefit: 'Can thoroughly validate and plan ventures through the validation workflow',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Stage 6 displays risk evaluation',
        given: 'Venture has risk data',
        when: 'User views Stage 6',
        then: 'Risk evaluation is displayed with severity indicators'
      },
      {
        id: 'AC-002-2',
        scenario: 'Stage 10 shows technical review',
        given: 'Venture has technical review data',
        when: 'User views Stage 10',
        then: 'Technical review details are displayed'
      }
    ],
    definition_of_done: [
      'Stage06-10 components extended from shells',
      'Each stage displays analysis data',
      'Risk indicators styled appropriately',
      'TypeScript strict mode passes'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Similar pattern to Foundation stages. Focus on data display for validation/analysis results.',
    implementation_approach: 'Extend P2 shells for validation stages. Display analysis results with appropriate visualizations.',
    implementation_context: 'FR-VALIDATION: Implement Validation Stages 6-10 including risk evaluation display in Stage06, comprehensive planning view in Stage07, problem decomposition breakdown in Stage08, gap analysis visualization in Stage09, and technical review summary in Stage10. Each stage uses the StageShellTemplate with stage-specific content areas.'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Growth Stages 24-25',
    user_role: 'Entrepreneur',
    user_want: 'Functional stages for growth metrics optimization and scale planning',
    user_benefit: 'Can track growth and plan scaling for launched ventures',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Stage 24 displays growth metrics',
        given: 'Venture has growth data',
        when: 'User views Stage 24',
        then: 'Growth metrics dashboard is displayed'
      },
      {
        id: 'AC-003-2',
        scenario: 'Stage 25 shows scale planning',
        given: 'Venture has scale plan',
        when: 'User views Stage 25',
        then: 'Scale planning details are displayed'
      }
    ],
    definition_of_done: [
      'Stage24-25 components extended from shells',
      'Growth metrics displayed with charts/indicators',
      'Scale planning shows roadmap',
      'TypeScript strict mode passes'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Growth stages are simpler as they mainly display metrics and planning data.',
    implementation_approach: 'Extend P2 shells for growth stages. Add metric displays and planning views.',
    implementation_context: 'FR-GROWTH: Implement Growth Stages 24-25 including growth metrics optimization dashboard in Stage24 showing key metrics and trends, and scale planning interface in Stage25 displaying expansion roadmap. These are the final stages of the safe zone before looping back for iteration.'
  }
];

async function addUserStories() {
  console.log(`📋 Adding ${userStories.length} User Stories to ${PRD_ID}...`);
  console.log('='.repeat(70));

  for (const story of userStories) {
    console.log(`\n  Adding: ${story.story_key} - ${story.title}`);

    const { data: existing } = await supabase
      .from('user_stories')
      .select('id')
      .eq('story_key', story.story_key)
      .single();

    if (existing) {
      console.log('    ⚠️ Already exists, updating...');
      const { error } = await supabase
        .from('user_stories')
        .update(story)
        .eq('story_key', story.story_key);

      if (error) {
        console.error(`    ❌ Update failed: ${error.message}`);
      } else {
        console.log('    ✅ Updated');
      }
    } else {
      const { error } = await supabase
        .from('user_stories')
        .insert(story);

      if (error) {
        console.error(`    ❌ Insert failed: ${error.message}`);
      } else {
        console.log('    ✅ Created');
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ User stories complete!');
  console.log(`   Total: ${userStories.length}`);
  console.log(`   Story points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
  console.log('\n📋 Next: Run PLAN-TO-EXEC handoff');
}

addUserStories().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
