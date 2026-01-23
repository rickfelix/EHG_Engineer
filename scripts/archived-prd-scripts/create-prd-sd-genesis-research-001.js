#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-GENESIS-RESEARCH-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-GENESIS-RESEARCH-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Genesis-LEO Integration Research'; // TODO: Replace with your PRD title

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
    category: 'infrastructure',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      This research deliverable maps the complete integration between the Genesis venture simulation system
      and the LEO Protocol workflow engine. The goal is to document all touchpoints, data flows, and
      dependencies between these two systems to enable seamless automated venture development.

      Key focus areas: SD/PRD creation workflows, phase transition triggers, validation gates, and
      cross-repository synchronization between EHG_Engineer (LEO infrastructure) and EHG (Genesis UI/API).

      Output: Comprehensive integration documentation that serves as the blueprint for subsequent
      implementation SDs in the Genesis Completion orchestrator.
    `.trim(),

    business_context: `
      Genesis provides simulation-based venture validation but currently lacks integration with LEO Protocol.
      Without this integration mapping, implementation work would proceed without clear understanding of:
      - Which LEO phases Genesis triggers and consumes
      - How SD/PRD structures map to Genesis venture artifacts
      - What validation gates must be satisfied for Genesis workflows

      This research prevents wasted effort from incorrect assumptions during implementation phases.
    `.trim(),

    technical_context: `
      Two-Codebase Architecture:
      - EHG_Engineer: LEO Protocol infrastructure, handoff scripts, validation gates, SD/PRD management
      - EHG: Genesis UI components, Supabase client, venture simulation interfaces

      Key Integration Points to Research:
      - scripts/handoff.js LEAD→PLAN→EXEC flow
      - lib/supabase-factory.js client patterns
      - Strategic Directives v2 schema structure
      - PRD schema and validation requirements
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Document Genesis-to-LEO phase mapping',
        description: 'Create comprehensive mapping of how Genesis workflow stages correspond to LEO LEAD/PLAN/EXEC phases',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All 17 Genesis stages mapped to LEO phases',
          'Phase transition triggers documented',
          'Validation gates identified for each transition'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Map SD/PRD field structures to Genesis artifacts',
        description: 'Document how strategic_directives_v2 and prds table fields map to Genesis venture data',
        priority: 'CRITICAL',
        acceptance_criteria: [
          '100% of SD fields mapped or marked N/A',
          '100% of PRD fields mapped or marked N/A',
          'Data transformation requirements documented'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Define API contracts for Genesis-LEO integration',
        description: 'Specify all API calls, webhooks, and data exchanges between Genesis UI and LEO infrastructure',
        priority: 'HIGH',
        acceptance_criteria: [
          'All integration endpoints documented with request/response schemas',
          'Authentication/authorization requirements specified',
          'Error handling patterns defined'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'documentation',
        requirement: 'Research deliverables must be database-first',
        target_metric: 'All findings stored in appropriate database tables, not markdown files'
      },
      {
        type: 'completeness',
        requirement: 'Coverage of all integration points',
        target_metric: '100% of Genesis-LEO touchpoints documented'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Research must cover both codebases',
        description: 'Analysis must include both EHG_Engineer (LEO) and EHG (Genesis) repositories',
        dependencies: ['Access to EHG repository', 'Access to EHG_Engineer repository']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      This research deliverable documents the integration architecture between:
      - Genesis (EHG): Venture simulation UI and data management
      - LEO Protocol (EHG_Engineer): Strategic directive workflow automation

      ## Data Flow
      1. Genesis UI creates venture → triggers SD creation via LEO API
      2. LEO LEAD phase validates venture feasibility
      3. LEO PLAN phase generates PRD with simulation parameters
      4. LEO EXEC phase runs Genesis simulation stages
      5. Results flow back to Genesis UI for display

      ## Integration Points
      - Supabase shared database (strategic_directives_v2, prds, genesis_simulations)
      - LEO handoff scripts (scripts/handoff.js)
      - Genesis API endpoints (EHG/src/app/api/)
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'strategic_directives_v2',
          columns: ['id', 'title', 'scope', 'current_phase', 'status', 'metadata'],
          relationships: ['FK to prds via sd_id', 'Self-referential parent_sd_id']
        },
        {
          name: 'prds',
          columns: ['id', 'sd_id', 'title', 'status', 'functional_requirements'],
          relationships: ['FK to strategic_directives_v2 via sd_id']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: '/api/genesis/venture',
        method: 'POST',
        description: 'Creates new venture and triggers SD creation',
        request: { venture_name: 'string', industry: 'string' },
        response: { sd_id: 'string', status: 'string' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'N/A - Research deliverable',
        description: 'This SD produces documentation, not UI components',
        wireframe: 'N/A'
      }
    ],

    // Implementation
    implementation_approach: `
      ## Phase 1: LEO Infrastructure Analysis
      - Map handoff.js workflow logic
      - Document validation gate requirements
      - Identify SD/PRD field dependencies

      ## Phase 2: Genesis Integration Points
      - Analyze EHG API endpoints
      - Document UI-to-backend data flows
      - Identify Genesis stage triggers

      ## Phase 3: Integration Mapping
      - Create comprehensive mapping document
      - Define API contracts
      - Document data transformation requirements
    `.trim(),

    technology_stack: [
      'Node.js (analysis scripts)',
      'Supabase PostgreSQL (data storage)',
      'Markdown (documentation output)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'Access to EHG codebase',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'Access to EHG_Engineer codebase',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Phase mapping completeness',
        description: 'Verify all 17 Genesis stages are mapped to LEO phases',
        expected_result: '100% coverage with no gaps',
        test_type: 'validation'
      },
      {
        id: 'TS-2',
        scenario: 'Field mapping coverage',
        description: 'Verify all SD/PRD fields are mapped or marked N/A',
        expected_result: 'Complete field mapping document',
        test_type: 'validation'
      }
    ],

    acceptance_criteria: [
      'Genesis-LEO integration map completed with all phases documented',
      'SD field mapping 100% complete',
      'PRD field mapping 100% complete',
      'API contracts defined for all integration points'
    ],

    performance_requirements: {
      documentation_completeness: '100%',
      review_cycle_time: '<3 days',
      accuracy_validation: 'Peer reviewed'
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Research scope defined', checked: true },
      { text: 'Integration points identified', checked: false },
      { text: 'Analysis approach documented', checked: true },
      { text: 'Validation criteria established', checked: true }
    ],

    exec_checklist: [
      { text: 'LEO handoff.js flow analyzed', checked: false },
      { text: 'SD field mapping completed', checked: false },
      { text: 'PRD field mapping completed', checked: false },
      { text: 'Genesis stage mapping completed', checked: false },
      { text: 'API contracts documented', checked: false },
      { text: 'Integration map finalized', checked: false }
    ],

    validation_checklist: [
      { text: 'All 17 Genesis stages mapped', checked: false },
      { text: 'Field mappings peer reviewed', checked: false },
      { text: 'API contracts validated', checked: false },
      { text: 'Documentation stored in database', checked: false }
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
        category: 'Research',
        risk: 'Incomplete codebase access',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Gaps in integration mapping if EHG repo not fully accessible',
        mitigation: 'Verify access to both repositories before starting analysis'
      },
      {
        category: 'Technical',
        risk: 'Undocumented integration points',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'May miss critical integration requirements',
        mitigation: 'Cross-reference with existing implementation and runtime behavior'
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
