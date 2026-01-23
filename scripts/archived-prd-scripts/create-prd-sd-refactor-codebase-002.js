#!/usr/bin/env node

/**
 * PRD Creation Script - SD-REFACTOR-CODEBASE-002
 * Parent/Orchestrator SD for Codebase Modularization Phase 2
 *
 * This is a PARENT SD that coordinates 9 child SDs.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

const SD_ID = 'SD-REFACTOR-CODEBASE-002';
const PRD_TITLE = 'Codebase Modularization Phase 2 - Script & Sub-Agent Consolidation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // Fetch SD using legacy_id
  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, category, priority')
    .eq('legacy_id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.id}`);
  console.log(`   Legacy ID: ${sdData.legacy_id}`);

  // Fetch child SDs
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('legacy_id, title')
    .eq('parent_sd_id', sdData.id)
    .order('legacy_id');

  console.log(`   Child SDs: ${children?.length || 0}`);

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    id: prdId,
    sd_id: sdData.id,
    directive_id: sdData.id,

    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'refactor',
    priority: 'high',

    executive_summary: `
This PRD orchestrates Phase 2 of the EHG_Engineer codebase modularization effort.
The initiative targets 36,863 lines of code across sub-agents, handoff system,
governance library, utilities, and server routes.

Key objectives:
- Reduce average sub-agent file size from 685 LOC to 300-400 LOC
- Extract BaseSubAgent class pattern for consistency across 27 sub-agents
- Unify governance library with facade pattern
- Consolidate scattered utilities into focused modules
- Extract server routes from monolithic 2,478 LOC server.js

This parent SD coordinates 9 child SDs, each targeting a specific refactoring domain.
Children execute sequentially to maintain codebase stability and enable incremental validation.
    `.trim(),

    business_context: `
Technical debt in the EHG_Engineer codebase has accumulated to the point where:
- Adding new sub-agents requires duplicating 50-100 lines of boilerplate
- Governance modules have circular dependencies risking runtime failures
- The server.js file at 2,478 LOC is difficult to navigate and test
- Test coverage is limited (~40%) due to tight coupling

This refactoring addresses these issues without changing functionality,
enabling faster feature development and reducing bug introduction risk.
    `.trim(),

    technical_context: `
Current architecture analysis (36,863 LOC total):

SUB-AGENTS (18,512 LOC across 27 files):
- design.js: 2,563 LOC - needs 5-module decomposition
- retro.js: 2,082 LOC - critical recursive findings issue
- Average: 685 LOC per sub-agent (target: 300-400)

HANDOFF SYSTEM (9,310 LOC across 25 files):
- PlanToExecExecutor: 1,338 LOC - most complex
- Already well-modularized, needs optimization

GOVERNANCE (2,963 LOC across 6 files):
- Tight coupling between modules
- Duplicate authority checking patterns

UTILITIES (5,300 LOC across 15 files):
- SD type detection scattered across 3 files
- QuickFix tools need consolidation

SERVER (2,478 LOC in server.js):
- Monolithic file mixing routes, middleware, WebSocket
- No separation of concerns
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Orchestrate 9 child SD executions sequentially',
        description: 'Coordinate child SDs through LEAD-PLAN-EXEC workflow',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All 9 child SDs complete successfully',
          'No child blocks another due to conflicts',
          'Parent progress reflects weighted child completion'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Maintain zero behavior changes across refactoring',
        description: 'All refactoring must preserve existing functionality',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'REGRESSION sub-agent validates each child',
          'All existing tests pass after each child completion',
          'No new bugs introduced'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Extract BaseSubAgent pattern',
        description: 'Create shared base class for all 27 sub-agents',
        priority: 'HIGH',
        acceptance_criteria: [
          'BaseSubAgent class extracted',
          'Common patterns consolidated',
          'All sub-agents extend BaseSubAgent'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'maintainability',
        requirement: 'Reduce code complexity',
        target_metric: 'Average function size <100 LOC, cyclomatic complexity <6'
      },
      {
        type: 'testability',
        requirement: 'Improve test coverage',
        target_metric: '80%+ coverage (from ~40%)'
      },
      {
        type: 'consistency',
        requirement: 'Establish patterns',
        target_metric: 'BaseSubAgent pattern in 100% of sub-agents'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Preserve backward compatibility',
        description: 'All existing imports must continue to work via re-exports',
        dependencies: []
      },
      {
        id: 'TR-2',
        requirement: 'Use REGRESSION sub-agent for validation',
        description: 'Before/after behavior comparison for each refactoring',
        dependencies: ['REGRESSION sub-agent']
      }
    ],

    system_architecture: `
## Parent-Child Architecture

PARENT SD (SD-REFACTOR-CODEBASE-002):
├── Orchestrates 9 child SDs
├── Monitors progress via weighted child completion
├── Auto-completes when all children finish
└── Provides rollback coordination if needed

CHILD SDs (Sequential Execution):
1. SD-REFACTOR-VERIFY-001 - Handoff verification
2. SD-REFACTOR-UTILS-001 - Utility consolidation
3. SD-REFACTOR-GOVERNANCE-001 - Governance unification
4. SD-REFACTOR-SUBAGENTS-001 - BaseSubAgent extraction
5. SD-REFACTOR-DESIGN-001 - Design sub-agent modularization
6. SD-REFACTOR-RETRO-001 - Retrospective modularization
7. SD-REFACTOR-AGENTS-001 - Agent library modularization
8. SD-REFACTOR-HANDOFF-001 - Handoff executor optimization
9. SD-REFACTOR-SERVER-001 - Server route extraction

## Refactoring Domains

Domain 1: Sub-Agents (lib/sub-agents/)
- 27 files, 18,512 LOC
- Extract BaseSubAgent, modularize large agents

Domain 2: Handoff System (scripts/modules/handoff/)
- 25 files, 9,310 LOC
- Optimize executors, extract gate factory

Domain 3: Governance (lib/governance/)
- 6 files, 2,963 LOC
- Create facade, unify exceptions

Domain 4: Utilities (lib/utils/)
- 15 files, 5,300 LOC
- Consolidate SD type detection, validation

Domain 5: Server (server.js)
- 1 file, 2,478 LOC
- Extract routes, middleware, WebSocket handlers
    `.trim(),

    data_model: {
      tables: [],
      note: 'No database schema changes - refactoring only'
    },

    api_specifications: [],

    ui_ux_requirements: [],

    implementation_approach: `
## Phase 1: Foundation (Child SDs 1-3)
- SD-REFACTOR-VERIFY-001: Consolidate handoff verification logic
- SD-REFACTOR-UTILS-001: Unify SD type detection and validation utilities
- SD-REFACTOR-GOVERNANCE-001: Extract shared governance exceptions, create facade

## Phase 2: Sub-Agent Infrastructure (Child SD 4)
- SD-REFACTOR-SUBAGENTS-001: Extract BaseSubAgent class
- Apply template method pattern
- Standardize execute() interface across 27 sub-agents

## Phase 3: Domain Decomposition (Child SDs 5-7)
- SD-REFACTOR-DESIGN-001: Split design.js (2,563 LOC) into 5 focused modules
- SD-REFACTOR-RETRO-001: Modularize retro.js (2,082 LOC), fix findings storage
- SD-REFACTOR-AGENTS-001: Apply BaseSubAgent pattern to remaining agents

## Phase 4: Integration & Server (Child SDs 8-9)
- SD-REFACTOR-HANDOFF-001: Optimize handoff executors, extract gate factory
- SD-REFACTOR-SERVER-001: Extract routes, middleware, WebSocket handlers

## Validation Strategy
- REGRESSION sub-agent runs after each child completion
- Existing test suite must pass at every step
- Backward compatibility via re-exports from original paths
    `.trim(),

    technology_stack: [
      'Node.js 18+',
      'ES Modules',
      'Supabase PostgreSQL',
      'Jest for testing',
      'ESLint for code quality'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'REGRESSION sub-agent operational',
        status: 'completed',
        blocker: false
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'All child SDs complete successfully',
        description: 'Verify each child SD passes through full LEO workflow',
        expected_result: '9/9 children completed with status=completed',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'No regression after refactoring',
        description: 'REGRESSION sub-agent validates behavior preservation',
        expected_result: 'All existing functionality works identically',
        test_type: 'regression'
      },
      {
        id: 'TS-3',
        scenario: 'Backward compatibility maintained',
        description: 'Existing imports continue to work',
        expected_result: 'No import errors in dependent files',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'All 9 child SDs completed successfully',
      'No regression in existing functionality (REGRESSION sub-agent validation)',
      'Average sub-agent LOC reduced to 300-400 (from 685)',
      'BaseSubAgent pattern extracted and applied',
      'Server routes extracted to modules',
      'Governance library unified with facade pattern',
      'Test coverage increased toward 80%'
    ],

    performance_requirements: {
      no_performance_regression: true,
      note: 'Refactoring must not degrade runtime performance'
    },

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Child SD execution order defined', checked: true },
      { text: 'REGRESSION sub-agent validation planned', checked: true },
      { text: 'Backward compatibility strategy documented', checked: true },
      { text: 'User stories generated (N/A for orchestrator)', checked: true },
      { text: 'Database schema reviewed (N/A - no changes)', checked: true },
      { text: 'Security assessment (N/A - internal refactoring)', checked: true }
    ],

    exec_checklist: [
      { text: 'Child SD-REFACTOR-VERIFY-001 completed', checked: false },
      { text: 'Child SD-REFACTOR-UTILS-001 completed', checked: false },
      { text: 'Child SD-REFACTOR-GOVERNANCE-001 completed', checked: false },
      { text: 'Child SD-REFACTOR-SUBAGENTS-001 completed', checked: false },
      { text: 'Child SD-REFACTOR-DESIGN-001 completed', checked: false },
      { text: 'Child SD-REFACTOR-RETRO-001 completed', checked: false },
      { text: 'Child SD-REFACTOR-AGENTS-001 completed', checked: false },
      { text: 'Child SD-REFACTOR-HANDOFF-001 completed', checked: false },
      { text: 'Child SD-REFACTOR-SERVER-001 completed', checked: false }
    ],

    validation_checklist: [
      { text: 'All 9 child SDs status = completed', checked: false },
      { text: 'REGRESSION validation passed for all children', checked: false },
      { text: 'No test failures introduced', checked: false },
      { text: 'Backward compatibility verified', checked: false },
      { text: 'Metrics targets achieved', checked: false }
    ],

    progress: 10,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 50,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    risks: [
      {
        category: 'Technical',
        risk: 'Breaking changes in shared modules',
        severity: 'HIGH',
        probability: 'MEDIUM',
        impact: 'Dependent code fails to execute',
        mitigation: 'REGRESSION sub-agent validates before/after behavior'
      },
      {
        category: 'Technical',
        risk: 'Import path changes break dependent code',
        severity: 'HIGH',
        probability: 'HIGH',
        impact: 'Build failures, runtime errors',
        mitigation: 'Re-export from original paths for backward compatibility'
      },
      {
        category: 'Process',
        risk: 'Incomplete refactoring leaves inconsistent patterns',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Mixed old/new patterns confuse developers',
        mitigation: 'Sequential child execution ensures complete pattern application'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'No behavior changes allowed',
        impact: 'Must preserve 100% of existing functionality'
      },
      {
        type: 'process',
        constraint: 'Sequential child execution',
        impact: 'Cannot parallelize children due to potential conflicts'
      }
    ],

    assumptions: [
      {
        assumption: 'Existing test suite provides adequate regression coverage',
        validation_method: 'REGRESSION sub-agent validation after each child'
      },
      {
        assumption: 'No concurrent development conflicts during refactoring',
        validation_method: 'Single-track execution, git branch isolation'
      }
    ],

    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      },
      {
        name: 'REGRESSION Sub-Agent',
        role: 'Validation',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days

    metadata: {
      is_parent_orchestrator: true,
      child_count: 9,
      child_sds: [
        'SD-REFACTOR-VERIFY-001',
        'SD-REFACTOR-UTILS-001',
        'SD-REFACTOR-GOVERNANCE-001',
        'SD-REFACTOR-SUBAGENTS-001',
        'SD-REFACTOR-DESIGN-001',
        'SD-REFACTOR-RETRO-001',
        'SD-REFACTOR-AGENTS-001',
        'SD-REFACTOR-HANDOFF-001',
        'SD-REFACTOR-SERVER-001'
      ],
      total_loc_in_scope: 36863,
      estimated_loc_reduction: 5000
    },

    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log('   Deleting existing PRD...');

    await supabase
      .from('product_requirements_v2')
      .delete()
      .eq('id', prdId);

    console.log('   ✅ Deleted existing PRD');
  }

  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Run PLAN-TO-EXEC handoff for parent SD');
  console.log('   2. Parent enters ORCHESTRATOR/WAITING state');
  console.log('   3. Process each child SD through LEAD-PLAN-EXEC');
  console.log('   4. Parent auto-completes when all children finish');
  console.log('');
}

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
