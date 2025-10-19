#!/usr/bin/env node
/**
 * Generate SD Testing Progress Report
 * Shows tested vs untested SDs, pass rates, and next recommendations
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function generateProgressReport() {
  // Get all SDs from view
  const { data: allSDs, error: sdError } = await supabase
    .from('v_untested_sds')
    .select('id, title, tested, test_pass_rate, testing_priority')
    .order('testing_priority', { ascending: false });

  if (sdError) {
    console.error('Error querying SDs:', sdError.message);
    return;
  }

  const tested = allSDs.filter(sd => sd.tested);
  const untested = allSDs.filter(sd => !sd.tested);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 SD TESTING PROGRESS REPORT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  console.log('📈 Overall Statistics:');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   Total SDs: ${allSDs.length}`);
  console.log(`   ✅ Tested: ${tested.length} (${((tested.length / allSDs.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Untested: ${untested.length} (${((untested.length / allSDs.length) * 100).toFixed(1)}%)`);

  if (tested.length > 0) {
    const avgPassRate = tested.reduce((sum, sd) => sum + (sd.test_pass_rate || 0), 0) / tested.length;
    console.log(`   📊 Average Pass Rate: ${avgPassRate.toFixed(1)}%`);
  }

  console.log('');
  console.log('✅ Recently Tested SDs:');
  console.log('───────────────────────────────────────────────────────────');
  tested.slice(0, 5).forEach((sd, i) => {
    console.log(`   ${i + 1}. ${sd.id} - ${sd.title}`);
    console.log(`      Pass Rate: ${sd.test_pass_rate}%`);
  });

  console.log('');
  console.log('❌ Top 5 Untested Critical SDs:');
  console.log('───────────────────────────────────────────────────────────');
  untested.slice(0, 5).forEach((sd, i) => {
    console.log(`   ${i + 1}. ${sd.id}`);
    console.log(`      Priority: ${sd.testing_priority}`);
    console.log(`      Title: ${sd.title}`);
  });

  console.log('');
  console.log('🎯 Next Recommended SD to Test:');
  console.log('───────────────────────────────────────────────────────────');
  if (untested.length > 0) {
    const nextSD = untested[0];
    console.log(`   SD: ${nextSD.id}`);
    console.log(`   Priority: ${nextSD.testing_priority}`);
    console.log(`   Title: ${nextSD.title}`);
    console.log('');
    console.log(`   Command: node scripts/qa-engineering-director-enhanced.js ${nextSD.id} --skip-build`);
  } else {
    console.log('   🎉 All SDs have been tested!');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
}

generateProgressReport();
