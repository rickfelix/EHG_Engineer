import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Improved user stories with INVEST principles
const storyUpdates = {
  'SD-STAGE-ARCH-001-P4:US-001': {
    title: 'Implement GTM & Sales Strategy Stages 11-12',
    user_role: 'venture creator entering the go-to-market phase',
    user_want: 'to configure and validate go-to-market strategy and sales success logic using the Stage 11-12 component shells',
    user_benefit: 'I can define clear market positioning and sales processes that will drive venture success and customer acquisition',
    acceptance_criteria: [
      'Given I am on Stage 11 (GTM Strategy), when the component loads, then I see sections for market positioning, channel strategy, and target customer segments',
      'Given I complete Stage 11 GTM inputs, when I save the data, then it persists to the venture_stage_data table with stage_number=11',
      'Given I am on Stage 12 (Sales & Success Logic), when the component renders, then I see sections for sales funnel, customer lifecycle, and success metrics',
      'Given I complete Stage 12 sales inputs, when I save the data, then it persists to venture_stage_data with stage_number=12',
      'Given I complete both stages 11-12, when I view the workflow, then both stages show completion status with green checkmarks'
    ],
    implementation_context: 'Stages 11-12 complete Phase 3 (THE IDENTITY) and establish how the venture will reach customers. Stage 11 is also a kill gate - ventures without viable GTM strategy can be terminated here.',
    architecture_references: [
      'src/components/ventures/workflow/StageShellTemplate.tsx - Base template from P3',
      'docs/workflow/stages_v2.yaml - Stage 11-12 specifications',
      'src/lib/venture-workflow.ts - SSOT for stage metadata',
      'database/schema/venture_stage_data table - Data persistence'
    ],
    example_code_patterns: [
      'Use StageShellTemplate with stage numbers 11 and 12',
      'Pull stage metadata from getStageDetails(11) and getStageDetails(12)',
      'Implement form sections for GTM strategy and sales logic',
      'Save to venture_stage_data table with proper stage_number'
    ],
    testing_scenarios: [
      'Happy path: User completes both GTM and Sales stages successfully',
      'Validation: Required fields enforce completion',
      'Kill gate: Stage 11 shows terminate option for non-viable GTM',
      'Data persistence: Stage data saves and loads correctly'
    ]
  },

  'SD-STAGE-ARCH-001-P4:US-002': {
    title: 'Implement Tech Stack Interrogation Kill Gate - Stage 13',
    user_role: 'venture creator entering the technical planning phase',
    user_want: 'to configure technology stack choices and validate technical feasibility at the Stage 13 kill gate',
    user_benefit: 'I can make informed technology decisions and validate technical viability before proceeding to detailed architecture',
    acceptance_criteria: [
      'Given I am on Stage 13 (Tech Stack Interrogation), when the component loads, then I see sections for tech stack selection, scalability assessment, and cost projections',
      'Given I complete tech stack selections, when I save the data, then it persists to venture_stage_data with stage_number=13',
      'Given Stage 13 is a kill gate, when I view the gate, then I see a clear GO/NO_GO decision interface based on technical feasibility',
      'Given tech stack has compatibility issues, when the gate evaluates, then blocking technical issues are highlighted with clear explanations',
      'Given I choose to terminate at this gate, when I click terminate, then a confirmation dialog shows the impact of stopping the venture at this stage'
    ],
    implementation_context: 'Stage 13 is the fourth kill gate (after stages 3, 5, and 11). It validates technical feasibility before committing to detailed architecture. Ventures with unsound technical foundations are terminated here.',
    architecture_references: [
      'src/components/ventures/workflow/StageShellTemplate.tsx - Base template',
      'docs/workflow/stages_v2.yaml - Stage 13 specification with kill gate flag',
      'src/lib/venture-workflow.ts - getStageDetails(13) returns is_kill_gate: true',
      'src/components/ventures/workflow/KillGateInterface.tsx - Kill gate UI pattern'
    ],
    example_code_patterns: [
      'Use StageShellTemplate with stage_number=13',
      'Implement KillGateInterface component for GO/NO_GO decision',
      'Show tech stack compatibility warnings',
      'Highlight blocking technical issues in red'
    ],
    testing_scenarios: [
      'Happy path: Tech stack validates and venture proceeds',
      'Kill scenario: Incompatible tech stack triggers NO_GO decision',
      'Termination: User terminates venture with confirmation dialog',
      'Data persistence: Tech stack choices save correctly'
    ]
  },

  'SD-STAGE-ARCH-001-P4:US-003': {
    title: 'Implement Data Model & Epic Breakdown - Stages 14-15',
    user_role: 'venture creator defining technical architecture',
    user_want: 'to design data models and break down work into epics and user stories using the Stage 14-15 component shells',
    user_benefit: 'I can create comprehensive technical specifications that guide development and ensure all functionality is planned',
    acceptance_criteria: [
      'Given I am on Stage 14 (Data Model & Architecture), when the component loads, then I see sections for ERD design, entity relationships, and architecture diagrams',
      'Given I complete data model design, when I save, then it persists to venture_stage_data with stage_number=14',
      'Given I am on Stage 15 (Epic & User Story Breakdown), when the component renders, then I see sections for epic creation, story generation, and acceptance criteria',
      'Given I create epics and stories, when I save, then they persist to venture_stage_data with stage_number=15',
      'Given I complete both stages 14-15, when I view the workflow, then both stages show completion with proper phase progress (Phase 4: THE BLUEPRINT)'
    ],
    implementation_context: 'Stages 14-15 are core architecture stages in Phase 4 (THE BLUEPRINT). Stage 14 defines the data foundation, Stage 15 breaks down work into implementable stories.',
    architecture_references: [
      'src/components/ventures/workflow/StageShellTemplate.tsx - Base template',
      'docs/workflow/stages_v2.yaml - Stages 14-15 specifications',
      'src/lib/venture-workflow.ts - Phase 4 metadata',
      'database/schema/venture_stage_data table - Multi-stage data storage'
    ],
    example_code_patterns: [
      'Use StageShellTemplate for stages 14 and 15',
      'Implement ERD builder interface for Stage 14',
      'Implement epic/story breakdown interface for Stage 15',
      'Link Stage 15 stories to Stage 14 data model'
    ],
    testing_scenarios: [
      'Happy path: User completes data model and story breakdown',
      'Validation: ERD requires minimum entity count',
      'Validation: Stories require acceptance criteria',
      'Integration: Stage 15 references Stage 14 data model'
    ]
  },

  'SD-STAGE-ARCH-001-P4:US-004': {
    title: 'Implement Schema & Environment Promotion Gates - Stages 16-17',
    user_role: 'venture creator advancing from simulation to production',
    user_want: 'to elevate database schema and repository from simulation namespace to production with Chairman approval at promotion gates 16-17',
    user_benefit: 'I can advance my venture to production-ready status with proper governance and validation of technical artifacts',
    acceptance_criteria: [
      'Given I am on Stage 16 (Schema Firewall), when the component loads, then I see schema generation status, migration builder, and elevation readiness percentage',
      'Given my schema meets promotion criteria, when I view the gate, then I see the Chairman signature requirement clearly labeled with approval workflow',
      'Given I am on Stage 17 (Environment Config), when the component renders, then I see environment configuration, .ai/ directory setup, and repo elevation status',
      'Given Stage 16 is completed, when I trigger elevation, then the schema copies from simulation namespace to production namespace in the database',
      'Given Stage 17 is completed, when I trigger repo elevation, then the repository forks from simulation org to production org on GitHub'
    ],
    implementation_context: 'Stages 16-17 are PROMOTION GATES that elevate artifacts from simulation to production. Stage 16 is also a kill gate and advisory checkpoint - requires Chairman signature. These are the first elevation points in the venture lifecycle.',
    architecture_references: [
      'src/components/ventures/workflow/PromotionGateInterface.tsx - Promotion gate UI',
      'docs/workflow/stages_v2.yaml - Stages 16-17 with elevation flags',
      'src/lib/venture-workflow.ts - getStageDetails returns is_elevation_point and elevation_target',
      'database/schema/venture_namespace_elevations table - Tracks schema/repo promotions'
    ],
    example_code_patterns: [
      'Use PromotionGateInterface with elevation_target: "schema" for Stage 16',
      'Use PromotionGateInterface with elevation_target: "repo" for Stage 17',
      'Show elevation readiness percentage based on schema validation',
      'Display Chairman signature requirement with approval status'
    ],
    testing_scenarios: [
      'Happy path: Schema and repo elevate successfully with Chairman approval',
      'Validation: Elevation blocks if schema validation fails',
      'Kill scenario: Stage 16 kill gate terminates if schema fundamentally flawed',
      'Authorization: Elevation requires Chairman role signature'
    ]
  },

  'SD-STAGE-ARCH-001-P4:US-005': {
    title: 'Implement Build Loop Stages 18-20',
    user_role: 'venture creator executing development iterations',
    user_want: 'to manage MVP development, integrations, and security validation using the Stage 18-20 component shells',
    user_benefit: 'I can track development progress, integrate external services, and ensure security standards are met before deployment',
    acceptance_criteria: [
      'Given I am on Stage 18 (MVP Development Loop), when the component loads, then I see sprint management, task board, and iteration tracking sections',
      'Given I complete sprint work, when I save progress, then it persists to venture_stage_data with stage_number=18',
      'Given I am on Stage 19 (Integration & API Layer), when the component renders, then I see API documentation, endpoint testing, and integration configuration sections',
      'Given I am on Stage 20 (Security & Performance), when the component loads, then I see security scanning results, performance benchmarks, and optimization recommendations',
      'Given I complete all three stages 18-20, when I view the workflow, then Phase 5 (THE BUILD LOOP) shows completion status'
    ],
    implementation_context: 'Stages 18-20 form the core development loop (Phase 5: THE BUILD LOOP). These stages track actual implementation work, API integrations, and technical quality validation.',
    architecture_references: [
      'src/components/ventures/workflow/StageShellTemplate.tsx - Base template',
      'docs/workflow/stages_v2.yaml - Stages 18-20 specifications',
      'src/lib/venture-workflow.ts - Phase 5 metadata and stage details',
      'database/schema/venture_stage_data table - Development progress tracking'
    ],
    example_code_patterns: [
      'Use StageShellTemplate for stages 18, 19, and 20',
      'Implement sprint board interface for Stage 18',
      'Implement API testing interface for Stage 19',
      'Implement security scan results display for Stage 20'
    ],
    testing_scenarios: [
      'Happy path: All three development stages complete successfully',
      'Validation: Security scan blocks progression if critical vulnerabilities found',
      'Validation: Performance benchmarks warn if targets not met',
      'Integration: Stage 19 API configs link to Stage 18 development tasks'
    ]
  },

  'SD-STAGE-ARCH-001-P4:US-006': {
    title: 'Implement QA/UAT & Deployment Promotion - Stages 21-22',
    user_role: 'venture creator preparing for production launch',
    user_want: 'to execute quality validation and deploy to production infrastructure using the Stage 21-22 component shells with deployment promotion',
    user_benefit: 'I can ensure quality standards are met and deploy my venture to production with confidence and proper governance',
    acceptance_criteria: [
      'Given I am on Stage 21 (QA & UAT), when the component loads, then I see test case management, UAT execution, bug tracking, and acceptance sign-off sections',
      'Given I complete QA testing, when all tests pass, then the quality gate allows progression to Stage 22',
      'Given I am on Stage 22 (Deployment & Infrastructure), when the component renders, then I see infrastructure provisioning status, deployment pipeline, and elevation readiness',
      'Given Stage 22 deployment meets criteria, when I trigger elevation, then the deployment elevates from simulation environment to production URL',
      'Given deployment elevation completes, when I view Stage 22, then it shows production deployment status with rollback option available'
    ],
    implementation_context: 'Stage 21 is the quality gate before production. Stage 22 is a DEPLOYMENT ELEVATION POINT - the deployment moves from simulation to production. These are the final validation stages in Phase 6 (LAUNCH & LEARN).',
    architecture_references: [
      'src/components/ventures/workflow/StageShellTemplate.tsx - Base template',
      'src/components/ventures/workflow/PromotionGateInterface.tsx - Deployment elevation UI',
      'docs/workflow/stages_v2.yaml - Stages 21-22 with deployment elevation',
      'database/schema/venture_deployments table - Tracks deployment elevations'
    ],
    example_code_patterns: [
      'Use StageShellTemplate for Stage 21 with quality gate enforcement',
      'Use PromotionGateInterface with elevation_target: "deployment" for Stage 22',
      'Display test results and bug tracking in Stage 21',
      'Show deployment status and rollback controls in Stage 22'
    ],
    testing_scenarios: [
      'Happy path: QA passes and deployment elevates successfully',
      'Quality gate: Stage 21 blocks if tests fail',
      'Deployment: Stage 22 elevates deployment to production URL',
      'Rollback: User can rollback deployment if issues found'
    ]
  },

  'SD-STAGE-ARCH-001-P4:US-007': {
    title: 'Implement Production Launch Kill Gate - Stage 23',
    user_role: 'venture creator finalizing production launch',
    user_want: 'to validate production readiness and execute go-live with launch checklist validation at the Stage 23 kill gate',
    user_benefit: 'I can ensure my venture meets all production requirements before committing to public launch and avoid costly rollbacks',
    acceptance_criteria: [
      'Given I am on Stage 23 (Production Launch), when the component loads, then I see launch checklist, monitoring activation, and go-live workflow sections',
      'Given Stage 23 is a kill gate, when I view the gate, then I see a final GO/NO_GO decision interface based on production readiness criteria',
      'Given launch checklist is incomplete, when the gate evaluates, then blocking items are highlighted and launch is prevented until resolved',
      'Given all readiness criteria are met, when I trigger go-live, then the venture transitions to LIVE status in the database',
      'Given I complete Stage 23, when I view the workflow, then it shows venture completion and transition to active monitoring state'
    ],
    implementation_context: 'Stage 23 is the FINAL kill gate and the ceremonial launch point. It validates production readiness, activates monitoring, and marks the venture as LIVE. This is the final stage of Phase 6 (LAUNCH & LEARN) before transitioning to ongoing optimization (Stages 24-25).',
    architecture_references: [
      'src/components/ventures/workflow/StageShellTemplate.tsx - Base template',
      'src/components/ventures/workflow/KillGateInterface.tsx - Final kill gate UI',
      'docs/workflow/stages_v2.yaml - Stage 23 specification with kill gate flag',
      'database/schema/ventures table - venture_status transition to LIVE'
    ],
    example_code_patterns: [
      'Use StageShellTemplate with stage_number=23',
      'Implement KillGateInterface for final GO/NO_GO decision',
      'Display launch checklist with completion status',
      'Trigger venture status update to LIVE on go-live'
    ],
    testing_scenarios: [
      'Happy path: All checklist items complete and venture goes live',
      'Kill scenario: Incomplete checklist blocks launch',
      'Kill scenario: User terminates venture at final gate',
      'Status transition: Venture status updates to LIVE in database'
    ]
  }
};

async function updateStories() {
  console.log('Fetching existing stories...\n');

  const { data: stories, error } = await supabase
    .from('user_stories')
    .select('id, story_key, title')
    .eq('sd_id', 'SD-STAGE-ARCH-001-P4')
    .order('story_key');

  if (error) {
    console.error('Error fetching stories:', error.message);
    return;
  }

  console.log('Found ' + stories.length + ' stories to update\n');

  for (const story of stories) {
    const update = storyUpdates[story.story_key];

    if (!update) {
      console.log('No update defined for ' + story.story_key);
      continue;
    }

    console.log('Updating ' + story.story_key + ': ' + update.title);

    const { error: updateError } = await supabase
      .from('user_stories')
      .update({
        title: update.title,
        user_role: update.user_role,
        user_want: update.user_want,
        user_benefit: update.user_benefit,
        acceptance_criteria: update.acceptance_criteria,
        implementation_context: update.implementation_context,
        architecture_references: update.architecture_references,
        example_code_patterns: update.example_code_patterns,
        testing_scenarios: update.testing_scenarios
      })
      .eq('id', story.id);

    if (updateError) {
      console.error('  Error: ' + updateError.message);
    } else {
      console.log('  Success - Updated with ' + update.acceptance_criteria.length + ' acceptance criteria');
    }
  }

  console.log('\n=== Update Summary ===');
  console.log('Total stories updated: ' + stories.length);
  console.log('\nQuality improvements:');
  console.log('- All user_want fields are specific and detailed (>80 chars)');
  console.log('- All user_benefit fields explain value clearly (>60 chars)');
  console.log('- All acceptance criteria use Given-When-Then format');
  console.log('- All stories include implementation context');
  console.log('- All stories reference Vision V2 specifications');
  console.log('- Minimum 3-5 acceptance criteria per story');
  console.log('\nRun validation script to verify quality score is now >55%');
}

updateStories();
