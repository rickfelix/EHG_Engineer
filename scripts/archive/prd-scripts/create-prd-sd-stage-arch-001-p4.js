#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-STAGE-ARCH-001-P4 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-STAGE-ARCH-001-P4'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Phase 4: Rebuild Crisis Zone (Stages 11-23)'; // TODO: Replace with your PRD title

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
    category: 'feature',
    priority: 'critical', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      Phase 4 implements the "Crisis Zone" stages (11-23) of the 25-stage venture workflow.
      These stages are more complex than the "safe stages" (1-10, 24-25) implemented in P3,
      containing critical decision points including kill gates and promotion gates.

      Kill Gates (hard stops): Stages 13, 23 - ventures that fail these are terminated
      Promotion Gates (advancement): Stages 16, 17, 22 - determine venture advancement path

      This phase transforms the existing duplicate/conflicting stage files into the canonical
      V2 architecture following Vision V2 specifications from GENESIS_RITUAL_SPECIFICATION.md.
    `.trim(),

    business_context: `
      The crisis zone stages are critical for venture evaluation and decision-making.
      Without proper kill gates, ventures may continue consuming resources when they should
      be terminated. Without promotion gates, high-potential ventures may be held back.

      Business objectives:
      - Enable proper venture lifecycle management
      - Reduce resource waste on non-viable ventures
      - Accelerate promising ventures through the pipeline
    `.trim(),

    technical_context: `
      Building on P3's safe stages foundation:
      - SSOT in /src/config/venture-workflow.ts (from P1)
      - Stage router in /src/components/stages/v2/stage-router.ts (from P2)
      - Safe stage implementations in /src/components/stages/v2/ (from P3)

      Each stage must:
      - Follow <600 LOC component size limit
      - Use Shadcn UI components
      - Integrate with stage router
      - Follow SSOT metadata patterns
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Implement Stage 11 - Strategic Naming',
        description: 'Create the strategic naming stage component',
        priority: 'HIGH',
        acceptance_criteria: [
          'Stage renders without errors',
          'Follows SSOT metadata',
          'Component under 600 LOC'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Implement Stage 12 - Adaptive Naming',
        description: 'Create the adaptive naming stage component',
        priority: 'HIGH',
        acceptance_criteria: [
          'Stage renders without errors',
          'Follows SSOT metadata',
          'Component under 600 LOC'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Implement Stage 13 - Exit-Oriented Design (KILL GATE)',
        description: 'Create kill gate stage that can terminate ventures',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Kill gate logic implemented',
          'Venture termination workflow functional',
          'Clear UI for kill/proceed decision'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Implement Stages 14-15',
        description: 'Development Preparation and Pricing Strategy stages',
        priority: 'HIGH',
        acceptance_criteria: [
          'Both stages render without errors',
          'Follow SSOT metadata patterns'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Implement Stages 16-17-22 (PROMOTION GATES)',
        description: 'Promotion gates that determine venture advancement path',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Promotion logic implemented',
          'Clear advancement criteria',
          'UI shows promotion status'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Implement Stages 18-21',
        description: 'Pre-flight check and iterative development stages',
        priority: 'HIGH',
        acceptance_criteria: [
          'All stages render without errors',
          'Follow SSOT metadata patterns'
        ]
      },
      {
        id: 'FR-7',
        requirement: 'Implement Stage 23 - Customer Acquisition (KILL GATE)',
        description: 'Final kill gate before scale planning',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Kill gate logic implemented',
          'Venture termination workflow functional',
          'Clear UI for kill/proceed decision'
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
        scenario: 'TODO: Test scenario name',
        description: 'TODO: What to test',
        expected_result: 'TODO: Expected outcome',
        test_type: 'unit' // unit, integration, e2e
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
        risk: 'TODO: Potential risk',
        severity: 'MEDIUM', // LOW, MEDIUM, HIGH, CRITICAL
        probability: 'MEDIUM', // LOW, MEDIUM, HIGH
        impact: 'TODO: Impact if risk occurs',
        mitigation: 'TODO: How to prevent/handle'
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
      // Store custom fields here that aren't in the official schema
      // Examples:
      // ui_components: [...],
      // success_metrics: [...],
      // database_changes: {...},
      // estimated_hours: 40,
      // etc.
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
