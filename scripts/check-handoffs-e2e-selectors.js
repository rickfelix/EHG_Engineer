#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkHandoffs() {
  console.log('Checking handoffs for SD-2025-1020-E2E-SELECTORS:\n');

  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, created_at')
    .eq('sd_id', 'SD-2025-1020-E2E-SELECTORS')
    .order('created_at', { ascending: true });

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  if (!handoffs || handoffs.length === 0) {
    console.log('❌ No handoffs found');
    console.log('');
    console.log('Need to create at minimum:');
    console.log('  1. LEAD-to-PLAN (status: accepted)');
    console.log('  2. PLAN-to-EXEC (status: accepted)');
    console.log('  3. EXEC-to-PLAN (status: accepted)');
    return;
  }

  console.log('Found', handoffs.length, 'handoffs:');
  console.log('');
  handoffs.forEach(h => {
    const icon = h.status === 'accepted' ? '✅' : '⚠️';
    console.log(`  ${icon} ${h.handoff_type} - ${h.status}`);
  });

  const acceptedCount = handoffs.filter(h => h.status === 'accepted').length;
  const distinctTypes = new Set(handoffs.filter(h => h.status === 'accepted').map(h => h.handoff_type)).size;

  console.log('');
  console.log('Accepted handoffs:', acceptedCount);
  console.log('Distinct types:', distinctTypes, '/ 3 required');
  console.log('');

  if (distinctTypes >= 3) {
    console.log('✅ Sufficient handoffs for LEAD final approval (15 points)');
    console.log('   Progress should be 100/100');
  } else {
    console.log(`❌ Need ${3 - distinctTypes} more DISTINCT accepted handoff types`);
    console.log('   Current progress: 85/100');
  }
}

checkHandoffs();
