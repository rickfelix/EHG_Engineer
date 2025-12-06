#!/usr/bin/env node
/**
 * SD-VISION-TRANSITION-001C: Apply Stage Constraints Migration
 * Updates CHECK constraints from 40 to 25 stages (Venture Vision v2.0)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('='.repeat(60));
  console.log('Venture Vision v2.0: Stage Constraints Migration');
  console.log('SD: SD-VISION-TRANSITION-001C');
  console.log('='.repeat(60));

  // The migration SQL statements
  const migrations = [
    {
      name: 'Update compliance_violations CHECK constraint',
      sql: 'ALTER TABLE compliance_violations DROP CONSTRAINT IF EXISTS compliance_violations_stage_number_check'
    },
    {
      name: 'Add new compliance_violations CHECK constraint (1-25)',
      sql: 'ALTER TABLE compliance_violations ADD CONSTRAINT compliance_violations_stage_number_check CHECK (stage_number BETWEEN 1 AND 25)'
    },
    {
      name: 'Update compliance_events CHECK constraint',
      sql: 'ALTER TABLE compliance_events DROP CONSTRAINT IF EXISTS compliance_events_stage_number_check'
    },
    {
      name: 'Add new compliance_events CHECK constraint (1-25)',
      sql: 'ALTER TABLE compliance_events ADD CONSTRAINT compliance_events_stage_number_check CHECK (stage_number BETWEEN 1 AND 25)'
    },
    {
      name: 'Update compliance_checks default total_stages',
      sql: 'ALTER TABLE compliance_checks ALTER COLUMN total_stages SET DEFAULT 25'
    }
  ];

  console.log('\nAttempting migration via Supabase...\n');

  for (const migration of migrations) {
    console.log(`\n[EXEC] ${migration.name}`);
    console.log(`  SQL: ${migration.sql.substring(0, 60)}...`);

    try {
      // Try executing via raw SQL if available
      const { error } = await supabase.from('_migrations_log').select('id').limit(0);
      console.log('  Status: Migration requires direct SQL execution');
      console.log('  Action: Execute in Supabase Dashboard SQL Editor');
    } catch (e) {
      console.log(`  Note: ${e.message}`);
    }
  }

  // Output the full migration for manual execution
  console.log('\n' + '='.repeat(60));
  console.log('MANUAL EXECUTION REQUIRED');
  console.log('='.repeat(60));
  console.log('\nCopy and execute this SQL in Supabase Dashboard:');
  console.log('https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new\n');

  const fullSql = `
-- SD-VISION-TRANSITION-001C: Venture Vision v2.0 Stage Constraints
-- Execute this SQL to update stage constraints from 40 to 25

-- 1. Update compliance_violations constraint
ALTER TABLE compliance_violations
  DROP CONSTRAINT IF EXISTS compliance_violations_stage_number_check;
ALTER TABLE compliance_violations
  ADD CONSTRAINT compliance_violations_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 25);

-- 2. Update compliance_events constraint
ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_stage_number_check;
ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 25);

-- 3. Update compliance_checks default
ALTER TABLE compliance_checks
  ALTER COLUMN total_stages SET DEFAULT 25;

-- Verification query:
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('compliance_violations'::regclass, 'compliance_events'::regclass)
  AND contype = 'c';
`;

  console.log(fullSql);

  // Verify current state
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION: Current Database State');
  console.log('='.repeat(60));

  // Test compliance_checks default
  const { data: testRecord, error: testError } = await supabase
    .from('compliance_checks')
    .insert({
      run_id: `TEST-MIGRATION-${Date.now()}`,
      run_type: 'manual',
      status: 'cancelled',
      created_by: 'migration-test'
    })
    .select('total_stages')
    .single();

  if (!testError && testRecord) {
    console.log(`\ncompliance_checks.total_stages default: ${testRecord.total_stages}`);
    console.log('Expected: 25 (if migration applied) or 40 (if not yet applied)');

    // Clean up test record
    await supabase.from('compliance_checks').delete().eq('run_id', `TEST-MIGRATION-${Date.now()}`);
  } else {
    console.log(`\nCould not verify: ${testError?.message || 'unknown error'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SCRIPT COMPLETE');
  console.log('='.repeat(60));
  console.log('\nNext Steps:');
  console.log('1. Execute the SQL above in Supabase Dashboard');
  console.log('2. Run verification query to confirm constraints');
  console.log('3. Mark migration as applied in deployment log');
}

applyMigration().catch(console.error);
