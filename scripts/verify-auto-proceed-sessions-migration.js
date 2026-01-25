#!/usr/bin/env node

/**
 * Verify auto_proceed_sessions migration was successfully applied
 * Run this after manually executing the migration in Supabase Dashboard
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function verifyMigration() {
  console.log('🔍 Verifying AUTO-PROCEED Sessions Migration\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function addResult(name, passed, message = '') {
    results.tests.push({ name, passed, message });
    if (passed) {
      console.log(`✅ ${name}`);
      if (message) console.log(`   ${message}`);
      results.passed++;
    } else {
      console.log(`❌ ${name}`);
      if (message) console.log(`   ${message}`);
      results.failed++;
    }
  }

  try {
    // Test 1: Table exists
    console.log('1️⃣  Testing table existence...');
    const { data: tableData, error: tableError } = await supabase
      .from('auto_proceed_sessions')
      .select('*')
      .limit(0);

    addResult(
      'Table exists',
      !tableError,
      tableError ? tableError.message : 'auto_proceed_sessions table is accessible'
    );

    // Test 2: View exists
    console.log('\n2️⃣  Testing view existence...');
    const { data: viewData, error: viewError } = await supabase
      .from('v_active_auto_proceed_sessions')
      .select('*')
      .limit(0);

    addResult(
      'View exists',
      !viewError,
      viewError ? viewError.message : 'v_active_auto_proceed_sessions view is accessible'
    );

    // Test 3: Create session (upsert function)
    console.log('\n3️⃣  Testing session creation...');
    const testSessionId = `verify_test_${Date.now()}`;

    const { data: createData, error: createError } = await supabase.rpc('upsert_auto_proceed_session', {
      p_session_id: testSessionId,
      p_active_sd_key: 'SD-VERIFY-001',
      p_chain_orchestrators: false,
      p_current_phase: 'PLAN',
      p_parent_orchestrator_key: null,
      p_total_children: 5,
      p_metadata: { verification_test: true }
    });

    addResult(
      'upsert_auto_proceed_session() function',
      !createError,
      createError ? createError.message : `Session created: ${createData}`
    );

    if (!createError) {
      // Test 4: Query created session
      console.log('\n4️⃣  Testing session query...');
      const { data: queryData, error: queryError } = await supabase
        .from('auto_proceed_sessions')
        .select('*')
        .eq('session_id', testSessionId)
        .single();

      addResult(
        'Query session',
        !queryError && queryData,
        queryError ? queryError.message : `Found session: ${queryData.active_sd_key}, Phase: ${queryData.current_phase}`
      );

      // Test 5: Update progress
      console.log('\n5️⃣  Testing progress update...');
      const { error: updateError } = await supabase.rpc('update_auto_proceed_progress', {
        p_session_id: testSessionId,
        p_completed_children: 2,
        p_current_phase: 'EXEC',
        p_active_sd_key: 'SD-VERIFY-002'
      });

      addResult(
        'update_auto_proceed_progress() function',
        !updateError,
        updateError ? updateError.message : 'Progress updated successfully'
      );

      // Test 6: Verify progress update
      console.log('\n6️⃣  Testing updated values...');
      const { data: updatedData, error: updatedError } = await supabase
        .from('auto_proceed_sessions')
        .select('*')
        .eq('session_id', testSessionId)
        .single();

      const progressCorrect = updatedData &&
        updatedData.completed_children === 2 &&
        updatedData.current_phase === 'EXEC' &&
        updatedData.active_sd_key === 'SD-VERIFY-002';

      addResult(
        'Progress values updated',
        !updatedError && progressCorrect,
        !updatedError && progressCorrect
          ? `Children: ${updatedData.completed_children}/5, Phase: ${updatedData.current_phase}, SD: ${updatedData.active_sd_key}`
          : 'Values not updated correctly'
      );

      // Test 7: Get active session function
      console.log('\n7️⃣  Testing get_active_auto_proceed_session()...');
      const { data: getActiveData, error: getActiveError } = await supabase.rpc('get_active_auto_proceed_session');

      const foundSession = getActiveData && getActiveData.length > 0;
      addResult(
        'get_active_auto_proceed_session() function',
        !getActiveError && foundSession,
        getActiveError ? getActiveError.message : `Found ${getActiveData.length} active session(s)`
      );

      // Test 8: View query with progress calculation
      console.log('\n8️⃣  Testing view with progress percentage...');
      const { data: viewProgressData, error: viewProgressError } = await supabase
        .from('v_active_auto_proceed_sessions')
        .select('*')
        .eq('session_id', testSessionId)
        .single();

      const progressPercentageCorrect = viewProgressData && viewProgressData.progress_percentage === 40.0; // 2/5 = 40%

      addResult(
        'View progress calculation',
        !viewProgressError && progressPercentageCorrect,
        viewProgressError ? viewProgressError.message : `Progress: ${viewProgressData.progress_percentage}% (2/5)`
      );

      // Test 9: Deactivate session
      console.log('\n9️⃣  Testing session deactivation...');
      const { error: deactivateError } = await supabase.rpc('deactivate_auto_proceed_session', {
        p_session_id: testSessionId
      });

      addResult(
        'deactivate_auto_proceed_session() function',
        !deactivateError,
        deactivateError ? deactivateError.message : 'Session deactivated successfully'
      );

      // Test 10: Verify deactivation
      console.log('\n🔟 Testing deactivation state...');
      const { data: deactivatedData, error: deactivatedError } = await supabase
        .from('auto_proceed_sessions')
        .select('is_active, deactivated_at')
        .eq('session_id', testSessionId)
        .single();

      const properlyDeactivated = deactivatedData &&
        deactivatedData.is_active === false &&
        deactivatedData.deactivated_at !== null;

      addResult(
        'Session properly deactivated',
        !deactivatedError && properlyDeactivated,
        !deactivatedError && properlyDeactivated
          ? `is_active: false, deactivated_at: ${new Date(deactivatedData.deactivated_at).toISOString()}`
          : 'Session not properly deactivated'
      );

      // Test 11: Verify not in active view
      console.log('\n1️⃣1️⃣  Testing deactivated session not in active view...');
      const { data: viewCheckData, error: viewCheckError } = await supabase
        .from('v_active_auto_proceed_sessions')
        .select('*')
        .eq('session_id', testSessionId);

      const notInView = !viewCheckError && viewCheckData.length === 0;

      addResult(
        'Deactivated session excluded from active view',
        notInView,
        notInView ? 'Session correctly excluded from v_active_auto_proceed_sessions' : 'Session still in active view'
      );
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tests: ${results.tests.length}`);
    console.log(`Passed: ${results.passed} ✅`);
    console.log(`Failed: ${results.failed} ❌`);
    console.log('');

    if (results.failed === 0) {
      console.log('🎉 ALL TESTS PASSED - Migration successful!');
      console.log('');
      console.log('Created components:');
      console.log('  - auto_proceed_sessions table');
      console.log('  - v_active_auto_proceed_sessions view');
      console.log('  - upsert_auto_proceed_session() function');
      console.log('  - update_auto_proceed_progress() function');
      console.log('  - get_active_auto_proceed_session() function');
      console.log('  - deactivate_auto_proceed_session() function');
      console.log('  - update_auto_proceed_sessions_updated_at() trigger function');
      console.log('  - Indexes and constraints');
      console.log('');
      console.log('Usage:');
      console.log('  const { data } = await supabase.rpc(\'upsert_auto_proceed_session\', {');
      console.log('    p_session_id: \'my_session\',');
      console.log('    p_active_sd_key: \'SD-XXX-001\',');
      console.log('    p_chain_orchestrators: false,');
      console.log('    p_current_phase: \'PLAN\',');
      console.log('    p_total_children: 3');
      console.log('  });');
      return 0;
    } else {
      console.log('⚠️  SOME TESTS FAILED - Please review errors above');
      console.log('');
      console.log('Failed tests:');
      results.tests.filter(t => !t.passed).forEach(t => {
        console.log(`  - ${t.name}: ${t.message}`);
      });
      return 1;
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    return 1;
  }
}

verifyMigration().then(code => process.exit(code));
