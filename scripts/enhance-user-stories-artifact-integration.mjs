#!/usr/bin/env node

/**
 * Enhance user stories for SD-ARTIFACT-INTEGRATION-001
 * Improves quality to pass the 55% threshold
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-ARTIFACT-INTEGRATION-001';

// Enhanced user story data with INVEST-compliant content
const enhancedStories = {
  'SD-ARTIFACT-INTEGRATION-001:US-001': {
    user_role: 'Developer',
    user_want: 'to have a single source of truth YAML configuration that defines which artifacts are required at each of the 25 venture workflow stages',
    user_benefit: 'I can implement stage-gated artifact validation consistently across the application without hardcoding requirements',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        criteria: 'Given I open config/stage_policy.yaml, When I validate its structure, Then it must contain all 25 stages with required_artifacts, optional_artifacts, and gate_type fields',
        type: 'functional'
      },
      {
        id: 'AC-001-2',
        criteria: 'Given stage_policy.yaml exists, When I parse it with js-yaml, Then no parsing errors occur and all stages are accessible by number',
        type: 'functional'
      },
      {
        id: 'AC-001-3',
        criteria: 'Given stages 3, 5, and 16 are decision gates, When I check their gate_type, Then they must be "hard" not "soft"',
        type: 'functional'
      },
      {
        id: 'AC-001-4',
        criteria: 'Given the artifact_contract.schema.json exists, When I validate sample artifacts against it, Then valid artifacts pass and invalid ones fail with clear error messages',
        type: 'validation'
      }
    ]
  },
  'SD-ARTIFACT-INTEGRATION-001:US-002': {
    user_role: 'Venture Creator',
    user_want: 'to see all artifacts associated with my current workflow stage displayed in a clear, organized panel within the stage viewer',
    user_benefit: 'I can quickly review governance-approved artifacts without navigating away from my workflow context',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        criteria: 'Given I am viewing a stage, When artifacts exist for that stage, Then the ArtifactPanel displays them with type, title, and validation status',
        type: 'functional'
      },
      {
        id: 'AC-002-2',
        criteria: 'Given an artifact has validation_status.passed=true, When rendered in ArtifactCard, Then a green checkmark badge appears',
        type: 'ui'
      },
      {
        id: 'AC-002-3',
        criteria: 'Given an artifact has quality_score, When rendered, Then the score is displayed as a percentage with appropriate color coding (green ≥85%, yellow ≥70%, red <70%)',
        type: 'ui'
      },
      {
        id: 'AC-002-4',
        criteria: 'Given the viewport is mobile width (<768px), When ArtifactPanel renders, Then it displays in a single-column responsive layout',
        type: 'responsive'
      }
    ]
  },
  'SD-ARTIFACT-INTEGRATION-001:US-003': {
    user_role: 'Venture Creator',
    user_want: 'to see clear visual indicators showing whether I can proceed to the next stage based on artifact requirements being met',
    user_benefit: 'I understand exactly what is blocking my progress and can take action to resolve missing artifacts',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        criteria: 'Given I am on a hard-gate stage (3, 5, or 16), When required artifacts are missing, Then a red GateBlocker modal prevents navigation to the next stage',
        type: 'functional'
      },
      {
        id: 'AC-003-2',
        criteria: 'Given I am on a soft-gate stage, When artifacts are missing, Then a yellow GateIndicator shows a warning but allows progression',
        type: 'functional'
      },
      {
        id: 'AC-003-3',
        criteria: 'Given all required artifacts are present and validated, When viewing the GateIndicator, Then it displays green with "Ready to proceed" text',
        type: 'ui'
      },
      {
        id: 'AC-003-4',
        criteria: 'Given GateBlocker is displayed, When I click "Request Artifact", Then a governance queue entry is created (or appropriate action is taken)',
        type: 'integration'
      }
    ]
  },
  'SD-ARTIFACT-INTEGRATION-001:US-004': {
    user_role: 'Venture Creator',
    user_want: 'to see the governance-generated vision visualization image displayed prominently in stages 2-3 of my venture workflow',
    user_benefit: 'I can visually validate that the AI-generated visualization matches my vision brief before proceeding with validation',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        criteria: 'Given a venture is linked to an SD with metadata.vision_discovery.visualization.url, When viewing Stage 2 or 3, Then the VisionBriefViewer displays the image',
        type: 'functional'
      },
      {
        id: 'AC-004-2',
        criteria: 'Given the visualization URL is valid, When the image loads, Then it displays with alt text from artifact metadata and a "Generated by Governance" badge',
        type: 'ui'
      },
      {
        id: 'AC-004-3',
        criteria: 'Given no visualization exists for the SD, When viewing Stage 2 or 3, Then a placeholder with "Visualization pending" message appears',
        type: 'edge-case'
      },
      {
        id: 'AC-004-4',
        criteria: 'Given the image file is in Supabase Storage, When runtime requests it, Then the image loads within 3 seconds on standard connection',
        type: 'performance'
      }
    ]
  },
  'SD-ARTIFACT-INTEGRATION-001:US-005': {
    user_role: 'Venture Creator',
    user_want: 'to navigate and view detailed information for stages 7 through 16 of my venture workflow with the same quality as stages 1-6',
    user_benefit: 'I can track my venture progress through THE IDENTITY and THE BLUEPRINT phases with full stage-specific guidance and artifact support',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        criteria: 'Given I navigate to any stage from 7 to 16, When the StageViewer loads, Then it displays stage-specific content following the same pattern as Stage3-6 viewers',
        type: 'functional'
      },
      {
        id: 'AC-005-2',
        criteria: 'Given each new StageViewer (7-16) is created, When measured with line counting, Then each file is between 300-600 lines of code',
        type: 'technical'
      },
      {
        id: 'AC-005-3',
        criteria: 'Given I am on Stage 10 (Strategic Naming), When artifacts are present, Then brand identity visualizations are displayed prominently',
        type: 'functional'
      },
      {
        id: 'AC-005-4',
        criteria: 'Given I am on Stage 16 (Schema Firewall), When the hard gate is active, Then GateBlocker prevents progression without required design contracts',
        type: 'integration'
      }
    ]
  },
  'SD-ARTIFACT-INTEGRATION-001:US-006': {
    user_role: 'Developer',
    user_want: 'to have automated enforcement that prevents the EHG runtime from importing or calling any governance scripts from EHG_Engineering',
    user_benefit: 'I maintain the architectural boundary between governance (artifact generation) and runtime (artifact consumption) to prevent cost overruns and ensure proper audit trails',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        criteria: 'Given I run ESLint on the EHG codebase, When any file imports from scripts/*.js or references governance functions, Then ESLint fails with a boundary violation error',
        type: 'technical'
      },
      {
        id: 'AC-006-2',
        criteria: 'Given the artifactService.ts is created, When I grep for insert/update/delete operations, Then only read operations (select) are found',
        type: 'technical'
      },
      {
        id: 'AC-006-3',
        criteria: 'Given a PR is submitted to EHG, When GitHub Actions runs, Then a boundary-check workflow verifies no governance imports exist',
        type: 'ci-cd'
      },
      {
        id: 'AC-006-4',
        criteria: 'Given useStagePolicy hook exists, When I inspect its implementation, Then it only reads from bundled/cached policy data, not from governance API',
        type: 'technical'
      }
    ]
  }
};

async function main() {
  console.log('\n📝 Enhancing User Stories for INVEST Quality');
  console.log('═'.repeat(70));
  console.log(`SD: ${SD_ID}\n`);

  let updated = 0;
  for (const [storyKey, enhancements] of Object.entries(enhancedStories)) {
    const { error } = await supabase
      .from('user_stories')
      .update({
        user_role: enhancements.user_role,
        user_want: enhancements.user_want,
        user_benefit: enhancements.user_benefit,
        acceptance_criteria: enhancements.acceptance_criteria
      })
      .eq('story_key', storyKey);

    if (error) {
      console.log(`  ❌ ${storyKey}: ${error.message}`);
    } else {
      console.log(`  ✅ ${storyKey}: Enhanced`);
      updated++;
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`✅ Enhanced ${updated}/${Object.keys(enhancedStories).length} user stories`);
  console.log('\nImprovements made:');
  console.log('  - Specific user_role (Developer/Venture Creator instead of Stakeholder)');
  console.log('  - Distinct user_want and user_benefit');
  console.log('  - Given-When-Then acceptance criteria format');
  console.log('  - Typed acceptance criteria (functional, ui, technical, etc.)');
  console.log('\n📝 Next step: Re-run PLAN-TO-EXEC handoff');
  console.log('   node scripts/handoff.js execute PLAN-TO-EXEC SD-ARTIFACT-INTEGRATION-001');
  console.log('═'.repeat(70));
}

main().catch(console.error);
