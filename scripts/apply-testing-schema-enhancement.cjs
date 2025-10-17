#!/usr/bin/env node
/**
 * Apply Database Migration: Enhanced Testing Status Schema
 * Adds granular test metrics to sd_testing_status table
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 Applying Testing Schema Enhancement');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check if columns already exist
  const { data: existing, error: checkError } = await supabase
    .from('sd_testing_status')
    .select('*')
    .limit(1);

  if (checkError) {
    console.error('❌ Error checking table:', checkError.message);
    return;
  }

  if (existing && existing[0]) {
    const hasNewColumns = 'coverage_percentage' in existing[0];
    if (hasNewColumns) {
      console.log('✅ Schema already enhanced - columns exist');
      console.log('   Skipping migration\n');
      return;
    }
  }

  console.log('⚠️  Direct SQL migration requires Supabase dashboard access\n');
  console.log('📋 Manual Steps:');
  console.log('───────────────────────────────────────────────────────────');
  console.log('1. Open Supabase SQL Editor:');
  console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql\n');
  console.log('2. Copy the SQL from:');
  console.log('   database/schema/enhance_sd_testing_status.sql\n');
  console.log('3. Paste and execute in SQL Editor\n');
  console.log('4. Verify with: SELECT * FROM sd_testing_status LIMIT 1;\n');

  console.log('📝 Columns to be added:');
  console.log('   - unit_test_count');
  console.log('   - unit_tests_passed');
  console.log('   - unit_tests_failed');
  console.log('   - e2e_test_count');
  console.log('   - e2e_tests_passed');
  console.log('   - e2e_tests_failed');
  console.log('   - coverage_percentage');
  console.log('   - test_output_log_path\n');

  console.log('═══════════════════════════════════════════════════════════\n');
}

applyMigration();
