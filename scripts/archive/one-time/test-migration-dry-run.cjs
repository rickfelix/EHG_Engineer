require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  console.log('=== DRY RUN: Migration Preview ===\n');

  // Get records that would be migrated
  const { data: legacyRecords, error: legacyError } = await supabase
    .from('leo_handoff_executions')
    .select('id, sd_id, handoff_type, from_agent, to_agent, status, created_at')
    .order('created_at', { ascending: true });

  if (legacyError) {
    console.error('Error fetching legacy records:', legacyError);
    process.exit(1);
  }

  // Get existing unified records
  const { data: unifiedRecords, error: unifiedError } = await supabase
    .from('sd_phase_handoffs')
    .select('id');

  if (unifiedError) {
    console.error('Error fetching unified records:', unifiedError);
    process.exit(1);
  }

  const existingIds = new Set(unifiedRecords.map(r => r.id));
  const toMigrate = legacyRecords.filter(r => !existingIds.has(r.id));

  console.log(`Total legacy records: ${legacyRecords.length}`);
  console.log(`Existing unified records: ${unifiedRecords.length}`);
  console.log(`Records to migrate: ${toMigrate.length}\n`);

  console.log('=== Sample of Records to Migrate (first 5) ===');
  toMigrate.slice(0, 5).forEach((record, index) => {
    console.log(`\n${index + 1}. ${record.handoff_type}`);
    console.log(`   SD: ${record.sd_id}`);
    console.log(`   From: ${record.from_agent} → To: ${record.to_agent}`);
    console.log(`   Status: ${record.status}`);
    console.log(`   Created: ${record.created_at}`);
  });

  console.log('\n=== Validation Checks ===');

  // Check for any potential issues
  const invalidPhases = toMigrate.filter(r =>
    !['LEAD', 'PLAN', 'EXEC'].includes(r.from_agent) ||
    !['LEAD', 'PLAN', 'EXEC'].includes(r.to_agent)
  );

  if (invalidPhases.length > 0) {
    console.log(`⚠️  WARNING: ${invalidPhases.length} records have non-standard phases:`);
    invalidPhases.slice(0, 3).forEach(r => {
      console.log(`   - ${r.sd_id}: ${r.from_agent} → ${r.to_agent}`);
    });
  } else {
    console.log('✅ All phases are valid (LEAD, PLAN, EXEC)');
  }

  // Check for duplicate IDs (should be none)
  const duplicateCheck = toMigrate.filter(r => existingIds.has(r.id));
  if (duplicateCheck.length > 0) {
    console.log(`❌ ERROR: ${duplicateCheck.length} duplicate IDs found!`);
  } else {
    console.log('✅ No duplicate IDs (safe to migrate)');
  }

  console.log('\n=== Ready for Migration ===');
  console.log('To execute migration, run the SQL script:');
  console.log('psql [connection-string] -f database/migrations/migrate_legacy_handoffs_to_unified.sql');
})().catch(console.error);
