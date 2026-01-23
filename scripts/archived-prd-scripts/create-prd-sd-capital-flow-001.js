#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-CAPITAL-FLOW-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-CAPITAL-FLOW-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Capital Transactions Table: 6-Pillar Token Flow Infrastructure'; // TODO: Replace with your PRD title

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
This PRD implements the capital_transactions table to complete the 6-pillar Genesis infrastructure.

**What**: Create the capital_transactions database table with schema, RLS policies, seed data, and a helper function for token balance calculation.

**Why**: The 6-pillar Genesis architecture (defined in SD-UNIFIED-PATH-2.0) requires a capital flow tracking table. Currently 5 of 6 pillars exist (venture_stage_work, system_events, agent_registry, chairman_directives, ventures). This table fills the gap.

**Impact**: Enables token budget tracking per venture, stage-based capital expenditure analysis, agent cost attribution, and burn rate analytics.
    `.trim(),

    business_context: `
**Problem Statement**:
The 6-pillar Genesis infrastructure was designed with capital_transactions as a core pillar, but the table was never created. This prevents token flow tracking and cost analysis.

**Solution**:
Create the capital_transactions table with proper schema, FK relationships, and RLS policies. Seed with baseline data for 5 ventures.

**Success Metrics**:
- Table exists with correct schema
- 25+ seed transactions for 5 ventures
- RLS policies enable authenticated SELECT
- Helper function returns correct token balances
    `.trim(),

    technical_context: `
**Existing Infrastructure**:
- ventures table: 5 ventures with complete data
- venture_stage_work: 33 rows tracking stage execution
- system_events: 67 rows with correlation_id tracing
- agent_registry: 7 agent records with token_budget/consumed

**Integration Points**:
- FK to ventures.id (required)
- FK to venture_stage_work.id (optional, for stage attribution)
- correlation_id for linking to system_events
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create capital_transactions Table',
        description: 'Create PostgreSQL table with proper schema for tracking token/financial flows',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Table has columns: id (uuid), venture_id (uuid FK), stage_work_id (uuid FK nullable), amount (numeric), transaction_type (text), correlation_id (text), description (text), created_at (timestamptz)',
          'FK constraint to ventures.id exists and enforces referential integrity',
          'Optional FK to venture_stage_work.id for stage attribution'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Apply RLS Policies',
        description: 'Row Level Security for data access control',
        priority: 'HIGH',
        acceptance_criteria: [
          'Authenticated users can SELECT their venture transactions',
          'Service role can INSERT/UPDATE/DELETE',
          'Anon users have no access'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Seed Baseline Data',
        description: 'Insert test transactions for 5 ventures',
        priority: 'HIGH',
        acceptance_criteria: [
          '25+ transaction rows (5 per venture minimum)',
          'Mix of transaction types: token_allocation, stage_expense, agent_cost',
          'Valid FK references to existing ventures and stage_work'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Create Token Balance Function',
        description: 'Database function to calculate venture token balance',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Function get_venture_token_balance(venture_id) returns numeric',
          'Correctly sums allocations and subtracts expenses',
          'Returns 0 for ventures with no transactions'
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
        requirement: 'Migration can run multiple times safely',
        target_metric: 'ON CONFLICT DO NOTHING pattern used'
      },
      {
        type: 'security',
        requirement: 'RLS policies protect venture data',
        target_metric: 'Authenticated users only see their ventures'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'PostgreSQL migration file',
        description: 'SQL migration following Supabase naming convention',
        dependencies: ['ventures table', 'venture_stage_work table']
      }
    ],

    // Architecture & Design
    system_architecture: `
## 6-Pillar Data Model - Capital Transactions Pillar

### Position in Architecture
capital_transactions is Pillar 4 of the 6-Pillar Genesis Infrastructure:
1. venture_stage_work - Stage execution tracking
2. system_events - Event log with correlation_id
3. agent_registry - Agent catalog with capabilities
4. **capital_transactions** - Token flow tracking (THIS SD)
5. chairman_directives - Governance directives
6. ventures - Core venture reference

### Data Flow
1. Venture receives token_allocation transaction
2. Stage work consumes tokens via stage_expense
3. Agent operations create agent_cost transactions
4. Balance calculated via get_venture_token_balance()

### Integration Points
- FK to ventures.id for venture ownership
- FK to venture_stage_work.id for stage attribution
- correlation_id links to system_events for audit trail
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'capital_transactions',
          columns: [
            'id (uuid PRIMARY KEY)',
            'venture_id (uuid FK NOT NULL)',
            'stage_work_id (uuid FK NULLABLE)',
            'amount (numeric NOT NULL)',
            'transaction_type (text NOT NULL)',
            'correlation_id (text)',
            'description (text)',
            'created_at (timestamptz DEFAULT now())'
          ],
          relationships: [
            'FK venture_id REFERENCES ventures(id)',
            'FK stage_work_id REFERENCES venture_stage_work(id)'
          ]
        }
      ]
    },

    api_specifications: [],  // Database-only SD, no API endpoints

    ui_ux_requirements: [],  // Database-only SD, no UI components

    // Implementation
    implementation_approach: `
## Phase 1: Create Migration File
1. Create migration: 20251228_create_capital_transactions_table.sql
2. Define table schema with columns and constraints
3. Add FK relationships to ventures and venture_stage_work
4. Create transaction_type CHECK constraint

## Phase 2: Apply RLS and Function
1. Enable RLS on table
2. Create policy for authenticated SELECT
3. Create get_venture_token_balance() function

## Phase 3: Seed Data
1. Query existing venture IDs
2. Insert 25+ transactions across 5 ventures
3. Verify FK constraints pass
4. Test balance function returns correct values
    `.trim(),

    technology_stack: [
      'PostgreSQL 15 (Supabase)',
      'SQL DDL (CREATE TABLE, ALTER TABLE)',
      'RLS Policies',
      'PL/pgSQL Functions'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'ventures table',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'venture_stage_work table',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Verify table creation',
        description: 'Query information_schema.tables for capital_transactions',
        expected_result: 'Table exists with correct columns',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Verify FK constraints',
        description: 'Attempt INSERT with invalid venture_id',
        expected_result: 'FK violation error raised',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'Verify seed data count',
        description: 'SELECT COUNT(*) FROM capital_transactions',
        expected_result: '>= 25 rows',
        test_type: 'integration'
      },
      {
        id: 'TS-4',
        scenario: 'Verify balance function',
        description: 'Call get_venture_token_balance() for seeded venture',
        expected_result: 'Returns correct numeric balance',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'capital_transactions table exists in database',
      'FK constraints to ventures and venture_stage_work enforced',
      'RLS policies applied (authenticated SELECT)',
      'Seed data has 25+ rows for 5 ventures',
      'get_venture_token_balance() returns correct values',
      'Migration file follows naming convention'
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
        impact: 'Seed data insert fails',
        mitigation: 'Query existing venture/stage_work IDs before INSERT'
      },
      {
        category: 'Technical',
        risk: 'RLS policy blocks legitimate queries',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Users cannot view their transactions',
        mitigation: 'Test with authenticated and anon roles before deploy'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use existing venture IDs from database',
        impact: 'Seed script must query ventures table first'
      },
      {
        type: 'technical',
        constraint: 'stage_work_id FK is optional',
        impact: 'Some transactions may not be attributed to specific stages'
      }
    ],

    assumptions: [
      {
        assumption: 'At least 5 ventures exist in database',
        validation_method: 'Query ventures table at migration start'
      },
      {
        assumption: 'venture_stage_work has data to reference',
        validation_method: 'Query for existing stage_work rows'
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
      parent_context: 'SD-UNIFIED-PATH-2.0',
      gap_identified_in: 'SD-UNIFIED-PATH-2.2.1',
      pillar_number: 4,
      migration_file: '20251228_create_capital_transactions_table.sql',
      pillar_tables: [
        'venture_stage_work',
        'system_events',
        'agent_registry',
        'capital_transactions',
        'chairman_directives',
        'ventures'
      ],
      exploration_summary: {
        files_explored: [
          { path: 'database/ventures', finding: '5 ventures exist' },
          { path: 'database/venture_stage_work', finding: '33 rows' },
          { path: 'database/system_events', finding: '67 rows' },
          { path: 'database/agent_registry', finding: '7 rows' },
          { path: 'database/capital_transactions', finding: 'DOES NOT EXIST' }
        ]
      },
      database_analysis: {
        verdict: 'PASS',
        tables: ['capital_transactions'],
        notes: 'Database-only SD creating new table'
      },
      design_analysis: {
        verdict: 'PASS',
        notes: 'Database-only SD - no UI components'
      }
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
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Options:');
    console.log('   1. Delete the existing PRD first');
    console.log('   2. Use an UPDATE script instead');
    console.log('   3. Change the SD_ID to create a different PRD');
    process.exit(1);
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
