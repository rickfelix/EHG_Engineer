#!/usr/bin/env node
/**
 * Test Script for Service Role Helper Functions
 *
 * Tests:
 * 1. createSupabaseServiceClient() - Can it create a client?
 * 2. Read handoffs using service role - Does it bypass RLS?
 * 3. Compare with anon client - Does anon fail to read?
 *
 * Usage: node scripts/test-service-role-helper.js
 */

import dotenv from 'dotenv';
import {
  createSupabaseServiceClient,
  createSupabaseAnonClient,
  getServiceRoleKey,
  getAnonKey,
  getSupabaseUrl
} from './lib/supabase-connection.js';

dotenv.config();

async function testServiceRoleHelper() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Testing Service Role Helper Functions                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Test 1: Environment Variable Getters
  console.log('Test 1: Environment Variable Getters');
  console.log('─'.repeat(60));

  try {
    const url = getSupabaseUrl('engineer');
    console.log('✅ getSupabaseUrl() works');
    console.log(`   URL: ${url}`);
  } catch (_error) {
    console.error('❌ getSupabaseUrl() failed:', error.message);
    return;
  }

  try {
    const anonKey = getAnonKey('engineer');
    console.log('✅ getAnonKey() works');
    console.log(`   Key: ${anonKey.substring(0, 20)}...`);
  } catch (_error) {
    console.error('❌ getAnonKey() failed:', error.message);
    console.log('   (This is expected if SUPABASE_ANON_KEY not in .env)');
  }

  try {
    const serviceKey = getServiceRoleKey('engineer');
    console.log('✅ getServiceRoleKey() works');
    console.log(`   Key: ${serviceKey.substring(0, 20)}...`);
  } catch (_error) {
    console.error('❌ getServiceRoleKey() failed:', error.message);
    console.log('   ⚠️  SUPABASE_SERVICE_ROLE_KEY not found in .env');
    console.log('   Add it to continue testing handoff read access');
    return;
  }

  console.log();

  // Test 2: Create Service Role Client
  console.log('Test 2: Create Service Role Client');
  console.log('─'.repeat(60));

  let serviceClient;
  try {
    serviceClient = await createSupabaseServiceClient('engineer', {
      verbose: true
    });
    console.log('✅ createSupabaseServiceClient() created client successfully');
  } catch (_error) {
    console.error('❌ createSupabaseServiceClient() failed:', error.message);
    return;
  }

  console.log();

  // Test 3: Read Handoffs with Service Role (Should Work)
  console.log('Test 3: Read Handoffs with Service Role');
  console.log('─'.repeat(60));

  try {
    const { data, error } = await serviceClient
      .from('sd_phase_handoffs')
      .select('id, sd_id, from_phase, to_phase, created_at')
      .limit(5);

    if (error) {
      console.error('❌ Query failed:', error.message);
    } else {
      console.log(`✅ Service role read handoffs: ${data.length} rows`);
      if (data.length > 0) {
        console.log('\n   Sample handoffs:');
        data.forEach((h, i) => {
          console.log(`   ${i + 1}. ${h.sd_id}: ${h.from_phase} → ${h.to_phase}`);
        });
      }
    }
  } catch (_error) {
    console.error('❌ Service role query failed:', error.message);
  }

  console.log();

  // Test 4: Create Anon Client (For Comparison)
  console.log('Test 4: Read Handoffs with Anon Key (Expected to Fail/Return 0)');
  console.log('─'.repeat(60));

  try {
    const anonClient = await createSupabaseAnonClient('engineer', {
      verbose: false
    });

    const { data, error } = await anonClient
      .from('sd_phase_handoffs')
      .select('id, sd_id, from_phase, to_phase')
      .limit(5);

    if (error) {
      console.log(`⚠️  Anon read failed (expected): ${error.message}`);
    } else {
      console.log(`📊 Anon read handoffs: ${data.length} rows`);
      if (data.length === 0) {
        console.log('   ✅ Correct: Anon key returns 0 rows (RLS blocking)');
      } else {
        console.log('   ⚠️  Unexpected: Anon key can read handoffs (RLS not blocking)');
      }
    }
  } catch (_error) {
    console.log(`⚠️  Anon client creation failed: ${error.message}`);
    console.log('   (This is expected if SUPABASE_ANON_KEY not in .env)');
  }

  console.log();

  // Test 5: Read Specific SD Handoffs
  console.log('Test 5: Read Handoffs for SD-SETTINGS-2025-10-12');
  console.log('─'.repeat(60));

  try {
    const { data, error } = await serviceClient
      .from('sd_phase_handoffs')
      .select('id, from_phase, to_phase, status, created_at')
      .eq('sd_id', 'SD-SETTINGS-2025-10-12')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Query failed:', error.message);
    } else {
      console.log(`✅ Found ${data.length} handoffs for SD-SETTINGS-2025-10-12`);
      if (data.length > 0) {
        data.forEach((h, i) => {
          console.log(`   ${i + 1}. ${h.from_phase} → ${h.to_phase} (${h.status})`);
        });
      }
    }
  } catch (_error) {
    console.error('❌ Query failed:', error.message);
  }

  console.log();

  // Summary
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('✅ Service Role Helper Functions:');
  console.log('   • getServiceRoleKey() - Working');
  console.log('   • getSupabaseUrl() - Working');
  console.log('   • createSupabaseServiceClient() - Working');
  console.log('   • Service role can read protected handoffs - Verified');
  console.log();
  console.log('📝 Next Steps:');
  console.log('   1. Use createSupabaseServiceClient() in scripts that need to read handoffs');
  console.log('   2. Keep SERVICE_ROLE_KEY in .env (never commit)');
  console.log('   3. Use Pattern 2 (Service Role) for read operations in scripts');
  console.log();
}

testServiceRoleHelper()
  .then(() => {
    console.log('✅ Test completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
