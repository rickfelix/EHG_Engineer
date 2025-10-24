#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function acceptHandoffsViaRPC() {
  const sdId = 'SD-2025-1020-E2E-SELECTORS';

  console.log('Accepting handoffs via RPC for SD-2025-1020-E2E-SELECTORS:\n');

  // Get all pending handoffs
  const { data: handoffs, error: fetchError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, handoff_type, status')
    .eq('sd_id', sdId)
    .eq('status', 'pending_acceptance');

  if (fetchError) {
    console.log('❌ Error fetching handoffs:', fetchError.message);
    return;
  }

  if (!handoffs || handoffs.length === 0) {
    console.log('⚠️  No pending handoffs found');
    return;
  }

  console.log(`Found ${handoffs.length} pending handoffs:\n`);

  // Accept each handoff via RPC function
  for (const handoff of handoffs) {
    const { data, error } = await supabase.rpc('accept_phase_handoff', {
      handoff_id_param: handoff.id
    });

    if (error) {
      console.log(`❌ Failed to accept ${handoff.handoff_type}:`, error.message);
    } else {
      console.log(`✅ Accepted ${handoff.handoff_type}`);
    }
  }

  console.log('\nVerifying progress...');
  const { data: progress } = await supabase.rpc('calculate_sd_progress', {
    sd_id_param: sdId
  });

  console.log('New Progress:', progress, '/ 100');

  if (progress === 100) {
    console.log('\n🎉 Progress is now 100% - SD ready for completion!');
  } else {
    console.log(`\n⚠️  Progress is ${progress}% (expected 100%)`);
  }
}

acceptHandoffsViaRPC();
