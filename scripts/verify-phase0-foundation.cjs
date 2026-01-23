#!/usr/bin/env node
/**
 * Verification script for Phase 0: Self-Improvement Foundation
 * SD: SD-LEO-SELF-IMPROVE-FOUND-001
 *
 * Run this after applying the migration to verify all components are in place.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('='.repeat(70));
  console.log('🔍 Phase 0 Foundation Verification');
  console.log('   SD: SD-LEO-SELF-IMPROVE-FOUND-001');
  console.log('='.repeat(70));
  console.log('');

  const checks = [];
  let allPassed = true;

  // Check 1: protocol_constitution table exists
  console.log('\n📋 Check 1: protocol_constitution table');
  const { data: constTable, error: constErr } = await supabase
    .from('protocol_constitution')
    .select('rule_code')
    .limit(1);

  if (constErr) {
    console.log('  ❌ FAILED: Table does not exist or not accessible');
    console.log(`     Error: ${constErr.message}`);
    checks.push({ name: 'protocol_constitution table', passed: false });
    allPassed = false;
  } else {
    console.log('  ✅ PASSED: Table exists and accessible');
    checks.push({ name: 'protocol_constitution table', passed: true });
  }

  // Check 2: Constitution rules seeded
  console.log('\n📋 Check 2: Constitution rules seeded');
  const { data: rules, count } = await supabase
    .from('protocol_constitution')
    .select('rule_code', { count: 'exact' });

  if (rules && rules.length >= 9) {
    console.log(`  ✅ PASSED: ${rules.length} rules found (expected: 9)`);
    rules.forEach(r => console.log(`     - ${r.rule_code}`));
    checks.push({ name: '9 constitution rules seeded', passed: true });
  } else {
    console.log(`  ❌ FAILED: ${rules?.length || 0} rules found (expected: 9)`);
    checks.push({ name: '9 constitution rules seeded', passed: false });
    allPassed = false;
  }

  // Check 3: improvement_quality_assessments table exists
  console.log('\n📋 Check 3: improvement_quality_assessments table');
  const { error: qaErr } = await supabase
    .from('improvement_quality_assessments')
    .select('id')
    .limit(1);

  if (qaErr && !qaErr.message.includes('0 rows')) {
    console.log('  ❌ FAILED: Table does not exist or not accessible');
    console.log(`     Error: ${qaErr.message}`);
    checks.push({ name: 'improvement_quality_assessments table', passed: false });
    allPassed = false;
  } else {
    console.log('  ✅ PASSED: Table exists and accessible');
    checks.push({ name: 'improvement_quality_assessments table', passed: true });
  }

  // Check 4: pattern_resolution_signals table exists
  console.log('\n📋 Check 4: pattern_resolution_signals table');
  const { error: patternErr } = await supabase
    .from('pattern_resolution_signals')
    .select('id')
    .limit(1);

  if (patternErr && !patternErr.message.includes('0 rows')) {
    console.log('  ❌ FAILED: Table does not exist or not accessible');
    console.log(`     Error: ${patternErr.message}`);
    checks.push({ name: 'pattern_resolution_signals table', passed: false });
    allPassed = false;
  } else {
    console.log('  ✅ PASSED: Table exists and accessible');
    checks.push({ name: 'pattern_resolution_signals table', passed: true });
  }

  // Check 5: risk_tier column on protocol_improvement_queue
  console.log('\n📋 Check 5: risk_tier column on protocol_improvement_queue');
  const { data: queueData, error: queueErr } = await supabase
    .from('protocol_improvement_queue')
    .select('risk_tier')
    .limit(1);

  if (queueErr) {
    console.log('  ❌ FAILED: Column does not exist or not accessible');
    console.log(`     Error: ${queueErr.message}`);
    checks.push({ name: 'risk_tier column', passed: false });
    allPassed = false;
  } else {
    console.log('  ✅ PASSED: Column exists');
    checks.push({ name: 'risk_tier column', passed: true });
  }

  // Check 6: priority column on leo_protocol_sections
  console.log('\n📋 Check 6: priority column on leo_protocol_sections');
  const { data: sectionsData, error: sectionsErr } = await supabase
    .from('leo_protocol_sections')
    .select('priority')
    .limit(1);

  if (sectionsErr) {
    console.log('  ❌ FAILED: Column does not exist or not accessible');
    console.log(`     Error: ${sectionsErr.message}`);
    checks.push({ name: 'priority column', passed: false });
    allPassed = false;
  } else {
    console.log('  ✅ PASSED: Column exists');
    checks.push({ name: 'priority column', passed: true });
  }

  // Check 7: effectiveness columns on protocol_improvement_queue
  console.log('\n📋 Check 7: effectiveness tracking columns');
  const { data: effData, error: effErr } = await supabase
    .from('protocol_improvement_queue')
    .select('effectiveness_measured_at, baseline_metric, post_metric, rollback_reason')
    .limit(1);

  if (effErr) {
    console.log('  ❌ FAILED: Columns do not exist or not accessible');
    console.log(`     Error: ${effErr.message}`);
    checks.push({ name: 'effectiveness columns', passed: false });
    allPassed = false;
  } else {
    console.log('  ✅ PASSED: All effectiveness columns exist');
    checks.push({ name: 'effectiveness columns', passed: true });
  }

  // Check 8: RLS policies on protocol_constitution (attempt to update/delete)
  console.log('\n📋 Check 8: RLS policies (immutability)');
  // Note: We can't easily test RLS from service role as it bypasses RLS
  // We'll just note that this needs manual verification
  console.log('  ⚠️  MANUAL CHECK REQUIRED');
  console.log('     Run these queries to verify immutability:');
  console.log('     DELETE FROM protocol_constitution WHERE rule_code = \'CONST-001\';');
  console.log('     UPDATE protocol_constitution SET rule_text = \'test\' WHERE rule_code = \'CONST-001\';');
  console.log('     Both should fail with RLS policy violation.');
  checks.push({ name: 'RLS policies', passed: true, manual: true });

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('VERIFICATION SUMMARY');
  console.log('='.repeat(70));

  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;

  console.log(`\n✓ Passed: ${passed}/${total}`);
  checks.forEach(c => {
    const icon = c.passed ? '✅' : '❌';
    const manual = c.manual ? ' (manual verification needed)' : '';
    console.log(`  ${icon} ${c.name}${manual}`);
  });

  console.log('\n' + '='.repeat(70));

  if (allPassed) {
    console.log('✅ PHASE 0 VERIFICATION PASSED');
    console.log('');
    console.log('Next steps:');
    console.log('1. Verify RLS policies manually (see Check 8 above)');
    console.log('2. Run: node scripts/handoff.js execute EXEC-TO-PLAN SD-LEO-SELF-IMPROVE-FOUND-001');
    return 0;
  } else {
    console.log('❌ PHASE 0 VERIFICATION FAILED');
    console.log('');
    console.log('Please apply the migration:');
    console.log('1. Open Supabase Dashboard SQL Editor');
    console.log('2. Run: database/migrations/20260122_self_improvement_foundation.sql');
    console.log('3. Re-run this verification script');
    return 1;
  }
}

verify()
  .then(exitCode => process.exit(exitCode))
  .catch(err => {
    console.error('Verification error:', err);
    process.exit(1);
  });
