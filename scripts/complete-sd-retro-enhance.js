#!/usr/bin/env node
/**
 * Mark SD-RETRO-ENHANCE-001 as Completed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function completeSd() {
  console.log('🎯 Completing SD-RETRO-ENHANCE-001\n');

  // Get current status
  const { data: sd, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, progress, current_phase')
    .eq('id', 'SD-RETRO-ENHANCE-001')
    .single();

  if (fetchError) {
    console.error('Error fetching SD:', fetchError);
    process.exit(1);
  }

  console.log('Current Status:');
  console.log(`  Status: ${sd.status}`);
  console.log(`  Progress: ${sd.progress}%`);
  console.log(`  Current Phase: ${sd.current_phase}\n`);

  // Update to completed
  console.log('Updating to completed...');
  const { data: updated, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      progress: 100,
      current_phase: 'COMPLETED',
      updated_at: new Date().toISOString(),
      updated_by: 'SYSTEM'
    })
    .eq('id', 'SD-RETRO-ENHANCE-001')
    .select()
    .single();

  if (updateError) {
    console.error('❌ Update failed:', updateError);
    process.exit(1);
  }

  console.log('✅ SD Updated:');
  console.log(`  Status: ${updated.status}`);
  console.log(`  Progress: ${updated.progress}%`);
  console.log(`  Current Phase: ${updated.current_phase}`);
  console.log('\n🎉 SD-RETRO-ENHANCE-001 COMPLETED!');
}

completeSd().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
