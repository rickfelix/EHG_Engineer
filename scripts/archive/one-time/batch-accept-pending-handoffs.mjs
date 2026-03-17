#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔄 Batch Accept Pending LEAD→PLAN Handoffs');
console.log('═'.repeat(70));

// Get all pending LEAD→PLAN handoffs
const { data: pendingHandoffs, error: fetchError } = await supabase
  .from('sd_phase_handoffs')
  .select('id, sd_id, from_phase, to_phase, status, created_at')
  .eq('from_phase', 'LEAD')
  .eq('to_phase', 'PLAN')
  .eq('status', 'pending_acceptance')
  .order('created_at', { ascending: true });

if (fetchError) {
  console.error('❌ Error fetching handoffs:', fetchError.message);
  process.exit(1);
}

console.log(`\n📋 Found ${pendingHandoffs.length} pending handoffs\n`);

let accepted = 0;
let failed = 0;
const results = [];

for (const handoff of pendingHandoffs) {
  console.log(`Processing ${handoff.sd_id}...`);

  // Use the accept_phase_handoff RPC function
  const { data, error } = await supabase.rpc('accept_phase_handoff', {
    handoff_id_param: handoff.id
  });

  if (error) {
    console.log(`  ❌ FAILED: ${error.message}`);
    failed++;
    results.push({ sd_id: handoff.sd_id, status: 'FAILED', error: error.message });
  } else {
    console.log(`  ✅ ACCEPTED`);
    accepted++;
    results.push({ sd_id: handoff.sd_id, status: 'ACCEPTED', accepted_at: data.accepted_at });
  }
}

console.log('\n═'.repeat(70));
console.log('📊 BATCH ACCEPTANCE SUMMARY');
console.log('═'.repeat(70));
console.log(`Total processed: ${pendingHandoffs.length}`);
console.log(`✅ Accepted: ${accepted}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Success rate: ${Math.round(accepted / pendingHandoffs.length * 100)}%`);

if (failed > 0) {
  console.log('\n❌ Failed Handoffs:');
  results.filter(r => r.status === 'FAILED').forEach(r => {
    console.log(`   ${r.sd_id}: ${r.error}`);
  });
}

console.log('\n═'.repeat(70));
console.log('✅ Batch acceptance complete!');
