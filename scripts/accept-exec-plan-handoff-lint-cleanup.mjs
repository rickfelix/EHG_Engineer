#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const handoffId = '4a08a2c9-0247-4e7d-b1ba-002c3b6ff499';

console.log('🔄 Accepting EXEC→PLAN Handoff for SD-LINT-CLEANUP-001');
console.log('═'.repeat(70));

// Use the accept_phase_handoff RPC function
const { data, error } = await supabase.rpc('accept_phase_handoff', {
  handoff_id_param: handoffId
});

if (error) {
  console.error('❌ Error accepting handoff:', error.message);
  console.error('   Details:', error);
  process.exit(1);
}

console.log('✅ Handoff accepted successfully!');
console.log('\nUpdated handoff:');
console.log('   ID:', data.id);
console.log('   Status:', data.status);
console.log('   Accepted at:', data.accepted_at);
console.log('   From:', data.from_phase, '→', data.to_phase);

console.log('\n═'.repeat(70));
console.log('✅ PLAN phase can now proceed with verification');
