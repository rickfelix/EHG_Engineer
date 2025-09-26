#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_IDS_TO_UPDATE = [
  'SD-043',
  'SD-VISION-ALIGN-001',
  'SD-MONITORING-001',
  'SD-GOVERNANCE-UI-001',
  'SD-2025-09-EMB'
];

async function main() {
  try {
    console.log('🔍 Checking current target_application values...\n');

    // First, query current values
    const { data: currentSDs, error: queryError } = await supabase
      .from('strategic_directives_v2')
      .select('id, target_application, title')
      .in('id', SD_IDS_TO_UPDATE);

    if (queryError) {
      console.error('❌ Error querying Strategic Directives:', queryError);
      return;
    }

    if (!currentSDs || currentSDs.length === 0) {
      console.error('❌ No Strategic Directives found with the specified IDs');
      return;
    }

    console.log('Current values:');
    currentSDs.forEach(sd => {
      console.log(`📋 ${sd.id}: "${sd.title}" -> target_application: "${sd.target_application}"`);
    });

    // Check which ones need updating (handle both variations)
    const needsUpdate = currentSDs.filter(sd =>
      sd.target_application === 'EHG_Engineer' || sd.target_application === 'EHG_ENGINEER'
    );

    if (needsUpdate.length === 0) {
      console.log('\n✅ All specified Strategic Directives already have correct target_application values');
      return;
    }

    console.log(`\n🔄 Updating ${needsUpdate.length} Strategic Directives from "EHG_Engineer"/"EHG_ENGINEER" to "EHG"...\n`);

    // Update each one
    for (const sd of needsUpdate) {
      console.log(`⏳ Updating ${sd.id}...`);

      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({ target_application: 'EHG' })
        .eq('id', sd.id);

      if (updateError) {
        console.error(`❌ Error updating ${sd.id}:`, updateError);
      } else {
        console.log(`✅ Successfully updated ${sd.id}`);
      }
    }

    // Verify updates
    console.log('\n🔍 Verifying updates...\n');

    const { data: updatedSDs, error: verifyError } = await supabase
      .from('strategic_directives_v2')
      .select('id, target_application, title')
      .in('id', SD_IDS_TO_UPDATE);

    if (verifyError) {
      console.error('❌ Error verifying updates:', verifyError);
      return;
    }

    console.log('Updated values:');
    updatedSDs.forEach(sd => {
      const status = sd.target_application === 'EHG' ? '✅' : '❌';
      console.log(`${status} ${sd.id}: "${sd.title}" -> target_application: "${sd.target_application}"`);
    });

    console.log('\n🎉 Update process completed!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

main();