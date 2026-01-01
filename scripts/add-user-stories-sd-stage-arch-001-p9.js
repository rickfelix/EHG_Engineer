#!/usr/bin/env node
/**
 * Add user stories for SD-STAGE-ARCH-001-P9 (API Error Handling & Observability)
 * Error handling patterns and logging for stage architecture
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-STAGE-ARCH-001-P9';
const PRD_ID = 'PRD-SD-STAGE-ARCH-001-P9';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Unified Error Boundary for Stages',
    user_role: 'User',
    user_want: 'Graceful error handling when a stage component fails',
    user_benefit: 'Can continue using the app even when a stage has errors',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Error boundary catches stage crash',
        given: 'Stage component throws runtime error',
        when: 'User is viewing the stage',
        then: 'Error boundary shows friendly message instead of white screen'
      },
      {
        id: 'AC-001-2',
        scenario: 'Error boundary allows recovery',
        given: 'Error boundary has caught an error',
        when: 'User clicks "Try Again"',
        then: 'Stage component attempts to re-render'
      },
      {
        id: 'AC-001-3',
        scenario: 'Error is logged',
        given: 'Error boundary catches error',
        when: 'Error is caught',
        then: 'Error details are logged with stage context'
      }
    ],
    definition_of_done: [
      'StageErrorBoundary component created',
      'Wraps all stage components in StageRouter',
      'Shows user-friendly error message',
      'Logs error with stage number and venture ID'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use React Error Boundary pattern. Log to console and optionally to backend.',
    implementation_approach: 'Create reusable error boundary with recovery capability.',
    implementation_context: 'Prevent white screens of death in stage views.'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement API Error Handling Pattern',
    user_role: 'Developer',
    user_want: 'Consistent error handling for all stage API calls',
    user_benefit: 'Can debug issues quickly with consistent error format',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'API errors are caught consistently',
        given: 'Stage API call fails',
        when: 'Error is caught',
        then: 'Error follows standard format with code, message, context'
      },
      {
        id: 'AC-002-2',
        scenario: 'User sees friendly error',
        given: 'API error occurs',
        when: 'Error is displayed',
        then: 'User sees non-technical message with suggested action'
      }
    ],
    definition_of_done: [
      'handleStageApiError utility created',
      'Standard error format defined',
      'User-friendly error messages mapped',
      'All stage API calls use utility'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Create error handler that wraps Supabase calls.',
    implementation_approach: 'Create error handling utility with consistent format.',
    implementation_context: 'Standardize error handling across all stages.'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add Stage Performance Logging',
    user_role: 'Developer',
    user_want: 'Performance metrics for stage load times',
    user_benefit: 'Can identify and fix slow stages',
    story_points: 5,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Stage load time is measured',
        given: 'Stage component mounts',
        when: 'Component finishes loading',
        then: 'Load time is logged with stage number'
      },
      {
        id: 'AC-003-2',
        scenario: 'Slow stages are flagged',
        given: 'Stage takes >2 seconds to load',
        when: 'Load time is measured',
        then: 'Warning is logged for slow stage'
      }
    ],
    definition_of_done: [
      'useStagePerformance hook created',
      'Measures time from mount to ready',
      'Logs to console with stage context',
      'Warns on stages >2s load time'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use performance.now() for timing. Consider React Profiler.',
    implementation_approach: 'Create performance measurement hook for stages.',
    implementation_context: 'Baseline for performance optimization work.'
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Stage Activity Logging',
    user_role: 'Operations',
    user_want: 'Audit log of stage navigation and actions',
    user_benefit: 'Can track user journey through venture workflow',
    story_points: 5,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Navigation is logged',
        given: 'User navigates to a stage',
        when: 'Stage loads',
        then: 'Navigation event is logged with timestamp'
      },
      {
        id: 'AC-004-2',
        scenario: 'Key actions are logged',
        given: 'User performs key action (save, submit, gate check)',
        when: 'Action completes',
        then: 'Action is logged with outcome'
      }
    ],
    definition_of_done: [
      'logStageActivity utility created',
      'Navigation events logged',
      'Save/submit actions logged',
      'Gate evaluations logged with results'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Log to console for now. Can add backend logging later.',
    implementation_approach: 'Create activity logging utility for audit trail.',
    implementation_context: 'Foundation for analytics and debugging.'
  }
];

const deliverables = [
  {
    sd_id: SD_ID,
    deliverable_name: 'StageErrorBoundary Component',
    deliverable_type: 'CODE',
    completion_status: 'pending',
    acceptance_criteria: 'Error boundary catches stage crashes gracefully'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Stage API Error Handler',
    deliverable_type: 'CODE',
    completion_status: 'pending',
    acceptance_criteria: 'Consistent error handling for all stage API calls'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Stage Performance Logging',
    deliverable_type: 'CODE',
    completion_status: 'pending',
    acceptance_criteria: 'Performance metrics hook for stage load times'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Stage Activity Logging',
    deliverable_type: 'CODE',
    completion_status: 'pending',
    acceptance_criteria: 'Audit logging for navigation and key actions'
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
  console.log('✅ P9 User stories and deliverables complete!');
  console.log(`   Stories: ${userStories.length}, Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
}

addUserStoriesAndDeliverables().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
