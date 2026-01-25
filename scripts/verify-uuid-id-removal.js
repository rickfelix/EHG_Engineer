#!/usr/bin/env node

/**
 * Verify uuid_id Column Removal
 *
 * Run this script after executing 20251217_remove_uuid_id_column.sql
 * to verify the migration was successful and no breaking references remain.
 *
 * SD: SD-FOUNDATION-V3-001
 * US: US-004 - Create uuid_id Removal Migration with Rollback
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function verifyUuidIdRemoval() {
  console.log('='.repeat(70));
  console.log('  UUID_ID Column Removal Verification');
  console.log('  SD-FOUNDATION-V3-001');
  console.log('='.repeat(70));
  console.log('');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const checks = {
    passed: 0,
    failed: 0,
    warnings: 0,
    results: []
  };

  // =========================================================================
  // Check 1: Verify uuid_id column no longer exists
  // =========================================================================
  console.log('1. Checking uuid_id column existence...');

  const { data: sdSample, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .limit(1)
    .single();

  if (sdError && sdError.code !== 'PGRST116') {
    console.log(`   ERROR: ${sdError.message}`);
    checks.failed++;
    checks.results.push({ check: 'uuid_id column removed', status: 'ERROR', error: sdError.message });
  } else if (sdSample && 'uuid_id' in sdSample) {
    console.log('   FAIL: uuid_id column still exists in strategic_directives_v2');
    checks.failed++;
    checks.results.push({ check: 'uuid_id column removed', status: 'FAIL' });
  } else {
    console.log('   PASS: uuid_id column does not exist');
    checks.passed++;
    checks.results.push({ check: 'uuid_id column removed', status: 'PASS' });
  }

  // =========================================================================
  // Check 2: Verify backup table exists (for rollback capability)
  // =========================================================================
  console.log('\n2. Checking backup table existence...');

  // Query using raw SQL via a stored function or direct RPC
  const { data: _backupCheck, error: backupError } = await supabase
    .from('_backup_strategic_directives_uuid_id')
    .select('id, uuid_id')
    .limit(1);

  if (backupError) {
    if (backupError.code === '42P01') {
      console.log('   WARNING: Backup table does not exist (rollback not available)');
      checks.warnings++;
      checks.results.push({ check: 'Backup table exists', status: 'WARNING', note: 'No rollback capability' });
    } else {
      console.log(`   WARNING: Could not verify backup table: ${backupError.message}`);
      checks.warnings++;
      checks.results.push({ check: 'Backup table exists', status: 'WARNING', error: backupError.message });
    }
  } else {
    console.log('   PASS: Backup table exists for rollback');
    checks.passed++;
    checks.results.push({ check: 'Backup table exists', status: 'PASS' });
  }

  // =========================================================================
  // Check 3: Verify PRDs can still be queried via sd_id
  // =========================================================================
  console.log('\n3. Checking PRD → SD relationship via sd_id...');

  const { data: prdJoin, error: prdJoinError } = await supabase
    .from('product_requirements_v2')
    .select(`
      id,
      sd_id,
      strategic_directives_v2!inner(id, title)
    `)
    .limit(5);

  if (prdJoinError) {
    console.log(`   FAIL: PRD → SD join failed: ${prdJoinError.message}`);
    checks.failed++;
    checks.results.push({ check: 'PRD → SD join works', status: 'FAIL', error: prdJoinError.message });
  } else if (!prdJoin || prdJoin.length === 0) {
    console.log('   WARNING: No PRDs found to verify join (may be empty table)');
    checks.warnings++;
    checks.results.push({ check: 'PRD → SD join works', status: 'WARNING', note: 'No PRDs to test' });
  } else {
    console.log(`   PASS: PRD → SD join works (${prdJoin.length} records verified)`);
    checks.passed++;
    checks.results.push({ check: 'PRD → SD join works', status: 'PASS', count: prdJoin.length });
  }

  // =========================================================================
  // Check 4: Verify handoffs can still be queried
  // =========================================================================
  console.log('\n4. Checking handoff queries...');

  const { data: handoffs, error: handoffsError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, handoff_type')
    .limit(5);

  if (handoffsError) {
    console.log(`   FAIL: Handoff query failed: ${handoffsError.message}`);
    checks.failed++;
    checks.results.push({ check: 'Handoff queries work', status: 'FAIL', error: handoffsError.message });
  } else {
    console.log(`   PASS: Handoff queries work (${handoffs?.length || 0} records)`);
    checks.passed++;
    checks.results.push({ check: 'Handoff queries work', status: 'PASS', count: handoffs?.length || 0 });
  }

  // =========================================================================
  // Check 5: Verify SD.id is the only identifier in use
  // =========================================================================
  console.log('\n5. Checking SD identifier format...');

  const { data: sdIds, error: sdIdsError } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .limit(10);

  if (sdIdsError) {
    console.log(`   ERROR: ${sdIdsError.message}`);
    checks.failed++;
    checks.results.push({ check: 'SD identifier format', status: 'ERROR', error: sdIdsError.message });
  } else {
    const ids = sdIds.map(s => s.id);
    const hasVarcharFormat = ids.some(id => id && typeof id === 'string' && id.startsWith('SD-'));

    if (hasVarcharFormat) {
      console.log('   PASS: SD.id uses VARCHAR format (e.g., SD-FOUNDATION-V3-001)');
      checks.passed++;
      checks.results.push({ check: 'SD identifier format', status: 'PASS', sample: ids.slice(0, 3) });
    } else {
      console.log('   WARNING: SD.id format may not be standard');
      checks.warnings++;
      checks.results.push({ check: 'SD identifier format', status: 'WARNING', sample: ids.slice(0, 3) });
    }
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('  VERIFICATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Passed:   ${checks.passed}`);
  console.log(`  Failed:   ${checks.failed}`);
  console.log(`  Warnings: ${checks.warnings}`);
  console.log('');

  if (checks.failed === 0) {
    console.log('  OVERALL: PASS - uuid_id removal verified successfully');
    console.log('');
    console.log('  Next steps:');
    console.log('  1. Monitor system for 1 week');
    console.log('  2. After stability confirmed, optionally drop backup table');
    console.log('     DROP TABLE IF EXISTS _backup_strategic_directives_uuid_id;');
  } else {
    console.log('  OVERALL: FAIL - Issues detected');
    console.log('');
    console.log('  Action required:');
    console.log('  1. Review failed checks above');
    console.log('  2. If needed, run rollback script from migration file');
  }

  console.log('\n' + '='.repeat(70));

  return checks;
}

// Run verification
verifyUuidIdRemoval()
  .then(checks => {
    process.exit(checks.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
