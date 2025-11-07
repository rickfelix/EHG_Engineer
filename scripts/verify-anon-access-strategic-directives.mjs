#!/usr/bin/env node

/**
 * Verification Test: ANON_KEY SELECT Access to strategic_directives_v2
 * Purpose: Verify RLS policy allows anon role to read SDs after migration
 * Context: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001 PLAN phase
 * Expected: SELECT succeeds, INSERT/UPDATE/DELETE blocked
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY  // Using ANON_KEY
);

async function testAnonAccess() {
  console.log('🔍 Testing ANON_KEY SELECT access to strategic_directives_v2...\n');

  let allPassed = true;

  // Test 1: Query specific SD
  console.log('=== TEST 1: SELECT Specific SD ===');
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase')
    .eq('id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
    .single();

  if (sdError) {
    console.error('❌ FAILED: Cannot SELECT specific SD');
    console.error('   Error:', sdError.message);
    console.error('   Code:', sdError.code);
    allPassed = false;
  } else {
    console.log('✅ PASS: SELECT specific SD');
    console.log('   Found:', sd.id);
    console.log('   Title:', sd.title);
    console.log('   Status:', sd.status, '| Phase:', sd.current_phase);
  }

  // Test 2: Query all SDs (verify no data leakage)
  console.log('\n=== TEST 2: SELECT Multiple SDs ===');
  const { data: allSDs, error: allError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status')
    .limit(5);

  if (allError) {
    console.error('❌ FAILED: Cannot SELECT multiple SDs');
    console.error('   Error:', allError.message);
    allPassed = false;
  } else {
    console.log(`✅ PASS: SELECT multiple SDs (${allSDs.length} records)`);
    allSDs.forEach(sd => {
      console.log(`   - ${sd.id}: ${sd.status}`);
    });
  }

  // Test 3: Verify INSERT is blocked (security check)
  console.log('\n=== TEST 3: INSERT Blocked (Security) ===');
  const { data: insertData, error: insertError } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: 'SD-TEST-999',
      title: 'Test SD',
      status: 'draft',
      category: 'test',
      priority: 'low',
      description: 'Test',
      rationale: 'Test',
      scope: 'Test',
      sequence_rank: 999,
      sd_key: 'SD-TEST-999',
      sd_type: 'feature'
    });

  if (insertError) {
    console.log('✅ PASS: INSERT blocked for anon (as expected)');
    console.log('   Error:', insertError.message);
  } else {
    console.error('❌ SECURITY ISSUE: anon role can INSERT (should be blocked!)');
    // Cleanup test record
    const serviceClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await serviceClient.from('strategic_directives_v2').delete().eq('id', 'SD-TEST-999');
    allPassed = false;
  }

  // Test 4: Verify UPDATE is blocked (security check)
  console.log('\n=== TEST 4: UPDATE Blocked (Security) ===');
  const { data: updateData, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ title: 'Modified Title' })
    .eq('id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');

  if (updateError) {
    console.log('✅ PASS: UPDATE blocked for anon (as expected)');
    console.log('   Error:', updateError.message);
  } else {
    console.error('❌ SECURITY ISSUE: anon role can UPDATE (should be blocked!)');
    allPassed = false;
  }

  // Test 5: Verify DELETE is blocked (security check)
  console.log('\n=== TEST 5: DELETE Blocked (Security) ===');
  const { data: deleteData, error: deleteError } = await supabase
    .from('strategic_directives_v2')
    .delete()
    .eq('id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001');

  if (deleteError) {
    console.log('✅ PASS: DELETE blocked for anon (as expected)');
    console.log('   Error:', deleteError.message);
  } else {
    console.error('❌ SECURITY ISSUE: anon role can DELETE (should be blocked!)');
    allPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED! ANON_KEY has read-only access as designed.');
    console.log('✅ Migration successful - RLS policy working correctly');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED - Review RLS policies');
    process.exit(1);
  }
}

testAnonAccess();
