#!/usr/bin/env node
/**
 * Verify sd_testing_status migration was applied successfully
 * SD-TEST-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function verifyMigration() {
  console.log('🔍 Verifying sd_testing_status migration...\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  let allGood = true;

  // Check table exists
  console.log('1️⃣  Checking table: sd_testing_status');
  const { data: tableData, error: tableError } = await supabase
    .from('sd_testing_status')
    .select('*')
    .limit(1);

  if (tableError && tableError.message.includes('does not exist')) {
    console.log('   ❌ Table does NOT exist');
    console.log('   Run migration first! See: scripts/MIGRATION-INSTRUCTIONS-sd-testing-status.md\n');
    allGood = false;
  } else if (tableError) {
    console.log(`   ⚠️  Error: ${tableError.message}\n`);
    allGood = false;
  } else {
    console.log('   ✅ Table EXISTS');
    console.log(`   Records: ${tableData?.length || 0}\n`);
  }

  // Check view exists
  console.log('2️⃣  Checking view: v_untested_sds');
  const { data: viewData, error: viewError } = await supabase
    .from('v_untested_sds')
    .select('id, title, tested, testing_priority')
    .limit(5);

  if (viewError && viewError.message.includes('does not exist')) {
    console.log('   ❌ View does NOT exist');
    console.log('   Run migration first!\n');
    allGood = false;
  } else if (viewError) {
    console.log(`   ⚠️  Error: ${viewError.message}\n`);
    allGood = false;
  } else {
    console.log('   ✅ View EXISTS');
    console.log(`   Sample SDs: ${viewData?.length || 0}`);
    if (viewData && viewData.length > 0) {
      viewData.forEach((sd, i) => {
        const tested = sd.tested ? '✅' : '❌';
        console.log(`      ${i + 1}. ${tested} ${sd.id}: ${sd.title.substring(0, 50)}... (priority: ${sd.testing_priority})`);
      });
    }
    console.log();
  }

  // Test insert (if table exists)
  if (!tableError) {
    console.log('3️⃣  Testing insert + triggers');
    const testSdId = 'SD-TEST-VERIFICATION';

    // Clean up any existing test record
    await supabase
      .from('sd_testing_status')
      .delete()
      .eq('sd_id', testSdId);

    // Create a test SD first
    const { error: testSdError } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: testSdId,
        title: 'Test SD for Migration Verification',
        status: 'draft',
        priority: 'low',
        sequence_rank: 9999
      });

    if (testSdError) {
      console.log(`   ⚠️  Could not create test SD: ${testSdError.message}`);
    } else {
      // Insert test record
      const { data: insertData, error: insertError } = await supabase
        .from('sd_testing_status')
        .insert({
          sd_id: testSdId,
          tested: false,
          test_count: 0
        })
        .select()
        .single();

      if (insertError) {
        console.log(`   ❌ Insert failed: ${insertError.message}\n`);
        allGood = false;
      } else {
        const autoPriority = insertData.testing_priority;
        console.log('   ✅ Insert successful');
        console.log(`   ✅ Trigger auto-calculated priority: ${autoPriority}`);

        // Clean up test record
        await supabase
          .from('sd_testing_status')
          .delete()
          .eq('sd_id', testSdId);

        await supabase
          .from('strategic_directives_v2')
          .delete()
          .eq('id', testSdId);

        console.log('   ✅ Test cleanup complete\n');
      }
    }
  }

  // Final verdict
  if (allGood) {
    console.log('✅ MIGRATION VERIFIED SUCCESSFULLY!\n');
    console.log('You can now use:');
    console.log('  - node scripts/query-untested-sds.js');
    console.log('  - node scripts/qa-engineering-director-enhanced.js <SD-ID>\n');
  } else {
    console.log('❌ MIGRATION INCOMPLETE\n');
    console.log('Action required:');
    console.log('  - See: scripts/MIGRATION-INSTRUCTIONS-sd-testing-status.md');
    console.log('  - Apply migration via Supabase SQL Editor\n');
    process.exit(1);
  }
}

verifyMigration();
