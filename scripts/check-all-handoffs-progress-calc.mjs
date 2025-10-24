#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from('sd_phase_handoffs')
  .select('id, handoff_type, status, from_phase, to_phase, created_at, accepted_at, rejected_at, rejection_reason, executive_summary')
  .eq('sd_id', 'SD-PROGRESS-CALC-FIX')
  .order('created_at', { ascending: false });

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log(`Found ${data.length} handoff(s) for SD-PROGRESS-CALC-FIX:\n`);

data.forEach((h, i) => {
  console.log(`${i+1}. ${h.handoff_type} (${h.from_phase} → ${h.to_phase})`);
  console.log(`   Status: ${h.status}`);
  console.log(`   Created: ${h.created_at}`);
  if (h.accepted_at) {
    console.log(`   Accepted: ${h.accepted_at}`);
  }
  if (h.rejected_at) {
    console.log(`   Rejected: ${h.rejected_at}`);
  }
  if (h.rejection_reason) {
    console.log(`   Reason: ${h.rejection_reason.substring(0, 150)}...`);
  }
  if (h.executive_summary) {
    console.log(`   Summary: ${h.executive_summary.substring(0, 100)}...`);
  }
  console.log('');
});

// Check if there's an accepted handoff
const accepted = data.filter(h => h.status === 'accepted');
if (accepted.length > 0) {
  console.log(`✅ ${accepted.length} accepted handoff(s) found!`);
} else {
  console.log(`⚠️  No accepted handoffs yet. Need to fix rejection issues.`);
}
