#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkRLS() {
  console.log('🔍 Checking RLS Policy Status\n');

  // Test 1: system_health INSERT
  console.log('1️⃣  Testing system_health INSERT...');
  const { data: healthTest, error: healthError } = await supabase
    .from('system_health')
    .insert({
      service_name: 'test_service_temp',
      circuit_breaker_state: 'closed',
      failure_count: 0
    })
    .select();

  if (healthError) {
    console.log('   ❌ BLOCKED:', healthError.message);
  } else {
    console.log('   ✅ INSERT allowed');
    // Clean up test data
    await supabase.from('system_health').delete().eq('service_name', 'test_service_temp');
  }

  // Test 2: prd_research_audit_log INSERT
  console.log('\n2️⃣  Testing prd_research_audit_log INSERT...');
  const { data: auditTest, error: auditError } = await supabase
    .from('prd_research_audit_log')
    .insert({
      sd_id: 'SD-TEST-TEMP',
      query_type: 'retrospective',
      tokens_consumed: 100,
      results_count: 5,
      execution_time_ms: 250
    })
    .select();

  if (auditError) {
    console.log('   ❌ BLOCKED:', auditError.message);
  } else {
    console.log('   ✅ INSERT allowed');
    // Clean up test data
    await supabase.from('prd_research_audit_log').delete().eq('sd_id', 'SD-TEST-TEMP');
  }

  // Test 3: tech_stack_references INSERT
  console.log('\n3️⃣  Testing tech_stack_references INSERT...');
  const { data: cacheTest, error: cacheError } = await supabase
    .from('tech_stack_references')
    .insert({
      sd_id: 'SD-TEST-TEMP',
      tech_stack: 'TestTech',
      source: 'local',
      confidence_score: 0.85,
      expires_at: new Date(Date.now() + 24*60*60*1000).toISOString()
    })
    .select();

  if (cacheError) {
    console.log('   ❌ BLOCKED:', cacheError.message);
  } else {
    console.log('   ✅ INSERT allowed');
    // Clean up test data
    await supabase.from('tech_stack_references').delete().eq('sd_id', 'SD-TEST-TEMP');
  }

  // Test 4: Check for context7 row
  console.log('\n4️⃣  Checking for context7 row in system_health...');
  const { data: context7, error: context7Error } = await supabase
    .from('system_health')
    .select('*')
    .eq('service_name', 'context7');

  if (context7Error) {
    console.log('   ❌ Query failed:', context7Error.message);
  } else {
    console.log(`   📊 Found ${context7?.length || 0} row(s)`);
    if (context7 && context7.length > 0) {
      console.log(`   State: ${context7[0].circuit_breaker_state}, Failures: ${context7[0].failure_count}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log(`   system_health: ${healthError ? '❌ BLOCKED' : '✅ OK'}`);
  console.log(`   prd_research_audit_log: ${auditError ? '❌ BLOCKED' : '✅ OK'}`);
  console.log(`   tech_stack_references: ${cacheError ? '❌ BLOCKED' : '✅ OK'}`);
  console.log(`   context7 row: ${context7?.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);
}

checkRLS();
