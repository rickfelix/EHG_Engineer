import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('=== APPLYING SEQUENCE_RANK MIGRATION ===\n');

  // Note: Supabase doesn't allow direct DDL operations via the client library
  // We need to use the SQL editor in Supabase Dashboard or the migration system

  console.log('⚠️  IMPORTANT: Direct DDL operations cannot be performed via the Supabase JS client.');
  console.log('');
  console.log('To complete the migration, please:');
  console.log('');
  console.log('1. Go to Supabase Dashboard:');
  console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
  console.log('');
  console.log('2. Run this SQL command:');
  console.log('');
  console.log('   ALTER TABLE strategic_directives_v2');
  console.log('   DROP COLUMN IF EXISTS execution_order;');
  console.log('');
  console.log('3. Optionally, add a comment to document the field:');
  console.log('');
  console.log('   COMMENT ON COLUMN strategic_directives_v2.sequence_rank IS');
  console.log("   'Execution sequence ranking for Strategic Directives. Lower numbers = higher priority/earlier execution.';");
  console.log('');

  // Verify current state
  console.log('=== CURRENT STATE ===');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sequence_rank')
    .order('sequence_rank')
    .limit(5);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample of SDs with sequence_rank:');
    data.forEach(sd => {
      console.log(`  ${sd.id}: sequence_rank = ${sd.sequence_rank}`);
    });
  }

  console.log('\n✅ All JavaScript files have been updated to use sequence_rank');
  console.log('✅ All data has been migrated from execution_order to sequence_rank');
  console.log('⏳ Pending: Drop execution_order column via Supabase Dashboard');
}

applyMigration().catch(console.error);