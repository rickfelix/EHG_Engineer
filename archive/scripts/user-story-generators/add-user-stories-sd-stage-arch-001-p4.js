#!/usr/bin/env node
/**
 * Add user stories for SD-STAGE-ARCH-001-P4 (Rebuild Crisis Zone)
 * Feature SD for implementing stages 11-23 per Vision V2
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-STAGE-ARCH-001-P4';
const PRD_ID = 'PRD-SD-STAGE-ARCH-001-P4';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement GTM & Sales Stages 11-12',
    user_role: 'Entrepreneur',
    user_want: 'Functional stages for Go-to-Market Strategy and Sales & Success Logic',
    user_benefit: 'Can plan market entry and customer acquisition for my venture',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Stage 11 captures GTM strategy',
        given: 'User is on Stage 11',
        when: 'User enters target markets and acquisition channels',
        then: 'GTM strategy data is saved to database'
      },
      {
        id: 'AC-001-2',
        scenario: 'Stage 12 captures sales logic',
        given: 'User is on Stage 12',
        when: 'User defines sales process and success metrics',
        then: 'Sales & success data is saved to database'
      }
    ],
    definition_of_done: [
      'Stage11GTMStrategy.tsx implemented (400-600 LOC)',
      'Stage12SalesSuccessLogic.tsx implemented (400-600 LOC)',
      'Data persists to venture_stage_data',
      'TypeScript strict mode passes'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'These stages are in THE_IDENTITY phase. Design based on Vision V2 purpose.',
    implementation_approach: 'Create fresh V2 components in stages/v2/. Use venture data integration. Include persona integration from earlier stages.',
    implementation_context: 'FR-01/FR-02: Implement Go-to-Market Strategy (Stage 11) and Sales & Success Logic (Stage 12). Part of THE_IDENTITY phase. Include target market selection, acquisition channel definition, launch timeline, sales process stages, and success metrics configuration.'
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Tech Stack Kill Gate - Stage 13',
    user_role: 'Entrepreneur',
    user_want: 'A kill gate that evaluates technology choices and blocks unviable stacks',
    user_benefit: 'Can ensure my venture has a viable technology foundation before heavy investment',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Stage 13 displays tech stack evaluation',
        given: 'User is on Stage 13',
        when: 'User evaluates technology choices',
        then: 'Tech stack assessment is displayed with viability scores'
      },
      {
        id: 'AC-002-2',
        scenario: 'Kill gate blocks on failure',
        given: 'Tech stack criteria NOT met',
        when: 'User attempts to advance to Stage 14',
        then: 'System blocks advancement with kill gate warning'
      },
      {
        id: 'AC-002-3',
        scenario: 'Kill gate allows on success',
        given: 'Tech stack criteria ARE met',
        when: 'User advances to Stage 14',
        then: 'System allows advancement'
      }
    ],
    definition_of_done: [
      'Stage13TechStackInterrogation.tsx implemented (400-600 LOC)',
      'Kill gate logic enforced at database and UI level',
      'Clear visual indication of gate status',
      'E2E test verifies blocking behavior'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'CRITICAL: This is a KILL GATE. Use handleKillGate() utility. Venture can be killed if criteria not met.',
    implementation_approach: 'Implement kill gate as utility function. UI shows gate status clearly. Test blocking behavior in E2E.',
    implementation_context: 'FR-03: Stage 13 Tech Stack Interrogation with KILL GATE. Part of THE_BLUEPRINT phase. Must enforce criteria check before advancement. Include technology selection, viability scoring, and risk assessment.'
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Architecture Stages 14-15',
    user_role: 'Entrepreneur',
    user_want: 'Functional stages for Data Model & Architecture and Epic & User Story Breakdown',
    user_benefit: 'Can design technical architecture and plan development work',
    story_points: 8,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Stage 14 captures architecture',
        given: 'User is on Stage 14',
        when: 'User defines entity relationships and data flows',
        then: 'Architecture data is saved to database'
      },
      {
        id: 'AC-003-2',
        scenario: 'Stage 15 captures epics and stories',
        given: 'User is on Stage 15',
        when: 'User creates epics and breaks down into stories',
        then: 'Epic/story data is saved with estimates'
      }
    ],
    definition_of_done: [
      'Stage14DataModelArchitecture.tsx implemented (400-600 LOC)',
      'Stage15EpicUserStoryBreakdown.tsx implemented (400-600 LOC)',
      'Schema visualization component included',
      'Story estimation capability included'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'These stages are in THE_BLUEPRINT phase. Focus on technical planning and work breakdown.',
    implementation_approach: 'Create fresh V2 components. Include schema visualization for Stage 14. Add story estimation for Stage 15.',
    implementation_context: 'FR-04/FR-05: Data Model & Architecture (Stage 14) and Epic & User Story Breakdown (Stage 15). Part of THE_BLUEPRINT phase. Include entity relationship diagrams, data flow documentation, epic creation, user story breakdown, and story point estimation.'
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Promotion Gates - Stages 16-17',
    user_role: 'Entrepreneur',
    user_want: 'Promotion gates for Schema Firewall and Environment Config that unlock production path',
    user_benefit: 'Can validate readiness and unlock production deployment path',
    story_points: 10,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Stage 16 validates schema',
        given: 'User is on Stage 16 Schema Firewall',
        when: 'User validates database schema',
        then: 'Validation result determines promotion gate status'
      },
      {
        id: 'AC-004-2',
        scenario: 'Stage 17 validates environment',
        given: 'User is on Stage 17 Environment Config',
        when: 'User configures environments (dev/staging/prod)',
        then: 'Environment readiness determines promotion gate status'
      },
      {
        id: 'AC-004-3',
        scenario: 'Promotion gate unlocks on success',
        given: 'Gate criteria ARE met',
        when: 'Validation passes',
        then: 'Production path is unlocked'
      }
    ],
    definition_of_done: [
      'Stage16SchemaFirewall.tsx implemented with PROMOTION GATE',
      'Stage17EnvironmentConfig.tsx implemented with PROMOTION GATE',
      'handlePromotionGate() utility integrated',
      'Visual indication of promotion status'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'CRITICAL: These are PROMOTION GATES. Successful validation unlocks production path.',
    implementation_approach: 'Implement promotion gate utility. Clear UI for gate status. Test promotion behavior.',
    implementation_context: 'FR-06/FR-07: Schema Firewall (Stage 16) and Environment Config (Stage 17) with PROMOTION GATES. Part of THE_BUILD phase transition. Include schema validation, environment configuration (dev/staging/prod), and promotion gate enforcement.'
  },
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Development Stages 18-20',
    user_role: 'Entrepreneur',
    user_want: 'Functional stages for MVP Development Loop, Integration & API Layer, and Security & Performance',
    user_benefit: 'Can track development progress and validate technical implementation',
    story_points: 13,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Stage 18 tracks MVP development',
        given: 'User is on Stage 18',
        when: 'User manages sprints and feature backlog',
        then: 'Development progress is tracked'
      },
      {
        id: 'AC-005-2',
        scenario: 'Stage 19 documents APIs',
        given: 'User is on Stage 19',
        when: 'User defines API endpoints and integrations',
        then: 'API documentation is stored'
      },
      {
        id: 'AC-005-3',
        scenario: 'Stage 20 validates security',
        given: 'User is on Stage 20',
        when: 'User completes security checklist',
        then: 'Security and performance validation is stored'
      }
    ],
    definition_of_done: [
      'Stage18MVPDevelopmentLoop.tsx implemented (400-600 LOC)',
      'Stage19IntegrationAPILayer.tsx implemented (400-600 LOC)',
      'Stage20SecurityPerformance.tsx implemented (400-600 LOC)',
      'All stages save to venture_stage_data'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'THE_BUILD phase stages. Focus on development tracking and technical validation.',
    implementation_approach: 'Create fresh V2 components with development tracking, API documentation, and security validation.',
    implementation_context: 'FR-08/FR-09/FR-10: MVP Development Loop (Stage 18), Integration & API Layer (Stage 19), and Security & Performance (Stage 20). Part of THE_BUILD phase. Include sprint tracking, feature backlog, API documentation, integration contracts, security checklists, and performance benchmarks.'
  },
  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement QA & Deployment - Stages 21-22',
    user_role: 'Entrepreneur',
    user_want: 'Functional stages for QA & UAT and Deployment with promotion gate',
    user_benefit: 'Can validate quality and deploy to production',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Stage 21 captures QA/UAT',
        given: 'User is on Stage 21',
        when: 'User creates test plans and UAT scenarios',
        then: 'QA data is saved to database'
      },
      {
        id: 'AC-006-2',
        scenario: 'Stage 22 Deployment promotion gate',
        given: 'User is on Stage 22 Deployment',
        when: 'Deployment criteria met',
        then: 'PROMOTION GATE unlocks production deployment'
      }
    ],
    definition_of_done: [
      'Stage21QAUAT.tsx implemented (400-600 LOC)',
      'Stage22Deployment.tsx implemented with PROMOTION GATE',
      'handlePromotionGate() utility integrated',
      'Deployment checklist included'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Stage 22 is a PROMOTION GATE. Include rollback procedures.',
    implementation_approach: 'Create QA/UAT tracking. Implement deployment with promotion gate. Include rollback.',
    implementation_context: 'FR-11/FR-12: QA & UAT (Stage 21) and Deployment (Stage 22) with PROMOTION GATE. Part of LAUNCH_LEARN phase. Include test plan creation, UAT scenario definition, deployment checklists, rollback procedures, and blue-green deployment support.'
  },
  {
    story_key: `${SD_ID}:US-007`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Production Launch Kill Gate - Stage 23',
    user_role: 'Entrepreneur',
    user_want: 'A kill gate that validates production readiness before final launch',
    user_benefit: 'Can ensure my venture is truly ready before committing to production launch',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Stage 23 displays launch readiness',
        given: 'User is on Stage 23',
        when: 'User reviews launch criteria',
        then: 'Launch readiness assessment is displayed'
      },
      {
        id: 'AC-007-2',
        scenario: 'Kill gate blocks on failure',
        given: 'Launch criteria NOT met',
        when: 'User attempts Go Live',
        then: 'System blocks with kill gate - venture can be killed'
      },
      {
        id: 'AC-007-3',
        scenario: 'Kill gate allows on success',
        given: 'Launch criteria ARE met',
        when: 'User confirms Go Live',
        then: 'Venture enters production'
      }
    ],
    definition_of_done: [
      'Stage23ProductionLaunch.tsx implemented (400-600 LOC)',
      'KILL GATE logic enforced',
      'Clear Go/No-Go decision UI',
      'E2E test verifies blocking behavior'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'CRITICAL: Final KILL GATE. Venture can be killed if launch criteria not met. Post-launch monitoring setup included.',
    implementation_approach: 'Implement as kill gate with Go/No-Go decision support. Include post-launch monitoring setup.',
    implementation_context: 'FR-13: Production Launch (Stage 23) with KILL GATE. Final stage of crisis zone. Must enforce launch readiness assessment. Include Go/No-Go decision support, KILL GATE enforcement, and post-launch monitoring setup.'
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
  console.log('\n📋 Next: Execute PLAN-TO-EXEC handoff');
}

addUserStories().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
