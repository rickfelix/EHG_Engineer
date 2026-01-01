#!/usr/bin/env node
/**
 * Add user stories for SD-STAGE-ARCH-001-P5 (Governance & Polish)
 * CI checks, lint rules, E2E test, documentation
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-STAGE-ARCH-001-P5';
const PRD_ID = 'PRD-SD-STAGE-ARCH-001-P5';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Stage Audit CI Check',
    user_role: 'Developer',
    user_want: 'An automated CI check that validates all V2 stage components exist and follow patterns',
    user_benefit: 'Can catch missing or malformed stage components before they reach production',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Stage audit detects missing components',
        given: 'CI pipeline runs audit:stages',
        when: 'A V2 stage component is missing',
        then: 'Build fails with clear error message'
      },
      {
        id: 'AC-001-2',
        scenario: 'Stage audit passes on complete implementation',
        given: 'All 25 V2 stage components exist',
        when: 'CI pipeline runs audit:stages',
        then: 'Build passes stage audit check'
      }
    ],
    definition_of_done: [
      'npm run audit:stages command exists',
      'Script validates all 25 stages exist in stages/v2/',
      'Script validates each stage follows component pattern',
      'CI workflow includes stage audit step'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Create script in scripts/audit-stages.js. Add to package.json and CI workflow.',
    implementation_approach: 'Create audit script that checks for all V2 stage components and validates basic structure.',
    implementation_context: 'CI governance to prevent regression. Must check for stages 1-25 in V2 format.'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add No-Hardcoded-Counts Lint Rule',
    user_role: 'Developer',
    user_want: 'A lint rule that warns when hardcoded stage counts like "25" appear in code',
    user_benefit: 'Can prevent brittle code that breaks when stage count changes',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Lint rule detects hardcoded counts',
        given: 'Code contains hardcoded stage count patterns',
        when: 'Lint runs on the file',
        then: 'Warning is shown with suggestion to use SSOT'
      },
      {
        id: 'AC-002-2',
        scenario: 'Lint rule allows SSOT usage',
        given: 'Code uses WORKFLOW_STAGES.length or similar SSOT',
        when: 'Lint runs on the file',
        then: 'No warning is shown'
      }
    ],
    definition_of_done: [
      'ESLint custom rule or no-restricted-syntax config added',
      'Rule warns on patterns like /25\s*stages?/ and /stage\s*25/',
      'Rule is warn-only (not error) until P7 completes',
      '.eslintrc updated with new rule'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use ESLint no-restricted-syntax with regex patterns. Keep as warn-only.',
    implementation_approach: 'Add ESLint configuration for no-restricted-syntax targeting hardcoded counts.',
    implementation_context: 'Prevent future hardcoding issues. Warn-only until god components refactored in P7.'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Vision V2 Compliance Check',
    user_role: 'Developer',
    user_want: 'A script that validates stage names match Vision V2 specification',
    user_benefit: 'Can ensure consistency between SSOT and actual implementation',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Compliance check validates names',
        given: 'SSOT has stage definitions',
        when: 'Compliance check runs',
        then: 'Each stage name is validated against Vision V2 spec'
      },
      {
        id: 'AC-003-2',
        scenario: 'Compliance check detects mismatches',
        given: 'A stage name differs from Vision V2',
        when: 'Compliance check runs',
        then: 'Error is reported with expected vs actual'
      }
    ],
    definition_of_done: [
      'npm run check:vision-compliance command exists',
      'Script validates SSOT against Vision V2 stage names',
      'Script outputs clear pass/fail report',
      'CI workflow includes compliance check'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Compare venture-workflow.ts SSOT against Vision V2 specification.',
    implementation_approach: 'Create script that imports SSOT and validates against Vision V2 canonical names.',
    implementation_context: 'Ensure SSOT remains aligned with Vision V2 document specification.'
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Full Venture Lifecycle E2E Test',
    user_role: 'QA Engineer',
    user_want: 'An E2E test that exercises all 25 stages of the venture workflow',
    user_benefit: 'Can validate complete venture journey works end-to-end',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'E2E test navigates all stages',
        given: 'Test creates a new venture',
        when: 'Test navigates through stages 1-25',
        then: 'Each stage loads without errors'
      },
      {
        id: 'AC-004-2',
        scenario: 'E2E test validates data persistence',
        given: 'Test enters data in each stage',
        when: 'Test revisits a stage',
        then: 'Previously entered data is preserved'
      },
      {
        id: 'AC-004-3',
        scenario: 'E2E test validates kill gates',
        given: 'Test is at a kill gate stage (13, 23)',
        when: 'Kill criteria not met',
        then: 'Test confirms advancement is blocked'
      }
    ],
    definition_of_done: [
      'Playwright test file for full venture lifecycle',
      'Test visits all 25 stages with basic assertions',
      'Test validates kill gates at stages 13 and 23',
      'Test validates promotion gates at 16, 17, 22',
      'Test runs in CI pipeline'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use Playwright page objects. Test may run 3-5 minutes due to 25 stages.',
    implementation_approach: 'Create comprehensive Playwright test with stage navigation and gate validation.',
    implementation_context: 'Critical E2E coverage for stage architecture. Validates kill and promotion gates work.'
  },
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create Architecture Decision Record (ADR)',
    user_role: 'Developer',
    user_want: 'Documentation of the Vision V2 stage architecture decisions',
    user_benefit: 'Can understand why architectural decisions were made',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'ADR documents decision',
        given: 'Developer reads ADR',
        when: 'Looking for stage architecture rationale',
        then: 'ADR explains Vision V2 phase mapping and gate decisions'
      },
      {
        id: 'AC-005-2',
        scenario: 'ADR follows template',
        given: 'ADR exists in docs/adr/',
        when: 'Checking ADR format',
        then: 'ADR follows standard template (Context, Decision, Consequences)'
      }
    ],
    definition_of_done: [
      'ADR file created in docs/adr/ directory',
      'ADR documents Vision V2 phase mapping',
      'ADR documents kill gate and promotion gate decisions',
      'ADR documents SSOT pattern decision'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use standard ADR template. Focus on the what and why.',
    implementation_approach: 'Create ADR following standard template documenting key decisions.',
    implementation_context: 'Document architectural decisions for future maintainability.'
  },
  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Update CLAUDE.md with Stage Architecture',
    user_role: 'AI Assistant',
    user_want: 'Updated CLAUDE.md that includes Vision V2 stage architecture context',
    user_benefit: 'Can provide better assistance with stage-related development',
    story_points: 2,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'CLAUDE.md includes stage info',
        given: 'AI reads CLAUDE.md',
        when: 'Assisting with stage development',
        then: 'Context includes Vision V2 phases and gate types'
      },
      {
        id: 'AC-006-2',
        scenario: 'CLAUDE.md references SSOT',
        given: 'AI needs stage configuration',
        when: 'Looking for stage data',
        then: 'CLAUDE.md points to venture-workflow.ts SSOT'
      }
    ],
    definition_of_done: [
      'CLAUDE.md database section includes Vision V2 context',
      'Stage architecture section added via leo_protocol_sections',
      'SSOT reference included',
      'Regenerate CLAUDE.md from database'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Add to leo_protocol_sections table, then regenerate CLAUDE.md.',
    implementation_approach: 'Add stage architecture context to database sections and regenerate.',
    implementation_context: 'Ensure AI assistant has context for stage-related development.'
  }
];

const deliverables = [
  {
    sd_id: SD_ID,
    deliverable_name: 'Stage Audit Script (audit:stages)',
    deliverable_type: 'SCRIPT',
    completion_status: 'pending',
    acceptance_criteria: 'Script validates all 25 V2 stage components exist and follow patterns'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'No-Hardcoded-Counts Lint Rule',
    deliverable_type: 'CONFIGURATION',
    completion_status: 'pending',
    acceptance_criteria: 'ESLint warns on hardcoded stage count patterns'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Vision V2 Compliance Check Script',
    deliverable_type: 'SCRIPT',
    completion_status: 'pending',
    acceptance_criteria: 'Script validates SSOT matches Vision V2 specification'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Full Venture Lifecycle E2E Test',
    deliverable_type: 'TEST',
    completion_status: 'pending',
    acceptance_criteria: 'Playwright test covers all 25 stages with gate validation'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'Vision V2 Architecture ADR',
    deliverable_type: 'DOCUMENTATION',
    completion_status: 'pending',
    acceptance_criteria: 'ADR documents phase mapping and gate decisions'
  },
  {
    sd_id: SD_ID,
    deliverable_name: 'CLAUDE.md Stage Architecture Update',
    deliverable_type: 'DOCUMENTATION',
    completion_status: 'pending',
    acceptance_criteria: 'CLAUDE.md includes Vision V2 stage context'
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
      const { error } = await supabase
        .from('sd_scope_deliverables')
        .update(deliverable)
        .eq('id', existing.id);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Updated');
    } else {
      const { error } = await supabase
        .from('sd_scope_deliverables')
        .insert(deliverable);
      console.log(error ? `    ❌ ${error.message}` : '    ✅ Created');
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ User stories and deliverables complete!');
  console.log(`   Stories: ${userStories.length}`);
  console.log(`   Deliverables: ${deliverables.length}`);
  console.log(`   Story points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
}

addUserStoriesAndDeliverables().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
