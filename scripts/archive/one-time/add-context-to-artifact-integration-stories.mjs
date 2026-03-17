#!/usr/bin/env node

/**
 * Add implementation_context to user stories for SD-ARTIFACT-INTEGRATION-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-ARTIFACT-INTEGRATION-001';

// Implementation context for each user story
const contextMap = {
  'SD-ARTIFACT-INTEGRATION-001:US-001': {
    technical_approach: 'Create stage_policy.yaml in EHG_Engineering/config/ defining artifact requirements, gate types (hard/soft), and epistemic flags for all 25 stages',
    files_to_create: ['config/stage_policy.yaml', 'config/artifact_contract.schema.json'],
    files_to_modify: [],
    dependencies: ['js-yaml package for YAML parsing'],
    estimated_effort: 'Small (4-8 hours)',
    test_approach: 'Unit tests for YAML validation, schema validation tests'
  },
  'SD-ARTIFACT-INTEGRATION-001:US-002': {
    technical_approach: 'Create generic ArtifactPanel React component using Shadcn UI that renders artifact cards based on artifact type, with validation badges and quality scores',
    files_to_create: ['src/components/artifacts/ArtifactPanel.tsx', 'src/components/artifacts/ArtifactCard.tsx', 'src/components/artifacts/index.ts'],
    files_to_modify: [],
    dependencies: ['Shadcn UI components', 'Supabase client'],
    estimated_effort: 'Medium (8-16 hours)',
    test_approach: 'Unit tests for component rendering, E2E tests for artifact display'
  },
  'SD-ARTIFACT-INTEGRATION-001:US-003': {
    technical_approach: 'Create GateIndicator component showing gate status (green/yellow/red), GateBlocker for hard gates, integrate with workflow orchestrator',
    files_to_create: ['src/components/gates/GateIndicator.tsx', 'src/components/gates/GateBlocker.tsx', 'src/components/gates/index.ts'],
    files_to_modify: ['src/components/workflow/CompleteWorkflowOrchestrator.tsx'],
    dependencies: ['ArtifactPanel component', 'useStagePolicy hook'],
    estimated_effort: 'Medium (8-16 hours)',
    test_approach: 'Unit tests for gate logic, E2E tests for blocking behavior'
  },
  'SD-ARTIFACT-INTEGRATION-001:US-004': {
    technical_approach: 'Create VisionBriefViewer component that fetches visualization URL from sd.metadata.vision_discovery and displays image with metadata overlay',
    files_to_create: ['src/components/artifacts/VisionBriefViewer.tsx'],
    files_to_modify: ['src/components/stages/StageViewer2.tsx', 'src/components/stages/StageViewer3.tsx'],
    dependencies: ['Supabase Storage access', 'ArtifactPanel component'],
    estimated_effort: 'Small (4-8 hours)',
    test_approach: 'Unit tests for URL fetching, E2E tests for image display'
  },
  'SD-ARTIFACT-INTEGRATION-001:US-005': {
    technical_approach: 'Create StageViewer7-16 components following existing Stage1-6 patterns, integrate ArtifactPanel and GateIndicator into each',
    files_to_create: ['src/components/stages/StageViewer7.tsx', 'src/components/stages/StageViewer8.tsx', 'src/components/stages/StageViewer9.tsx', 'src/components/stages/StageViewer10.tsx', 'src/components/stages/StageViewer11.tsx', 'src/components/stages/StageViewer12.tsx', 'src/components/stages/StageViewer13.tsx', 'src/components/stages/StageViewer14.tsx', 'src/components/stages/StageViewer15.tsx', 'src/components/stages/StageViewer16.tsx'],
    files_to_modify: ['src/components/stages/index.ts'],
    dependencies: ['ArtifactPanel', 'GateIndicator', 'Stage1-6 viewer patterns'],
    estimated_effort: 'Large (16-24 hours)',
    test_approach: 'E2E tests for each new stage viewer navigation and rendering'
  },
  'SD-ARTIFACT-INTEGRATION-001:US-006': {
    technical_approach: 'Add ESLint rule to block imports from scripts/*.js in EHG runtime, create PR check for boundary compliance, ensure artifactService.ts is read-only',
    files_to_create: ['src/services/artifactService.ts', '.eslintrc.boundary-rules.js'],
    files_to_modify: ['.eslintrc.js', '.github/workflows/boundary-check.yml'],
    dependencies: ['ESLint', 'GitHub Actions'],
    estimated_effort: 'Small (4-8 hours)',
    test_approach: 'Lint tests for boundary violations, integration tests for artifactService'
  }
};

async function main() {
  console.log('\n📝 Adding Implementation Context to User Stories');
  console.log('═'.repeat(70));
  console.log(`SD: ${SD_ID}\n`);

  // First, check current status
  const { data: stories, error: fetchError } = await supabase
    .from('user_stories')
    .select('story_key, title, implementation_context')
    .eq('sd_id', SD_ID);

  if (fetchError) {
    console.error('Error fetching stories:', fetchError.message);
    process.exit(1);
  }

  console.log('Current Status:');
  for (const story of stories) {
    const hasContext = story.implementation_context && Object.keys(story.implementation_context).length > 0;
    console.log(`  ${story.story_key}: ${hasContext ? '✅' : '❌'} ${story.title}`);
  }

  console.log('\n' + '─'.repeat(70));
  console.log('Updating stories with implementation_context...\n');

  let updated = 0;
  for (const [storyKey, context] of Object.entries(contextMap)) {
    const { error: updateError } = await supabase
      .from('user_stories')
      .update({ implementation_context: context })
      .eq('story_key', storyKey);

    if (updateError) {
      console.error(`  ❌ ${storyKey}: ${updateError.message}`);
    } else {
      console.log(`  ✅ ${storyKey}: Context added`);
      updated++;
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`✅ Updated ${updated}/${Object.keys(contextMap).length} user stories`);
  console.log('\n📝 Next step: Re-run PLAN-TO-EXEC handoff');
  console.log('   node scripts/handoff.js execute PLAN-TO-EXEC SD-ARTIFACT-INTEGRATION-001');
  console.log('═'.repeat(70));
}

main().catch(console.error);
