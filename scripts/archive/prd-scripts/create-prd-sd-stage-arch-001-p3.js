#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-STAGE-ARCH-001-P3 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-STAGE-ARCH-001-P3'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Phase 3: Implement Safe Stages (1-10, 24-25)'; // TODO: Replace with your PRD title

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
Phase 3 implements the "safe stages" - stages 1-10 (Foundation and Validation chunks)
and stages 24-25 (Growth stages). These 12 stages have no kill gates or promotion gates,
making them lower-risk to implement first.

Building on P2's shell infrastructure, P3 transforms the placeholder shells into
functional stage components. Each stage receives venture data and renders appropriate
UI based on its purpose (idea capture, review, analysis, planning, etc.).
    `.trim(),

    business_context: `
P3 delivers user value by enabling the first 10 stages of the venture workflow. Users
can create ventures, get AI reviews, validate ideas, analyze competition, forecast
profitability, evaluate risks, plan comprehensively, decompose problems, analyze gaps,
and get technical reviews.

Stages 24-25 enable growth metric optimization and scale planning for launched ventures.
Together these 12 stages cover the foundation, validation, and growth phases.
    `.trim(),

    technical_context: `
P3 builds on P2 infrastructure:
- Uses V2 shell components in /src/components/stages/v2/
- Integrates with venture-workflow.ts SSOT
- StageRouter handles dynamic component loading

Each safe stage will:
- Fetch venture data via Supabase
- Render stage-specific UI with proper forms/displays
- Save progress to database
- Integrate with existing API services
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-FOUNDATION',
        requirement: 'Implement Foundation Stages (1-5)',
        description: 'Stages 1-5 covering idea capture, AI review, validation, competitive intel, and profitability',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Stage01 captures venture idea text',
          'Stage02 displays AI review results',
          'Stage03 shows validation metrics',
          'Stage04 displays competitive analysis',
          'Stage05 shows profitability forecast'
        ]
      },
      {
        id: 'FR-VALIDATION',
        requirement: 'Implement Validation Stages (6-10)',
        description: 'Stages 6-10 covering risk, planning, decomposition, gap analysis, and technical review',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Stage06 displays risk evaluation',
          'Stage07 shows comprehensive plan',
          'Stage08 shows problem decomposition',
          'Stage09 displays gap analysis',
          'Stage10 shows technical review'
        ]
      },
      {
        id: 'FR-GROWTH',
        requirement: 'Implement Growth Stages (24-25)',
        description: 'Stages 24-25 covering growth metrics and scale planning',
        priority: 'HIGH',
        acceptance_criteria: [
          'Stage24 displays growth metrics',
          'Stage25 shows scale planning details'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Stage components load within 2 seconds',
        target_metric: '<2s initial render'
      },
      {
        type: 'maintainability',
        requirement: 'Each stage component under 300 LOC',
        target_metric: '<300 LOC per component'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-P2',
        requirement: 'Build on P2 shell infrastructure',
        description: 'Use V2 shells as base, StageRouter for navigation',
        dependencies: ['P2 V2 shells complete', 'venture-workflow.ts SSOT']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
Safe stages (1-10, 24-25) implemented in /src/components/stages/v2/
Each stage component extends the P2 shell with real functionality.

## Data Flow
1. VenturePage loads venture data from Supabase
2. StageRouter receives stageNumber, renders correct V2 component
3. Stage component fetches stage-specific data
4. User interactions saved to database via API

## Integration Points
- venture-workflow.ts SSOT for stage metadata
- Supabase for venture and stage data
- Existing API services for AI features
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'ventures',
          columns: ['id', 'current_stage', 'stage_data'],
          relationships: ['Uses SSOT stage numbers']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'N/A',
        method: 'N/A',
        description: 'Uses existing Supabase queries, no new API endpoints',
        request: {},
        response: {}
      }
    ],

    ui_ux_requirements: [
      {
        component: 'Safe Stage Components',
        description: 'Consistent layout using StageShellTemplate, stage-specific content',
        wireframe: 'Each stage shows relevant data cards'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Foundation Stages (1-5)
- Implement Stage01 idea capture form
- Implement Stage02 AI review display
- Implement Stage03-05 analysis displays

## Phase 2: Validation Stages (6-10)
- Implement risk evaluation, planning displays
- Implement decomposition and gap analysis
- Implement technical review

## Phase 3: Growth Stages (24-25)
- Implement growth metrics dashboard
- Implement scale planning interface
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
        name: 'P2 V2 Stage Shells',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'P1 SSOT Config',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-FOUNDATION',
        scenario: 'Foundation stages render with venture data',
        description: 'Stages 1-5 load and display venture-specific content',
        expected_result: 'Each stage shows correct data for the venture',
        test_type: 'integration'
      },
      {
        id: 'TS-VALIDATION',
        scenario: 'Validation stages render correctly',
        description: 'Stages 6-10 display analysis and planning data',
        expected_result: 'All validation stages render without errors',
        test_type: 'integration'
      },
      {
        id: 'TS-GROWTH',
        scenario: 'Growth stages display metrics',
        description: 'Stages 24-25 show growth data',
        expected_result: 'Growth metrics and scale planning visible',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'All 12 safe stages render with venture data',
      'Stages use StageShellTemplate consistently',
      'No TypeScript errors in safe stage components',
      'Each stage under 300 LOC',
      'Build succeeds with safe stage implementations'
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
        risk: 'Existing stage data incompatible with V2 components',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Need to migrate or transform venture data',
        mitigation: 'Check data formats before implementation'
      },
      {
        category: 'Scope',
        risk: 'Safe stages have hidden complexity',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Implementation takes longer than expected',
        mitigation: 'Start with simpler stages first'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use P2 shell infrastructure',
        impact: 'Cannot deviate from StageShellTemplate pattern'
      },
      {
        type: 'scope',
        constraint: 'Only safe stages (no kill/promotion gates)',
        impact: 'Crisis zone stages deferred to P4'
      }
    ],

    assumptions: [
      {
        assumption: 'P2 shell infrastructure is stable',
        validation_method: 'Build passes with P2 components'
      },
      {
        assumption: 'Existing venture data is compatible',
        validation_method: 'Test with sample ventures'
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
