import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSchema() {
  console.log('🔍 SCHEMA MISMATCH INVESTIGATION\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get user_stories schema
  console.log('📋 user_stories table schema:');
  const { data: userStoriesSchema, error: usError } = await supabase
    .rpc('get_table_schema', { table_name: 'user_stories' });

  if (usError) {
    console.error('   ❌ Error:', usError.message);
  } else {
    console.log('   Columns:');
    userStoriesSchema.forEach(col => {
      console.log(`     - ${col.column_name} (${col.data_type})`);
    });
  }
  console.log();

  // Get product_requirements_v2 schema
  console.log('📄 product_requirements_v2 table schema:');
  const { data: prdSchema, error: prdError } = await supabase
    .rpc('get_table_schema', { table_name: 'product_requirements_v2' });

  if (prdError) {
    console.error('   ❌ Error:', prdError.message);
  } else {
    console.log('   Columns (showing only relevant ones):');
    prdSchema.forEach(col => {
      if (col.column_name.includes('deliver') ||
          col.column_name.includes('metadata') ||
          col.column_name.includes('status') ||
          col.column_name.includes('progress')) {
        console.log(`     ✨ ${col.column_name} (${col.data_type})`);
      }
    });
  }
  console.log();

  console.log('🔍 ROOT CAUSE ANALYSIS:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('The progress calculation function checks for columns that');
  console.log('do NOT exist in the actual schema:');
  console.log('  ❌ user_stories.e2e_test_mapped');
  console.log('  ❌ product_requirements_v2.deliverables');
  console.log();
  console.log('This suggests:');
  console.log('  1. The progress calculation logic is outdated');
  console.log('  2. OR a schema migration is missing');
  console.log('  3. OR the progress calculation needs schema updates');
  console.log();
  console.log('RECOMMENDED SOLUTION:');
  console.log('  Create a database migration to add missing columns');
  console.log('  OR update the progress calculation to use existing columns');
}

checkSchema().catch(console.error);
