#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

console.log('Checking UAT tables in database...\n');

// Check what UAT tables exist
const tables = ['uat_runs', 'uat_cases', 'uat_results', 'uat_defects', 'v_uat_run_stats'];

for (const table of tables) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (!error) {
    console.log(`✅ Table exists: ${table} (${count || 0} rows)`);
  } else {
    console.log(`❌ Table not found: ${table}`);
  }
}

console.log('\n📌 Migration guide available at: scripts/uat-migration-guide.md');
console.log('📦 SQL migration file: database/migrations/uat-simple-tracking.sql');