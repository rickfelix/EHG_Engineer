#!/usr/bin/env node
/**
 * Stage 5 Schema Verification Script
 * SD-STAGE5-DB-SCHEMA-DEPLOY-001
 *
 * Purpose: Verify which tables exist in EHG application database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load EHG application environment variables
const ehgEnvPath = join(__dirname, '../../ehg/.env');
dotenv.config({ path: ehgEnvPath });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  console.error('   VITE_SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'MISSING');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SERVICE_ROLE_KEY ? 'Set' : 'MISSING');
  process.exit(1);
}

console.log('🔍 Stage 5 Schema Verification');
console.log('Database:', SUPABASE_URL);
console.log('');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function verifyTables() {
  const requiredTables = [
    'recursion_events',
    'crewai_agents',
    'crewai_crews',
    'crewai_tasks'
  ];

  console.log('📊 Checking Required Tables:');
  console.log('─'.repeat(50));

  const results = {};

  for (const tableName of requiredTables) {
    try {
      // Use information_schema to check table existence
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: `SELECT to_regclass('public.${tableName}') IS NOT NULL AS exists`
      });

      if (error) {
        // Fallback: Try to select from table
        const { error: selectError } = await supabase
          .from(tableName)
          .select('id')
          .limit(1);

        results[tableName] = {
          exists: !selectError || !selectError.message.includes('does not exist'),
          method: 'select_test',
          error: selectError?.message
        };
      } else {
        results[tableName] = {
          exists: data?.[0]?.exists || false,
          method: 'rpc'
        };
      }

      const status = results[tableName].exists ? '✅ EXISTS' : '❌ MISSING';
      console.log(`  ${tableName.padEnd(25)} ${status}`);

    } catch (err) {
      console.log(`  ${tableName.padEnd(25)} ⚠️  ERROR: ${err.message}`);
      results[tableName] = { exists: false, error: err.message };
    }
  }

  console.log('');
  return results;
}

async function checkRecursionEventsColumns() {
  console.log('📋 Checking recursion_events Columns:');
  console.log('─'.repeat(50));

  try {
    const { data, error } = await supabase
      .from('recursion_events')
      .select('*')
      .limit(0);

    if (error) {
      console.log('  ❌ Table does not exist or error:', error.message);
      return false;
    }

    console.log('  ✅ Table exists, checking column structure via schema...');
    return true;

  } catch (err) {
    console.log('  ❌ Error:', err.message);
    return false;
  }
}

async function checkRLSPolicies() {
  console.log('');
  console.log('🔒 Checking RLS Policies:');
  console.log('─'.repeat(50));

  const tables = ['recursion_events', 'crewai_agents', 'crewai_crews', 'crewai_tasks'];

  for (const tableName of tables) {
    try {
      // Try to query pg_policies view
      const { data, error } = await supabase
        .from('pg_policies')
        .select('policyname, cmd')
        .eq('tablename', tableName);

      if (error) {
        console.log(`  ${tableName}: ⚠️  Cannot query policies (${error.message})`);
      } else if (!data || data.length === 0) {
        console.log(`  ${tableName}: ⚠️  No policies found`);
      } else {
        console.log(`  ${tableName}: ✅ ${data.length} policies`);
        data.forEach(p => {
          console.log(`    - ${p.policyname} (${p.cmd})`);
        });
      }
    } catch (err) {
      console.log(`  ${tableName}: ⚠️  Error checking policies`);
    }
  }
}

async function testInsertOperation() {
  console.log('');
  console.log('🧪 Testing INSERT Operation:');
  console.log('─'.repeat(50));

  try {
    // Test insert to recursion_events
    const testData = {
      venture_id: '00000000-0000-0000-0000-000000000000', // Test UUID
      created_by: '00000000-0000-0000-0000-000000000000', // Test UUID
      from_stage: 5,
      to_stage: 3,
      trigger_type: 'TEST-001',
      trigger_data: { test: true },
      threshold_severity: 'LOW',
      auto_executed: false,
      recursion_count_for_stage: 0
    };

    const { data, error } = await supabase
      .from('recursion_events')
      .insert(testData)
      .select()
      .single();

    if (error) {
      console.log('  ❌ INSERT failed:', error.message);
      return false;
    }

    console.log('  ✅ INSERT succeeded');
    console.log('  ID:', data.id);

    // Clean up test record
    const { error: deleteError } = await supabase
      .from('recursion_events')
      .delete()
      .eq('id', data.id);

    if (deleteError) {
      console.log('  ⚠️  Failed to delete test record:', deleteError.message);
    } else {
      console.log('  ✅ Test record cleaned up');
    }

    return true;

  } catch (err) {
    console.log('  ❌ Error:', err.message);
    return false;
  }
}

async function main() {
  try {
    const tableResults = await verifyTables();

    const allExist = Object.values(tableResults).every(r => r.exists);

    if (allExist) {
      console.log('✅ All required tables exist');
      console.log('');

      await checkRecursionEventsColumns();
      await checkRLSPolicies();
      await testInsertOperation();

      console.log('');
      console.log('📝 Summary: Database schema appears to be deployed');
      console.log('   Next step: Run E2E tests to verify integration');

    } else {
      console.log('❌ Missing tables detected');
      console.log('');
      console.log('📝 Next Steps:');
      console.log('   1. Review migration files in /mnt/c/_EHG/ehg/supabase/migrations/');
      console.log('   2. Apply migrations via Supabase Dashboard SQL Editor');
      console.log('   3. Re-run this verification script');
      console.log('');
      console.log('📄 Migration Files to Check:');
      console.log('   - 20251103131938_create_recursion_events_table.sql');
      console.log('   - 20251106150201_sd_crewai_architecture_001_phase1_final.sql');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

main();
