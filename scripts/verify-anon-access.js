#!/usr/bin/env node

/**
 * Verify ANON access to system_health table
 */

import { createSupabaseAnonClient } from './lib/supabase-connection.js';

async function verify() {
  try {
    const client = await createSupabaseAnonClient('engineer', { verbose: true });

    console.log('');
    console.log('Testing ANON SELECT on system_health...');

    const { data, error } = await client
      .from('system_health')
      .select('*');

    if (error) {
      console.error('❌ ANON query failed:', error);
      process.exit(1);
    }

    console.log('✅ ANON SELECT successful');
    console.log('');
    console.log('Records found:', data.length);
    data.forEach(record => {
      console.log('  -', record.service_name, '| state:', record.state || 'undefined', '| failures:', record.failure_count);
    });

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

verify();
