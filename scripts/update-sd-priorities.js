import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updatePriorities() {
  const sdIds = [
    'SD-009',
    'SD-006',
    'SD-GOVERNANCE-UI-001',
    'SD-044',
    'SD-036',
    'SD-PIPELINE-001',
    'SD-016',
    'SD-029'
  ];

  console.log('Updating priorities for Strategic Directives to HIGH...\n');

  for (const sdId of sdIds) {
    try {
      // First check if SD exists
      const { data: existingSD, error: checkError } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, priority')
        .eq('id', sdId)
        .single();

      if (checkError || !existingSD) {
        console.log(`❌ ${sdId}: Not found`);
        continue;
      }

      // Update priority to high
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update({
          priority: 'high',
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId)
        .select()
        .single();

      if (error) {
        console.log(`❌ ${sdId}: Error updating - ${error.message}`);
      } else {
        console.log(`✅ ${sdId}: ${existingSD.title}`);
        console.log(`   Priority: ${existingSD.priority} → high`);
      }
    } catch (err) {
      console.log(`❌ ${sdId}: Unexpected error - ${err.message}`);
    }
  }

  console.log('\n✨ Priority update complete!');
}

updatePriorities().catch(console.error);