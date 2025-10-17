#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function investigate() {
  console.log('🔍 Investigating Circuit Breaker Multi-Row Issue\n');

  // Check how many rows exist for context7
  const { data, error, count } = await supabase
    .from('system_health')
    .select('*', { count: 'exact' })
    .eq('service_name', 'context7');

  if (error) {
    console.error('❌ Error querying system_health:', error.message);
    return;
  }

  console.log(`📊 Found ${count} rows for service_name='context7'`);
  
  if (data && data.length > 0) {
    console.log('\n📋 Rows:');
    data.forEach((row, i) => {
      console.log(`\n  Row ${i + 1}:`);
      console.log(`    service_name: ${row.service_name}`);
      console.log(`    circuit_breaker_state: ${row.circuit_breaker_state}`);
      console.log(`    failure_count: ${row.failure_count}`);
      console.log(`    last_failure_at: ${row.last_failure_at}`);
      console.log(`    last_success_at: ${row.last_success_at}`);
    });
  }

  // Check if there's a unique constraint
  console.log('\n🔒 Checking for UNIQUE constraint on service_name...');
  const { data: constraints } = await supabase
    .rpc('get_table_constraints', { table_name: 'system_health' })
    .catch(() => ({ data: null }));

  if (!constraints) {
    console.log('   ⚠️  Unable to query constraints (RPC may not exist)');
    console.log('   💡 Recommendation: Add UNIQUE constraint on service_name');
  }
}

investigate();
