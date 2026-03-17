#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-LEO-FIX-CREATION-COLUMN-MAPPING-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-LEO-FIX-CREATION-COLUMN-MAPPING-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Fix SD Creation Column Mapping (id vs uuid_id)'; // TODO: Replace with your PRD title

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

  // Query by sd_key OR id to handle both formats (sd_key like SD-XXX-001, id is UUID)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, category, priority')
    .or(`sd_key.eq.${SD_ID},id.eq.${SD_ID}`)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  // Use UUID for FK references
  const sdUuid = sdData.id;

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.id}`);
  console.log(`   SD Key: ${sdData.sd_key}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${sdData.sd_key || SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id (UUID)
    id: prdId,
    sd_id: sdUuid,                  // FK to strategic_directives_v2.id (UUID)
    directive_id: sdUuid,           // Backward compatibility (UUID)

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'fix',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      Fix SD creation scripts that incorrectly put UUID in the 'id' column instead of human-readable keys.

      The documentation specifies that 'id' (VARCHAR) should contain human-readable keys like SD-LEARN-001,
      while 'uuid_id' (UUID) should be used for foreign key relationships. However, 4 scripts use the
      opposite pattern, causing new SDs to be invisible in the SD queue and creating FK confusion.

      This fix aligns code with the documented schema, ensuring all new SDs appear correctly in npm run sd:next.
    `.trim(),

    business_context: `
      5-Whys root cause analysis revealed schema/code misalignment causing:
      - New SDs created via /learn not appearing in SD queue
      - Confusion about which column to use for references
      - Inconsistent data in strategic_directives_v2 table

      Impact: Workflow disruption when SDs are created but invisible.
    `.trim(),

    technical_context: `
      Schema per docs/database/strategic_directives_v2_field_reference.md:
      - id (VARCHAR): Human-readable key like SD-LEARN-001 (main identifier)
      - uuid_id (UUID): Internal UUID for foreign key relationships
      - sd_key (TEXT): Alternative/legacy key

      Four scripts incorrectly use: id=randomUUID(), sd_key=humanReadableKey
      Should be: id=humanReadableKey, sd_key=humanReadableKey (uuid_id auto-generated)
    `.trim(),

    // Requirements (JSONB arrays)
    // CRITICAL: Minimum 3 functional requirements required by database constraint
    // PRD validation will FAIL if fewer than 3 requirements are provided
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Fix executor.js column mapping',
        description: 'Update scripts/modules/learning/executor.js lines 345-347 to use id=sdKey instead of id=randomUUID()',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'executor.js uses id: sdKey (human-readable)',
          'uuid_id is not set (auto-generated by database)',
          'sd_key is set to same value as id for backward compatibility'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Fix create-sd.js column mapping',
        description: 'Update scripts/create-sd.js lines 395-396 to use id=sdKey instead of id=randomUUID()',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'create-sd.js uses id: sdKey (human-readable)',
          'New SDs created via create-sd.js appear in npm run sd:next'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Fix sd-from-feedback.js column mapping',
        description: 'Update scripts/sd-from-feedback.js lines 245-246 to use id=sdKey instead of id=randomUUID()',
        priority: 'HIGH',
        acceptance_criteria: [
          'sd-from-feedback.js uses id: sdKey (human-readable)',
          'New SDs created from feedback appear in queue'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Fix uat-to-strategic-directive-ai.js column mapping',
        description: 'Update scripts/uat-to-strategic-directive-ai.js lines 310-311 and 422 to use id=sdKey',
        priority: 'HIGH',
        acceptance_criteria: [
          'uat-to-strategic-directive-ai.js uses id: sdKey (human-readable)',
          'SDs created from UAT findings appear correctly in queue'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'TODO: Performance requirement',
        target_metric: 'TODO: e.g., <2s page load time'
      },
      {
        type: 'security',
        requirement: 'TODO: Security requirement',
        target_metric: 'TODO: e.g., OAuth 2.0 authentication'
      }
      // Add: scalability, reliability, usability, etc.
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'TODO: Technical requirement',
        description: 'TODO: Technologies, patterns, constraints',
        dependencies: ['TODO: Library/service dependencies']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      [TODO: Describe component architecture]

      ## Data Flow
      [TODO: Describe how data flows through the system]

      ## Integration Points
      [TODO: External systems, APIs, services]
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'TODO_table_name',
          columns: ['id', 'name', 'created_at'],
          relationships: ['TODO: Foreign keys']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: '/api/TODO',
        method: 'GET',
        description: 'TODO: Endpoint description',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'TODO: Component name',
        description: 'TODO: UI/UX requirements',
        wireframe: 'TODO: Link to wireframe'
      }
    ],

    // Implementation
    implementation_approach: `
      ## Phase 1: Foundation
      [TODO: Initial setup and core functionality]

      ## Phase 2: Feature Development
      [TODO: Main feature implementation]

      ## Phase 3: Testing & Deployment
      [TODO: Testing, validation, deployment]
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
        scenario: 'Verify /learn creates SD with correct id',
        description: 'Run /learn, approve an item, verify SD has human-readable id',
        expected_result: 'New SD id matches SD-xxx-xxx pattern, not UUID',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Verify SD appears in queue after creation',
        description: 'After creating SD via /learn, run npm run sd:next',
        expected_result: 'New SD appears in queue output',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'Verify backward compatibility',
        description: 'Existing SDs with UUID in id column continue to work',
        expected_result: 'No regression in existing SD functionality',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'TODO: All functional requirements implemented',
      'TODO: All tests passing (unit + E2E)',
      'TODO: Performance requirements met',
      'TODO: Security review completed'
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
        risk: 'Existing SDs with UUID in id column may have FK references',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'learning_decisions table FK may reference UUIDs',
        mitigation: 'Check and update FK references before fixing, maintain backward compatibility'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'TODO: Technical constraint',
        impact: 'TODO: How this limits the solution'
      }
    ],

    assumptions: [
      {
        assumption: 'TODO: What we\'re assuming',
        validation_method: 'TODO: How to validate this assumption'
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
      // REQUIRED: exploration_summary - Documents files explored during PLAN phase
      exploration_summary: [
        {
          file_path: 'scripts/modules/learning/executor.js',
          purpose: 'Identify incorrect column mapping in /learn SD creation',
          key_findings: 'Lines 345-347 use id=randomUUID(), sd_key=sdKey - should be reversed'
        },
        {
          file_path: 'scripts/create-sd.js',
          purpose: 'Check SD creation pattern',
          key_findings: 'Lines 395-396 have same incorrect pattern: id=randomUUID()'
        },
        {
          file_path: 'scripts/sd-from-feedback.js',
          purpose: 'Check feedback-to-SD creation',
          key_findings: 'Lines 245-246 have same incorrect pattern'
        },
        {
          file_path: 'scripts/uat-to-strategic-directive-ai.js',
          purpose: 'Check UAT-to-SD creation',
          key_findings: 'Lines 310-311 and 422 have same incorrect pattern'
        },
        {
          file_path: 'docs/database/strategic_directives_v2_field_reference.md',
          purpose: 'Verify canonical schema definition',
          key_findings: 'id=VARCHAR for human-readable, uuid_id=UUID for FK, sd_key=alternative'
        },
        {
          file_path: 'scripts/modules/sd-key-generator.js',
          purpose: 'Verify SDKeyGenerator returns correct format',
          key_findings: 'SDKeyGenerator correctly generates SD-xxx-xxx format keys'
        }
      ],
      root_cause: 'SD-LEO-SDKEY-001 fixed key FORMAT but not column MAPPING',
      estimated_hours: 2
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
  // STEP 6: Auto-invoke PLAN phase sub-agents (Gap #1 Fix)
  // -------------------------------------------------------------------------

  console.log('\n6️⃣  Auto-invoking PLAN phase sub-agents...');

  try {
    // Dynamic import to avoid circular dependencies
    const { orchestrate } = await import('./orchestrate-phase-subagents.js');
    const orchestrationResult = await orchestrate('PLAN_PRD', SD_ID, { autoRemediate: true });

    if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
      console.log(`   ✅ Sub-agents completed: ${orchestrationResult.executed?.join(', ') || 'All required'}`);
    } else if (orchestrationResult.status === 'PARTIAL') {
      console.log(`   ⚠️  Some sub-agents had issues: ${JSON.stringify(orchestrationResult.summary)}`);
    } else {
      console.log(`   ⚠️  Sub-agent orchestration status: ${orchestrationResult.status}`);
      console.log('   You may need to run sub-agents manually for full compliance');
    }
  } catch (orchestrationError) {
    console.warn('   ⚠️  Sub-agent auto-invocation failed:', orchestrationError.message);
    console.log('   Sub-agents can be run manually later with:');
    console.log(`      node scripts/orchestrate-phase-subagents.js PLAN_PRD ${SD_ID}`);
  }

  // -------------------------------------------------------------------------
  // STEP 7: Success Summary
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
  console.log('   2. Verify sub-agent results in database (auto-invoked above)');
  console.log('   3. Mark plan_checklist items as complete');
  console.log('   4. Create PLAN→EXEC handoff when ready');
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
