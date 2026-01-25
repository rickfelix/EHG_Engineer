#!/usr/bin/env node
/**
 * Manually add SD-BASELINE-SYNC-001 to the active baseline
 * (Since this SD was created before the trigger was installed)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addToBaseline() {
  const baselineId = '35705d0f-9c9c-4aa4-85c6-a2cffe51e76a';
  const sdId = process.argv[2] || 'SD-BASELINE-SYNC-001';

  // Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, current_phase, status')
    .eq('id', sdId)
    .single();

  if (sdError || !sd) {
    console.log('SD not found:', sdId);
    return;
  }

  console.log('Adding SD to baseline:', sd.title);

  // Derive track from category (matching trigger logic)
  const track = sd.category === 'infrastructure' ? 'A' :
                sd.category === 'quality' ? 'C' : 'B';

  const { error } = await supabase
    .from('sd_baseline_items')
    .insert({
      baseline_id: baselineId,
      sd_id: sd.id,
      track: track,
      track_name: track === 'A' ? 'Infrastructure' : track === 'B' ? 'Features' : 'Quality',
      sequence_rank: 1,
      is_ready: true,
      notes: `Auto-added: ${sd.title}`
    });

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('✅ Added', sd.id, 'to baseline');
    console.log('   Track:', track);
    console.log('   Status: in_progress');
  }
}

addToBaseline().catch(console.error);
