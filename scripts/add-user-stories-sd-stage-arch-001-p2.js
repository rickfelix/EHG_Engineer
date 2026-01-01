#!/usr/bin/env node
/**
 * Add user stories for SD-STAGE-ARCH-001-P2 (Create V2 Stage Shells + Router)
 * Infrastructure SD for stage component shell creation
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-STAGE-ARCH-001-P2';
const PRD_ID = 'PRD-SD-STAGE-ARCH-001-P2';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create shell template component for V2 stages',
    user_role: 'Developer',
    user_want: 'A reusable shell template that provides consistent structure for all 25 stage components',
    user_benefit: 'Ensures consistent UI patterns, reduces code duplication, and speeds up P3-P4 implementation',
    story_points: 3,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Template renders stage header',
        given: 'StageShellTemplate receives VentureStage props',
        when: 'Component is rendered',
        then: 'Header displays stage number, name, and gate type indicator'
      },
      {
        id: 'AC-001-2',
        scenario: 'Template provides content slot',
        given: 'StageShellTemplate is used by a shell component',
        when: 'Shell passes children to template',
        then: 'Content renders in designated area with proper spacing'
      },
      {
        id: 'AC-001-3',
        scenario: 'Template shows gate indicator',
        given: 'Stage has gateType of "kill" or "promotion"',
        when: 'Component renders',
        then: 'Appropriate gate badge appears with gateLabel text'
      }
    ],
    definition_of_done: [
      'stage-shell-template.tsx created in /src/components/stages/v2/',
      'Component accepts VentureStage type from SSOT',
      'Props include: stage metadata, children, optional className',
      'Gate indicators styled appropriately (kill=red, promotion=green)',
      'TypeScript strict mode passes',
      'Component < 100 LOC'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Import VentureStage from venture-workflow.ts SSOT. Use Shadcn Card for layout. Gate badges use Badge component.',
    implementation_approach: 'Create reusable shell template using React FC with proper TypeScript generics. Use Tailwind for styling.',
    implementation_context: 'FR-TEMPLATE: Create reusable StageShellTemplate component. Imports VentureStage from venture-workflow.ts SSOT. Uses Shadcn Card and Badge components for layout. Gate types (kill/promotion) display with appropriate color indicators. Component receives stage metadata as props and renders header, content area, and navigation elements.'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Generate 25 V2 stage shell components',
    user_role: 'Developer',
    user_want: 'Individual shell components for all 25 stages that use the shell template',
    user_benefit: 'Provides complete stage infrastructure for P3-P4 to implement functionality',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'All 25 shells exist',
        given: 'P2 implementation is complete',
        when: 'Checking /src/components/stages/v2/',
        then: '25 shell files exist: Stage01DraftIdea.tsx through Stage25ScalePlanning.tsx'
      },
      {
        id: 'AC-002-2',
        scenario: 'Shells use shell template',
        given: 'Any stage shell component',
        when: 'Component code is reviewed',
        then: 'Component imports and uses StageShellTemplate'
      },
      {
        id: 'AC-002-3',
        scenario: 'Shells integrate with SSOT',
        given: 'Stage shell receives stageNumber prop',
        when: 'Component renders',
        then: 'Stage data is fetched from VENTURE_STAGES via getStageByNumber()'
      },
      {
        id: 'AC-002-4',
        scenario: 'Shells include placeholder content',
        given: 'Stage shell is rendered',
        when: 'User views stage',
        then: 'Shell shows "Implementation pending (P3/P4)" message in content area'
      }
    ],
    definition_of_done: [
      '25 shell files exist in /src/components/stages/v2/',
      'Each shell < 50 LOC',
      'Each shell imports VentureStage type from SSOT',
      'Each shell uses StageShellTemplate',
      'All shells pass TypeScript strict mode',
      'All shells pass ESLint'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use script to generate shells from VENTURE_STAGES array. Each shell follows naming convention: Stage{NN}{PascalCaseStageName}.tsx',
    implementation_approach: 'Create generator script that iterates VENTURE_STAGES and outputs shell files. Each file imports template and SSOT.',
    implementation_context: 'FR-SHELLS: Generate 25 V2 stage shell components using a generator script. Each shell imports StageShellTemplate and VentureStage type from SSOT. Files created in /src/components/stages/v2/ with naming convention Stage{NN}{PascalCaseStageName}.tsx. Each component is minimal (<50 LOC) with placeholder content for P3-P4 implementation.'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement dynamic stage router',
    user_role: 'Developer',
    user_want: 'A router component that dynamically loads and renders the correct stage based on stage number',
    user_benefit: 'Enables dynamic stage navigation without hardcoded imports, makes adding stages trivial',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Router resolves valid stage',
        given: 'Router receives stageNumber=5',
        when: 'Router resolves component',
        then: 'Stage05ProfitabilityForecasting component is loaded and rendered'
      },
      {
        id: 'AC-003-2',
        scenario: 'Router handles invalid stage',
        given: 'Router receives stageNumber=99',
        when: 'Router attempts to resolve',
        then: 'Fallback error component is shown with "Stage not found" message'
      },
      {
        id: 'AC-003-3',
        scenario: 'Router uses SSOT for validation',
        given: 'Router receives stageNumber',
        when: 'Router validates input',
        then: 'Uses getStageByNumber() from venture-workflow.ts to validate'
      },
      {
        id: 'AC-003-4',
        scenario: 'Router shows loading state',
        given: 'Stage component is being dynamically imported',
        when: 'Import is in progress',
        then: 'Loading spinner is displayed'
      }
    ],
    definition_of_done: [
      'stage-router.tsx created in /src/components/stages/v2/',
      'Router uses React.lazy() for dynamic imports',
      'Router validates stage numbers against SSOT',
      'Error boundary catches import failures',
      'Loading state shows during dynamic import',
      'TypeScript strict mode passes'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Use React.lazy() with Suspense. Import paths follow pattern: ./Stage{NN}{Name}.tsx. Use getStageByNumber() for SSOT lookup.',
    implementation_approach: 'Create StageRouter component with React.lazy dynamic imports. Wrap in Suspense with Loading fallback. Add ErrorBoundary for failed imports.',
    implementation_context: 'FR-ROUTER: Implement dynamic StageRouter component using React.lazy() for code splitting. Router validates stageNumber against SSOT using getStageByNumber(). Wraps imports in Suspense with loading fallback. Includes ErrorBoundary for failed imports. Router accepts stageNumber prop and dynamically imports Stage{NN}{Name}.tsx components from v2 directory.'
  }
];

async function addUserStories() {
  console.log(`📋 Adding ${userStories.length} User Stories to ${PRD_ID}...`);
  console.log('='.repeat(70));

  for (const story of userStories) {
    console.log(`\n  Adding: ${story.story_key} - ${story.title}`);

    // Check if story already exists
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
