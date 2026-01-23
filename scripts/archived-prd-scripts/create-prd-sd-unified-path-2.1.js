#!/usr/bin/env node

/**
 * PRD Creation Script for SD-UNIFIED-PATH-2.1
 * Stage Column Unification - Lock current_lifecycle_stage as canonical
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

const SD_ID = 'SD-UNIFIED-PATH-2.1';
const PRD_TITLE = 'Stage Column Unification';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    id: prdId,
    sd_id: SD_ID,
    directive_id: SD_ID,

    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'database',
    priority: 'critical',

    executive_summary: `
This PRD establishes current_lifecycle_stage as the single canonical stage column, eliminating the Split-Brain Data crisis.

**What**: Code refactoring to remove all references to deprecated stage columns (current_workflow_stage, current_stage) and update the tier 0 trigger to use the canonical column.

**Why**: The Microscope Audit identified three competing stage columns creating data inconsistency risks. Unification ensures reliable stage management across the entire system.

**Impact**: All code paths use a single source of truth for venture stage data, preventing data drift and simplifying queries.
    `.trim(),

    business_context: `
**Problem Statement**:
Three stage columns exist in the ventures table:
- current_lifecycle_stage (CANONICAL - 207 occurrences)
- current_workflow_stage (DEPRECATED - 26 occurrences)
- current_stage (DEPRECATED - 99 occurrences)

**Solution**:
Refactor all code to use current_lifecycle_stage exclusively. The deprecated columns have been renamed with DEPRECATED_ prefix and a compatibility view exists.

**Success Metrics**:
- grep -r returns 0 matches for current_workflow_stage in active code
- grep -r returns 0 matches for current_stage in active code
- Tier 0 trigger fires correctly on current_lifecycle_stage
    `.trim(),

    technical_context: `
**Existing Infrastructure**:
- Migration 20251220_stage_column_unification.sql: Renamed deprecated columns
- Migration 20251220_canonical_stage_lock.sql: Created compatibility view
- fn_validate_stage_column(): Validates 1-25 range
- v_ventures_stage_compat: Backward compatibility view

**BLOCKING ISSUE**:
Trigger in 20251023195744_prevent_tier0_stage_progression.sql still references current_stage directly. Must create migration to update trigger to use current_lifecycle_stage.

**Child SD**:
- SD-UNIFIED-PATH-2.1.1: Standardize current_lifecycle_stage as canonical 25-stage truth
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Update Tier 0 Trigger',
        description: 'Create migration to update prevent_tier0_stage_progression trigger to use current_lifecycle_stage instead of current_stage.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'New migration file created with proper naming convention',
          'Trigger condition uses NEW.current_lifecycle_stage',
          'Trigger watches current_lifecycle_stage column changes',
          'Tier 0 ventures blocked from advancing past stage 3'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Code Audit for Deprecated References',
        description: 'Search and update any remaining code references to deprecated stage columns.',
        priority: 'HIGH',
        acceptance_criteria: [
          'grep search finds 0 matches for current_workflow_stage in .ts/.js/.sql files',
          'grep search finds 0 matches for current_stage in active code',
          'All imports and type definitions updated'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Validate Compatibility View',
        description: 'Ensure v_ventures_stage_compat provides proper aliasing for backward compatibility.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'View returns current_lifecycle_stage as all aliased columns',
          'Existing queries using deprecated columns still work via view'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Document Deprecation',
        description: 'Add migration comments documenting the deprecation of old columns.',
        priority: 'LOW',
        acceptance_criteria: [
          'Migration includes COMMENT ON COLUMN for deprecated columns',
          'README or documentation updated with deprecation notice'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Test Stage Transitions',
        description: 'Verify all E2E tests use current_lifecycle_stage correctly.',
        priority: 'HIGH',
        acceptance_criteria: [
          'All venture lifecycle tests pass',
          'Stage transitions work correctly',
          'No test failures related to stage columns'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'data_integrity',
        requirement: 'No data loss during code refactoring',
        target_metric: 'Zero data migration errors'
      },
      {
        type: 'backward_compatibility',
        requirement: 'Existing queries work via compatibility view',
        target_metric: 'View provides all aliased columns'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'PostgreSQL trigger update migration',
        description: 'Migration file to DROP and recreate tier 0 trigger with correct column reference',
        dependencies: ['20251023195744_prevent_tier0_stage_progression.sql']
      }
    ],

    system_architecture: `
## Database Schema

The ventures table uses current_lifecycle_stage (INTEGER 1-25) as the canonical stage column.

### Trigger Update Required
\`\`\`sql
-- Current (DEPRECATED):
IF NEW.tier = 0 AND NEW.current_stage > 3 THEN ...
BEFORE INSERT OR UPDATE OF current_stage

-- Target (CANONICAL):
IF NEW.tier = 0 AND NEW.current_lifecycle_stage > 3 THEN ...
BEFORE INSERT OR UPDATE OF current_lifecycle_stage
\`\`\`

### Compatibility View
v_ventures_stage_compat provides:
- current_workflow_stage AS current_lifecycle_stage
- current_stage AS current_lifecycle_stage
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'ventures',
          columns: ['current_lifecycle_stage INTEGER (1-25)', 'DEPRECATED_current_workflow_stage', 'DEPRECATED_current_stage'],
          relationships: ['FK to lifecycle_stage_config via current_lifecycle_stage']
        }
      ]
    },

    api_specifications: [],

    ui_ux_requirements: [],

    implementation_approach: `
## Phase 1: Trigger Migration
1. Create migration: 20251227_fix_tier0_trigger_canonical_column.sql
2. DROP existing trigger prevent_tier0_stage_progression
3. CREATE new trigger with current_lifecycle_stage reference
4. Test with tier 0 venture

## Phase 2: Code Audit
1. Run grep to find deprecated column references
2. Update any remaining references
3. Verify all tests pass

## Phase 3: Validation
1. Confirm grep returns 0 matches
2. Validate tier 0 trigger works
3. Run E2E tests
    `.trim(),

    technology_stack: [
      'PostgreSQL 15 (Supabase)',
      'Database triggers',
      'Row Level Security (RLS)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'SD-UNIFIED-PATH-2.0 (Parent)',
        status: 'in_progress',
        blocker: false
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Verify tier 0 trigger blocks stage advancement',
        description: 'Attempt to advance tier 0 venture past stage 3',
        expected_result: 'Exception raised: Tier 0 ventures cannot progress beyond stage 3',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Verify grep returns no deprecated references',
        description: 'Run grep -r for current_workflow_stage and current_stage',
        expected_result: '0 matches in active code files',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'grep -r current_workflow_stage returns 0 in active code',
      'grep -r current_stage returns 0 in active code (excluding DEPRECATED_ prefixed)',
      'Tier 0 trigger fires correctly on current_lifecycle_stage',
      'All E2E tests pass'
    ],

    performance_requirements: {
      page_load_time: 'N/A (backend only)',
      api_response_time: 'N/A (backend only)',
      concurrent_users: 'N/A'
    },

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Trigger migration requirements documented', checked: true },
      { text: 'Code audit scope defined', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true }
    ],

    exec_checklist: [
      { text: 'Trigger migration created', checked: false },
      { text: 'Migration applied to database', checked: false },
      { text: 'Code audit completed', checked: false },
      { text: 'E2E tests passing', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'grep verification passed', checked: false },
      { text: 'Tier 0 trigger validated', checked: false }
    ],

    progress: 20,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 100,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    risks: [
      {
        category: 'Technical',
        risk: 'Trigger recreation breaks existing functionality',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Tier 0 ventures unprotected during migration',
        mitigation: 'Test in isolated environment first'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use current_lifecycle_stage exclusively',
        impact: 'All new code uses canonical column'
      }
    ],

    assumptions: [
      {
        assumption: 'Deprecated columns have been renamed with DEPRECATED_ prefix',
        validation_method: 'Check 20251220_stage_column_unification.sql migration'
      }
    ],

    stakeholders: [
      {
        name: 'Database Agent',
        role: 'Schema Validation',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),

    metadata: {
      orchestrator: true,
      children: ['SD-UNIFIED-PATH-2.1.1'],
      parent: 'SD-UNIFIED-PATH-2.0',
      blocking_issue: 'Tier 0 trigger references deprecated current_stage'
    },

    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists! Deleting and recreating...`);
    await supabase.from('product_requirements_v2').delete().eq('id', prdId);
  }

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

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Run PLAN-TO-EXEC handoff');
  console.log('   2. Process child SD-UNIFIED-PATH-2.1.1');
  console.log('');
}

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
