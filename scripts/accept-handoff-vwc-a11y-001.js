#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function acceptHandoffVwcA11y001() {
  const sdId = 'SD-VWC-A11Y-001';

  console.log('Accepting EXEC→PLAN handoff for SD-VWC-A11Y-001:\n');

  // Get the most recent EXEC→PLAN handoff
  const { data: handoffs, error: fetchError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, from_phase, to_phase, status, created_at')
    .eq('sd_id', sdId)
    .eq('from_phase', 'EXEC')
    .eq('to_phase', 'PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetchError) {
    console.log('❌ Error fetching handoffs:', fetchError.message);
    return;
  }

  if (!handoffs || handoffs.length === 0) {
    console.log('⚠️  No EXEC→PLAN handoffs found');
    return;
  }

  const handoff = handoffs[0];
  console.log('Found handoff:');
  console.log(`  ID: ${handoff.id}`);
  console.log(`  From: ${handoff.from_phase} → To: ${handoff.to_phase}`);
  console.log(`  Status: ${handoff.status}`);
  console.log(`  Created: ${handoff.created_at}\n`);

  if (handoff.status === 'accepted') {
    console.log('✅ Handoff is already accepted');
    return;
  }

  // Accept the handoff via RPC function
  const { data: _data, error } = await supabase.rpc('accept_phase_handoff', {
    handoff_id_param: handoff.id
  });

  if (error) {
    console.log('❌ Failed to accept handoff:', error.message);
    console.log('Error details:', error);
    return;
  }

  console.log('✅ Successfully accepted EXEC→PLAN handoff');

  // Verify the update
  const { data: updated, error: verifyError } = await supabase
    .from('sd_phase_handoffs')
    .select('status, updated_at, accepted_at')
    .eq('id', handoff.id)
    .single();

  if (verifyError) {
    console.log('⚠️  Could not verify update:', verifyError.message);
  } else {
    console.log('\nVerified:');
    console.log(`  New Status: ${updated.status}`);
    console.log(`  Accepted At: ${updated.accepted_at}`);
    console.log(`  Updated At: ${updated.updated_at}`);
  }

  console.log('\nChecking SD progress...');
  const { data: progress } = await supabase.rpc('calculate_sd_progress', {
    sd_id_param: sdId
  });

  if (progress !== null) {
    console.log(`Current Progress: ${progress}%`);
  }
}

acceptHandoffVwcA11y001();
