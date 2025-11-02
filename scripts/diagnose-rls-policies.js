#!/usr/bin/env node

/**
 * RLS Policy Diagnostic Script
 * Purpose: Query Supabase database to verify RLS policies for intelligence_analysis and activity_logs
 * Date: 2025-10-30
 */

import { createSupabaseClient } from '../lib/supabase-client.js';

async function diagnosePolicies() {
  console.log('🔍 Diagnosing RLS Policies for intelligence_analysis and activity_logs\n');
  console.log('=' .repeat(80));

  const supabase = createSupabaseClient();

  // Query 1: Check policies on intelligence_analysis
  console.log('\n📊 INTELLIGENCE_ANALYSIS POLICIES:');
  console.log('-'.repeat(80));

  const { data: intelligencePolicies, error: intelligenceError } = await supabase
    .rpc('get_policies_for_table', { table_name: 'intelligence_analysis' });

  if (intelligenceError) {
    console.error('❌ Error querying intelligence_analysis policies:', intelligenceError.message);

    // Fallback: Try direct query
    console.log('\n🔄 Attempting direct SQL query...');
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'intelligence_analysis');

    if (fallbackError) {
      console.error('❌ Fallback also failed. Using custom query...');

      // Final fallback: Execute raw SQL
      const sqlQuery = `
        SELECT
          schemaname,
          tablename,
          policyname,
          permissive,
          roles::text[] as roles,
          cmd,
          qual,
          with_check
        FROM pg_policies
        WHERE tablename = 'intelligence_analysis'
        ORDER BY policyname;
      `;

      console.log('\nExecuting SQL:\n', sqlQuery);
      console.log('\n⚠️  Manual execution required. Run this in Supabase SQL Editor.\n');
    } else if (fallbackData) {
      console.log(`✅ Found ${fallbackData.length} policies:`);
      fallbackData.forEach(policy => {
        console.log(`\n  Policy: ${policy.policyname}`);
        console.log(`    Command: ${policy.cmd}`);
        console.log(`    Roles: ${policy.roles}`);
        console.log(`    Using: ${policy.qual}`);
        console.log(`    With Check: ${policy.with_check}`);
      });
    }
  } else if (intelligencePolicies) {
    console.log(`✅ Found ${intelligencePolicies.length} policies:`);
    intelligencePolicies.forEach(policy => {
      console.log(`\n  Policy: ${policy.policyname}`);
      console.log(`    Command: ${policy.cmd}`);
      console.log(`    Roles: ${policy.roles}`);
    });
  }

  // Query 2: Check policies on activity_logs
  console.log('\n\n📊 ACTIVITY_LOGS POLICIES:');
  console.log('-'.repeat(80));

  const { data: activityPolicies, error: activityError } = await supabase
    .rpc('get_policies_for_table', { table_name: 'activity_logs' });

  if (activityError) {
    console.error('❌ Error querying activity_logs policies:', activityError.message);
    console.log('\n⚠️  Manual execution required in Supabase SQL Editor:');
    console.log(`
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles::text[] as roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'activity_logs'
ORDER BY policyname;
    `);
  } else if (activityPolicies) {
    console.log(`✅ Found ${activityPolicies.length} policies:`);
    activityPolicies.forEach(policy => {
      console.log(`\n  Policy: ${policy.policyname}`);
      console.log(`    Command: ${policy.cmd}`);
      console.log(`    Roles: ${policy.roles}`);
    });
  }

  // Query 3: Check if migration was applied
  console.log('\n\n📋 MIGRATION HISTORY:');
  console.log('-'.repeat(80));

  const { data: migrations, error: migrationError } = await supabase
    .from('schema_migrations')
    .select('version, name')
    .or('name.ilike.%intelligence%,name.ilike.%activity%')
    .order('version', { ascending: false });

  if (migrationError) {
    console.error('❌ Could not query migration history:', migrationError.message);
  } else if (migrations && migrations.length > 0) {
    console.log(`✅ Found ${migrations.length} related migrations:`);
    migrations.forEach(migration => {
      console.log(`  - ${migration.version}: ${migration.name}`);
    });
  } else {
    console.log('⚠️  No migration records found (table may not exist)');
  }

  // Query 4: Test actual access
  console.log('\n\n🧪 TESTING ACTUAL DATABASE ACCESS:');
  console.log('-'.repeat(80));

  // Test SELECT on intelligence_analysis
  console.log('\nTest 1: SELECT from intelligence_analysis...');
  const { data: testSelect, error: testSelectError } = await supabase
    .from('intelligence_analysis')
    .select('id, agent_type, created_at')
    .limit(1);

  if (testSelectError) {
    console.error(`❌ SELECT FAILED: ${testSelectError.message} (Code: ${testSelectError.code})`);
  } else {
    console.log(`✅ SELECT succeeded (returned ${testSelect?.length || 0} rows)`);
  }

  // Test INSERT on activity_logs (will fail if user not authenticated)
  console.log('\nTest 2: INSERT into activity_logs (expecting failure - no auth)...');
  const { error: testInsertError } = await supabase
    .from('activity_logs')
    .insert({
      user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
      activity_type: 'test',
      activity_action: 'diagnostic_test',
      metadata: { source: 'diagnose-rls-policies.js' }
    });

  if (testInsertError) {
    console.error(`❌ INSERT FAILED: ${testInsertError.message} (Code: ${testInsertError.code})`);
    console.log('   👉 This is EXPECTED if using anon key without auth');
  } else {
    console.log('✅ INSERT succeeded (unexpected - check RLS!)');
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📝 DIAGNOSTIC SUMMARY:\n');
  console.log('Next steps:');
  console.log('1. Run the SQL queries above in Supabase SQL Editor');
  console.log('2. Verify service_role_full_access_* policies exist');
  console.log('3. Check Edge Function is using SUPABASE_SERVICE_ROLE_KEY');
  console.log('4. Review Edge Function logs for actual error details');
  console.log('\n');
}

diagnosePolicies().catch(console.error);
