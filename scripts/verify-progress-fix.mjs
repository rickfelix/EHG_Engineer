import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-PROOF-DRIVEN-1758340937844';

console.log('🔍 Verifying Migration Fix');
console.log('═'.repeat(60));
console.log('SD:', SD_ID);
console.log('');

// Call get_progress_breakdown RPC
const { data: breakdown, error } = await supabase
  .rpc('get_progress_breakdown', { sd_id_param: SD_ID });

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('📊 Progress Breakdown:');
console.log('');
console.log('Total Progress:', breakdown.total_progress + '%');
console.log('Can Complete:', breakdown.can_complete);
console.log('');

console.log('Phase Breakdown:');
console.log('');

const phases = breakdown.phases;

console.log('1. LEAD_approval:', phases.LEAD_approval.progress + '/' + phases.LEAD_approval.weight,
  phases.LEAD_approval.complete ? '✅' : '❌');

console.log('2. PLAN_prd:', phases.PLAN_prd.progress + '/' + phases.PLAN_prd.weight,
  phases.PLAN_prd.complete ? '✅' : '❌');

console.log('3. EXEC_implementation:', phases.EXEC_implementation.progress + '/' + phases.EXEC_implementation.weight,
  phases.EXEC_implementation.deliverables_complete ? '✅' : '❌');

console.log('4. PLAN_verification:', phases.PLAN_verification.progress + '/' + phases.PLAN_verification.weight);
console.log('   • user_stories_validated:', phases.PLAN_verification.user_stories_validated ? '✅ TRUE' : '❌ FALSE');
console.log('   • sub_agents_verified:', phases.PLAN_verification.sub_agents_verified ? '✅' : '❌');

console.log('5. LEAD_final_approval:', phases.LEAD_final_approval.progress + '/' + phases.LEAD_final_approval.weight);
console.log('   • retrospective_exists:', phases.LEAD_final_approval.retrospective_exists ? '✅' : '❌');
console.log('   • handoffs_complete:', phases.LEAD_final_approval.handoffs_complete ? '✅' : '❌');
console.log('   • handoff_count:', phases.LEAD_final_approval.handoff_count);

console.log('');
console.log('═'.repeat(60));

if (breakdown.total_progress === 100 && breakdown.can_complete) {
  console.log('✅ MIGRATION FIX VERIFIED - SD Ready for Completion!');
  console.log('');
  console.log('Run: node scripts/complete-sd-proof-driven.mjs');
} else {
  console.log('⚠️  Progress:', breakdown.total_progress + '% (expected 100%)');
  console.log('');
  console.log('Remaining issues:');
  if (!phases.PLAN_verification.user_stories_validated) {
    console.log('  • PLAN_verification.user_stories_validated still false');
  }
  if (breakdown.total_progress !== 100) {
    console.log('  • Total progress not 100%');
  }
}

console.log('');
