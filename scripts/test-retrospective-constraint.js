#!/usr/bin/env node

/**
 * Test Retrospective Quality Score Constraint
 *
 * Verifies that the database constraint is working correctly
 * to prevent SD-KNOWLEDGE-001 Issue #4 (quality_score = 0)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🧪 Testing Retrospective Quality Score Constraint');
console.log('='.repeat(70));
console.log('Purpose: Verify SD-KNOWLEDGE-001 Issue #4 prevention\n');

let testsPassed = 0;
let testsFailed = 0;

/**
 * Test helper
 */
async function test(name, fn) {
  try {
    await fn();
    testsPassed++;
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    testsFailed++;
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${err.message}`);
  }
}

// Test 1: Try to insert quality_score = 0 (should fail)
await test('Reject quality_score = 0', async () => {
  const { data, error } = await supabase
    .from('retrospectives')
    .insert({
      sd_id: 'TEST-CONSTRAINT-001',
      project_name: 'Test Project',
      retro_type: 'TEST',
      title: 'Test Retrospective',
      description: 'Testing constraint',
      conducted_date: new Date().toISOString(),
      what_went_well: ['Test'],
      what_needs_improvement: ['Test'],
      key_learnings: ['Test'],
      action_items: ['Test'],
      quality_score: 0,  // This should fail
      status: 'DRAFT'
    });

  if (error) {
    if (error.message.includes('quality_score') || error.message.includes('constraint') || error.message.includes('70')) {
      return; // Expected error
    }
    throw new Error(`Wrong error: ${error.message}`);
  }
  throw new Error('Insert succeeded when it should have failed!');
});

// Test 2: Try to insert quality_score = NULL (should fail)
await test('Reject quality_score = NULL', async () => {
  const { data, error } = await supabase
    .from('retrospectives')
    .insert({
      sd_id: 'TEST-CONSTRAINT-002',
      project_name: 'Test Project',
      retro_type: 'TEST',
      title: 'Test Retrospective',
      description: 'Testing constraint',
      conducted_date: new Date().toISOString(),
      what_went_well: ['Test'],
      what_needs_improvement: ['Test'],
      key_learnings: ['Test'],
      action_items: ['Test'],
      quality_score: null,  // This should fail
      status: 'DRAFT'
    });

  if (error) {
    if (error.message.includes('null') || error.message.includes('NOT NULL') || error.message.includes('quality_score')) {
      return; // Expected error
    }
    throw new Error(`Wrong error: ${error.message}`);
  }
  throw new Error('Insert succeeded when it should have failed!');
});

// Test 3: Try to insert quality_score = 69 (should fail)
await test('Reject quality_score = 69 (below threshold)', async () => {
  const { data, error } = await supabase
    .from('retrospectives')
    .insert({
      sd_id: 'TEST-CONSTRAINT-003',
      project_name: 'Test Project',
      retro_type: 'TEST',
      title: 'Test Retrospective',
      description: 'Testing constraint',
      conducted_date: new Date().toISOString(),
      what_went_well: ['Test'],
      what_needs_improvement: ['Test'],
      key_learnings: ['Test'],
      action_items: ['Test'],
      quality_score: 69,  // This should fail
      status: 'DRAFT'
    });

  if (error) {
    if (error.message.includes('quality_score') || error.message.includes('70')) {
      return; // Expected error
    }
    throw new Error(`Wrong error: ${error.message}`);
  }
  throw new Error('Insert succeeded when it should have failed!');
});

// Test 4: Try to insert quality_score = 70 (should succeed)
await test('Accept quality_score = 70 (minimum threshold)', async () => {
  const { data, error } = await supabase
    .from('retrospectives')
    .insert({
      sd_id: 'TEST-CONSTRAINT-004',
      project_name: 'Test Project',
      retro_type: 'TEST',
      title: 'Test Retrospective',
      description: 'Testing constraint',
      conducted_date: new Date().toISOString(),
      what_went_well: ['Test'],
      what_needs_improvement: ['Test'],
      key_learnings: ['Test'],
      action_items: ['Test'],
      quality_score: 70,  // This should succeed
      status: 'DRAFT'
    })
    .select();

  if (error) {
    throw new Error(`Insert failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('No data returned from insert');
  }

  // Clean up test record
  await supabase
    .from('retrospectives')
    .delete()
    .eq('sd_id', 'TEST-CONSTRAINT-004');
});

// Test 5: Try to insert quality_score = 100 (should succeed)
await test('Accept quality_score = 100 (maximum)', async () => {
  const { data, error } = await supabase
    .from('retrospectives')
    .insert({
      sd_id: 'TEST-CONSTRAINT-005',
      project_name: 'Test Project',
      retro_type: 'TEST',
      title: 'Test Retrospective',
      description: 'Testing constraint',
      conducted_date: new Date().toISOString(),
      what_went_well: ['Test'],
      what_needs_improvement: ['Test'],
      key_learnings: ['Test'],
      action_items: ['Test'],
      quality_score: 100,  // This should succeed
      status: 'DRAFT'
    })
    .select();

  if (error) {
    throw new Error(`Insert failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('No data returned from insert');
  }

  // Clean up test record
  await supabase
    .from('retrospectives')
    .delete()
    .eq('sd_id', 'TEST-CONSTRAINT-005');
});

// Test 6: Try to insert quality_score = 101 (should fail)
await test('Reject quality_score = 101 (above maximum)', async () => {
  const { data, error } = await supabase
    .from('retrospectives')
    .insert({
      sd_id: 'TEST-CONSTRAINT-006',
      project_name: 'Test Project',
      retro_type: 'TEST',
      title: 'Test Retrospective',
      description: 'Testing constraint',
      conducted_date: new Date().toISOString(),
      what_went_well: ['Test'],
      what_needs_improvement: ['Test'],
      key_learnings: ['Test'],
      action_items: ['Test'],
      quality_score: 101,  // This should fail
      status: 'DRAFT'
    });

  if (error) {
    if (error.message.includes('quality_score') || error.message.includes('100')) {
      return; // Expected error
    }
    throw new Error(`Wrong error: ${error.message}`);
  }
  throw new Error('Insert succeeded when it should have failed!');
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total Tests:  ${testsPassed + testsFailed}`);
console.log(`✅ Passed:     ${testsPassed}`);
console.log(`❌ Failed:     ${testsFailed}`);
console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
console.log('');

if (testsFailed === 0) {
  console.log('🎉 All tests passed! Retrospective quality score constraint is working correctly.');
  console.log('');
  console.log('✅ Prevention Verified:');
  console.log('   - quality_score = 0 rejected');
  console.log('   - quality_score = NULL rejected');
  console.log('   - quality_score < 70 rejected');
  console.log('   - quality_score >= 70 AND <= 100 accepted');
  console.log('   - quality_score > 100 rejected');
  console.log('');
  console.log('   The exact SD-KNOWLEDGE-001 Issue #4 scenario is prevented!');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Review the errors above.');
  process.exit(1);
}
