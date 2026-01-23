#!/usr/bin/env node

/**
 * PRD Creation Script for SD-UNIFIED-PATH-2.0
 * Parent/Orchestrator SD: Logic Locking & The Genesis Pulse
 *
 * This PRD documents the orchestration of child SDs that will:
 * 1. Unify stage columns (SD-UNIFIED-PATH-2.1)
 * 2. Seed 6-pillar vertical data (SD-UNIFIED-PATH-2.2)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

const SD_ID = 'SD-UNIFIED-PATH-2.0';
const PRD_TITLE = 'Logic Locking & The Genesis Pulse';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // Fetch Strategic Directive
  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // Build PRD Data Object
  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    id: prdId,
    sd_id: SD_ID,
    directive_id: SD_ID,

    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'database',
    priority: 'critical',

    executive_summary: `
This PRD orchestrates the "Logic Locking & The Genesis Pulse" initiative to resolve the Split-Brain Data crisis identified by the Microscope Audit.

**What**: Unify stage column schema and seed comprehensive 6-pillar vertical data for 5 demo ventures.

**Why**: The system has three competing stage columns (current_lifecycle_stage, current_workflow_stage, current_stage) creating data inconsistency. Additionally, the 6-pillar infrastructure (Assembly Line, Crew Registry, Capital Ledger) needs validation with real seed data.

**Impact**: Resolves schema inconsistency, validates all pillar infrastructure works together, and provides demo data for Glass Cockpit development.
    `.trim(),

    business_context: `
**Problem Statement**:
The Microscope Audit revealed "Split-Brain Data" where three different stage columns exist with potential data drift. This creates risk of data inconsistency and makes query logic unreliable.

**Business Objectives**:
1. Establish current_lifecycle_stage as the ONLY canonical stage column
2. Validate 6-pillar infrastructure with comprehensive seed data
3. Enable Glass Cockpit development with consistent, well-seeded data

**Success Metrics**:
- Zero code references to deprecated stage columns (current_workflow_stage, current_stage)
- 5 demo ventures with complete stage_work, system_events, agent_registry data
- capital_transactions and chairman_directives tables created and seeded
    `.trim(),

    technical_context: `
**Existing Infrastructure (80% Complete)**:
- Stage column unification migrations executed (columns renamed with DEPRECATED_ prefix)
- Compatibility view v_ventures_stage_compat exists for backward compatibility
- venture_stage_work: 32 rows seeded for 5 demo ventures
- system_events: 14 events with 6-pillar DNA structure
- agent_registry: 5 agents with LTREE hierarchy

**Remaining Work**:
- SD-UNIFIED-PATH-2.1: Code refactoring to remove deprecated column references
- SD-UNIFIED-PATH-2.2: Create capital_transactions and chairman_directives tables

**BLOCKING ISSUE**: Tier 0 stage progression trigger (20251023195744) still references deprecated current_stage column - must update in SD-2.1.1
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Stage Column Unification (Child SD-2.1)',
        description: 'Standardize current_lifecycle_stage as the single canonical stage column. Remove all code references to deprecated columns.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'grep -r returns 0 matches for current_workflow_stage in active code',
          'grep -r returns 0 matches for current_stage in active code (excluding deprecated prefixed columns)',
          'Tier 0 trigger updated to reference current_lifecycle_stage'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Vertical Genesis Seed (Child SD-2.2)',
        description: 'Create missing 6-pillar tables and seed comprehensive demo data for 5 ventures.',
        priority: 'HIGH',
        acceptance_criteria: [
          'capital_transactions table created with token allocation entries',
          'chairman_directives table created with strategic commands',
          'Each venture has complete 6-pillar data (stage_work, system_events, agent_registry, capital, directives)'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Tier 0 Trigger Migration (Grandchild SD-2.1.1)',
        description: 'Update prevent_tier0_stage_progression trigger to use current_lifecycle_stage instead of deprecated current_stage.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Trigger fires on current_lifecycle_stage column changes',
          'Tier 0 ventures blocked from advancing past stage 3',
          'No references to deprecated columns in trigger code'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Capital Transactions Table (Grandchild SD-2.2.1)',
        description: 'Create capital_transactions table for Pillar 5 (Capital Ledger) token tracking.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Table schema matches 6-pillar DNA structure',
          'RLS policies enforce proper access control',
          'Seed data includes token allocations for 5 demo ventures'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Chairman Directives Table (Grandchild SD-2.2.1)',
        description: 'Create chairman_directives table for Pillar 1 (Glass Cockpit) strategic commands.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Table schema includes directive_type, target_ventures, status',
          'RLS policies enforce Chairman-only write access',
          'Seed data includes demo directives for Glass Cockpit'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'data_integrity',
        requirement: 'No data loss during column deprecation',
        target_metric: 'Zero data migration errors'
      },
      {
        type: 'backward_compatibility',
        requirement: 'Existing queries continue to work via compatibility views',
        target_metric: 'v_ventures_stage_compat provides aliased columns'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Database migration for tier 0 trigger',
        description: 'Update prevent_tier0_stage_progression trigger to use current_lifecycle_stage',
        dependencies: ['20251023195744_prevent_tier0_stage_progression.sql']
      },
      {
        id: 'TR-2',
        requirement: 'capital_transactions table schema',
        description: 'Create table for token allocation tracking with proper RLS policies',
        dependencies: ['agent_registry', 'ventures', 'venture_stage_work']
      },
      {
        id: 'TR-3',
        requirement: 'chairman_directives table schema',
        description: 'Create table for high-level strategic commands from Chairman',
        dependencies: ['agent_registry', 'ventures']
      }
    ],

    system_architecture: `
## Orchestrator Architecture

This is a PARENT/ORCHESTRATOR SD that coordinates two child SDs:

### Child Execution Order
1. **SD-UNIFIED-PATH-2.1** (Stage Column Unification) - CRITICAL priority
   - Grandchild: SD-UNIFIED-PATH-2.1.1 (Standardize current_lifecycle_stage)

2. **SD-UNIFIED-PATH-2.2** (Vertical Genesis Seed) - MEDIUM priority
   - Grandchild: SD-UNIFIED-PATH-2.2.1 (Seed 6-pillar data structures)

### Data Flow
- Deprecated columns renamed with DEPRECATED_ prefix (already done)
- Compatibility view provides aliases during transition
- Code refactoring removes deprecated references
- New tables (capital_transactions, chairman_directives) created
- Seed data inserted with proper 6-pillar DNA structure

### Integration Points
- ventures table: current_lifecycle_stage as canonical stage column
- venture_stage_work: Per-stage work tracking with advisory_data
- system_events: Audit trail with correlation_id and calibration_delta
- agent_registry: LTREE hierarchy for CEO/VP/Crew agents
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'capital_transactions (TO CREATE)',
          columns: ['id', 'venture_id', 'stage_id', 'agent_id', 'token_amount', 'transaction_type', 'created_at'],
          relationships: ['FK to ventures', 'FK to agent_registry']
        },
        {
          name: 'chairman_directives (TO CREATE)',
          columns: ['id', 'title', 'description', 'issued_by', 'directive_type', 'target_ventures', 'status', 'created_at'],
          relationships: ['FK to agent_registry (chairman)', 'FK to system_events']
        }
      ]
    },

    api_specifications: [],

    ui_ux_requirements: [],

    implementation_approach: `
## Orchestrator Workflow

### Phase 1: Stage Column Unification (SD-2.1, SD-2.1.1)
- Update tier 0 stage progression trigger
- Audit code for deprecated column references
- Remove/update deprecated references
- Verify grep returns 0 matches

### Phase 2: Vertical Genesis Seed (SD-2.2, SD-2.2.1)
- Create capital_transactions table with RLS
- Create chairman_directives table with RLS
- Seed 5 ventures with complete 6-pillar data
- Validate all pillar queries work

### Orchestrator Completion
- Parent completes when all children complete
- Progress auto-calculated from child completion
    `.trim(),

    technology_stack: [
      'PostgreSQL 15 (Supabase)',
      'LTREE extension (agent hierarchy)',
      'Row Level Security (RLS)',
      'Database triggers and functions'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'SD-UNIFIED-PATH-1.0 (Persistence & Governance Spine)',
        status: 'completed',
        blocker: false
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Verify no deprecated column references',
        description: 'Run grep to find any references to current_workflow_stage or current_stage in active code',
        expected_result: '0 matches in non-deprecated files',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Verify tier 0 trigger works with canonical column',
        description: 'Attempt to advance tier 0 venture past stage 3',
        expected_result: 'Exception raised preventing advancement',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'Verify 5 ventures have complete 6-pillar data',
        description: 'Query each pillar table for demo venture data',
        expected_result: 'Each venture has stage_work, system_events, agent_registry, capital, directives',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'No code references current_workflow_stage or current_stage (grep returns 0)',
      '5 ventures have venture_stage_work rows for their completed stages',
      'system_events has >= 25 rows with correlation_id',
      'capital_transactions table exists with token allocation entries',
      'chairman_directives table exists with demo directives',
      'All children SDs completed successfully'
    ],

    performance_requirements: {
      page_load_time: 'N/A (backend only)',
      api_response_time: 'N/A (backend only)',
      concurrent_users: 'N/A'
    },

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Child SDs identified and documented', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'Database schema reviewed (exploration complete)', checked: true },
      { text: 'Dependency on SD-UNIFIED-PATH-1.0 verified', checked: true }
    ],

    exec_checklist: [
      { text: 'Child SD-2.1 LEAD approved', checked: false },
      { text: 'Child SD-2.1 PLAN completed', checked: false },
      { text: 'Child SD-2.1 EXEC completed', checked: false },
      { text: 'Child SD-2.2 LEAD approved', checked: false },
      { text: 'Child SD-2.2 PLAN completed', checked: false },
      { text: 'Child SD-2.2 EXEC completed', checked: false },
      { text: 'All children completed', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'grep verification passed', checked: false },
      { text: '6-pillar data validated', checked: false },
      { text: 'All children completed', checked: false }
    ],

    progress: 20,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 100,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    risks: [
      {
        category: 'Technical',
        risk: 'Deprecated column references missed in code audit',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Runtime errors when deprecated columns are dropped',
        mitigation: 'Thorough grep search with multiple patterns'
      },
      {
        category: 'Data',
        risk: 'Tier 0 trigger update breaks existing ventures',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Existing tier 0 ventures cannot advance',
        mitigation: 'Test trigger update in isolation before deployment'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use current_lifecycle_stage exclusively',
        impact: 'All new code and migrations use canonical column only'
      },
      {
        type: 'scope',
        constraint: 'No UI changes (out of scope)',
        impact: 'Focus on backend/database work only'
      }
    ],

    assumptions: [
      {
        assumption: 'SD-UNIFIED-PATH-1.0 infrastructure is stable',
        validation_method: 'Dependency is marked completed'
      },
      {
        assumption: 'Existing seed migrations have not been rolled back',
        validation_method: 'Query venture_stage_work for existing data'
      }
    ],

    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning & PRD Creation',
        involvement_level: 'high'
      },
      {
        name: 'Database Agent',
        role: 'Schema Validation',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),

    metadata: {
      orchestrator: true,
      children: ['SD-UNIFIED-PATH-2.1', 'SD-UNIFIED-PATH-2.2'],
      grandchildren: ['SD-UNIFIED-PATH-2.1.1', 'SD-UNIFIED-PATH-2.2.1'],
      crisis_resolved: 'Split-Brain Data',
      exploration_summary: {
        files_explored: 7,
        key_findings: [
          'current_lifecycle_stage is canonical (207 occurrences)',
          'Tier 0 trigger needs fix',
          'venture_stage_work seeded (32 rows)',
          'capital_transactions NOT CREATED',
          'chairman_directives NOT CREATED'
        ]
      }
    },

    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Validate PRD Data
  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // Check if PRD already exists
  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Deleting existing PRD and recreating...');

    await supabase.from('product_requirements_v2').delete().eq('id', prdId);
  }

  // Insert PRD into database
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

  console.log('\n📝 Next Steps (Orchestrator SD):');
  console.log('   1. Run PLAN-TO-EXEC handoff for parent (enters orchestrator waiting state)');
  console.log('   2. Process children sequentially:');
  console.log('      - SD-UNIFIED-PATH-2.1 → LEAD → PLAN → EXEC');
  console.log('      - SD-UNIFIED-PATH-2.2 → LEAD → PLAN → EXEC');
  console.log('   3. Parent auto-completes when all children finish');
  console.log('');
}

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
