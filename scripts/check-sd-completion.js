#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCompletion() {
  // Check progress breakdown
  const { data: breakdown, error: breakdownError } = await supabase.rpc('get_progress_breakdown', {
    sd_id_param: 'SD-FOUNDATION-SECURITY-001'
  });

  if (breakdownError) {
    console.error('Error getting progress breakdown:', breakdownError.message);
  } else {
    console.log('Progress Breakdown:');
    console.log(JSON.stringify(breakdown, null, 2));
  }

  // Check handoffs
  console.log('\n\nHandoffs:');
  const { data: handoffs, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, source_sd_id, target_sd_id, handoff_type, status')
    .or('source_sd_id.eq.SD-FOUNDATION-SECURITY-001,target_sd_id.eq.SD-FOUNDATION-SECURITY-001');

  if (handoffError) {
    console.error('Error getting handoffs:', handoffError.message);
  } else {
    handoffs.forEach(h => {
      console.log(`  - ${h.handoff_type} (${h.source_sd_id} → ${h.target_sd_id}): ${h.status}`);
    });
  }

  // Check retrospectives
  // NOTE: Table is 'retrospectives' not 'sd_retrospectives'
  console.log('\n\nRetrospectives:');
  const { data: retro, error: retroError } = await supabase
    .from('retrospectives')
    .select('id, sd_id, retro_type')
    .eq('sd_id', 'SD-FOUNDATION-SECURITY-001');

  if (retroError) {
    console.error('Error getting retrospectives:', retroError.message);
  } else {
    console.log(`Found ${retro.length} retrospectives`);
    retro.forEach(r => {
      console.log(`  - ${r.id}: ${r.status}`);
    });
  }
}

checkCompletion();
