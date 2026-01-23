#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-STAGE-ARCH-001-P2 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-STAGE-ARCH-001-P2'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Phase 2: Create V2 Stage Shells + Router'; // TODO: Replace with your PRD title

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
Phase 2 creates 25 V2 stage shell components in /src/components/stages/v2/ and
implements a dynamic stage router that uses the SSOT config from P1. These shells
provide the foundation for P3-P4 implementation work.

Each shell component follows a standardized structure with proper TypeScript types,
loading states, error boundaries, and integration with the venture-workflow.ts SSOT.
The stage router dynamically renders the correct component based on stage number.
    `.trim(),

    business_context: `
P1 established the SSOT config (venture-workflow.ts) defining all 25 stages. P2
creates the component infrastructure that uses this SSOT. Without P2, there is no
standardized way to render stages or route between them.

The shell pattern ensures consistent component structure across all 25 stages,
making P3-P5 implementation faster and more maintainable. Each shell is production-
ready but with placeholder content that P3-P4 will fill in.
    `.trim(),

    technical_context: `
SSOT Integration:
- Import VentureStage type and VENTURE_STAGES from venture-workflow.ts
- Stage router uses getStageByNumber() for dynamic component resolution
- Each shell receives stage metadata as props from router

Component Structure:
- /src/components/stages/v2/Stage01DraftIdea.tsx through Stage25ScalePlanning.tsx
- /src/components/stages/v2/stage-router.tsx - dynamic stage renderer
- /src/components/stages/v2/stage-shell-template.tsx - shared shell structure
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-SHELLS',
        requirement: 'Create 25 V2 stage shell components',
        description: 'Each shell follows standardized structure with proper types',
        priority: 'CRITICAL',
        acceptance_criteria: [
          '25 shell files exist in /src/components/stages/v2/',
          'Each shell imports VentureStage type from SSOT',
          'Each shell has loading state placeholder',
          'Each shell has error boundary integration'
        ]
      },
      {
        id: 'FR-ROUTER',
        requirement: 'Implement dynamic stage router',
        description: 'Router uses SSOT to resolve and render correct stage component',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'stage-router.tsx created in /src/components/stages/v2/',
          'Router imports VENTURE_STAGES from SSOT',
          'Router dynamically imports stage components',
          'Router handles stage not found gracefully'
        ]
      },
      {
        id: 'FR-TEMPLATE',
        requirement: 'Create reusable shell template',
        description: 'Template component for consistent stage structure',
        priority: 'HIGH',
        acceptance_criteria: [
          'stage-shell-template.tsx provides shared layout',
          'Template includes header, content area, navigation',
          'Template accepts stage metadata as props'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'maintainability',
        requirement: 'Shells must be consistent and maintainable',
        target_metric: 'Each shell component < 100 LOC'
      },
      {
        type: 'type_safety',
        requirement: 'Full TypeScript coverage',
        target_metric: 'Zero any types in stage components'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-SSOT',
        requirement: 'SSOT integration',
        description: 'All stage metadata sourced from venture-workflow.ts',
        dependencies: ['P1 SSOT config must be complete']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
/src/components/stages/v2/
├── stage-router.tsx           # Dynamic stage renderer
├── stage-shell-template.tsx   # Shared shell component
├── Stage01DraftIdea.tsx       # Stage 1 shell
├── Stage02AIReview.tsx        # Stage 2 shell
├── ...                        # Stages 3-24
└── Stage25ScalePlanning.tsx   # Stage 25 shell

## Data Flow
1. Venture page passes stageNumber to StageRouter
2. StageRouter imports SSOT and looks up stage metadata
3. StageRouter dynamically imports correct stage component
4. Stage component receives VentureStage metadata as props

## Integration Points
- venture-workflow.ts (SSOT from P1)
- Existing venture pages that need stage rendering
- Future P3-P4 implementations will extend these shells
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'N/A - Frontend components only',
          columns: [],
          relationships: ['Uses SSOT config, no database changes']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'N/A',
        method: 'N/A',
        description: 'P2 is frontend-only, no API changes',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'StageShellTemplate',
        description: 'Consistent stage layout with header, content, navigation',
        wireframe: 'Standard stage layout with stage name and gate indicator'
      }
    ],

    // Implementation
    implementation_approach: `
## Step 1: Create Shell Template
- Build reusable StageShellTemplate component
- Include header with stage name, number, gate type
- Content area placeholder for P3-P4 implementation
- Navigation between stages

## Step 2: Generate 25 Shell Components
- Each shell imports and uses StageShellTemplate
- Each shell receives VentureStage metadata
- Each shell has minimal placeholder content

## Step 3: Implement Stage Router
- Dynamic import of stage components
- Integration with SSOT for stage lookup
- Error handling for invalid stage numbers

## Step 4: Verify Integration
- Test router with all 25 stages
- Verify SSOT metadata displays correctly
- Confirm no build errors
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
        name: 'P1 SSOT config (venture-workflow.ts)',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'P0 Audit Report',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-SHELLS',
        scenario: 'All 25 stage shells render correctly',
        description: 'Each stage shell component mounts without error and displays stage metadata',
        expected_result: 'All 25 shells render with correct stage name, number, and gate type',
        test_type: 'unit'
      },
      {
        id: 'TS-ROUTER',
        scenario: 'Stage router resolves correct component',
        description: 'Router dynamically imports and renders correct stage based on stageNumber',
        expected_result: 'Router returns Stage05 component when given stageNumber=5',
        test_type: 'unit'
      },
      {
        id: 'TS-SSOT',
        scenario: 'SSOT integration verified',
        description: 'Each shell receives VentureStage metadata from venture-workflow.ts',
        expected_result: 'Stage props match VENTURE_STAGES array data',
        test_type: 'integration'
      },
      {
        id: 'TS-GATES',
        scenario: 'Gate types display correctly',
        description: 'Kill gates and promotion gates show appropriate visual indicators',
        expected_result: 'Stage 3 shows "KILL GATE", Stage 16 shows "PROMOTION GATE"',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      '25 V2 stage shell files created in /src/components/stages/v2/',
      'Stage router dynamically imports and renders correct stage',
      'Each shell imports VentureStage type from SSOT',
      'All shells render without build errors',
      'Kill gates (3, 5, 13, 23) display gate indicators',
      'Promotion gates (16, 17, 22) display gate indicators',
      'TypeScript strict mode passes (zero any types)',
      'No lint errors in new components'
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
        risk: 'Dynamic import failures for stage components',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Router cannot load specific stages, breaking venture workflow',
        mitigation: 'Add error boundaries and fallback components'
      },
      {
        category: 'Integration',
        risk: 'SSOT type mismatches between P1 config and P2 shells',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'TypeScript errors, runtime failures',
        mitigation: 'Import types directly from venture-workflow.ts, use strict mode'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use existing venture-workflow.ts SSOT',
        impact: 'All stage metadata must come from P1 config, no hardcoding'
      },
      {
        type: 'structural',
        constraint: 'Shells must be minimal (<100 LOC each)',
        impact: 'Forces lean implementation, P3-P4 will add real functionality'
      }
    ],

    assumptions: [
      {
        assumption: 'P1 SSOT config (venture-workflow.ts) is complete and correct',
        validation_method: 'Verify 25 stages with correct gate types exist in config'
      },
      {
        assumption: 'Vite supports dynamic imports for stage components',
        validation_method: 'Test dynamic import pattern with one component first'
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
