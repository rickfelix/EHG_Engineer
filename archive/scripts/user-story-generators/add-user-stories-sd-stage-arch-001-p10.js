#!/usr/bin/env node
/**
 * Add user stories for SD-STAGE-ARCH-001-P10 (Vision Alignment Review & Next SD Generation)
 * Final review and generation of follow-up SDs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-STAGE-ARCH-001-P10';
const PRD_ID = 'PRD-SD-STAGE-ARCH-001-P10';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Conduct Vision V2 Alignment Audit',
    user_role: 'Architect',
    user_want: 'Comprehensive audit of implementation against Vision V2 specification',
    user_benefit: 'Can verify all requirements are met before closing SD',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Audit covers all 25 stages',
        given: 'Audit is run',
        when: 'Reviewing results',
        then: 'Each of 25 stages has alignment status'
      },
      {
        id: 'AC-001-2',
        scenario: 'Audit verifies phase assignments',
        given: 'Audit is run',
        when: 'Checking phases',
        then: 'Each stage is in correct Vision V2 phase'
      },
      {
        id: 'AC-001-3',
        scenario: 'Audit verifies gates',
        given: 'Audit is run',
        when: 'Checking gates',
        then: 'Kill gates (13, 23) and promotion gates (16, 17, 22) are verified'
      }
    ],
    definition_of_done: [
      'Alignment audit script created',
      'Script verifies all 25 stages exist',
      'Script verifies phase assignments',
      'Script verifies gate configurations',
      'Report generated with pass/fail status'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use SSOT and component analysis for verification.',
    implementation_approach: 'Create comprehensive audit script that validates implementation.',
    implementation_context: 'Final verification before closing parent SD.'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Document Implementation Gaps',
    user_role: 'Architect',
    user_want: 'Clear documentation of any gaps or deviations from Vision V2',
    user_benefit: 'Can plan follow-up work to address gaps',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Gaps are documented',
        given: 'Audit reveals gaps',
        when: 'Reviewing gap report',
        then: 'Each gap has description, impact, and suggested resolution'
      },
      {
        id: 'AC-002-2',
        scenario: 'Gaps are prioritized',
        given: 'Multiple gaps exist',
        when: 'Viewing gap list',
        then: 'Gaps are ranked by impact/urgency'
      }
    ],
    definition_of_done: [
      'Gap analysis document created',
      'Each gap categorized (critical, high, medium, low)',
      'Impact assessment for each gap',
      'Recommended resolution approach'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use audit results to identify gaps. Prioritize by business impact.',
    implementation_approach: 'Analyze audit results and document gaps with priorities.',
    implementation_context: 'Input for follow-up SD generation.'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Generate Follow-up SD Proposals',
    user_role: 'Architect',
    user_want: 'Draft SDs for addressing identified gaps and future enhancements',
    user_benefit: 'Can continue improving stage architecture systematically',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Gap-based SDs proposed',
        given: 'Gaps exist from audit',
        when: 'Generating follow-up SDs',
        then: 'Each critical/high gap has proposed SD'
      },
      {
        id: 'AC-003-2',
        scenario: 'Enhancement SDs proposed',
        given: 'Enhancement opportunities identified',
        when: 'Generating follow-up SDs',
        then: 'Key enhancements have proposed SDs'
      }
    ],
    definition_of_done: [
      'Follow-up SD proposals created in draft status',
      'SDs linked to gap analysis',
      'SDs have scope and success criteria',
      'SDs prioritized in backlog'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Create SD drafts in database. Link to this parent SD.',
    implementation_approach: 'Generate SD proposals based on gaps and enhancement opportunities.',
    implementation_context: 'Ensure continuous improvement pipeline.'
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create SD-STAGE-ARCH-001 Retrospective',
    user_role: 'Team',
    user_want: 'Comprehensive retrospective capturing lessons learned',
    user_benefit: 'Can improve future SD execution based on learnings',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Retro covers all phases',
        given: 'Retrospective is created',
        when: 'Reviewing retro',
        then: 'P0-P10 phases are covered'
      },
      {
        id: 'AC-004-2',
        scenario: 'Lessons are actionable',
        given: 'Retrospective has lessons',
        when: 'Reviewing lessons',
        then: 'Each lesson has concrete improvement action'
      }
    ],
    definition_of_done: [
      'Retrospective created in database',
      'What went well documented',
      'What could improve documented',
      'Key lessons extracted and actionable'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use retrospectives table. Include metrics from all phases.',
    implementation_approach: 'Gather feedback and metrics, create comprehensive retro.',
    implementation_context: 'Final deliverable for parent SD closure.'
  },
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Close Parent SD-STAGE-ARCH-001',
    user_role: 'Architect',
    user_want: 'Formal closure of parent SD with all deliverables verified',
    user_benefit: 'Can cleanly close the SD and move to next priorities',
    story_points: 2,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'All children SDs complete',
        given: 'P0-P10 children exist',
        when: 'Checking status',
        then: 'All children are in completed status'
      },
      {
        id: 'AC-005-2',
        scenario: 'Parent SD marked complete',
        given: 'All children complete',
        when: 'Closing parent',
        then: 'Parent SD status is updated to completed'
      }
    ],
    definition_of_done: [
      'All P0-P10 children verified complete',
      'Parent SD-STAGE-ARCH-001 marked completed',
      'Final metrics captured',
      'Handoff documentation created'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use handoff.js script for formal closure.',
    implementation_approach: 'Verify all children complete, then close parent.',
    implementation_context: 'Final step in SD hierarchy execution.'
  }
];

const deliverables = [
  {
    sd_id: SD_ID,
    deliverable_name: 'Vision V2 Alignment Audit Report',
    deliverable_type: 'DOCUMENTATION',
    completion_status: 'pending',
    acceptance_criteria: 'Comprehensive audit of all 25 stages against Vision V2'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Implementation Gap Analysis',
    deliverable_type: 'DOCUMENTATION',
    completion_status: 'pending',
    acceptance_criteria: 'Prioritized gaps with impact assessment'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Follow-up SD Proposals',
    deliverable_type: 'DATABASE',
    completion_status: 'pending',
    acceptance_criteria: 'Draft SDs for gaps and enhancements'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Parent SD Retrospective',
    deliverable_type: 'DATABASE',
    completion_status: 'pending',
    acceptance_criteria: 'Comprehensive retro with lessons learned'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Parent SD Closure',
    deliverable_type: 'DATABASE',
    completion_status: 'pending',
    acceptance_criteria: 'SD-STAGE-ARCH-001 status=completed'
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
  console.log('✅ P10 User stories and deliverables complete!');
  console.log(`   Stories: ${userStories.length}, Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
}

addUserStoriesAndDeliverables().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
