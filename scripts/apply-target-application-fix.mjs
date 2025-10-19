#!/usr/bin/env node

/**
 * Apply target_application constraint fix
 * Allows both 'EHG' and 'EHG_Engineer' as valid values
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔧 Applying target_application constraint fix...');
console.log();

// The constraint modification needs to be done via Supabase dashboard or direct SQL
// Since we don't have service role key access, we'll use a workaround:
// 1. Check current constraint
// 2. Guide user to apply fix manually if needed

async function checkAndFix() {
  // Test if EHG_Engineer is accepted
  const testSdId = 'SD-PROOF-DRIVEN-1758340937844';

  console.log('Testing current constraint...');
  const { error: testError } = await supabase
    .from('strategic_directives_v2')
    .update({ target_application: 'EHG_Engineer' })
    .eq('id', testSdId);

  if (testError) {
    console.log('❌ Current constraint blocks EHG_Engineer');
    console.log('Error:', testError.message);
    console.log();
    console.log('MANUAL FIX REQUIRED:');
    console.log('====================');
    console.log('1. Open Supabase Dashboard');
    console.log('2. Go to SQL Editor');
    console.log('3. Execute:');
    console.log();
    console.log('   ALTER TABLE strategic_directives_v2');
    console.log('   DROP CONSTRAINT IF EXISTS check_target_application;');
    console.log();
    console.log('   ALTER TABLE strategic_directives_v2');
    console.log('   ADD CONSTRAINT check_target_application');
    console.log("   CHECK (target_application IN ('EHG', 'EHG_Engineer'));");
    console.log();
    console.log('4. Re-run this script to verify');
    process.exit(1);
  } else {
    console.log('✅ Constraint allows EHG_Engineer');
    console.log('✅ target_application updated successfully');
    console.log();

    // Verify the update
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('target_application')
      .eq('id', testSdId)
      .single();

    if (!error && data) {
      console.log(`Current target_application: ${data.target_application}`);
    }
  }
}

checkAndFix().catch(console.error);
