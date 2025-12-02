#!/usr/bin/env node
/**
 * Test nav_routes table access after RLS policy fix
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function testAccess() {
  console.log('=== Testing nav_routes Access ===\n');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: true });

  // Test SELECT
  console.log('\n1. Testing SELECT...');
  const { data: selectData, error: selectError } = await supabase
    .from('nav_routes')
    .select('id, path, title, maturity')
    .limit(3);

  if (selectError) {
    console.log('   [FAIL] SELECT error:', selectError.message);
    return;
  } else {
    console.log('   [OK] SELECT works. Sample data:');
    selectData.forEach(r => console.log(`      - ${r.path} (${r.maturity})`));
  }

  // Test UPDATE (on a specific row)
  console.log('\n2. Testing UPDATE...');
  if (selectData && selectData.length > 0) {
    const testRow = selectData[0];
    const originalMaturity = testRow.maturity;

    // Update to same value (no actual change)
    const { error: updateError } = await supabase
      .from('nav_routes')
      .update({ maturity: originalMaturity })
      .eq('id', testRow.id);

    if (updateError) {
      console.log('   [FAIL] UPDATE error:', updateError.message);
    } else {
      console.log(`   [OK] UPDATE works. Updated ${testRow.path} maturity to: ${originalMaturity}`);
    }
  }

  console.log('\n=== ACCESS TESTS COMPLETE ===');
}

testAccess().catch(console.error);
