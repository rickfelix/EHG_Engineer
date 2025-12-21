#!/usr/bin/env node

/**
 * Verify Settings Tables Migration (SD-UAT-020)
 * Checks that profiles and user_preferences tables were created successfully
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from EHG app
dotenv.config({ path: path.join(__dirname, '../../ehg/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in /mnt/c/_EHG/EHG/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔍 Verifying Settings Tables Migration (SD-UAT-020)\n');
console.log(`📍 Database: ${supabaseUrl}`);
console.log('═══════════════════════════════════════════════════\n');

async function verifyMigration() {
  const results = {
    profilesTableExists: false,
    preferencesTableExists: false,
    rlsEnabled: false,
    policiesExist: false,
    triggersExist: false
  };

  // Test 1: Check if profiles table exists
  console.log('1️⃣  Checking profiles table...');
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .limit(0);

  if (profilesError) {
    if (profilesError.message.includes('does not exist') || profilesError.message.includes('schema cache')) {
      console.log('   ❌ Profiles table does NOT exist');
      console.log(`      Error: ${profilesError.message}\n`);
    } else {
      console.log('   ✅ Profiles table exists (RLS may be blocking anonymous access - this is expected)');
      results.profilesTableExists = true;
    }
  } else {
    console.log('   ✅ Profiles table exists and accessible');
    results.profilesTableExists = true;
  }

  // Test 2: Check if user_preferences table exists
  console.log('\n2️⃣  Checking user_preferences table...');
  const { data: prefsData, error: prefsError } = await supabase
    .from('user_preferences')
    .select('*')
    .limit(0);

  if (prefsError) {
    if (prefsError.message.includes('does not exist') || prefsError.message.includes('schema cache')) {
      console.log('   ❌ User_preferences table does NOT exist');
      console.log(`      Error: ${prefsError.message}\n`);
    } else {
      console.log('   ✅ User_preferences table exists (RLS may be blocking anonymous access - this is expected)');
      results.preferencesTableExists = true;
    }
  } else {
    console.log('   ✅ User_preferences table exists and accessible');
    results.preferencesTableExists = true;
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 Migration Verification Summary:\n');

  if (results.profilesTableExists && results.preferencesTableExists) {
    console.log('✅ MIGRATION SUCCESSFUL!');
    console.log('   • Profiles table: EXISTS');
    console.log('   • User_preferences table: EXISTS');
    console.log('\n📋 Next Steps:');
    console.log('   1. Create test user at http://localhost:8080/login');
    console.log('   2. Navigate to /settings');
    console.log('   3. Test all three settings tabs');
    console.log('   4. Verify data persists after refresh\n');
    return true;
  } else {
    console.log('❌ MIGRATION NOT COMPLETE');
    if (!results.profilesTableExists) {
      console.log('   • Profiles table: MISSING');
    }
    if (!results.preferencesTableExists) {
      console.log('   • User_preferences table: MISSING');
    }
    console.log('\n📋 Action Required:');
    console.log('   Execute migration SQL in Supabase Dashboard:');
    console.log('   1. Go to: https://supabase.com/dashboard/project/liapbndqlqxdcgpwntbv');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy contents of: /mnt/c/_EHG/EHG/supabase/migrations/20251001140000_create_settings_tables.sql');
    console.log('   4. Execute the SQL');
    console.log('   5. Re-run this verification script\n');
    return false;
  }
}

verifyMigration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  });
