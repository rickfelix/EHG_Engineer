#!/usr/bin/env node
/**
 * Unit tests for calculate_sd_progress() fix
 * SD: SD-PROGRESS-CALC-FIX
 *
 * Tests that calculate_sd_progress() and get_progress_breakdown() return
 * consistent results after the fix.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { strict as assert } from 'assert';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Test SDs at various completion stages
const TEST_SDS = [
  'SD-CICD-WORKFLOW-FIX',  // Should be at 40%
  'SD-PROGRESS-CALC-FIX',  // Current SD
];

console.log('🧪 UNIT TESTS: calculate_sd_progress() fix');
console.log('='.repeat(70));
console.log('');

let passed = 0;
let failed = 0;

for (const sdId of TEST_SDS) {
  console.log(`Testing: ${sdId}`);

  try {
    // Get result from calculate_sd_progress()
    const { data: calcResult, error: calcError } = await supabase.rpc('calculate_sd_progress', {
      sd_id_param: sdId
    });

    if (calcError) {
      console.log(`  ❌ calculate_sd_progress() error: ${calcError.message}`);
      failed++;
      continue;
    }

    // Get result from get_progress_breakdown()
    const { data: breakdown, error: breakdownError } = await supabase.rpc('get_progress_breakdown', {
      sd_id_param: sdId
    });

    if (breakdownError) {
      console.log(`  ❌ get_progress_breakdown() error: ${breakdownError.message}`);
      failed++;
      continue;
    }

    // Test 1: Both functions should return the same total
    const breakdownTotal = breakdown.total_progress;
    assert.equal(calcResult, breakdownTotal,
      `Functions disagree: calculate=${calcResult}%, breakdown=${breakdownTotal}%`);
    console.log(`  ✅ Both functions agree: ${calcResult}%`);

    // Test 2: Sum of individual phases should match total
    const phaseSum = Object.values(breakdown.phases).reduce((sum, phase) => sum + phase.progress, 0);
    assert.equal(breakdownTotal, phaseSum,
      `Breakdown inconsistent: total=${breakdownTotal}%, sum=${phaseSum}%`);
    console.log(`  ✅ Phase sum matches total: ${phaseSum}%`);

    // Test 3: Progress should be 0-100
    assert.ok(calcResult >= 0 && calcResult <= 100,
      `Progress out of range: ${calcResult}%`);
    console.log(`  ✅ Progress in valid range: ${calcResult}%`);

    passed++;

  } catch (error) {
    console.log(`  ❌ Test failed: ${error.message}`);
    failed++;
  }

  console.log('');
}

console.log('='.repeat(70));
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
console.log('');

if (failed === 0) {
  console.log('✅ ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
}
