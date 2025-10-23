#!/usr/bin/env node
/**
 * Query SD Phase Handoff Details
 *
 * Usage: node scripts/query-handoff.js SD-VWC-A11Y-001 PLAN LEAD
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function queryHandoff(sdId, fromPhase, toPhase) {
  console.log(`\n🔍 Querying handoff for ${sdId} (${fromPhase} → ${toPhase})...\n`);

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_id', sdId)
    .eq('from_phase', fromPhase)
    .eq('to_phase', toPhase)
    .eq('status', 'pending_acceptance')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('❌ Error querying handoff:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('❌ No pending handoff found');
    process.exit(1);
  }

  // Pretty print the handoff details
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📋 HANDOFF DETAILS: ${sdId}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`🆔 Handoff ID: ${data.handoff_id}`);
  console.log(`📊 Status: ${data.status}`);
  console.log(`➡️  From Phase: ${data.from_phase}`);
  console.log(`⬅️  To Phase: ${data.to_phase}`);
  console.log(`📅 Created: ${data.created_at}`);
  console.log(`✅ Accepted: ${data.accepted_at || 'N/A'}\n`);

  console.log('─────────────────────────────────────────────────────────────');
  console.log('📝 EXECUTIVE SUMMARY');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(data.executive_summary || 'N/A');
  console.log('');

  console.log('─────────────────────────────────────────────────────────────');
  console.log('📦 DELIVERABLES MANIFEST');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(data.deliverables_manifest, null, 2));
  console.log('');

  console.log('─────────────────────────────────────────────────────────────');
  console.log('🎯 KEY DECISIONS');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(data.key_decisions, null, 2));
  console.log('');

  console.log('─────────────────────────────────────────────────────────────');
  console.log('⚠️  KNOWN ISSUES');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(data.known_issues, null, 2));
  console.log('');

  console.log('─────────────────────────────────────────────────────────────');
  console.log('📊 RESOURCE UTILIZATION');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(data.resource_utilization, null, 2));
  console.log('');

  console.log('─────────────────────────────────────────────────────────────');
  console.log('✅ ACTION ITEMS');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(data.action_items, null, 2));
  console.log('');

  console.log('─────────────────────────────────────────────────────────────');
  console.log('📋 COMPLETENESS REPORT');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(JSON.stringify(data.completeness_report, null, 2));
  console.log('');

  if (data.verification_verdict) {
    console.log('─────────────────────────────────────────────────────────────');
    console.log('✅ VERIFICATION VERDICT');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(JSON.stringify(data.verification_verdict, null, 2));
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Parse arguments
const sdId = process.argv[2] || 'SD-VWC-A11Y-001';
const fromPhase = process.argv[3] || 'PLAN';
const toPhase = process.argv[4] || 'LEAD';

queryHandoff(sdId, fromPhase, toPhase)
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
