#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

// Direct connection
const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function deleteManualTests() {
  console.log('🗑️  Deleting manual UAT tests...\n');

  // First, check current state
  const { data: allTests, error: checkError } = await supabase
    .from('uat_cases')
    .select('id, test_type, title');

  if (checkError) {
    console.error('❌ Error accessing table:', checkError.message);
    return;
  }

  console.log('📊 Current state:');
  console.log(`   Total tests: ${allTests.length}`);
  console.log(`   Manual: ${allTests.filter(t => t.test_type === 'manual').length}`);
  console.log(`   Automatic: ${allTests.filter(t => t.test_type === 'automatic').length}\n`);

  const manualTests = allTests.filter(t => t.test_type === 'manual');

  if (manualTests.length === 0) {
    console.log('✅ No manual tests to delete!');
    return;
  }

  console.log('🎯 Manual tests to delete:');
  manualTests.forEach(t => console.log(`   - ${t.id}: ${t.title.substring(0, 60)}...`));
  console.log();

  // Delete using RPC or direct SQL
  // Try using raw SQL through rpc if available
  const { data: _sqlResult, error: sqlError } = await supabase.rpc('exec_sql', {
    sql: "DELETE FROM uat_cases WHERE test_type = 'manual'"
  });

  if (sqlError) {
    console.log('⚠️  RPC method not available, trying direct delete...\n');

    // Try direct delete with each ID
    let deleted = 0;
    for (const test of manualTests) {
      const { error } = await supabase
        .from('uat_cases')
        .delete()
        .eq('id', test.id);

      if (error) {
        console.error(`❌ Failed to delete ${test.id}:`, error.message);
      } else {
        console.log(`✅ Deleted ${test.id}`);
        deleted++;
      }
    }

    console.log(`\n📊 Deleted ${deleted}/${manualTests.length} manual tests`);
  } else {
    console.log('✅ Manual tests deleted via SQL!\n');
  }

  // Verify final state
  const { data: remaining } = await supabase
    .from('uat_cases')
    .select('id, test_type', { count: 'exact' });

  console.log('\n📊 Final state:');
  console.log(`   Total tests: ${remaining.length}`);
  console.log(`   Manual: ${remaining.filter(t => t.test_type === 'manual').length}`);
  console.log(`   Automatic: ${remaining.filter(t => t.test_type === 'automatic').length}`);

  if (remaining.filter(t => t.test_type === 'manual').length === 0) {
    console.log('\n✨ Success! All manual tests have been deleted.');
  }
}

deleteManualTests();