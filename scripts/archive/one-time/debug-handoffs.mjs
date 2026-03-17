#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug() {
  const sdId = process.argv[2] || 'SD-VISION-V2-002';

  console.log(`🔍 Debugging handoffs for ${sdId}`);
  console.log('');

  // Get all handoffs for this SD
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, from_phase, to_phase, status, validation_score, created_at')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: true });

  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  console.log('=== ALL HANDOFFS ===');
  if (!handoffs || handoffs.length === 0) {
    console.log('  No handoffs found');
  } else {
    handoffs.forEach(h => {
      console.log(`  ${h.from_phase} → ${h.to_phase}: ${h.status} (${h.validation_score || 'N/A'}%) - ${h.created_at}`);
    });
  }
  console.log('');
  console.log(`Total handoffs: ${handoffs?.length || 0}`);

  // Check specifically for LEAD-TO-PLAN
  const leadToPlan = handoffs?.find(h => h.from_phase === 'LEAD' && h.to_phase === 'PLAN');
  console.log('');
  console.log('LEAD-TO-PLAN exists:', leadToPlan ? 'YES' : 'NO');
  if (leadToPlan) {
    console.log('  ID:', leadToPlan.id);
    console.log('  Status:', leadToPlan.status);
  }
}

debug().catch(console.error);
