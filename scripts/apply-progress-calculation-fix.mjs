#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔧 Applying Progress Calculation Fix Migration');
console.log('═'.repeat(70));

// Read the migration SQL
const migrationSQL = readFileSync('database/migrations/fix_calculate_sd_progress_no_prd_bug.sql', 'utf8');

// Extract just the CREATE OR REPLACE FUNCTION part (remove comments)
const functionSQL = migrationSQL
  .split('\n')
  .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
  .join('\n');

console.log('\n📝 Applying migration...\n');

try {
  // Execute the migration via RPC (raw SQL execution)
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: functionSQL
  });

  if (error) {
    // exec_sql might not exist, try direct query
    console.log('⚠️  exec_sql not available, trying direct approach...');

    // Alternative: Read the SQL and execute via pg-promise or similar
    // For now, let's manually execute via Supabase admin API
    throw new Error(`Cannot execute migration directly: ${error.message}`);
  }

  console.log('✅ Migration applied successfully');

  // Now verify and update all SDs at 65%
  console.log('\n📊 Verifying impact on SDs at 65%...\n');

  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('id, progress_percentage')
    .eq('progress_percentage', 65)
    .limit(5);

  console.log(`Testing ${sds.length} SDs:\n`);

  for (const sd of sds) {
    const { data: newProgress } = await supabase.rpc('calculate_sd_progress', {
      sd_id_param: sd.id
    });

    console.log(`   ${sd.id.padEnd(25)}: ${sd.progress_percentage}% → ${newProgress}%`);
  }

  console.log('\n✅ Migration verification complete!');

} catch (err) {
  console.error('\n❌ Migration failed:', err.message);
  console.error('\nℹ️  Please apply migration manually via Supabase SQL Editor:');
  console.error('   1. Open Supabase Dashboard → SQL Editor');
  console.error('   2. Copy contents of: database/migrations/fix_calculate_sd_progress_no_prd_bug.sql');
  console.error('   3. Execute the migration');
  console.error('   4. Run this script again to verify and update SDs');
}
