/**
 * Fix Null SD Keys - Root Cause Mitigation
 * Finds and fixes all SDs where sd_key is null by setting sd_key = id
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

async function fixNullSDKeys() {
  console.log('🔍 Root Cause Fix: Finding SDs with null sd_key...\n');

  try {
    // Find all SDs with null sd_key
    const { data: nullSDs, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, progress')
      .is('sd_key', null);

    if (fetchError) {
      console.error('❌ Error fetching SDs:', fetchError.message);
      process.exit(1);
    }

    if (!nullSDs || nullSDs.length === 0) {
      console.log('✅ No SDs found with null sd_key');
      console.log('✅ Database is healthy!\n');
      return;
    }

    console.log(`⚠️  Found ${nullSDs.length} SDs with null sd_key:\n`);
    nullSDs.forEach((sd, i) => {
      console.log(`${i+1}. ID: ${sd.id}`);
      console.log(`   Title: ${sd.title.substring(0, 60)}...`);
      console.log(`   Status: ${sd.status} | Progress: ${sd.progress}%`);
      console.log('');
    });

    console.log('🔧 Fixing by setting sd_key = id for each SD...\n');

    let fixed = 0;
    let failed = 0;

    for (const sd of nullSDs) {
      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({
          sd_key: sd.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', sd.id);

      if (updateError) {
        console.error(`❌ Failed to fix ${sd.id}: ${updateError.message}`);
        failed++;
      } else {
        console.log(`✅ Fixed: ${sd.id}`);
        fixed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   Total found: ${nullSDs.length}`);
    console.log(`   Successfully fixed: ${fixed}`);
    console.log(`   Failed: ${failed}`);

    if (failed === 0) {
      console.log('\n✅ All SDs fixed successfully!');
      console.log('✅ Root cause mitigation: COMPLETE\n');
    } else {
      console.log('\n⚠️  Some SDs could not be fixed. Manual intervention required.\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixNullSDKeys();
