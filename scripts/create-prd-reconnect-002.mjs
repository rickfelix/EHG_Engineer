#!/usr/bin/env node

/**
 * Create PRD for SD-RECONNECT-002 Venture Creation Workflow Integration
 * Pragmatic Scope: scaffoldStage1() implementation only
 * LEAD Assessment: 8/30 over-engineering score (LOW RISK)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createPRDLink } from '../lib/sd-helpers.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRDData() {
  return {
    id: `PRD-${crypto.randomUUID()}`,
    ...await createPRDLink('SD-RECONNECT-002'),
    title: 'Venture Creation → Stage 1 Workflow Connection',
  version: '1.0',
  status: 'draft',
  category: 'technical',
  priority: 'high',

  executive_summary: `Wire venture creation dialog to Stage 1 workflow by implementing scaffoldStage1() function. Current state: ventures created but scaffolding is no-op stub (returns true immediately). Target state: ventures created → automatically initialize at Stage 1 → redirect to Stage1DraftIdea component. Scope reduced from 8-week full integration (dialog consolidation + 40-stage orchestration) to 1.5-hour pragmatic minimum (scaffolding only).`,

  functional_requirements: JSON.stringify([
    {
      id: 'FR-001',
      title: 'Implement scaffoldStage1() function',
      description: 'Replace no-op stub in src/services/ventures.ts with database operations to initialize venture at Stage 1',
      priority: 'MUST',
      acceptance_criteria: [
        'Update ventures.current_workflow_stage to 1',
        'Update ventures.workflow_status to "pending"',
        'Return Stage 1 URL: /ventures/{id}/stage/1',
        'Throw error if database update fails'
      ]
    },
    {
      id: 'FR-002',
      title: 'Wire VentureCreationDialog navigation',
      description: 'Add navigation redirect after scaffoldStage1() call to send user to Stage 1',
      priority: 'MUST',
      acceptance_criteria: [
        'After createVenture() succeeds, call scaffoldStage1()',
        'Navigate to returned Stage 1 URL',
        'User lands on Stage1DraftIdea component',
        'No manual navigation required'
      ]
    },
    {
      id: 'FR-003',
      title: 'Verify database schema support',
      description: 'Confirm ventures table has required fields for workflow tracking',
      priority: 'MUST',
      acceptance_criteria: [
        'current_workflow_stage INTEGER column exists',
        'workflow_status enum column exists',
        'Fields accept expected values (1, "pending")'
      ]
    }
  ]),

  system_architecture: JSON.stringify({
    components: [
      {
        name: 'scaffoldStage1()',
        location: '/mnt/c/_EHG/EHG/src/services/ventures.ts',
        current_state: 'No-op stub (lines 151-154)',
        changes_required: 'Replace with ~30 LOC database update logic'
      },
      {
        name: 'VentureCreationDialog',
        location: '/mnt/c/_EHG/EHG/src/components/ventures/VentureCreationDialog.tsx',
        current_state: 'Calls scaffoldStage1() but no navigation (line 82)',
        changes_required: 'Add navigate() call with Stage 1 URL (~3 LOC)'
      },
      {
        name: 'ventures table',
        location: 'Database: liapbndqlqxdcgpwntbv',
        current_state: 'Has current_workflow_stage and workflow_status columns',
        changes_required: 'None - schema verified'
      }
    ],
    data_flow: '1. User fills VentureCreationDialog → 2. createVenture() inserts to DB → 3. scaffoldStage1() updates workflow fields → 4. navigate() sends user to Stage 1 → 5. Stage1DraftIdea renders',
    dependencies: [
      '@supabase/supabase-js (existing)',
      'react-router-dom navigate hook (existing)',
      'Stage1DraftIdea component (existing, 573 LOC)'
    ]
  }),

  acceptance_criteria: JSON.stringify([
    {
      id: 'AC-001',
      criterion: 'Venture creation triggers Stage 1 initialization',
      verification: 'Query ventures table after creation, verify current_workflow_stage = 1 and workflow_status = "pending"',
      priority: 'CRITICAL'
    },
    {
      id: 'AC-002',
      criterion: 'User automatically navigated to Stage 1',
      verification: 'Create venture, observe automatic redirect to /ventures/{id}/stage/1 URL',
      priority: 'CRITICAL'
    },
    {
      id: 'AC-003',
      criterion: 'Stage1DraftIdea component renders correctly',
      verification: 'After navigation, verify Stage1DraftIdea component displays 21-field form',
      priority: 'CRITICAL'
    },
    {
      id: 'AC-004',
      criterion: 'Error handling for database failures',
      verification: 'Simulate DB error, verify scaffoldStage1() throws error and creation fails gracefully',
      priority: 'HIGH'
    },
    {
      id: 'AC-005',
      criterion: 'No breaking changes to existing ventures',
      verification: 'Query existing ventures, verify current_workflow_stage remains unchanged if created before this PR',
      priority: 'HIGH'
    }
  ]),

  test_scenarios: JSON.stringify([
    {
      id: 'TS-001',
      scenario: 'Happy path: Create venture → Stage 1',
      steps: [
        'Open VentureCreationDialog',
        'Fill form (title, description, category)',
        'Click Create',
        'Observe automatic redirect to Stage1DraftIdea',
        'Verify URL is /ventures/{uuid}/stage/1',
        'Verify database shows current_workflow_stage = 1'
      ],
      expected_result: 'User lands on Stage 1 form without manual navigation',
      priority: 'CRITICAL'
    },
    {
      id: 'TS-002',
      scenario: 'Database failure handling',
      steps: [
        'Mock Supabase update to return error',
        'Attempt venture creation',
        'Observe error thrown by scaffoldStage1()',
        'Verify user sees error message',
        'Verify venture NOT created'
      ],
      expected_result: 'Error displayed, venture not created, database consistent',
      priority: 'HIGH'
    },
    {
      id: 'TS-003',
      scenario: 'Existing ventures unaffected',
      steps: [
        'Query ventures created before this PR',
        'Verify current_workflow_stage unchanged',
        'Verify workflow_status unchanged',
        'Open existing venture detail page',
        'Verify no navigation triggered'
      ],
      expected_result: 'No regression on existing data',
      priority: 'HIGH'
    }
  ]),

  implementation_approach: JSON.stringify({
    methodology: 'Incremental implementation with immediate testing',
    phases: [
      {
        phase: 1,
        name: 'Implement scaffoldStage1()',
        duration: '45 minutes',
        tasks: [
          'Read ventures.ts lines 151-154 to understand current stub',
          'Replace with database update logic (~30 LOC)',
          'Add error handling',
          'Add TypeScript return type annotation'
        ]
      },
      {
        phase: 2,
        name: 'Wire VentureCreationDialog',
        duration: '15 minutes',
        tasks: [
          'Read VentureCreationDialog.tsx lines 80-85',
          'Add navigate() call after scaffoldStage1()',
          'Import useNavigate from react-router-dom',
          'Test locally'
        ]
      },
      {
        phase: 3,
        name: 'Manual testing',
        duration: '30 minutes',
        tasks: [
          'Create test venture',
          'Verify redirect to Stage 1',
          'Screenshot workflow',
          'Query database to confirm current_workflow_stage = 1',
          'Test error scenarios'
        ]
      }
    ],
    rollback_plan: 'Git revert commits if navigation fails. scaffoldStage1() changes are additive (no breaking changes to existing ventures).',
    deployment_strategy: 'Single PR with ~33 LOC changes. No database migration needed (schema already exists).'
  }),

  risks: JSON.stringify([
    {
      risk: 'Stage1DraftIdea routing not configured',
      probability: 'LOW',
      impact: '404 error after navigation',
      mitigation: 'Verify /ventures/:id/stage/:stageNumber route exists in App.tsx before implementation',
      owner: 'EXEC'
    },
    {
      risk: 'Venture creation errors silently fail',
      probability: 'MEDIUM',
      impact: 'Ventures created but workflow not initialized',
      mitigation: 'Add try-catch in VentureCreationDialog, show toast on error',
      owner: 'EXEC'
    },
    {
      risk: 'Database transaction race condition',
      probability: 'LOW',
      impact: 'Venture created but current_workflow_stage update fails',
      mitigation: 'Use Supabase transaction if needed, or accept eventual consistency',
      owner: 'Principal Database Architect'
    }
  ]),

  constraints: JSON.stringify({
    technical: [
      'Must use existing Supabase client',
      'Must use existing react-router-dom navigation',
      'No new dependencies allowed',
      'No database schema changes'
    ],
    business: [
      'No disruption to existing venture creation flow',
      'Existing ventures must remain functional',
      'Completion within 1.5 hours total effort'
    ],
    dependencies: [
      'Stage1DraftIdea component must exist at expected path',
      'Route /ventures/:id/stage/:stageNumber must be configured',
      'Database columns current_workflow_stage and workflow_status must exist'
    ]
  }),


  plan_checklist: JSON.stringify([
    { item: 'Verify database schema has required columns', status: 'pending' },
    { item: 'Invoke Principal Database Architect for schema validation', status: 'pending' },
    { item: 'Verify Stage1DraftIdea route exists', status: 'pending' },
    { item: 'Review over-engineering assessment (8/30 score)', status: 'pending' },
    { item: 'Confirm scope reduction approved by LEAD', status: 'pending' },
    { item: 'Create PLAN→EXEC handoff with 7 elements', status: 'pending' }
  ]),

  exec_checklist: JSON.stringify([
    { item: 'Read current scaffoldStage1() stub implementation', status: 'pending' },
    { item: 'Implement database update logic (~30 LOC)', status: 'pending' },
    { item: 'Wire VentureCreationDialog navigation (~3 LOC)', status: 'pending' },
    { item: 'Manual test: Create venture → verify redirect', status: 'pending' },
    { item: 'Manual test: Query database for current_workflow_stage = 1', status: 'pending' },
    { item: 'Manual test: Verify Stage1DraftIdea renders', status: 'pending' },
    { item: 'Take screenshots of workflow', status: 'pending' },
    { item: 'Create EXEC→PLAN handoff with 7 elements', status: 'pending' }
  ]),

  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  created_by: 'LEAD-SD-RECONNECT-002',
  metadata: {
    scope_decision: 'pragmatic_minimal',
    over_engineering_score: '8/30',
    deferred_scope: [
      'Dialog consolidation (3→1)',
      'Full workflow orchestration',
      'Stage 2-40 automation'
    ],
    rationale: 'YAGNI - build minimal connection first, defer complex orchestration until proven need'
  }
  };
}

console.log('📋 Creating PRD for SD-RECONNECT-002...\n');

const prd = await createPRDData();

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prd)
  .select();

if (error) {
  console.error('❌ Error creating PRD:', error);
  process.exit(1);
}

console.log('✅ PRD Created Successfully');
console.log('   ID:', data[0].id);
console.log('   Title:', data[0].title);
console.log('   Status:', data[0].status);
console.log('   Functional Requirements:', JSON.parse(data[0].functional_requirements).length);
console.log('   Acceptance Criteria:', JSON.parse(data[0].acceptance_criteria).length);
console.log('   Test Scenarios:', JSON.parse(data[0].test_scenarios).length);
console.log('\n📊 Scope Summary:');
console.log('   Over-Engineering Score: 8/30 (LOW RISK)');
console.log('   Estimated Effort: 1.5 hours');
console.log('   LOC Changes: ~33 lines');
console.log('   Breaking Changes: 0');
