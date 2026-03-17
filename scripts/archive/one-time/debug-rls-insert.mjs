#!/usr/bin/env node
/**
 * Debug RLS INSERT issue with detailed error info
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

async function debugInsert() {
  console.log('🔍 Debug RLS INSERT\n');
  console.log('Environment:');
  console.log(`   URL: ${process.env.SUPABASE_URL}`);
  console.log(`   Using KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON'}\n`);

  // Try insert with full error details
  console.log('Attempting INSERT into system_health...\n');

  const { data, error } = await supabase
    .from('system_health')
    .insert({
      service_name: 'test_debug',
      circuit_breaker_state: 'closed',
      failure_count: 0
    })
    .select();

  if (error) {
    console.log('❌ INSERT FAILED\n');
    console.log('Full error object:');
    console.log(JSON.stringify(error, null, 2));
    console.log('\nError details:');
    console.log(`   Code: ${error.code}`);
    console.log(`   Message: ${error.message}`);
    console.log(`   Details: ${error.details}`);
    console.log(`   Hint: ${error.hint}`);
  } else {
    console.log('✅ INSERT SUCCEEDED\n');
    console.log('Data inserted:');
    console.log(JSON.stringify(data, null, 2));

    // Clean up
    await supabase.from('system_health').delete().eq('service_name', 'test_debug');
    console.log('\n✅ Test data cleaned up');
  }
}

debugInsert().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
