#!/usr/bin/env node
/**
 * Add user stories for SD-STAGE-ARCH-001-P7 (God Component Refactoring)
 * Break down oversized components (>600 LOC)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-STAGE-ARCH-001-P7';
const PRD_ID = 'PRD-SD-STAGE-ARCH-001-P7';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Identify God Components via Audit',
    user_role: 'Developer',
    user_want: 'An automated audit that identifies components exceeding 600 LOC',
    user_benefit: 'Can prioritize refactoring work based on data',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Audit finds god components',
        given: 'Components exist that exceed 600 LOC',
        when: 'God component audit runs',
        then: 'Report lists all oversized components with LOC counts'
      },
      {
        id: 'AC-001-2',
        scenario: 'Audit provides refactor suggestions',
        given: 'God component is identified',
        when: 'Viewing audit report',
        then: 'Report suggests extraction candidates'
      }
    ],
    definition_of_done: [
      'npm run audit:god-components command exists',
      'Script identifies files >600 LOC in src/components/',
      'Report includes LOC count and file path',
      'Report suggests logical extraction points'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use cloc or custom script. Focus on .tsx files in components/.',
    implementation_approach: 'Create audit script that counts lines and identifies oversized components.',
    implementation_context: 'First step in refactoring - identify what needs work.'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Refactor VentureWorkflowContainer',
    user_role: 'Developer',
    user_want: 'VentureWorkflowContainer broken down into smaller modules',
    user_benefit: 'Can maintain and test workflow logic more easily',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Container is under 600 LOC',
        given: 'Refactoring is complete',
        when: 'Running LOC audit',
        then: 'VentureWorkflowContainer is <=600 LOC'
      },
      {
        id: 'AC-002-2',
        scenario: 'Functionality preserved',
        given: 'Refactoring is complete',
        when: 'Running existing tests',
        then: 'All tests pass without modification'
      },
      {
        id: 'AC-002-3',
        scenario: 'Extracted modules are cohesive',
        given: 'Logic has been extracted',
        when: 'Reviewing extracted modules',
        then: 'Each module has single responsibility'
      }
    ],
    definition_of_done: [
      'VentureWorkflowContainer <=600 LOC',
      'Logic extracted to focused hooks/utilities',
      'No behavioral changes (tests pass)',
      'Imports are clean and organized'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Extract hooks for state management, effects, and calculations.',
    implementation_approach: 'Identify cohesive logic blocks and extract to custom hooks.',
    implementation_context: 'Primary god component. Contains workflow state and navigation logic.'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Refactor Stage V1 Components (if any >600 LOC)',
    user_role: 'Developer',
    user_want: 'Any V1 stage components over 600 LOC refactored',
    user_benefit: 'Can maintain consistent code quality across codebase',
    story_points: 5,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'V1 components under limit',
        given: 'Refactoring is complete',
        when: 'Running LOC audit on stages/',
        then: 'All V1 components are <=600 LOC'
      },
      {
        id: 'AC-003-2',
        scenario: 'V1 tests still pass',
        given: 'V1 components refactored',
        when: 'Running V1 test suite',
        then: 'All existing tests pass'
      }
    ],
    definition_of_done: [
      'All V1 stage components <=600 LOC',
      'No behavioral changes',
      'Code reviews approve extractions'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'V1 components may be deprecated but still need maintenance.',
    implementation_approach: 'Apply same extraction patterns as V2 components.',
    implementation_context: 'May have fewer issues since V2 was built with limits in mind.'
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add Component Size Lint Rule (Error Mode)',
    user_role: 'Developer',
    user_want: 'Lint rule that errors on components >600 LOC',
    user_benefit: 'Can prevent new god components from being introduced',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Lint fails on oversized component',
        given: 'Component exceeds 600 LOC',
        when: 'Lint runs on file',
        then: 'Build fails with clear error message'
      },
      {
        id: 'AC-004-2',
        scenario: 'Lint passes on compliant components',
        given: 'Component is <=600 LOC',
        when: 'Lint runs on file',
        then: 'No errors reported'
      }
    ],
    definition_of_done: [
      'ESLint rule for max component size',
      'Rule errors (not warns) on >600 LOC',
      'Rule applies to .tsx files in components/',
      'CI enforces rule'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use eslint-plugin-component-size or custom rule.',
    implementation_approach: 'Configure ESLint max-lines rule for component files.',
    implementation_context: 'Promotion from P5 warn-only to error mode after refactoring.'
  }
];

const deliverables = [
  {
    sd_id: SD_ID,
    deliverable_name: 'God Component Audit Script',
    deliverable_type: 'SCRIPT',
    completion_status: 'pending',
    acceptance_criteria: 'Script identifies all components >600 LOC'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'VentureWorkflowContainer Refactored',
    deliverable_type: 'CODE',
    completion_status: 'pending',
    acceptance_criteria: 'Component <=600 LOC with extracted hooks'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'V1 Stage Components Refactored',
    deliverable_type: 'CODE',
    completion_status: 'pending',
    acceptance_criteria: 'All V1 components <=600 LOC'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Component Size Lint Rule (Error)',
    deliverable_type: 'CONFIGURATION',
    completion_status: 'pending',
    acceptance_criteria: 'ESLint errors on components >600 LOC'
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
  console.log('✅ P7 User stories and deliverables complete!');
  console.log(`   Stories: ${userStories.length}, Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
}

addUserStoriesAndDeliverables().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
