#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking Handoff Executions for SD-KNOWLEDGE-001\n');

const { data: handoffs, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-KNOWLEDGE-001')
  .order('completed_at', { ascending: true });

if (error) {
  console.error('❌ Error:', error.message);
} else if (!handoffs || handoffs.length === 0) {
  console.log('No handoffs found in sd_phase_handoffs');
} else {
  console.log(`Found ${handoffs.length} handoff(s):\n`);
  handoffs.forEach((h, idx) => {
    console.log(`${idx + 1}. ${h.handoff_type}`);
    console.log(`   ID: ${h.id}`);
    console.log(`   Status: ${h.status}`);
    console.log(`   From: ${h.from_agent} → To: ${h.to_agent}`);
    console.log(`   Completed: ${h.completed_at}`);
    console.log(`   Score: ${h.validation_score}`);
    console.log('');
  });
}
