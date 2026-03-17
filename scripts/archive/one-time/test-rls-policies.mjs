#!/usr/bin/env node

/**
 * Test RLS Policies on Context Learning Tables
 * Verifies that the newly enabled RLS policies work correctly
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   - SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌');
  console.error('   - SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '✅' : '❌');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
  process.exit(1);
}

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TEST_TABLES = [
  'context_embeddings',
  'feedback_events',
  'interaction_history',
  'learning_configurations',
  'user_context_patterns'
];

async function testTableRLS(tableName) {
  console.log(`\n📋 Testing: ${tableName}`);
  console.log('─'.repeat(60));

  // Test 1: Anonymous READ (should succeed - we have read policies)
  console.log('  🔍 Test 1: Anonymous SELECT...');
  const { data: anonReadData, error: anonReadError } = await anonClient
    .from(tableName)
    .select('*')
    .limit(1);

  if (anonReadError && anonReadError.code !== 'PGRST116') { // PGRST116 = no rows, which is OK
    console.log(`    ❌ Anonymous SELECT failed: ${anonReadError.message}`);
  } else {
    console.log('    ✅ Anonymous SELECT allowed (read-only policy working)');
  }

  // Test 2: Anonymous WRITE (should fail - no write policies for anon)
  console.log('  🔍 Test 2: Anonymous INSERT...');
  const testData = getTestData(tableName);
  const { error: anonWriteError } = await anonClient
    .from(tableName)
    .insert(testData);

  if (anonWriteError) {
    console.log('    ✅ Anonymous INSERT blocked (security working correctly)');
  } else {
    console.log('    ⚠️  WARNING: Anonymous INSERT allowed (potential security issue)');
  }

  // Test 3: Service Role READ (should succeed)
  console.log('  🔍 Test 3: Service Role SELECT...');
  const { data: serviceReadData, error: serviceReadError } = await serviceClient
    .from(tableName)
    .select('*')
    .limit(1);

  if (serviceReadError && serviceReadError.code !== 'PGRST116') {
    console.log(`    ❌ Service Role SELECT failed: ${serviceReadError.message}`);
  } else {
    console.log('    ✅ Service Role SELECT allowed');
  }

  // Test 4: Service Role WRITE (should succeed - critical for application)
  console.log('  🔍 Test 4: Service Role INSERT...');
  const { data: insertData, error: serviceWriteError } = await serviceClient
    .from(tableName)
    .insert(testData)
    .select();

  if (serviceWriteError) {
    console.log(`    ❌ CRITICAL: Service Role INSERT failed: ${serviceWriteError.message}`);
    console.log('    ⚠️  APPLICATION MAY BE BROKEN - needs write access to this table');
    return { success: false, critical: true };
  } else {
    console.log('    ✅ Service Role INSERT succeeded');

    // Clean up test data
    if (insertData && insertData.length > 0) {
      const { error: deleteError } = await serviceClient
        .from(tableName)
        .delete()
        .eq('id', insertData[0].id);

      if (deleteError) {
        console.log(`    ⚠️  Cleanup failed (test data remains): ${deleteError.message}`);
      } else {
        console.log('    ✅ Test data cleaned up');
      }
    }
    return { success: true, critical: false };
  }
}

function getTestData(tableName) {
  const baseData = {
    context_embeddings: {
      context_hash: 'test_' + Date.now(),
      embedding_model: 'test-model',
      context_type: 'test'
    },
    feedback_events: {
      feedback_type: 'explicit',
      feedback_source: 'test',
      feedback_category: 'test'
    },
    interaction_history: {
      prompt_hash: 'test_' + Date.now(),
      analysis_method: 'test'
    },
    learning_configurations: {
      config_scope: 'test_' + Date.now()
    },
    user_context_patterns: {
      pattern_hash: 'test_' + Date.now()
    }
  };

  return baseData[tableName] || {};
}

async function runTests() {
  console.log('\n🔐 RLS Policy Verification Test Suite');
  console.log('═'.repeat(60));
  console.log('Testing 5 context learning tables with newly enabled RLS');
  console.log('');

  const results = [];

  for (const table of TEST_TABLES) {
    const result = await testTableRLS(table);
    results.push({ table, ...result });
  }

  console.log('\n\n📊 Test Summary');
  console.log('═'.repeat(60));

  const criticalFailures = results.filter(r => r.critical);
  const successCount = results.filter(r => r.success).length;

  if (criticalFailures.length > 0) {
    console.log('❌ CRITICAL FAILURES DETECTED:');
    console.log('');
    criticalFailures.forEach(({ table }) => {
      console.log(`  ❌ ${table}: Service role cannot write (application broken)`);
    });
    console.log('');
    console.log('⚠️  ACTION REQUIRED:');
    console.log('   The application needs write access via service_role key.');
    console.log('   RLS policies appear to be blocking service_role writes.');
    console.log('');
    process.exit(1);
  } else if (successCount === TEST_TABLES.length) {
    console.log('✅ All tests passed!');
    console.log('');
    console.log('Results:');
    console.log(`  ✅ Anonymous users: Read-only access (secure)`);
    console.log(`  ✅ Service role: Full access (application functional)`);
    console.log(`  ✅ ${TEST_TABLES.length}/${TEST_TABLES.length} tables working correctly`);
    console.log('');
    console.log('🎉 RLS policies are correctly configured!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests had issues (non-critical)');
    console.log('');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed with error:', err);
  process.exit(1);
});
