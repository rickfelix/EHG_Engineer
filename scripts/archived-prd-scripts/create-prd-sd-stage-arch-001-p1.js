#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-STAGE-ARCH-001-P1 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-STAGE-ARCH-001-P1'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Phase 1: SSOT Foundation + Delete Legacy'; // TODO: Replace with your PRD title

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
    priority: 'critical', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
Phase 1 creates the Single Source of Truth (SSOT) for the 25-stage venture workflow
defined in Vision V2. This phase establishes /src/config/venture-workflow.ts as the
canonical definition of all stage metadata - names, gates (kill/promotion), and
sequence. The SSOT prevents the "Schrödinger's Stage" crisis where 12 stages exist
as duplicate files with conflicting purposes.

After establishing SSOT, this phase archives the 12 "wrong" duplicate stage files
and deletes the 2 backup files identified in P0. This creates a clean foundation
for P2's new V2 stage shell creation.
    `.trim(),

    business_context: `
The current codebase has 12 duplicate stage pairs (24 files) when Vision V2 specifies
exactly 25 unique stages. This creates confusion about which component to use, prevents
consistent gate enforcement, and blocks proper kill gate (3, 5, 13, 23) and promotion
gate (16, 17, 22) implementation.

Establishing SSOT enables:
- Consistent stage naming across the application
- Proper gate enforcement at validation points
- Type-safe stage references throughout the codebase
- Foundation for P2-P5 implementation
    `.trim(),

    technical_context: `
Current state (from P0 audit):
- ../ehg/src/components/stages/ contains 46 files
- 12 stage numbers have duplicate implementations
- 2 backup files need deletion
- 6 chunk workflow files for review
- Stage router uses hardcoded stage references

Target architecture:
- /src/config/venture-workflow.ts as SSOT (new)
- TypeScript types for stage metadata
- Stage router updated to use SSOT
- Archive folder: _deprecated/pre-vision-v2/
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-SSOT',
        requirement: 'Create venture-workflow.ts SSOT config',
        description: 'Define all 25 stages with metadata: number, name, componentPath, gateType, gateLabel',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'File exists at /src/config/venture-workflow.ts',
          'Exports VENTURE_STAGES array with 25 entries',
          'Exports TypeScript types: VentureStage, GateType',
          'Kill gates marked for stages 3, 5, 13, 23',
          'Promotion gates marked for stages 16, 17, 22'
        ]
      },
      {
        id: 'FR-ARCHIVE',
        requirement: 'Archive duplicate stage files',
        description: 'Move 12 non-canonical stage files to _deprecated/pre-vision-v2/',
        priority: 'HIGH',
        acceptance_criteria: [
          'Archive folder created at /src/components/stages/_deprecated/pre-vision-v2/',
          'All 12 duplicate files moved (not deleted)',
          'No breaking imports in main codebase',
          'Git history preserved (mv, not delete+create)'
        ]
      },
      {
        id: 'FR-CLEANUP',
        requirement: 'Delete backup files',
        description: 'Remove .backup files identified in P0 audit',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Stage15PricingStrategy.tsx.backup deleted',
          'Stage4CompetitiveIntelligence.tsx.backup deleted'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'maintainability',
        requirement: 'SSOT config must be the only source of stage truth',
        target_metric: 'Zero hardcoded stage references in router or components'
      },
      {
        type: 'type_safety',
        requirement: 'Full TypeScript coverage for stage references',
        target_metric: 'All stage lookups use VentureStage type'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-TYPES',
        requirement: 'TypeScript type definitions',
        description: 'Create VentureStage interface and GateType union type',
        dependencies: ['TypeScript 5']
      },
      {
        id: 'TR-EXPORTS',
        requirement: 'Named exports for external use',
        description: 'Export getStageByNumber, getStageByKey helper functions',
        dependencies: []
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
SSOT Config Pattern:
\`\`\`
/src/config/venture-workflow.ts
├── Types: VentureStage, GateType
├── Data: VENTURE_STAGES (25 entries)
└── Helpers: getStageByNumber(), getStageByKey()
\`\`\`

## Data Flow
1. Stage router imports VENTURE_STAGES from SSOT
2. Components look up metadata via getStageByNumber()
3. Gate logic uses gateType field to determine behavior
4. No hardcoded stage numbers anywhere in codebase

## Integration Points
- Stage router (P2 will update)
- Stage components (will import types)
- Venture workflow UI (gate displays)
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'N/A - Config file only',
          columns: ['stageNumber', 'stageName', 'stageKey', 'componentPath', 'gateType'],
          relationships: ['Maps to stage components via componentPath']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'N/A',
        method: 'N/A',
        description: 'P1 is config-only, no API changes',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'N/A - Infrastructure only',
        description: 'No UI changes in P1, foundation for P2-P5',
        wireframe: 'N/A'
      }
    ],

    // Implementation
    implementation_approach: `
## Step 1: Create SSOT Config
- Create /src/config/venture-workflow.ts
- Define VentureStage interface with all metadata fields
- Define VENTURE_STAGES array with 25 canonical stages
- Mark kill gates (3, 5, 13, 23) and promotion gates (16, 17, 22)

## Step 2: Determine Canonical Files
- Cross-reference P0 audit with GENESIS_RITUAL_SPECIFICATION.md
- For each duplicate pair, select the canonical (Vision V2) version
- Document selection rationale in commit message

## Step 3: Archive Duplicates
- Create _deprecated/pre-vision-v2/ folder
- Move non-canonical files (preserve git history)
- Update any direct imports if found

## Step 4: Cleanup
- Delete .backup files
- Verify build succeeds
- Run existing tests
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
        id: 'TS-SSOT',
        scenario: 'SSOT config exports correctly',
        description: 'Import venture-workflow.ts and verify exports',
        expected_result: 'VENTURE_STAGES has 25 entries, types compile',
        test_type: 'unit'
      },
      {
        id: 'TS-GATES',
        scenario: 'Gate types assigned correctly',
        description: 'Verify kill and promotion gates at correct stage numbers',
        expected_result: 'Stages 3,5,13,23 = kill; 16,17,22 = promotion',
        test_type: 'unit'
      },
      {
        id: 'TS-BUILD',
        scenario: 'Build succeeds after cleanup',
        description: 'Run npm run build in EHG app',
        expected_result: 'Build completes without import errors',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'venture-workflow.ts exists with 25 stages defined',
      'All kill gates (3, 5, 13, 23) correctly marked',
      'All promotion gates (16, 17, 22) correctly marked',
      '12 duplicate files archived to _deprecated/pre-vision-v2/',
      '2 backup files deleted',
      'Build succeeds with no import errors',
      'Existing tests pass'
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
        risk: 'Incorrect canonical file selection',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Wrong component archived, need to reverse',
        mitigation: 'Cross-reference with GENESIS spec, archive (dont delete)'
      },
      {
        category: 'Integration',
        risk: 'Breaking imports from archived files',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Build failure until imports updated',
        mitigation: 'Run build after each archive, fix imports before next'
      }
    ],

    constraints: [
      {
        type: 'dependency',
        constraint: 'Must complete P0 audit first',
        impact: 'P1 requires P0 audit report to identify duplicates'
      },
      {
        type: 'sequencing',
        constraint: 'Archive before P2 shell creation',
        impact: 'P2 depends on clean _deprecated folder'
      }
    ],

    assumptions: [
      {
        assumption: 'P0 audit report is accurate',
        validation_method: 'Verify file list against actual directory'
      },
      {
        assumption: 'GENESIS spec defines canonical stage names',
        validation_method: 'Review GENESIS_RITUAL_SPECIFICATION.md'
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
