#!/usr/bin/env node

/**
 * PRD Creation Script for SD-UNIFIED-PATH-2.1.1
 * Standardize current_lifecycle_stage as canonical 25-stage truth
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

const SD_ID = 'SD-UNIFIED-PATH-2.1.1';
const PRD_TITLE = 'Standardize current_lifecycle_stage as canonical 25-stage truth';

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
    console.error(`❌ Strategic Directive ${SD_ID} not found`);
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
    status: 'approved',
    category: 'database',
    priority: 'high',

    executive_summary: `
This PRD implements the Stage Column Unification by updating the tier 0 stage progression trigger to use the canonical current_lifecycle_stage column.

**What**: Create a database migration to update the prevent_tier0_stage_progression trigger from using deprecated current_stage to current_lifecycle_stage.

**Why**: The existing trigger references a deprecated column, creating a blocking issue for the stage column unification initiative.

**Impact**: Enables tier 0 ventures to be properly blocked at stage 3 using the canonical stage column, completing the Split-Brain Data resolution.
    `.trim(),

    business_context: `
**Problem Statement**:
The prevent_tier0_stage_progression trigger (migration 20251023195744) references the deprecated current_stage column. This creates a data inconsistency risk where the trigger may not fire correctly.

**Solution**:
Create a new migration to DROP the existing trigger and CREATE a new one that references current_lifecycle_stage.

**Success Metrics**:
- Trigger uses NEW.current_lifecycle_stage in condition
- Trigger watches current_lifecycle_stage column changes
- Tier 0 ventures blocked at stage 3
    `.trim(),

    technical_context: `
**Existing Infrastructure**:
- 20251023195744_prevent_tier0_stage_progression.sql: Creates trigger with current_stage
- 20251220_stage_column_unification.sql: Deprecated columns renamed
- 20251220_canonical_stage_lock.sql: Compatibility view exists

**Migration Required**:
Create 20251227_fix_tier0_trigger_canonical_column.sql to:
1. DROP TRIGGER prevent_tier0_stage_progression
2. DROP FUNCTION IF EXISTS prevent_tier0_stage_progression()
3. CREATE new function using current_lifecycle_stage
4. CREATE new trigger on current_lifecycle_stage column
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create Tier 0 Trigger Migration',
        description: 'Create migration file 20251227_fix_tier0_trigger_canonical_column.sql',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Migration file created with proper naming',
          'DROP statements for existing trigger and function',
          'CREATE statements for new function and trigger',
          'Trigger condition: IF NEW.tier = 0 AND NEW.current_lifecycle_stage > 3'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Apply Migration to Database',
        description: 'Apply the migration to update the trigger in Supabase',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Migration runs without errors',
          'Trigger exists with correct column reference',
          'Function exists with correct logic'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Verify Trigger Functionality',
        description: 'Test that tier 0 ventures are blocked from advancing past stage 3',
        priority: 'HIGH',
        acceptance_criteria: [
          'Test with tier 0 venture attempting to advance to stage 4',
          'Exception is raised with proper message',
          'Non-tier-0 ventures can advance normally'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Audit Deprecated Column References',
        description: 'Search for any remaining code references to deprecated columns',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'grep returns 0 for current_stage in active code',
          'Only DEPRECATED_ prefixed columns remain',
          'No TypeScript/JavaScript using deprecated columns'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Update Documentation',
        description: 'Add comments documenting the canonical column',
        priority: 'LOW',
        acceptance_criteria: [
          'Migration includes explanatory comments',
          'One Column Law documented in migration'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'data_integrity',
        requirement: 'No data loss during trigger update',
        target_metric: 'Zero data migration errors'
      },
      {
        type: 'backward_compatibility',
        requirement: 'Trigger behavior unchanged for valid operations',
        target_metric: 'Same blocking behavior as original'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'PostgreSQL trigger migration',
        description: 'Use CREATE OR REPLACE FUNCTION and CREATE TRIGGER syntax',
        dependencies: ['Existing trigger in database']
      }
    ],

    system_architecture: `
## Database Changes

### Migration: 20251227_fix_tier0_trigger_canonical_column.sql

\`\`\`sql
-- Drop existing trigger and function
DROP TRIGGER IF EXISTS prevent_tier0_stage_progression ON ventures;
DROP FUNCTION IF EXISTS prevent_tier0_stage_progression();

-- Create new function using canonical column
CREATE OR REPLACE FUNCTION prevent_tier0_stage_progression()
RETURNS TRIGGER AS $$
BEGIN
  -- Tier 0 ventures cannot progress beyond stage 3
  IF NEW.tier = 0 AND NEW.current_lifecycle_stage > 3 THEN
    RAISE EXCEPTION 'Tier 0 ventures cannot progress beyond stage 3';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on canonical column
CREATE TRIGGER prevent_tier0_stage_progression
  BEFORE INSERT OR UPDATE OF current_lifecycle_stage, tier
  ON ventures
  FOR EACH ROW
  EXECUTE FUNCTION prevent_tier0_stage_progression();

-- Document the canonical column
COMMENT ON COLUMN ventures.current_lifecycle_stage IS
  'CANONICAL stage column (1-25). This is the ONLY stage column. All others are DEPRECATED.';
\`\`\`
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'ventures',
          columns: ['current_lifecycle_stage INTEGER (1-25)'],
          relationships: ['FK to lifecycle_stage_config']
        }
      ]
    },

    api_specifications: [],

    ui_ux_requirements: [],

    implementation_approach: `
## Implementation Steps

### Step 1: Create Migration File
Create /database/migrations/20251227_fix_tier0_trigger_canonical_column.sql

### Step 2: Apply Migration
Run via Supabase dashboard or CLI

### Step 3: Verify Trigger
Test with tier 0 venture UPDATE

### Step 4: Code Audit
Run grep to verify no deprecated references remain
    `.trim(),

    technology_stack: [
      'PostgreSQL 15 (Supabase)',
      'PL/pgSQL triggers'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'SD-UNIFIED-PATH-2.1 (Parent)',
        status: 'in_progress',
        blocker: false
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Tier 0 blocked at stage 3',
        description: 'Attempt to update tier 0 venture to stage 4',
        expected_result: 'Exception: Tier 0 ventures cannot progress beyond stage 3',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'Non-tier-0 can advance',
        description: 'Update tier 1+ venture to stage 4',
        expected_result: 'Update succeeds',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'Migration file created and applied',
      'Trigger references current_lifecycle_stage only',
      'Tier 0 ventures blocked at stage 3',
      'grep returns 0 for deprecated column references in active code'
    ],

    performance_requirements: {
      page_load_time: 'N/A',
      api_response_time: 'N/A',
      concurrent_users: 'N/A'
    },

    plan_checklist: [
      { text: 'PRD created', checked: true },
      { text: 'Migration design documented', checked: true },
      { text: 'Test scenarios defined', checked: true }
    ],

    exec_checklist: [
      { text: 'Migration file created', checked: false },
      { text: 'Migration applied', checked: false },
      { text: 'Trigger verified', checked: false },
      { text: 'Code audit passed', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Trigger works correctly', checked: false }
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
        risk: 'Trigger recreation fails',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Tier 0 ventures unprotected',
        mitigation: 'Test migration in staging first'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use current_lifecycle_stage',
        impact: 'Canonical column only'
      }
    ],

    assumptions: [
      {
        assumption: 'Existing trigger can be dropped safely',
        validation_method: 'Migration includes DROP IF EXISTS'
      }
    ],

    stakeholders: [
      {
        name: 'Database Agent',
        role: 'Migration Validation',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),

    metadata: {
      parent: 'SD-UNIFIED-PATH-2.1',
      grandparent: 'SD-UNIFIED-PATH-2.0',
      migration_file: '20251227_fix_tier0_trigger_canonical_column.sql',
      exploration_summary: [
        { file_path: '/database/migrations/20251023195744_prevent_tier0_stage_progression.sql', finding: 'Current trigger uses deprecated current_stage' },
        { file_path: '/database/migrations/20251220_stage_column_unification.sql', finding: 'Deprecated columns renamed' },
        { file_path: '/database/migrations/20251220_canonical_stage_lock.sql', finding: 'Compatibility view exists' },
        { file_path: '/lib/agents/venture-state-machine.js', finding: 'Uses current_lifecycle_stage correctly' },
        { file_path: '/tests/e2e/venture-lifecycle/phase4-the-blueprint.spec.ts', finding: 'Tests use canonical column' }
      ]
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

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', prdId)
    .single();

  if (existing) {
    await supabase.from('product_requirements_v2').delete().eq('id', prdId);
    console.log('   Deleted existing PRD');
  }

  console.log('\n5️⃣  Inserting PRD...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed:', insertError.message);
    process.exit(1);
  }

  console.log('\n✅ PRD created successfully!');
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   Status: ${insertedPRD.status}`);
}

createPRD().catch(console.error);
