#!/usr/bin/env node
/**
 * Update SD-GTM-INTEL-DISCOVERY-001 Status to Conditional Completion
 * LEAD Final Approval: CONDITIONAL_PASS
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateSDStatus() {
  console.log('\n📊 Updating SD Status: SD-GTM-INTEL-DISCOVERY-001');
  console.log('='.repeat(70));

  const { data: _data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'active',
      current_phase: 'LEAD_FINAL_APPROVAL',
      progress_percentage: 85,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'SD-GTM-INTEL-DISCOVERY-001')
    .select()
    .single();

  if (error) {
    console.error('\n❌ Failed to update SD status:', error.message);
    process.exit(1);
  }

  console.log('\n✅ SD status updated successfully!');
  console.log('   Status:', data.status);
  console.log('   Phase:', data.current_phase);
  console.log('   Progress:', data.progress_percentage + '%');

  console.log('\n📋 CONDITIONAL_PASS Summary:');
  console.log('   ✅ All code artifacts delivered (migration, docs, E2E tests)');
  console.log('   ✅ US-002: COMPLETE (GTM Strategist investigation)');
  console.log('   ✅ US-003: COMPLETE (GTM routes documentation)');
  console.log('   ⚠️  US-001: 75% (RLS blocker - manual migration required)');

  console.log('\n💡 Post-Approval Tasks Required:');
  console.log('   1. Execute database/migrations/fix-gtm-navigation-routes.sql');
  console.log('   2. Verify navigation links in UI');
  console.log('   3. Run E2E tests (expect 13/13 pass)');
  console.log('   4. Clean up App.tsx (delete /gtm-strategist route)');
  console.log('');
}

updateSDStatus().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
