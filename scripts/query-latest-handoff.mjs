#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function queryLatestHandoff() {
  const { data: handoff, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_id', 'SD-VWC-PHASE1-001')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('\n📊 LATEST HANDOFF DETAILS:');
  console.log('=====================================');
  console.log(`ID: ${handoff.id}`);
  console.log(`Type: ${handoff.from_phase} → ${handoff.to_phase}`);
  console.log(`Status: ${handoff.status}`);
  console.log(`Created: ${handoff.created_at}`);
  console.log(`\nValidation Score: ${handoff.validation_score || 'N/A'}`);
  console.log(`\nContext:`);
  console.log(JSON.stringify(handoff.context, null, 2));
}

queryLatestHandoff().then(() => process.exit(0)).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
