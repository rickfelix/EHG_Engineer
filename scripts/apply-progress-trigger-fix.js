#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Need service role for DDL
);

console.log('🔧 Applying Progress Trigger Table Consolidation Fix');
console.log('='.repeat(60));

// Read migration file
const migrationSQL = fs.readFileSync(
  'database/migrations/20251015_fix_progress_trigger_table_consolidation.sql',
  'utf8'
);

// Execute migration
console.log('Executing migration...\n');

const { data, error } = await supabase.rpc('exec_sql', {
  sql: migrationSQL
});

if (error) {
  console.error('❌ Migration failed:', error.message);
  console.error('Details:', error);
  process.exit(1);
}

console.log('✅ Migration applied successfully');
console.log('\nTesting progress calculation...');

// Test with SD-KNOWLEDGE-001
const { data: breakdown, error: breakdownError } = await supabase.rpc('get_progress_breakdown', {
  sd_id_param: 'SD-KNOWLEDGE-001'
});

if (breakdownError) {
  console.error('❌ Test failed:', breakdownError.message);
} else {
  console.log('\n📊 Updated Progress for SD-KNOWLEDGE-001:');
  console.log(JSON.stringify(breakdown, null, 2));

  if (breakdown.total_progress >= 80) {
    console.log('\n✅ Progress calculation working correctly!');
  } else {
    console.log('\n⚠️  Progress still below 80% - additional fixes needed');
  }
}
