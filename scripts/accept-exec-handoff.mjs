#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n📝 Accepting EXEC→PLAN handoff and updating PRD status...\n');

// Get current PRD with metadata
const { data: prd, error: fetchError } = await supabase
  .from('product_requirements_v2')
  .select('metadata')
  .eq('id', 'PRD-SD-STAGE4-UX-EDGE-CASES-001')
  .single();

if (fetchError) {
  console.error('❌ Error fetching PRD:', fetchError.message);
  process.exit(1);
}

// Update handoff status to accepted
const handoffs = prd.metadata?.handoffs || [];
if (handoffs.length > 0) {
  handoffs[handoffs.length - 1].status = 'accepted';
  handoffs[handoffs.length - 1].accepted_at = new Date().toISOString();
  handoffs[handoffs.length - 1].accepted_by = 'PLAN Supervisor';
  handoffs[handoffs.length - 1].plan_decision = 'ACCEPT - Merge P0+P1+P2 now';
  handoffs[handoffs.length - 1].plan_rationale = `High quality implementation (85/100 score), no blocking issues, immediate user value. P3+backend deferred to child SDs per LEO Protocol.`;
}

// Add child SD references to metadata
const updatedMetadata = {
  ...prd.metadata,
  handoffs,
  scope_reductions: [
    {
      deferred_to: 'SD-STAGE4-UX-EDGE-CASES-BACKEND-001',
      functional_requirements: ['FR-4: LLM extraction fallback'],
      user_stories: ['bb088ac3-6a1d-4a5b-a4d9-f0a6f1af807b'],
      estimated_hours: 9,
      reason: 'Backend work requires separate Python team. Frontend ready (P0+P1+P2 merged).',
      deferred_at: new Date().toISOString()
    }
  ]
};

// Update PRD
const { data, error } = await supabase
  .from('product_requirements_v2')
  .update({
    status: 'testing', // Move from in_progress to testing
    phase: 'verification', // Move from implementation to verification
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 100,
      EXEC_IMPL: 70, // P0+P1+P2 complete
      PLAN_VERIFY: 10, // Handoff accepted, verification starting
      LEAD_FINAL: 0
    },
    metadata: updatedMetadata,
    updated_at: new Date().toISOString()
  })
  .eq('id', 'PRD-SD-STAGE4-UX-EDGE-CASES-001')
  .select();

if (error) {
  console.error('❌ Error updating PRD:', error.message);
  process.exit(1);
}

console.log('✅ EXEC→PLAN handoff accepted!');
console.log(`   PRD: ${data[0].id}`);
console.log(`   Status: ${data[0].status}`);
console.log(`   Phase: ${data[0].phase}`);
console.log(`   PLAN_VERIFY Progress: ${data[0].phase_progress.PLAN_VERIFY}%`);
console.log('\n📊 Handoff Details:');
console.log(`   Decision: ACCEPT - Merge P0+P1+P2 now`);
console.log(`   Accepted by: PLAN Supervisor`);
console.log(`   Accepted at: ${handoffs[handoffs.length - 1].accepted_at}`);
console.log('\n🔗 Child SDs Created:');
console.log(`   1. SD-STAGE4-UX-EDGE-CASES-BACKEND-001 (FR-4, 9 hours Python)`);
console.log('\n📋 Scope Reductions Documented:');
updatedMetadata.scope_reductions.forEach((reduction, i) => {
  console.log(`   ${i + 1}. Deferred to: ${reduction.deferred_to}`);
  console.log(`      FRs: ${reduction.functional_requirements.join(', ')}`);
  console.log(`      Hours: ${reduction.estimated_hours}`);
  console.log(`      Reason: ${reduction.reason}`);
});
console.log('\n🎯 Next Phase: VERIFICATION');
console.log('   - Code review (if required)');
console.log('   - Test infrastructure fix (E2E navigation)');
console.log('   - Documentation updates');
console.log('');
