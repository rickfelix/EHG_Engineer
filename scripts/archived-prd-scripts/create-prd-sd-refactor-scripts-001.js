#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-REFACTOR-SCRIPTS-001 with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-REFACTOR-SCRIPTS-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Script Framework Consolidation'; // TODO: Replace with your PRD title

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

  // SD lookup: Use legacy_id for string IDs like 'SD-REFACTOR-SCRIPTS-001'
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, category, priority')
    .eq('sd_key', SD_ID)
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
      This PRD defines the consolidation of 74 duplicate create-prd-* scripts and 19 add-user-stories-*
      scripts into a unified template-based system. Currently, each SD has its own hardcoded script
      with 95% identical boilerplate code, leading to maintenance nightmares and inconsistent behavior.

      The solution creates a single template engine that reads SD metadata from the database and
      generates properly structured PRDs dynamically. This eliminates ~15,000 lines of duplicate code,
      ensures consistent PRD structure, and makes adding new SDs trivial (just database entries, no scripts).

      Impact: Reduces script count from 93 to 3 (template, generator, validator), improves maintainability,
      and establishes the pattern for similar consolidation across the codebase.
    `.trim(),

    business_context: `
      Pain Points:
      - 74 near-identical scripts means 74x maintenance burden for any change
      - Inconsistent PRD formats across SDs due to copy-paste drift
      - New SD creation requires copying/modifying existing script (error-prone)

      Business Objectives:
      - Reduce maintenance overhead by 95%
      - Ensure consistent PRD quality across all SDs
      - Enable rapid SD creation without code changes

      Success Metrics:
      - Script count: 93 → 3 (97% reduction)
      - Lines of code: 15,000+ eliminated
      - Time to create new SD PRD: 2 hours → 5 minutes
    `.trim(),

    technical_context: `
      Existing Systems:
      - 74 scripts in scripts/create-prd-*.js following same pattern
      - 19 scripts in scripts/add-user-stories-*.js
      - lib/prd-schema-validator.js (reusable)
      - lib/sd-helpers.js (underutilized - has createPRDLink, getSDByKey)

      Architecture Pattern:
      - Template engine reads SD from database
      - Config files provide SD-specific customizations
      - Single generator script applies template + config
      - Validator ensures schema compliance

      Integration Points:
      - strategic_directives_v2 table (source of SD metadata)
      - product_requirements_v2 table (target for generated PRDs)
      - lib/factories/client-factory.js (Supabase client)
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create PRD template engine',
        description: 'Build a template system that generates PRD data from SD metadata and optional config overrides',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Template reads SD from database using sd_id or legacy_id',
          'Template fills all required PRD fields from SD data',
          'Config overrides allow SD-specific customizations',
          'Generated PRD passes schema validation'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Create unified PRD generator script',
        description: 'Single script that replaces all 74 create-prd-* scripts',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Accepts SD ID as command-line argument',
          'Looks up SD in database and generates PRD',
          'Uses template engine for PRD data construction',
          'Validates and inserts PRD into database'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Create user story generator consolidation',
        description: 'Consolidate 19 add-user-stories-* scripts into template-based system',
        priority: 'HIGH',
        acceptance_criteria: [
          'Single script generates user stories for any SD',
          'Stories follow Given-When-Then format',
          'Acceptance criteria auto-generated from SD success_criteria'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Maintain backward compatibility',
        description: 'Existing scripts continue to work during migration period',
        priority: 'HIGH',
        acceptance_criteria: [
          'Old scripts remain functional until migration complete',
          'Generated PRDs identical in structure to manual ones',
          'No database schema changes required'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'maintainability',
        requirement: 'Single point of maintenance for PRD generation',
        target_metric: '1 template file + 1 generator script'
      },
      {
        type: 'reliability',
        requirement: 'Schema validation before database insert',
        target_metric: '100% of inserts pass validation'
      },
      {
        type: 'usability',
        requirement: 'Clear CLI interface with helpful error messages',
        target_metric: 'Zero-friction SD → PRD workflow'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Use ClientFactory for Supabase access',
        description: 'Use centralized client factory instead of local lazy init',
        dependencies: ['lib/factories/client-factory.js']
      },
      {
        id: 'TR-2',
        requirement: 'Leverage existing prd-schema-validator',
        description: 'Reuse existing validation infrastructure',
        dependencies: ['lib/prd-schema-validator.js']
      },
      {
        id: 'TR-3',
        requirement: 'Support both ESM and CommonJS',
        description: 'Generator must work with existing codebase module patterns',
        dependencies: []
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      Template-based PRD generation with three core components:
      1. PRD Template (lib/templates/prd-template.js) - Defines PRD structure
      2. PRD Generator (scripts/generate-prd.js) - CLI entry point
      3. Config System (config/sd-prd-configs/) - SD-specific overrides

      ## Data Flow
      1. User runs: node scripts/generate-prd.js SD-XXX-001
      2. Generator fetches SD from strategic_directives_v2
      3. Template engine merges SD data + config overrides
      4. Schema validator checks generated PRD
      5. PRD inserted into product_requirements_v2

      ## Component Diagram
      [CLI] → [Generator] → [Template Engine] → [Validator] → [Database]
                  ↓
           [SD Lookup] ←→ [strategic_directives_v2]
                  ↓
           [Config Loader] ←→ [config/sd-prd-configs/*.json]
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'strategic_directives_v2',
          columns: ['id', 'sd_key', 'title', 'description', 'scope', 'success_metrics'],
          relationships: ['Source for PRD generation']
        },
        {
          name: 'product_requirements_v2',
          columns: ['id', 'sd_id', 'directive_id', 'title', 'functional_requirements'],
          relationships: ['Target for generated PRDs']
        }
      ]
    },

    api_specifications: [],  // No API endpoints - this is CLI-only infrastructure

    ui_ux_requirements: [],  // No UI - this is CLI-only infrastructure

    // Implementation
    implementation_approach: `
      ## Phase 1: Template Engine (2-3 hours)
      1. Create lib/templates/prd-template.js with default PRD structure
      2. Implement SD field mapping (SD.description → PRD.executive_summary)
      3. Add config override system for SD-specific customizations
      4. Unit test template generation

      ## Phase 2: Unified Generator (2-3 hours)
      1. Create scripts/generate-prd.js as CLI entry point
      2. Integrate with ClientFactory for Supabase access
      3. Add validation before insert
      4. Test with 3-5 existing SDs

      ## Phase 3: User Story Consolidation (2 hours)
      1. Create scripts/generate-user-stories.js
      2. Template for Given-When-Then format
      3. Auto-generate from SD success_criteria

      ## Phase 4: Migration & Cleanup (2 hours)
      1. Test new generators with all SDs
      2. Archive old scripts (don't delete yet)
      3. Update documentation
    `.trim(),

    technology_stack: [
      'Node.js 20',
      'ESM modules',
      'Supabase JS Client',
      'lib/prd-schema-validator.js',
      'lib/factories/client-factory.js'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'lib/factories/client-factory.js',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'lib/prd-schema-validator.js',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'strategic_directives_v2 table with SD data',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Generate PRD from valid SD',
        description: 'Run generator with existing SD ID, verify PRD created in database',
        expected_result: 'PRD created with all required fields populated',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Handle missing SD gracefully',
        description: 'Run generator with non-existent SD ID',
        expected_result: 'Clear error message, no database changes',
        test_type: 'unit'
      },
      {
        id: 'TS-3',
        scenario: 'Config override applies correctly',
        description: 'Create SD-specific config, verify it overrides template defaults',
        expected_result: 'Generated PRD reflects config values, not defaults',
        test_type: 'integration'
      },
      {
        id: 'TS-4',
        scenario: 'Schema validation catches errors',
        description: 'Attempt to generate PRD with invalid data',
        expected_result: 'Validation error before database insert',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'Single script can generate PRD for any SD in database',
      'Generated PRDs pass prd-schema-validator',
      'Old scripts remain functional during transition',
      'Build passes (npm run lint, npm run typecheck)',
      'At least 3 SDs successfully migrated as proof of concept'
    ],

    performance_requirements: {
      script_execution_time: '<5s',
      database_insert_time: '<1s'
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
        risk: 'Template may not handle all edge cases in existing scripts',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Some SDs may need custom handling outside template',
        mitigation: 'Allow config overrides for any PRD field; maintain escape hatch for truly unique SDs'
      },
      {
        category: 'Migration',
        risk: 'Breaking existing PRD creation during transition',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'SD workflow blocked if both old and new scripts fail',
        mitigation: 'Keep old scripts until new system proven; test with non-critical SDs first'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must work with existing database schema',
        impact: 'Cannot modify product_requirements_v2 table structure'
      },
      {
        type: 'compatibility',
        constraint: 'Must support both ESM and CommonJS import patterns',
        impact: 'Some codebase uses require(), some uses import'
      }
    ],

    assumptions: [
      {
        assumption: 'All SDs have sufficient metadata for PRD generation',
        validation_method: 'Query database for SDs missing required fields'
      },
      {
        assumption: 'prd-schema-validator.js covers all required validations',
        validation_method: 'Review validator against PRD schema documentation'
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
