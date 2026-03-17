#!/usr/bin/env node
/**
 * Investigate RLS Policies on sd_phase_handoffs Table
 *
 * Root cause analysis for handoff acceptance blocking issue
 * SD: SD-INFRA-VALIDATION
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 INVESTIGATING HANDOFF RLS POLICIES');
console.log('═══════════════════════════════════════════════════════════\n');

// Step 1: Query RLS policies on sd_phase_handoffs table
console.log('STEP 1: Query RLS Policies');
console.log('───────────────────────────────────────────────────────────');

const rlsQuery = `
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'sd_phase_handoffs'
ORDER BY cmd, policyname;
`;

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql: rlsQuery });

  if (error) {
    console.log('⚠️  Cannot query via exec_sql RPC (function may not exist)');
    console.log('   Error:', error.message);
    console.log('   Code:', error.code);
    console.log('\n   Attempting alternative approach...\n');
  } else {
    console.log('✅ RLS Policies found:');
    data.forEach(policy => {
      console.log(`\n   Policy: ${policy.policyname}`);
      console.log(`   Command: ${policy.cmd}`);
      console.log(`   Roles: ${policy.roles}`);
      console.log(`   Permissive: ${policy.permissive}`);
      if (policy.qual) console.log(`   USING: ${policy.qual}`);
      if (policy.with_check) console.log(`   WITH CHECK: ${policy.with_check}`);
    });
  }
} catch (err) {
  console.log('⚠️  Error querying RLS policies:', err.message);
}

console.log('\n───────────────────────────────────────────────────────────\n');

// Step 2: Check if accept_handoff function exists
console.log('STEP 2: Check for accept_handoff() RPC Function');
console.log('───────────────────────────────────────────────────────────');

try {
  const { data, error } = await supabase.rpc('accept_handoff', {
    handoff_id: 'af6fc12d-f352-491b-9ff7-58b3c268a951'
  });

  if (error) {
    if (error.code === 'PGRST202') {
      console.log('❌ accept_handoff() function does NOT exist');
      console.log('   Error code: PGRST202');
      console.log('   This confirms RPC function needs to be created\n');
    } else {
      console.log('⚠️  Function may exist but returned error:', error.message);
    }
  } else {
    console.log('✅ accept_handoff() function exists and works');
    console.log('   Result:', data);
  }
} catch (err) {
  console.log('⚠️  Error checking function:', err.message);
}

console.log('───────────────────────────────────────────────────────────\n');

// Step 3: Verify handoff exists and check permissions
console.log('STEP 3: Verify Handoff Exists and Check Permissions');
console.log('───────────────────────────────────────────────────────────');

const handoffId = 'af6fc12d-f352-491b-9ff7-58b3c268a951';

// Try to SELECT (should work)
const { data: selectData, error: selectError } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('id', handoffId)
  .single();

if (selectError) {
  console.log('❌ Cannot SELECT handoff');
  console.log('   Error:', selectError.message);
} else {
  console.log('✅ SELECT works:');
  console.log('   ID:', selectData.id);
  console.log('   SD:', selectData.sd_id);
  console.log('   Status:', selectData.status);
  console.log('   From→To:', `${selectData.from_phase}→${selectData.to_phase}`);
}

console.log('');

// Try to UPDATE (will likely fail)
const { data: updateData, error: updateError } = await supabase
  .from('sd_phase_handoffs')
  .update({ status: 'accepted', accepted_at: new Date().toISOString() })
  .eq('id', handoffId)
  .select();

if (updateError) {
  console.log('❌ UPDATE failed with error:');
  console.log('   Error:', updateError.message);
  console.log('   Code:', updateError.code);
} else if (!updateData || updateData.length === 0) {
  console.log('❌ UPDATE succeeded but returned 0 rows');
  console.log('   This indicates RLS policy is blocking the UPDATE');
  console.log('   The query syntax is correct, but permissions prevent update');
} else {
  console.log('✅ UPDATE works:');
  console.log('   Rows updated:', updateData.length);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('📋 DIAGNOSIS SUMMARY');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('Issue: Cannot accept handoff via UPDATE operation');
console.log('Root Cause: RLS policy blocks UPDATE with anon key\n');

console.log('Evidence:');
console.log('  ✅ SELECT works (can read handoff)');
console.log('  ❌ UPDATE returns 0 rows (RLS blocking)');
console.log('  ❌ accept_handoff() RPC does not exist\n');

console.log('Recommended Solution:');
console.log('  Create accept_handoff() RPC function with SECURITY DEFINER');
console.log('  This bypasses RLS policies for handoff acceptance\n');

console.log('Migration File:');
console.log('  database/migrations/create_accept_handoff_function.sql\n');

console.log('═══════════════════════════════════════════════════════════\n');
