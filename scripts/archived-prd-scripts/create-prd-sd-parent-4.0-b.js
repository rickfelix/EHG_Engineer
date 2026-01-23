#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-PARENT-4.0-B with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-PARENT-4.0-B'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Crew Registry: 4-Level Agent Hierarchy Management'; // TODO: Replace with your PRD title

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

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'GOVERNANCE',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
The Crew Registry is a foundational pillar of Vision V2 that implements a 4-level agent hierarchy (L1: EVA, L2: Director, L3: Manager, L4: Agent) with RLS-enforced authority boundaries. This registry serves as the authoritative source for agent metadata, permissions, and orchestration capabilities.

The implementation provides a structured agent_registry table with proper hierarchy constraints, enabling the LEO Protocol sub-agents to have clear authority levels and operational boundaries. This is critical for autonomous operation governance.
    `.trim(),

    business_context: `
**Business Justification:** The current sub-agent system lacks formal hierarchy and authority definitions. This leads to:
- Unclear delegation chains between agents
- No authority-based operation restrictions
- Missing governance model for multi-agent orchestration

**Value Proposition:** The Crew Registry provides:
- Clear 4-level hierarchy with defined authority boundaries
- RLS policies that enforce operational restrictions
- Foundation for EVA orchestration and agent coordination
    `.trim(),

    technical_context: `
**Existing Systems:** Supabase PostgreSQL with existing sub_agent_* tables.

**Architecture Pattern:** Database-first with RLS for authority enforcement.

**Integration Points:**
- sub_agent_orchestrator.js - for agent execution
- sub_agent_registry_v2 table - legacy agent definitions
- EVA core (SD-EVA-CORE-001) - future orchestration integration
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create agent_registry table with 4-level hierarchy',
        description: 'Database table with L1-L4 hierarchy levels (EVA, Director, Manager, Agent)',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'agent_registry table created with level column (1-4)',
          'Hierarchy constraint ensures L1=EVA, L2=Director, L3=Manager, L4=Agent'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Implement RLS authority boundaries',
        description: 'RLS policies that restrict operations based on hierarchy level',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'L1 agents can operate on all levels',
          'L2+ agents can only operate on equal or lower levels'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Integrate with existing sub-agent system',
        description: 'Registry accessible from sub-agent orchestrator',
        priority: 'HIGH',
        acceptance_criteria: [
          'Agent lookup by key returns hierarchy level',
          'Authority checks integrated into orchestration flow'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Agent lookup queries under 100ms',
        target_metric: '<100ms for single agent lookup'
      },
      {
        type: 'security',
        requirement: 'RLS enforces authority boundaries at database level',
        target_metric: 'Zero unauthorized cross-level operations'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'PostgreSQL with Supabase RLS',
        description: 'Use Supabase PostgreSQL with Row Level Security for authority enforcement',
        dependencies: ['Supabase', 'PostgreSQL 15+']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
The Crew Registry uses a database-first architecture where the agent_registry table serves as the authoritative source. RLS policies enforce authority boundaries directly at the PostgreSQL level.

## Data Flow
1. Sub-agent orchestrator queries agent_registry for agent metadata
2. RLS policy checks caller's hierarchy level
3. Operations permitted only if caller level <= target level

## Integration Points
- sub_agent_orchestrator.js - agent execution
- LEO Protocol handoff system - authority validation
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'agent_registry',
          columns: [
            'id (uuid PK)',
            'agent_key (varchar unique)',
            'display_name (varchar)',
            'hierarchy_level (int 1-4)',
            'authority_scope (jsonb)',
            'parent_agent_id (uuid FK)',
            'status (varchar)',
            'created_at, updated_at (timestamp)'
          ],
          relationships: ['parent_agent_id → agent_registry.id (self-referential)']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'Database function: get_agent_by_key',
        method: 'RPC',
        description: 'Lookup agent by key with authority check',
        request: { agent_key: 'string' },
        response: { agent: 'AgentRecord', authorized: 'boolean' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'N/A - Infrastructure SD',
        description: 'No UI components - database-only implementation',
        wireframe: 'N/A'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Schema Design
- Create agent_registry table with hierarchy columns
- Add check constraint for level 1-4

## Phase 2: RLS Policies
- Implement authority boundary policies
- Test cross-level access restrictions

## Phase 3: Integration
- Update sub-agent orchestrator to use registry
- Add authority validation to handoff system
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'Vite',
      'Shadcn UI',
      'Supabase PostgreSQL'
      // Add specific technologies for this PRD
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'TODO: Internal dependency',
        status: 'completed', // completed, in_progress, blocked
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Agent hierarchy level validation',
        description: 'Verify L1-L4 hierarchy levels are correctly enforced',
        expected_result: 'Only valid levels (1-4) accepted, constraint violation on others',
        test_type: 'unit'
      },
      {
        id: 'TS-2',
        scenario: 'RLS authority boundary test',
        description: 'Verify RLS policies restrict cross-level access',
        expected_result: 'L2+ agents cannot modify L1 agents, L3+ cannot modify L2',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'Agent lookup performance',
        description: 'Verify agent lookup queries meet performance target',
        expected_result: 'Single agent lookup completes in under 100ms',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'agent_registry table created with correct schema',
      'RLS policies enforce hierarchy-based access control',
      'All test scenarios pass',
      'Integration with sub-agent orchestrator verified'
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
        risk: 'RLS policy complexity may impact query performance',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Slower agent lookups if RLS policies are complex',
        mitigation: 'Use indexed columns for RLS checks, benchmark before deployment'
      },
      {
        category: 'Integration',
        risk: 'Existing sub-agent system may have hardcoded assumptions',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Integration may require refactoring existing code',
        mitigation: 'Review existing code, implement adapter pattern if needed'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use Supabase PostgreSQL RLS',
        impact: 'Authority enforcement tied to database layer, not application layer'
      }
    ],

    assumptions: [
      {
        assumption: '4-level hierarchy is sufficient for current needs',
        validation_method: 'Review with Vision V2 architecture requirements'
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
      design_analysis: 'Database-first architecture with RLS enforcement for agent hierarchy',
      database_analysis: 'New agent_registry table with self-referential hierarchy',
      exploration_summary: [
        'scripts/modules/sub-agents/sub-agent-orchestrator.js',
        'database/schema/sub_agent_registry_v2.sql',
        'lib/sub-agent-executor.js'
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
