#!/usr/bin/env node

/**
 * Add User Stories for SD-FOUNDATION-V3-002
 * Legacy Protocol Cleanup (The Exorcism)
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const stories = [
  {
    story_key: 'SD-FOUNDATION-V3-002:US-001',
    sd_id: 'SD-FOUNDATION-V3-002',
    prd_id: 'PRD-SD-FOUNDATION-V3-002',
    title: 'Delete Stage26-52 Component Files',
    user_role: 'developer',
    user_want: 'all Stage26-52 component files removed from src/components/stages/',
    user_benefit: 'the codebase only contains the canonical 25-stage protocol components',
    status: 'draft',
    priority: 'critical',
    story_points: 2,
    acceptance_criteria: [
      'Stage26OperationalExcellence.tsx through Stage40VentureActive.tsx deleted',
      'Stage52DataManagementKB.tsx deleted',
      'Total: 16 component files removed',
      'ls src/components/stages/Stage{26..52}* returns no matches'
    ],
    test_scenarios: ['Verify files deleted', 'Build compiles without missing file errors'],
    implementation_context: {
      files_affected: [
        'src/components/stages/Stage26OperationalExcellence.tsx',
        'src/components/stages/Stage40VentureActive.tsx',
        'src/components/stages/Stage52DataManagementKB.tsx'
      ],
      approach: 'Delete all files matching Stage{26..52}*.tsx pattern',
      verification: 'ls src/components/stages/Stage{26..52}* should return no matches'
    }
  },
  {
    story_key: 'SD-FOUNDATION-V3-002:US-002',
    sd_id: 'SD-FOUNDATION-V3-002',
    prd_id: 'PRD-SD-FOUNDATION-V3-002',
    title: 'Update Orchestrator Components',
    user_role: 'developer',
    user_want: 'orchestrator components updated to remove Stage26-52 imports',
    user_benefit: 'there are no broken import references',
    status: 'draft',
    priority: 'critical',
    story_points: 3,
    acceptance_criteria: [
      'CompleteWorkflowOrchestrator.tsx - legacy imports removed',
      'LaunchGrowthChunkWorkflow.tsx - legacy imports removed',
      'OperationsOptimizationChunkWorkflow.tsx - legacy imports removed',
      'TypeScript compilation succeeds'
    ],
    test_scenarios: ['npx tsc --noEmit passes', 'No import errors in console'],
    implementation_context: {
      files_affected: [
        'src/components/stages/CompleteWorkflowOrchestrator.tsx',
        'src/components/stages/LaunchGrowthChunkWorkflow.tsx',
        'src/components/stages/OperationsOptimizationChunkWorkflow.tsx'
      ],
      approach: 'Remove imports and render logic for Stage26-52 components',
      verification: 'npx tsc --noEmit passes with no errors'
    }
  },
  {
    story_key: 'SD-FOUNDATION-V3-002:US-003',
    sd_id: 'SD-FOUNDATION-V3-002',
    prd_id: 'PRD-SD-FOUNDATION-V3-002',
    title: 'Clean Type Definitions',
    user_role: 'developer',
    user_want: 'Stage26-40 type definitions removed from workflowStages.ts',
    user_benefit: 'the type system reflects only 25 stages',
    status: 'draft',
    priority: 'high',
    story_points: 2,
    acceptance_criteria: [
      'Stage26-40 data interfaces removed from workflowStages.ts',
      'STAGE_CONFIGS entries for stages 26-40 removed',
      'WorkflowStageData union type updated',
      'No TypeScript errors after changes'
    ],
    test_scenarios: ['TypeScript compilation succeeds', 'No type-related build errors'],
    implementation_context: {
      files_affected: ['src/types/workflowStages.ts'],
      approach: 'Remove Stage26-40 data interfaces and STAGE_CONFIGS entries',
      verification: 'TypeScript compilation succeeds without errors'
    }
  },
  {
    story_key: 'SD-FOUNDATION-V3-002:US-004',
    sd_id: 'SD-FOUNDATION-V3-002',
    prd_id: 'PRD-SD-FOUNDATION-V3-002',
    title: 'Update Navigation and Routing',
    user_role: 'user',
    user_want: 'navigation entries for legacy stages removed',
    user_benefit: 'I do not see broken or ghost routes in the sidebar',
    status: 'draft',
    priority: 'high',
    story_points: 2,
    acceptance_criteria: [
      'ModernNavigationSidebar.tsx - legacy nav items removed',
      'App.tsx - routes to deleted pages removed',
      'navigationTaxonomy.ts - legacy references removed',
      'No 404 errors when navigating'
    ],
    test_scenarios: ['Navigation renders without errors', 'All visible nav items lead to valid pages'],
    implementation_context: {
      files_affected: [
        'src/components/navigation/ModernNavigationSidebar.tsx',
        'src/App.tsx',
        'src/data/navigationTaxonomy.ts'
      ],
      approach: 'Remove navigation entries and routes for legacy stages',
      verification: 'No 404 errors when navigating'
    }
  },
  {
    story_key: 'SD-FOUNDATION-V3-002:US-005',
    sd_id: 'SD-FOUNDATION-V3-002',
    prd_id: 'PRD-SD-FOUNDATION-V3-002',
    title: 'Remove Legacy Page Components',
    user_role: 'developer',
    user_want: 'page components that depend on legacy stages removed or updated',
    user_benefit: 'there are no runtime errors',
    status: 'draft',
    priority: 'high',
    story_points: 2,
    acceptance_criteria: [
      'MVPLaunchPage.tsx - removed or updated',
      'DataManagementKBPage.tsx - removed or updated',
      'GTMTimingPage.tsx - removed or updated',
      'CreativeMediaPage.tsx - removed or updated'
    ],
    test_scenarios: ['Build succeeds', 'No runtime errors in browser console'],
    implementation_context: {
      files_affected: [
        'src/pages/MVPLaunchPage.tsx',
        'src/pages/DataManagementKBPage.tsx',
        'src/pages/GTMTimingPage.tsx',
        'src/pages/CreativeMediaPage.tsx'
      ],
      approach: 'Remove or update pages that depend on legacy stage components',
      verification: 'Build succeeds, no runtime errors'
    }
  },
  {
    story_key: 'SD-FOUNDATION-V3-002:US-006',
    sd_id: 'SD-FOUNDATION-V3-002',
    prd_id: 'PRD-SD-FOUNDATION-V3-002',
    title: 'Update Workflow Constants',
    user_role: 'developer',
    user_want: 'VENTURE_STAGES array in workflows.ts to contain only stages 1-25',
    user_benefit: 'the constant reflects the canonical protocol',
    status: 'draft',
    priority: 'high',
    story_points: 1,
    acceptance_criteria: [
      'VENTURE_STAGES array contains only stages 1-25',
      'No placeholder components for stages 26-35',
      'No imports of deleted stage components',
      'Build succeeds with updated constants'
    ],
    test_scenarios: ['Constant exports correctly', 'No reference to Stage26+ in workflows.ts'],
    implementation_context: {
      files_affected: ['src/constants/workflows.ts'],
      approach: 'Remove Stage26-35 entries from VENTURE_STAGES array',
      verification: 'grep Stage26 src/constants/workflows.ts returns no matches'
    }
  }
];

async function addStories() {
  const client = await createSupabaseServiceClient('engineer');

  console.log('Adding user stories for SD-FOUNDATION-V3-002...\n');

  for (const story of stories) {
    const { error } = await client
      .from('user_stories')
      .upsert(story, { onConflict: 'story_key' });

    if (error) {
      console.log('❌ Error adding', story.story_key, ':', error.message);
    } else {
      console.log('✅', story.story_key, '-', story.title);
    }
  }

  console.log('\n✅ Done! Added', stories.length, 'user stories');
}

addStories().catch(console.error);
