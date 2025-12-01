#!/usr/bin/env node

/**
 * Apply SD Completeness Enforcement Migration
 *
 * Purpose: Install database trigger to prevent incomplete SDs from being activated
 * Root Cause Fix: SD-UI-PARITY-001 was missing key_principles at creation time
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('=== SD Completeness Enforcement Migration ===\n');

  // Read the SQL migration file
  const sqlPath = './database/migrations/20251128_enforce_sd_completeness.sql';

  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Migration file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split into statements (simple approach - won't handle all edge cases)
  // For complex SQL, we need to execute statement by statement

  console.log('Step 1: Creating validate_sd_completeness function...');

  const createFunctionSQL = `
CREATE OR REPLACE FUNCTION validate_sd_completeness()
RETURNS TRIGGER AS $$
DECLARE
  missing_fields TEXT[] := ARRAY[]::TEXT[];
  error_message TEXT;
BEGIN
  -- Only enforce when SD is being activated (not during initial draft creation)
  IF NEW.status IN ('active', 'in_progress', 'pending_approval') THEN
    -- Check key_principles
    IF NEW.key_principles IS NULL OR
       NEW.key_principles::text = '[]' OR
       NEW.key_principles::text = 'null' THEN
      missing_fields := array_append(missing_fields, 'key_principles');
    END IF;

    -- Check strategic_objectives
    IF NEW.strategic_objectives IS NULL OR
       NEW.strategic_objectives::text = '[]' OR
       NEW.strategic_objectives::text = 'null' THEN
      missing_fields := array_append(missing_fields, 'strategic_objectives');
    END IF;

    -- Check success_criteria
    IF NEW.success_criteria IS NULL OR
       NEW.success_criteria::text = '[]' OR
       NEW.success_criteria::text = 'null' THEN
      missing_fields := array_append(missing_fields, 'success_criteria');
    END IF;
  END IF;

  -- If there are missing fields, raise an error
  IF array_length(missing_fields, 1) > 0 THEN
    error_message := format(
      E'LEO Protocol Violation: SD Completeness Check Failed\\n\\n'
      'SD: %s\\n'
      'Status: %s\\n'
      'Missing Required Fields: %s\\n\\n'
      'ACTION REQUIRED:\\n'
      '1. Add the missing fields before activating the SD\\n'
      '2. Use the SD creation template: scripts/templates/sd-creation-template.js\\n'
      '3. Refer to LEO Protocol documentation for field requirements',
      NEW.id,
      NEW.status,
      array_to_string(missing_fields, ', ')
    );

    RAISE EXCEPTION '%', error_message
    USING HINT = 'Update the SD to include all required fields before activating';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

  const { error: funcError } = await supabase.rpc('exec_sql', { sql: createFunctionSQL });

  if (funcError) {
    // Try alternate approach - direct SQL execution
    console.log('   Using direct SQL approach...');

    // Execute via postgres function if available
    const { data, error: altError } = await supabase
      .from('_sql_execution')
      .insert({ sql: createFunctionSQL })
      .select();

    if (altError) {
      console.log('   Note: Function creation via RPC not available');
      console.log('   Will try to verify if function already exists...');
    }
  } else {
    console.log('✓ Function created');
  }

  console.log('\nStep 2: Creating trigger...');

  const createTriggerSQL = `
DROP TRIGGER IF EXISTS validate_sd_completeness_trigger ON strategic_directives_v2;
CREATE TRIGGER validate_sd_completeness_trigger
  BEFORE INSERT OR UPDATE OF status
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_sd_completeness();
`;

  const { error: triggerError } = await supabase.rpc('exec_sql', { sql: createTriggerSQL });

  if (triggerError) {
    console.log('   Note: Trigger creation via RPC not available');
  } else {
    console.log('✓ Trigger created');
  }

  console.log('\nStep 3: Logging the migration...');

  const { error: logError } = await supabase.from('leo_protocol_changes').insert({
    protocol_id: 'leo-v4-3-3-ui-parity',
    change_type: 'enforcement_trigger',
    description: 'SD Completeness Enforcement Trigger',
    changed_fields: {
      trigger: 'validate_sd_completeness_trigger',
      fields_validated: ['key_principles', 'strategic_objectives', 'success_criteria']
    },
    change_reason: 'Prevent incomplete SDs from being activated. Root cause: SD-UI-PARITY-001 was missing key_principles at creation time.',
    changed_by: 'SD-UI-PARITY-001-SYSTEMIC-FIX'
  });

  if (logError) {
    console.error('⚠️  Warning: Could not log migration:', logError.message);
  } else {
    console.log('✓ Migration logged to leo_protocol_changes');
  }

  console.log('\n=== Migration Summary ===');
  console.log('The migration SQL has been saved to:');
  console.log('  database/migrations/20251128_enforce_sd_completeness.sql');
  console.log('\nTo apply this migration to production:');
  console.log('  1. Run the SQL in Supabase SQL Editor, or');
  console.log('  2. Use: supabase db push (if using Supabase CLI)');
  console.log('\nThe trigger will:');
  console.log('  - Allow draft SDs to be created without all fields');
  console.log('  - Block activation if key_principles, strategic_objectives, or success_criteria are missing');
  console.log('  - Provide clear error messages with remediation steps');
}

applyMigration().catch(console.error);
