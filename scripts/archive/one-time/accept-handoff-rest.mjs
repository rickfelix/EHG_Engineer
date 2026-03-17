#!/usr/bin/env node
/**
 * Accept a handoff via Supabase REST API with RPC call
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const HANDOFF_ID = process.argv[2] || 'b6fb1114-2a19-4371-9eec-265ebc8003b7';
const SD_ID = 'SD-STAGE1-ENTRY-UX-001';

async function main() {
  console.log('Accepting handoff:', HANDOFF_ID);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: true });

  // First verify handoff exists
  console.log('\n1. Checking handoff status...');
  const { data: handoff, error: checkError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, status, handoff_type, executive_summary')
    .eq('id', HANDOFF_ID)
    .single();

  if (checkError) {
    console.error('Failed to find handoff:', checkError);
    process.exit(1);
  }

  console.log('   Found handoff:', handoff.id);
  console.log('   SD:', handoff.sd_id);
  console.log('   Current status:', handoff.status);
  console.log('   Type:', handoff.handoff_type);

  // Try using direct SQL via RPC (if there's an RPC function available)
  // Otherwise try updating just accepted_at first
  console.log('\n2. Attempting to set accepted_at...');
  const { data: updated1, error: error1 } = await supabase
    .from('sd_phase_handoffs')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', HANDOFF_ID)
    .select('id, status, accepted_at');

  if (error1) {
    console.log('   accepted_at update failed:', error1.message);
  } else {
    console.log('   accepted_at updated');
  }

  // Now try the status update
  console.log('\n3. Attempting to set status=accepted...');
  const { data: updated2, error: error2 } = await supabase
    .from('sd_phase_handoffs')
    .update({ status: 'accepted' })
    .eq('id', HANDOFF_ID)
    .select('id, status, accepted_at');

  if (error2) {
    console.log('   status update failed:', error2.message);
    console.log('   Error code:', error2.code);
    console.log('   Error hint:', error2.hint);

    // The format() error is a bug in the database trigger
    // Document this for manual fix in Supabase dashboard
    console.log('\n=== MANUAL ACTION REQUIRED ===');
    console.log('The database has a bug in auto_validate_handoff() trigger');
    console.log('that causes format() errors when updating status.');
    console.log('\nTo fix manually in Supabase SQL Editor:');
    console.log('------------------------------------');
    console.log(`UPDATE sd_phase_handoffs
SET status = 'accepted',
    accepted_at = NOW()
WHERE id = '${HANDOFF_ID}';`);
    console.log('------------------------------------');

    // Also provide SQL to update SD
    console.log('\nThen update the SD:');
    console.log('------------------------------------');
    console.log(`UPDATE strategic_directives_v2
SET current_phase = 'PLAN'
WHERE id = '${SD_ID}';`);
    console.log('------------------------------------');
  } else {
    console.log('   Handoff accepted successfully!');
    console.log('   ID:', updated2[0]?.id);
    console.log('   Status:', updated2[0]?.status);
    console.log('   Accepted at:', updated2[0]?.accepted_at);
  }

  // Check final state
  console.log('\n4. Final handoff state:');
  const { data: final } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, status, handoff_type, accepted_at')
    .eq('id', HANDOFF_ID)
    .single();

  if (final) {
    console.log('   ID:', final.id);
    console.log('   SD:', final.sd_id);
    console.log('   Status:', final.status);
    console.log('   Type:', final.handoff_type);
    console.log('   Accepted at:', final.accepted_at);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
