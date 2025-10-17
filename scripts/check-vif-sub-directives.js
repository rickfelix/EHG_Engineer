import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSubDirectives() {
  try {
    console.log('\n=== VIF SUB-DIRECTIVES STATUS ===\n');

    const subDirectiveIds = [
      'SD-VIF-TIER-001',
      'SD-VIF-INTEL-001',
      'SD-VIF-REFINE-001'
    ];

    for (const sdId of subDirectiveIds) {
      const { data: sd, error } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status, current_phase, priority, progress')
        .eq('id', sdId)
        .single();

      if (error || !sd) {
        console.log(`❌ ${sdId}: NOT FOUND`);
        console.log(`   Status: Does not exist in database`);
        console.log('');
      } else {
        console.log(`✅ ${sdId}`);
        console.log(`   Title: ${sd.title}`);
        console.log(`   Status: ${sd.status}`);
        console.log(`   Phase: ${sd.current_phase || 'Not set'}`);
        console.log(`   Priority: ${sd.priority}`);
        console.log(`   Progress: ${sd.progress || 0}%`);
        console.log('');
      }
    }

  } catch (err) {
    console.error('Failed:', err.message);
  }
}

checkSubDirectives();
