#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔧 Fixing 21 SDs Stuck at 65% with Invalid Phase');
console.log('═'.repeat(70));

const invalidSDIds = [
  'SD-MONITORING-001', 'SD-034', 'SD-043', 'SD-BACKLOG-INT-001',
  'SD-042', 'SD-032', 'SD-040', 'SD-035', 'SD-033', 'SD-VISION-ALIGN-001',
  'SD-026', 'SD-038', 'SD-005', 'SD-017', 'SD-050', 'SD-030',
  'SD-013', 'SD-007', 'SD-049', 'SD-020', 'SD-VWC-PHASE2-001'
];

console.log(`\nResetting ${invalidSDIds.length} SDs to LEAD_APPROVAL phase\n`);

let fixed = 0;
let failed = 0;
const results = [];

for (const sdId of invalidSDIds) {
  console.log(`Processing ${sdId}...`);

  // Get current state
  const { data: before } = await supabase
    .from('strategic_directives_v2')
    .select('id, current_phase, progress_percentage')
    .eq('id', sdId)
    .single();

  if (!before) {
    console.log(`  ❌ SD not found`);
    failed++;
    continue;
  }

  // Reset to LEAD_APPROVAL phase
  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: 'LEAD_APPROVAL',
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId);

  if (updateError) {
    console.log(`  ❌ Update failed: ${updateError.message}`);
    failed++;
    results.push({ sd_id: sdId, status: 'FAILED', error: updateError.message });
    continue;
  }

  // Recalculate progress
  const { data: newProgress, error: calcError } = await supabase.rpc('calculate_sd_progress', {
    sd_id_param: sdId
  });

  if (calcError) {
    console.log(`  ⚠️  Progress recalculation failed: ${calcError.message}`);
    // Don't fail completely - phase was still reset
  }

  // Update with recalculated progress
  if (newProgress !== null) {
    await supabase
      .from('strategic_directives_v2')
      .update({
        progress_percentage: newProgress,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId);
  }

  // Verify new state
  const { data: after } = await supabase
    .from('strategic_directives_v2')
    .select('id, current_phase, progress_percentage')
    .eq('id', sdId)
    .single();

  console.log(`  ✅ FIXED: ${before.current_phase} (${before.progress_percentage}%) → ${after.current_phase} (${after.progress_percentage}%)`);
  fixed++;
  results.push({
    sd_id: sdId,
    status: 'FIXED',
    before: { phase: before.current_phase, progress: before.progress_percentage },
    after: { phase: after.current_phase, progress: after.progress_percentage }
  });
}

console.log('\n' + '═'.repeat(70));
console.log('📊 FIX SUMMARY');
console.log('═'.repeat(70));
console.log(`Total processed: ${invalidSDIds.length}`);
console.log(`✅ Fixed: ${fixed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Success rate: ${Math.round(fixed / invalidSDIds.length * 100)}%`);

if (fixed > 0) {
  console.log('\n✅ Successfully fixed SDs:');
  results.filter(r => r.status === 'FIXED').slice(0, 5).forEach(r => {
    console.log(`   ${r.sd_id}: ${r.before.phase}→${r.after.phase}, ${r.before.progress}%→${r.after.progress}%`);
  });
  if (fixed > 5) {
    console.log(`   ... and ${fixed - 5} more`);
  }
}

if (failed > 0) {
  console.log('\n❌ Failed SDs:');
  results.filter(r => r.status === 'FAILED').forEach(r => {
    console.log(`   ${r.sd_id}: ${r.error}`);
  });
}

console.log('\n' + '═'.repeat(70));
console.log('🎯 IMPACT:');
console.log(`   ${fixed} SDs reset from invalid PLAN phase to LEAD_APPROVAL`);
console.log(`   Progress recalculated to reflect actual completion state`);
console.log(`   These SDs now need proper LEAD→PLAN handoffs to enter PLAN phase`);
console.log('\n✅ Fix complete!');
