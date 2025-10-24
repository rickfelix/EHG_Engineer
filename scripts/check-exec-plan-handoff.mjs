#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📊 Checking EXEC→PLAN Handoff Status for SD-LINT-CLEANUP-001');
console.log('═'.repeat(70));

const { data: handoffs } = await supabase
  .from('sd_phase_handoffs')
  .select('id, from_phase, to_phase, status, created_at')
  .eq('sd_id', 'SD-LINT-CLEANUP-001')
  .eq('from_phase', 'EXEC')
  .eq('to_phase', 'PLAN')
  .order('created_at', { ascending: false })
  .limit(1);

if (!handoffs || handoffs.length === 0) {
  console.log('⏳ No EXEC→PLAN handoff found yet');
  console.log('   Sub-agents may still be running...');
} else {
  const h = handoffs[0];
  console.log('✅ EXEC→PLAN Handoff Found!');
  console.log('   ID:', h.id);
  console.log('   Status:', h.status);
  console.log('   Created:', h.created_at);
}

console.log('═'.repeat(70));
