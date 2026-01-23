#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-UNIFIED-PATH-2.2.1 with your SD ID (e.g., SD-AUTH-001)
 *   3. Fill in PRD details
 *   4. Run: node scripts/create-prd-sd-XXX.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const SD_ID = 'SD-UNIFIED-PATH-2.2.1'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Seed 6-pillar data structures for 5 ventures'; // TODO: Replace with your PRD title

// ============================================================================
// Supabase Client Setup
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// Main Function
// ============================================================================

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // -------------------------------------------------------------------------
  // STEP 1: Fetch Strategic Directive UUID (CRITICAL for handoff validation)
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Fetching Strategic Directive...');

  // SD ID Schema Cleanup: Use SD.id directly (uuid_id is deprecated)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id
    id: prdId,
    sd_id: SD_ID,                   // FK to strategic_directives_v2.id (canonical)
    directive_id: SD_ID,            // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'database',
    priority: 'medium', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
This PRD implements the 6-Pillar Genesis Seed by populating the foundational data structures for 5 ventures.

**What**: Create and execute a seed script that populates venture_stage_work, system_events, agent_registry, capital_transactions, and chairman_directives tables with realistic baseline data.

**Why**: The 6-pillar infrastructure (from SD-UNIFIED-PATH-2.0) requires seed data to demonstrate the complete vertical integration and enable testing/validation of the Genesis architecture.

**Impact**: Establishes working baseline data for 5 ventures, enabling end-to-end testing of stage progression, event tracking, agent operations, and financial flows.
    `.trim(),

    business_context: `
**Problem Statement**:
The 6-pillar Genesis infrastructure exists but has no seed data to validate proper integration and operation.

**Solution**:
Create a migration or seed script that populates all 6 pillar tables with interconnected data for 5 ventures.

**Success Metrics**:
- 5 ventures have venture_stage_work rows for stages 1-5
- system_events has >= 25 rows with correlation_id
- agent_registry has 5 agent records
- capital_transactions has token allocations per stage work
    `.trim(),

    technical_context: `
**Existing Infrastructure**:
- ventures table: Primary venture records exist
- venture_stage_work: Stage execution tracking
- system_events: Event log with correlation_id
- agent_registry: Agent catalog with capabilities
- capital_transactions: Token flow records
- chairman_directives: Governance directives

**Integration Points**:
- All pillar tables must have foreign keys to ventures.id
- system_events.correlation_id links related actions
- capital_transactions references venture_stage_work.id
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create 6-Pillar Seed Migration',
        description: 'Create SQL migration file to seed venture_stage_work, system_events, agent_registry, capital_transactions, chairman_directives for 5 ventures',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Migration file created with proper naming convention',
          'All 5 pillar tables populated with interconnected data',
          'Foreign key relationships validated'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Apply Seed Migration',
        description: 'Execute the seed migration in the database',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Migration runs without errors',
          'Data count verification queries pass',
          '5 ventures × 5 stages = 25 stage_work rows minimum'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Verify 6-Pillar Coverage',
        description: 'Validate all 6 pillars have data for 5 ventures',
        priority: 'HIGH',
        acceptance_criteria: [
          'SELECT COUNT(*) returns expected rows per table',
          'JOIN queries across pillars return valid data',
          'correlation_id tracing works end-to-end'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'data_integrity',
        requirement: 'All seeded data passes FK constraints',
        target_metric: 'Zero FK violation errors'
      },
      {
        type: 'idempotency',
        requirement: 'Seed script can run multiple times safely',
        target_metric: 'ON CONFLICT DO NOTHING or upsert pattern'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'PostgreSQL seed migration',
        description: 'Use INSERT statements with proper sequencing for FK dependencies',
        dependencies: ['ventures table populated', 'All 6 pillar tables exist']
      }
    ],

    // Architecture & Design
    system_architecture: `
## 6-Pillar Data Model

### Pillar 1: venture_stage_work
Tracks stage execution with started_at, completed_at, status

### Pillar 2: system_events
Event log with correlation_id for tracing related actions

### Pillar 3: agent_registry
Agent catalog with agent_type, capabilities JSON, cost_per_action

### Pillar 4: capital_transactions
Token flow linking to venture_stage_work and transactions

### Pillar 5: chairman_directives
Top-level governance directives from venture chairman

### Pillar 6: ventures (reference)
Core venture data - already populated
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'venture_stage_work',
          columns: ['id', 'venture_id', 'stage_number', 'started_at', 'completed_at', 'status'],
          relationships: ['FK to ventures.id']
        },
        {
          name: 'system_events',
          columns: ['id', 'venture_id', 'event_type', 'correlation_id', 'payload'],
          relationships: ['FK to ventures.id']
        },
        {
          name: 'agent_registry',
          columns: ['id', 'agent_type', 'capabilities', 'cost_per_action'],
          relationships: []
        },
        {
          name: 'capital_transactions',
          columns: ['id', 'venture_id', 'stage_work_id', 'amount', 'transaction_type'],
          relationships: ['FK to ventures.id', 'FK to venture_stage_work.id']
        },
        {
          name: 'chairman_directives',
          columns: ['id', 'venture_id', 'directive_type', 'content'],
          relationships: ['FK to ventures.id']
        }
      ]
    },

    api_specifications: [],

    ui_ux_requirements: [],

    // Implementation
    implementation_approach: `
## Phase 1: Create Seed Migration
1. Create migration file: 20251227_seed_6_pillar_genesis_data.sql
2. Insert venture_stage_work rows for 5 ventures × 5 stages
3. Insert system_events with correlation_ids
4. Insert agent_registry with 5 agent types
5. Insert capital_transactions linking to stage_work
6. Insert chairman_directives for governance

## Phase 2: Apply and Verify
1. Apply migration via Supabase dashboard or CLI
2. Run verification queries to confirm row counts
3. Test JOIN queries across pillars
    `.trim(),

    technology_stack: [
      'PostgreSQL 15 (Supabase)',
      'SQL INSERT statements',
      'ON CONFLICT patterns for idempotency'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'SD-UNIFIED-PATH-2.2 (Parent)',
        status: 'in_progress',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Verify stage_work row count',
        description: 'Count venture_stage_work rows for seeded ventures',
        expected_result: '>= 25 rows (5 ventures × 5 stages)',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Verify 6-pillar JOIN',
        description: 'JOIN all pillar tables on venture_id',
        expected_result: 'Returns valid data for all 5 ventures',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'Verify correlation_id tracing',
        description: 'Query system_events by correlation_id',
        expected_result: 'Related events grouped correctly',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'Migration file created and applied',
      '5 ventures have stage_work rows for stages 1-5',
      'system_events has >= 25 rows',
      'agent_registry has 5 agent records',
      'capital_transactions links to stage_work',
      'All FK constraints pass'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: false },
      { text: 'Technical architecture defined', checked: false },
      { text: 'Implementation approach documented', checked: false },
      { text: 'Test scenarios defined', checked: false },
      { text: 'Acceptance criteria established', checked: false },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: false },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'Core functionality implemented', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'Performance requirements validated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress Tracking
    progress: 10, // 0-100
    phase: 'planning', // planning, design, implementation, verification, approval
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks & Constraints
    risks: [
      {
        category: 'Technical',
        risk: 'FK constraint violations during seeding',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Migration fails, seed data not inserted',
        mitigation: 'Use proper INSERT ordering, test with single venture first'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use existing venture IDs',
        impact: 'Seed script must query ventures table first'
      }
    ],

    assumptions: [
      {
        assumption: 'At least 5 ventures exist in database',
        validation_method: 'Query ventures table at start of migration'
      }
    ],

    // Stakeholders & Timeline
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks

    // Metadata (for custom fields that don't fit schema)
    metadata: {
      parent: 'SD-UNIFIED-PATH-2.2',
      grandparent: 'SD-UNIFIED-PATH-2.0',
      migration_file: '20251227_seed_6_pillar_genesis_data.sql',
      pillar_tables: [
        'venture_stage_work',
        'system_events',
        'agent_registry',
        'capital_transactions',
        'chairman_directives',
        'ventures'
      ]
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Data (CRITICAL - catches schema mismatches)
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    console.error('   Fix the errors above before inserting to database');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // -------------------------------------------------------------------------
  // STEP 4: Check if PRD already exists
  // -------------------------------------------------------------------------

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists! Deleting and recreating...`);
    await supabase.from('product_requirements_v2').delete().eq('id', prdId);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Insert PRD into database
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // STEP 6: Success!
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id || insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Update TODO items in PRD (executive_summary, requirements, etc.)');
  console.log('   2. Run STORIES sub-agent: node scripts/create-user-stories-[sd-id].mjs');
  console.log('   3. Run DATABASE sub-agent: node scripts/database-architect-schema-review.js');
  console.log('   4. Run SECURITY sub-agent: node scripts/security-architect-assessment.js');
  console.log('   5. Mark plan_checklist items as complete');
  console.log('   6. Create PLAN→EXEC handoff when ready');
  console.log('');
}

// ============================================================================
// Execute
// ============================================================================

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
