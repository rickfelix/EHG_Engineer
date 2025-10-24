#!/usr/bin/env node
/**
 * Accept EXEC→PLAN Handoff for SD-GTM-INTEL-DISCOVERY-001
 * PLAN Verification Phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const HANDOFF_ID = 'b66a5bda-1dd2-43a1-b208-d91e230b2812';

async function acceptHandoff() {
  console.log('\n✅ Accepting EXEC→PLAN Handoff');
  console.log('='.repeat(70));
  console.log('   Handoff ID:', HANDOFF_ID);
  console.log('   SD: SD-GTM-INTEL-DISCOVERY-001');

  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString()
    })
    .eq('id', HANDOFF_ID)
    .select()
    .single();

  if (error) {
    console.error('\n❌ Failed to accept handoff:', error.message);
    process.exit(1);
  }

  console.log('\n✅ Handoff accepted successfully!');
  console.log('   Status:', data.status);
  console.log('   Accepted at:', data.accepted_at);
  console.log('\n📋 PLAN Verification Phase begins...');
  console.log('');
}

acceptHandoff().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
