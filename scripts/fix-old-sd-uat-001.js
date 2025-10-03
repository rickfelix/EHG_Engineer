import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fixOldSDUAT001() {
  console.log('🔧 Fixing old SD-UAT-001 record...\n');

  // Get the old record that has ID = 'SD-UAT-001' but sd_key = null
  const { data: oldSD, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-UAT-001')
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      console.log('✅ No old SD-UAT-001 record found (using ID field). Nothing to fix!');
      return;
    }
    console.error('❌ Error fetching old record:', fetchError);
    return;
  }

  console.log('📋 Found old record:');
  console.log('  ID:', oldSD.id);
  console.log('  SD Key:', oldSD.sd_key);
  console.log('  Title:', oldSD.title);
  console.log('  Status:', oldSD.status);
  console.log('');

  // Option 1: Update the old record to use a different sd_key
  console.log('🔄 Updating old record to use SD-UAT-LEGACY-001...\n');

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      sd_key: 'SD-UAT-LEGACY-001',
      // Optionally update other fields to indicate it's legacy
      metadata: {
        ...(oldSD.metadata || {}),
        legacy: true,
        original_id: 'SD-UAT-001',
        renamed_at: new Date().toISOString(),
        reason: 'Renamed to avoid conflict with new UAT-generated SD'
      }
    })
    .eq('id', 'SD-UAT-001');

  if (updateError) {
    console.error('❌ Error updating record:', updateError);
    return;
  }

  console.log('✅ Successfully updated old record:');
  console.log('  Old ID: SD-UAT-001');
  console.log('  New SD Key: SD-UAT-LEGACY-001');
  console.log('  Title:', oldSD.title);
  console.log('');
  console.log('🎉 The SD-UAT-001 key is now free for the new UAT-generated SD!');
}

fixOldSDUAT001();