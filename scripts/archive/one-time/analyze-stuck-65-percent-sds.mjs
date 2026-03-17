#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Comprehensive Analysis of All SDs at 65%');
console.log('═'.repeat(70));

// Get all SDs at 65%
const { data: allSDs } = await supabase
  .from('strategic_directives_v2')
  .select('id, current_phase, status')
  .eq('progress_percentage', 65);

console.log(`\nTotal SDs at 65%: ${allSDs.length}\n`);

const phaseBreakdown = {};
const invalidSDs = [];
const validSDs = [];

for (const sd of allSDs) {
  // Count by phase
  phaseBreakdown[sd.current_phase] = (phaseBreakdown[sd.current_phase] || 0) + 1;

  // Check for valid handoff justification
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('id, from_phase, to_phase, status')
    .eq('sd_id', sd.id);

  const hasAcceptedLeadToPlan = handoffs?.some(h =>
    h.from_phase === 'LEAD' && h.to_phase === 'PLAN' && h.status === 'accepted'
  );

  // SDs in PLAN* or EXEC* phases need handoff justification
  const needsHandoff = ['PLAN_DESIGN', 'PLAN_VERIFY', 'PLAN', 'EXEC', 'EXEC_IMPLEMENT'].includes(sd.current_phase);

  if (needsHandoff && !hasAcceptedLeadToPlan) {
    invalidSDs.push({ ...sd, handoffs: handoffs?.length || 0 });
  } else {
    validSDs.push({ ...sd, handoffs: handoffs?.length || 0 });
  }
}

console.log('📊 Phase Breakdown:');
Object.entries(phaseBreakdown).sort((a, b) => b[1] - a[1]).forEach(([phase, count]) => {
  console.log(`   ${phase.padEnd(20)}: ${count}`);
});

console.log(`\n${'═'.repeat(70)}`);
console.log('🔍 Validation Results:');
console.log(`   ✅ Valid SDs (proper handoffs): ${validSDs.length}`);
console.log(`   ❌ Invalid SDs (no handoff): ${invalidSDs.length}`);

if (invalidSDs.length > 0) {
  console.log(`\n❌ Invalid SDs that need phase reset:`);
  invalidSDs.forEach(sd => {
    console.log(`   ${sd.id.padEnd(35)} | ${sd.current_phase.padEnd(20)} → LEAD_APPROVAL`);
  });

  console.log(`\n${'═'.repeat(70)}`);
  console.log('💡 RECOMMENDED FIX:');
  console.log(`   Reset ${invalidSDs.length} SDs to LEAD_APPROVAL phase`);
  console.log(`   This will recalculate their progress to correct values`);
  console.log(`\n   Script will:`);
  console.log(`   1. UPDATE current_phase to LEAD_APPROVAL`);
  console.log(`   2. RECALCULATE progress_percentage`);
  console.log(`   3. VERIFY new progress is correct`);
}

if (validSDs.length > 0) {
  console.log(`\n✅ Valid SDs (no action needed):`);
  validSDs.slice(0, 5).forEach(sd => {
    console.log(`   ${sd.id.padEnd(35)} | ${sd.current_phase.padEnd(20)} | ${sd.handoffs} handoffs`);
  });
  if (validSDs.length > 5) {
    console.log(`   ... and ${validSDs.length - 5} more`);
  }
}

console.log(`\n${'═'.repeat(70)}`);
console.log(`📋 Export invalid SD IDs for batch fix:`);
console.log(invalidSDs.map(sd => `'${sd.id}'`).join(', '));
