#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-INFRA-VALIDATION with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-INFRA-VALIDATION'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Add Infrastructure SD Validation Support to LEO Protocol - Technical Implementation'; // TODO: Replace with your PRD title

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

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.uuid_id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    id: prdId,
    sd_uuid: sdData.uuid_id,        // CRITICAL: Required for handoff validation
    directive_id: SD_ID,             // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'infrastructure',
    priority: 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
      LEO Protocol's validation system currently assumes all Strategic Directives require E2E tests for completion.
      This blocks infrastructure SDs (CI/CD, database, security) from completing automatically, requiring manual
      intervention. This PRD implements type-aware validation to distinguish infrastructure SDs from feature SDs,
      enabling proper progress calculation for all SD types.

      Key deliverables: (1) Add sd_type column to strategic_directives_v2 table with enum validation,
      (2) Update calculate_sd_progress() function to skip E2E validation for infrastructure SDs,
      (3) Maintain backward compatibility for existing feature SDs.

      Impact: Eliminates manual workarounds for infrastructure SD completion, proven by SD-CICD-WORKFLOW-FIX
      completion attempt that revealed 12 NULL deliverables blocking progress.
    `.trim(),

    business_context: `
      Current pain point: Infrastructure SDs cannot complete through normal LEO Protocol flow, causing:
      - Manual status updates required (database workarounds)
      - Progress calculation failures (NULL deliverables)
      - Handoff system confusion (validation expects E2E tests that don't exist)

      Business value: Automated completion for all SD types increases throughput, reduces context switching
      for LEAD agents, and eliminates technical debt from manual workarounds.

      Success criteria: SD-CICD-WORKFLOW-FIX can complete automatically with type='infrastructure',
      existing feature SDs maintain current behavior (zero regression).
    `.trim(),

    technical_context: `
      Existing system: LEO Protocol v4.2.0 with 5-phase workflow (LEAD→PLAN→EXEC→PLAN→LEAD).
      Progress calculation in database/migrations/fix_calculate_sd_progress_explicit.sql checks:
      - EXEC phase: sd_scope_deliverables completion
      - PLAN verification: user_stories.validation_status = 'validated'
      - Assumes all SDs have UI components requiring E2E tests

      Architecture constraint: PostgreSQL function (calculate_sd_progress) must maintain backward compatibility.
      Integration points: Unified handoff system, user story validation, PRD deliverable tracking.

      Root cause: No sd_type detection in validation logic, treating all SDs as feature SDs.
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Add sd_type column to strategic_directives_v2 table',
        description: 'New enum column to classify SDs by type (feature, infrastructure, database, security, documentation). Defaults to "feature" for backward compatibility.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Column exists in strategic_directives_v2 with NOT NULL constraint',
          'Enum validation restricts to valid types only',
          'Default value is "feature" for existing records',
          'Migration script runs successfully on production schema'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Update calculate_sd_progress() function with type-aware validation',
        description: 'Modify PostgreSQL function to check sd_type and skip E2E validation for infrastructure/database/security SDs. Feature SDs maintain existing E2E requirements.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Infrastructure SDs validate against unit tests instead of E2E tests',
          'Feature SDs maintain existing validation logic (no regression)',
          'Function returns correct progress for both SD types',
          'Documentation updated with new validation rules'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Backward compatibility for existing feature SDs',
        description: 'All existing SDs default to type="feature" and maintain current validation behavior',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Zero regression in existing SD progress calculations',
          'All active feature SDs continue to validate correctly',
          'Handoff system continues to work for feature SDs',
          'No manual updates required for existing records'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Validate against SD-CICD-WORKFLOW-FIX regression test',
        description: 'Use SD-CICD-WORKFLOW-FIX as test case to prove infrastructure SDs can complete',
        priority: 'HIGH',
        acceptance_criteria: [
          'SD-CICD-WORKFLOW-FIX marked as type="infrastructure"',
          'Progress calculation returns 100% when requirements met',
          'Handoff creation succeeds without E2E test requirements',
          'Completion flow works end-to-end without manual intervention'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Progress calculation must complete in <500ms',
        target_metric: 'calculate_sd_progress() execution time <500ms for all SD types'
      },
      {
        type: 'reliability',
        requirement: 'Zero downtime migration for sd_type column addition',
        target_metric: 'Migration completes without locking strategic_directives_v2 table'
      },
      {
        type: 'maintainability',
        requirement: 'Type validation logic centralized in single function',
        target_metric: 'All validation rules in calculate_sd_progress(), no scattered logic'
      },
      {
        type: 'backward_compatibility',
        requirement: 'Existing feature SDs maintain 100% current behavior',
        target_metric: 'Zero regression in progress calculation for feature SDs'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'PostgreSQL enum type for sd_type column',
        description: 'Use CHECK constraint or custom enum type to validate sd_type values. Must support: feature, infrastructure, database, security, documentation',
        dependencies: ['PostgreSQL 12+', 'Supabase migrations system']
      },
      {
        id: 'TR-2',
        requirement: 'Function signature compatibility for calculate_sd_progress()',
        description: 'Maintain existing function signature (sd_id_param VARCHAR) RETURNS INTEGER. No breaking changes to function interface.',
        dependencies: ['Existing calculate_sd_progress() function in database/migrations/fix_calculate_sd_progress_explicit.sql']
      },
      {
        id: 'TR-3',
        requirement: 'Unit tests for progress calculation logic',
        description: 'Test coverage for both feature and infrastructure SD validation paths. Regression tests against historical SDs.',
        dependencies: ['Node.js test framework', 'Supabase client', '@supabase/supabase-js']
      }
    ],

    // Architecture & Design
    system_architecture: `
      ## Architecture Overview
      Extends LEO Protocol v4.2.0 database layer with type classification system. No UI components required.

      Components:
      1. Database Layer: strategic_directives_v2 table + sd_type column
      2. Validation Layer: calculate_sd_progress() function with conditional logic
      3. Migration Layer: 3 migration scripts for schema changes

      ## Data Flow
      1. SD created → sd_type assigned (manual or auto-detected)
      2. Progress calculation triggered → calculate_sd_progress(sd_id) executed
      3. Function checks sd_type → Routes to appropriate validation logic:
         - feature: Check E2E tests + deliverables
         - infrastructure/database/security: Check unit tests + deliverables (skip E2E)
      4. Returns progress integer (0-100)

      ## Integration Points
      - Unified handoff system (sd_phase_handoffs table)
      - User story validation (user_stories.validation_status)
      - PRD deliverable tracking (product_requirements_v2.metadata.deliverables)
      - PostgreSQL triggers (if any exist for progress updates)
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'strategic_directives_v2',
          columns: [
            'id VARCHAR (PK)',
            'uuid_id UUID',
            'sd_type VARCHAR(50) NOT NULL DEFAULT \'feature\' CHECK (sd_type IN (\'feature\', \'infrastructure\', \'database\', \'security\', \'documentation\'))',
            'status VARCHAR',
            'progress INTEGER',
            'current_phase VARCHAR',
            'created_at TIMESTAMP',
            'updated_at TIMESTAMP'
          ],
          relationships: [
            'product_requirements_v2.sd_uuid → strategic_directives_v2.uuid_id',
            'user_stories.sd_id → strategic_directives_v2.id'
          ]
        }
      ],
      functions: [
        {
          name: 'calculate_sd_progress',
          signature: '(sd_id_param VARCHAR) RETURNS INTEGER',
          description: 'Calculates progress across 5 phases. Enhanced with sd_type awareness.'
        }
      ]
    },

    api_specifications: [
      // No API changes required - infrastructure SD only
    ],

    ui_ux_requirements: [
      // No UI changes required - database/function updates only
    ],

    // Implementation
    implementation_approach: `
      ## Phase 1: Schema Migration (2 hours)
      1. Create migration: database/migrations/add_sd_type_column.sql
         - Add sd_type column with CHECK constraint
         - Set default value to 'feature'
         - Backfill existing records with 'feature'
      2. Create migration: database/migrations/update_sd_cicd_workflow_fix_type.sql
         - Update SD-CICD-WORKFLOW-FIX to sd_type='infrastructure' for testing
      3. Run migrations in development environment
      4. Verify schema changes with query scripts

      ## Phase 2: Function Update (2 hours)
      1. Read current calculate_sd_progress() function logic
      2. Add sd_type detection at function start
      3. Implement conditional validation logic:
         - IF sd_type IN ('infrastructure', 'database', 'security') THEN skip E2E validation
         - ELSE maintain existing validation (feature SDs)
      4. Update function documentation
      5. Create migration: database/migrations/update_calculate_sd_progress_with_type.sql

      ## Phase 3: Testing & Validation (2 hours)
      1. Create unit tests: tests/unit/calculate-sd-progress.test.js
         - Test feature SD validation (existing behavior)
         - Test infrastructure SD validation (new behavior)
         - Test backward compatibility
      2. Regression test: Run progress calculation on SD-CICD-WORKFLOW-FIX
         - Verify progress = 100% with sd_type='infrastructure'
         - Verify handoff creation succeeds
      3. Run migrations in staging environment
      4. Manual verification of 5 historical SDs (2 feature, 3 infrastructure)
    `.trim(),

    technology_stack: [
      'PostgreSQL 12+ (Supabase)',
      'Supabase Migrations System',
      'PL/pgSQL (function programming)',
      'Node.js 18+ (test scripts)',
      '@supabase/supabase-js (client library)',
      'dotenv (configuration)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'SD-CICD-WORKFLOW-FIX completion evidence',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'calculate_sd_progress() function (existing)',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'strategic_directives_v2 table schema',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Feature SD progress calculation (backward compatibility)',
        description: 'Verify existing feature SDs maintain current validation behavior after sd_type column addition',
        expected_result: 'Feature SDs with E2E tests pass validation, progress calculates correctly',
        test_type: 'unit'
      },
      {
        id: 'TS-2',
        scenario: 'Infrastructure SD progress calculation (new behavior)',
        description: 'Verify infrastructure SDs skip E2E validation and validate against unit tests',
        expected_result: 'Infrastructure SDs with unit tests pass validation, progress = 100%',
        test_type: 'unit'
      },
      {
        id: 'TS-3',
        scenario: 'SD-CICD-WORKFLOW-FIX regression test',
        description: 'Mark SD-CICD-WORKFLOW-FIX as sd_type=infrastructure and run progress calculation',
        expected_result: 'Progress = 100%, handoff creation succeeds, completion flow works',
        test_type: 'integration'
      },
      {
        id: 'TS-4',
        scenario: 'Migration rollback test',
        description: 'Test that migrations can be rolled back without data loss',
        expected_result: 'Rollback succeeds, data integrity maintained',
        test_type: 'integration'
      },
      {
        id: 'TS-5',
        scenario: 'Type validation constraint test',
        description: 'Attempt to insert invalid sd_type values to verify CHECK constraint',
        expected_result: 'Invalid values rejected, only valid enum values accepted',
        test_type: 'unit'
      }
    ],

    acceptance_criteria: [
      'FR-1: sd_type column exists in strategic_directives_v2 with CHECK constraint',
      'FR-2: calculate_sd_progress() function updated with type-aware validation logic',
      'FR-3: Zero regression in feature SD progress calculations',
      'FR-4: SD-CICD-WORKFLOW-FIX completes automatically with sd_type=infrastructure',
      'All unit tests passing (5/5 test scenarios)',
      'Database Architect review completed and approved',
      'Migration scripts tested in development and staging environments',
      'Documentation updated with new validation rules'
    ],

    performance_requirements: {
      progress_calculation_time: '<500ms',
      migration_execution_time: '<30s',
      zero_downtime_deployment: true
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
        risk: 'Regression in feature SD validation',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Existing feature SDs fail to complete, breaking LEO Protocol workflow',
        mitigation: 'Comprehensive unit tests for backward compatibility, test against 5 historical feature SDs before deployment'
      },
      {
        category: 'Data',
        risk: 'Migration fails in production',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'strategic_directives_v2 table locked or data corrupted',
        mitigation: 'Test migrations in staging, use non-blocking ADD COLUMN with default value, maintain rollback scripts'
      },
      {
        category: 'Validation',
        risk: 'sd_type misclassification',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'SDs validated with wrong rules (infrastructure SD expecting E2E tests)',
        mitigation: 'Conservative defaults (all SDs default to "feature"), manual review during SD creation, audit trail in sd_type column'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Cannot change function signature for calculate_sd_progress()',
        impact: 'Must maintain backward compatibility with existing callers'
      },
      {
        type: 'database',
        constraint: 'Zero downtime requirement for migrations',
        impact: 'Cannot use blocking ALTER TABLE operations'
      },
      {
        type: 'validation',
        constraint: 'Must support both validation paths (feature + infrastructure)',
        impact: 'Increased complexity in progress calculation logic'
      }
    ],

    assumptions: [
      {
        assumption: 'Infrastructure SDs do not require E2E tests',
        validation_method: 'Review SD-CICD-WORKFLOW-FIX evidence (no UI components, CI/CD only)'
      },
      {
        assumption: 'Feature SDs always have E2E test requirements',
        validation_method: 'Historical analysis of completed feature SDs'
      },
      {
        assumption: 'Default sd_type="feature" is safe for existing records',
        validation_method: 'Manual review of all active SDs before migration'
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
  console.log(`   SD UUID: ${insertedPRD.sd_uuid}`);
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
