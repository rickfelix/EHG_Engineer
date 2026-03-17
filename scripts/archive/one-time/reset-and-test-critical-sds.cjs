#!/usr/bin/env node
/**
 * Reset and Test CRITICAL/HIGH Priority SDs Only
 * Focuses real testing on most important Strategic Directives
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function resetAndTestCriticalSDs() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎯 RESET & TEST: CRITICAL/HIGH PRIORITY SDs');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Find CRITICAL/HIGH priority completed SDs
  const { data: criticalSDs, error: queryError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority')
    .eq('status', 'completed')
    .in('priority', ['critical', 'high'])
    .order('priority', { ascending: false });

  if (queryError) {
    console.error('❌ Error querying SDs:', queryError.message);
    return;
  }

  console.log(`📊 Found ${criticalSDs.length} CRITICAL/HIGH priority completed SDs:\n`);

  // Step 2: Reset their test status
  console.log('🔄 Resetting test status for critical/high priority SDs...');

  for (const sd of criticalSDs) {
    const { error: resetError } = await supabase
      .from('sd_testing_status')
      .upsert({
        sd_id: sd.id,
        tested: false,
        testing_notes: 'Reset for real testing - previous results were placeholders'
      }, { onConflict: 'sd_id' });

    if (resetError) {
      console.log(`   ⚠️  ${sd.id}: Failed to reset - ${resetError.message}`);
    } else {
      console.log(`   ✅ ${sd.id}: Reset to untested (${sd.priority})`);
    }
  }

  console.log(`\n✅ Reset complete - ${criticalSDs.length} SDs ready for real testing\n`);

  // Step 3: Launch real testing campaign
  console.log('🚀 Launching real testing campaign for CRITICAL/HIGH priority SDs...\n');
  console.log('Command to run:');
  console.log('   node scripts/batch-test-completed-sds-real.cjs\n');
  console.log('Expected SDs to test:', criticalSDs.length);
  console.log('Estimated runtime:', Math.round(criticalSDs.length * 5 / 60), 'hours\n');

  console.log('═══════════════════════════════════════════════════════════\n');
}

resetAndTestCriticalSDs();
