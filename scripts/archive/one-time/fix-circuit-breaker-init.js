#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fix() {
  console.log('🔧 Fixing Circuit Breaker Initialization\n');

  // Check if context7 entry exists
  const { data: existing, error: checkError } = await supabase
    .from('system_health')
    .select('*')
    .eq('service_name', 'context7');

  if (checkError) {
    console.error('❌ Error checking existing rows:', checkError.message);
    return;
  }

  console.log(`📊 Current rows for context7: ${existing?.length || 0}`);

  if (!existing || existing.length === 0) {
    console.log('\n➕ Inserting context7 entry...');
    
    const { data: _data, error } = await supabase
      .from('system_health')
      .insert({
        service_name: 'context7',
        circuit_breaker_state: 'closed',
        failure_count: 0,
        last_failure_at: null,
        last_success_at: null,
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('❌ Insert failed:', error.message);
      console.log('\n💡 This is likely an RLS policy issue');
      console.log('   The migration INSERT may have been blocked by RLS');
      return;
    }

    console.log('✅ Context7 entry created successfully');
    console.log('   State: closed, Failures: 0');
  } else if (existing.length > 1) {
    console.log('\n⚠️  Multiple rows found! Deleting duplicates...');
    
    // Keep first row, delete others
    const _keepRow = existing[0];
    const deleteRows = existing.slice(1);

    for (const row of deleteRows) {
      await supabase
        .from('system_health')
        .delete()
        .eq('service_name', row.service_name)
        .eq('updated_at', row.updated_at);
    }

    console.log(`✅ Kept 1 row, deleted ${deleteRows.length} duplicates`);
  } else {
    console.log('✅ Context7 entry exists and is unique');
  }

  // Verify final state
  const { data: final } = await supabase
    .from('system_health')
    .select('*')
    .eq('service_name', 'context7');

  console.log('\n📊 Final State:');
  console.log(`   Rows: ${final?.length || 0}`);
  if (final && final.length === 1) {
    console.log(`   State: ${final[0].circuit_breaker_state}`);
    console.log(`   Failures: ${final[0].failure_count}`);
  }
}

fix();
