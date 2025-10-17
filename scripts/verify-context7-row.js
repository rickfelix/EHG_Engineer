#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verify() {
  console.log('🔍 Verifying Context7 Row Existence\n');

  console.log('Using Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
  console.log('Using Key Type:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON');
  console.log('');

  // Query context7 row (SELECT should work with any role)
  const { data, error } = await supabase
    .from('system_health')
    .select('*')
    .eq('service_name', 'context7');

  if (error) {
    console.error('❌ Query failed:', error.message);
    console.log('\n💡 This could mean:');
    console.log('   1. The table doesn\'t exist');
    console.log('   2. SELECT policy is blocking (unlikely if database agent succeeded)');
    console.log('   3. Connection issue');
    return;
  }

  console.log(`📊 Query successful: Found ${data?.length || 0} row(s)\n`);

  if (data && data.length > 0) {
    console.log('✅ Context7 Row Details:');
    console.log('='.repeat(50));
    data.forEach((row, idx) => {
      console.log(`Row ${idx + 1}:`);
      console.log(`  service_name: ${row.service_name}`);
      console.log(`  circuit_breaker_state: ${row.circuit_breaker_state}`);
      console.log(`  failure_count: ${row.failure_count}`);
      console.log(`  last_success_at: ${row.last_success_at || 'NULL'}`);
      console.log(`  last_failure_at: ${row.last_failure_at || 'NULL'}`);
      console.log(`  updated_at: ${row.updated_at}`);
      console.log('');
    });

    if (data.length === 1 && data[0].circuit_breaker_state === 'closed' && data[0].failure_count === 0) {
      console.log('✅ VERIFICATION PASSED');
      console.log('   Context7 circuit breaker is properly initialized');
    } else {
      console.log('⚠️  Row exists but may have unexpected values');
    }
  } else {
    console.log('❌ VERIFICATION FAILED');
    console.log('   No context7 row found');
    console.log('\n💡 Database agent reported success, but row is missing.');
    console.log('   This could mean:');
    console.log('   1. Different database connection (EHG vs EHG_Engineer)');
    console.log('   2. Row was deleted after creation');
    console.log('   3. Replication delay (unlikely)');
  }

  // Also query all rows to see what's in the table
  console.log('\n📋 All rows in system_health:');
  const { data: allRows, error: allError } = await supabase
    .from('system_health')
    .select('service_name, circuit_breaker_state, failure_count');

  if (!allError && allRows) {
    console.log(`   Total rows: ${allRows.length}`);
    allRows.forEach(row => {
      console.log(`   - ${row.service_name}: ${row.circuit_breaker_state} (failures: ${row.failure_count})`);
    });
  }
}

verify();
