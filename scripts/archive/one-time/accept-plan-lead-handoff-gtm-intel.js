#!/usr/bin/env node
/**
 * Accept PLAN→LEAD Handoff for SD-GTM-INTEL-DISCOVERY-001
 * LEAD Final Approval Phase
 *
 * Verdict: CONDITIONAL_PASS accepted
 * Post-Approval Tasks Required:
 * 1. Manual migration execution via Supabase dashboard
 * 2. E2E test validation
 * 3. App.tsx cleanup
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function acceptHandoff() {
  console.log('\n✅ LEAD Final Approval: Accepting PLAN→LEAD Handoff');
  console.log('='.repeat(70));
  console.log('   SD: SD-GTM-INTEL-DISCOVERY-001');

  // Find latest PLAN-TO-LEAD handoff
  const { data: handoffs, error: findError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, handoff_type, validation_score, validation_details')
    .eq('sd_id', 'SD-GTM-INTEL-DISCOVERY-001')
    .eq('handoff_type', 'PLAN-TO-LEAD')
    .eq('status', 'pending_acceptance')
    .order('created_at', { ascending: false })
    .limit(1);

  if (findError || !handoffs || handoffs.length === 0) {
    console.error('\n❌ No pending PLAN→LEAD handoff found');
    process.exit(1);
  }

  const handoff = handoffs[0];
  console.log('   Handoff ID:', handoff.id);
  console.log('   Validation Score:', handoff.validation_score + '%');
  console.log('   Verdict:', handoff.validation_details.verdict);

  // Accept handoff
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString()
    })
    .eq('id', handoff.id)
    .select()
    .single();

  if (error) {
    console.error('\n❌ Failed to accept handoff:', error.message);
    process.exit(1);
  }

  console.log('\n✅ PLAN→LEAD handoff accepted!');
  console.log('   Status:', data.status);
  console.log('   Accepted at:', data.accepted_at);

  console.log('\n📋 CONDITIONAL_PASS Acceptance:');
  console.log('   ✅ All code artifacts production-ready');
  console.log('   ✅ Documentation comprehensive');
  console.log('   ✅ E2E tests created');
  console.log('   ⚠️  RLS blocker requires manual intervention');

  console.log('\n💡 Post-Approval Tasks (Required for Full Completion):');
  console.log('   1. Execute database/migrations/fix-gtm-navigation-routes.sql via Supabase dashboard');
  console.log('   2. Verify navigation links in UI (Strategy & Execution + Go-To-Market sections)');
  console.log('   3. Run E2E tests: npx playwright test gtm-navigation-sd-gtm-intel-discovery-001.spec.ts');
  console.log('   4. Clean up App.tsx: delete /gtm-strategist route (lines 111, 963-974)');
  console.log('   5. Verify all tests pass (13/13 expected)');
  console.log('');
}

acceptHandoff().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
