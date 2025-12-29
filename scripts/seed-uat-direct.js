#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

// Direct connection
const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

const testCases = [
  // Just a few test cases to verify
  { id: 'TEST-AUTH-001', section: 'Authentication', priority: 'critical', title: 'Standard Login' },
  { id: 'TEST-DASH-001', section: 'Dashboard', priority: 'critical', title: 'Dashboard Initial Load' },
  { id: 'TEST-VENT-001', section: 'Ventures', priority: 'critical', title: 'View All Ventures' }
];

async function seedDirect() {
  console.log('🌱 Testing direct insert...\n');

  // First check if table is accessible
  const { data: _existing, error: checkError } = await supabase
    .from('uat_cases')
    .select('id')
    .limit(1);

  if (checkError) {
    console.error('❌ Table not accessible:', checkError.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('1. The table exists but may need RLS policies');
    console.log('2. Run migration via Supabase Dashboard SQL Editor');
    console.log('3. Check: database/migrations/uat-simple-tracking.sql');
    return;
  }

  console.log('✅ Table is accessible, inserting test cases...\n');

  // Clear existing data
  const { error: deleteError } = await supabase
    .from('uat_cases')
    .delete()
    .neq('id', '');

  if (deleteError) {
    console.log('Note: Could not clear existing data:', deleteError.message);
  }

  // Insert one by one
  let inserted = 0;
  for (const testCase of testCases) {
    const { error } = await supabase
      .from('uat_cases')
      .insert(testCase);

    if (error) {
      console.error(`❌ Failed to insert ${testCase.id}:`, error.message);
    } else {
      console.log(`✅ Inserted ${testCase.id}`);
      inserted++;
    }
  }

  console.log(`\n📊 Summary: ${inserted}/${testCases.length} test cases inserted`);

  if (inserted === testCases.length) {
    console.log('✨ Success! Now run full seeding script.');
  }
}

seedDirect();