#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔄 Batch Accept All Valid Pending Handoffs');
console.log('═'.repeat(70));

const handoffTypes = [
  { from: 'PLAN', to: 'EXEC', name: 'PLAN→EXEC' },
  { from: 'EXEC', to: 'PLAN', name: 'EXEC→PLAN' },
  { from: 'PLAN', to: 'LEAD', name: 'PLAN→LEAD' }
];

const overallResults = {
  total: 0,
  accepted: 0,
  skipped: 0,
  failed: 0
};

for (const type of handoffTypes) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📋 Processing ${type.name} Handoffs`);
  console.log('='.repeat(70));

  // Get all pending handoffs of this type
  const { data: pendingHandoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, executive_summary, created_at')
    .eq('from_phase', type.from)
    .eq('to_phase', type.to)
    .eq('status', 'pending_acceptance')
    .order('created_at', { ascending: true });

  if (!pendingHandoffs || pendingHandoffs.length === 0) {
    console.log('   No pending handoffs found');
    continue;
  }

  console.log(`\nFound ${pendingHandoffs.length} pending ${type.name} handoffs\n`);
  overallResults.total += pendingHandoffs.length;

  let typeAccepted = 0;
  let typeSkipped = 0;
  let typeFailed = 0;

  for (const handoff of pendingHandoffs) {
    // Validate executive summary exists and is >50 chars
    if (!handoff.executive_summary || handoff.executive_summary.length < 50) {
      console.log(`⏭️  SKIP ${handoff.sd_id}: Missing/incomplete executive summary`);
      typeSkipped++;
      overallResults.skipped++;
      continue;
    }

    // Attempt to accept
    const { error } = await supabase.rpc('accept_phase_handoff', {
      handoff_id_param: handoff.id
    });

    if (error) {
      console.log(`❌ FAIL ${handoff.sd_id}: ${error.message.substring(0, 60)}...`);
      typeFailed++;
      overallResults.failed++;
    } else {
      console.log(`✅ OK   ${handoff.sd_id}`);
      typeAccepted++;
      overallResults.accepted++;
    }
  }

  console.log(`\n${type.name} Summary: ${typeAccepted} accepted, ${typeSkipped} skipped, ${typeFailed} failed`);
}

console.log('\n' + '═'.repeat(70));
console.log('📊 OVERALL BATCH ACCEPTANCE SUMMARY');
console.log('═'.repeat(70));
console.log(`Total processed: ${overallResults.total}`);
console.log(`✅ Accepted: ${overallResults.accepted}`);
console.log(`⏭️  Skipped: ${overallResults.skipped} (missing executive summary)`);
console.log(`❌ Failed: ${overallResults.failed}`);

if (overallResults.total > 0) {
  const successRate = Math.round(overallResults.accepted / overallResults.total * 100);
  console.log(`\nSuccess rate: ${successRate}% (accepted / total)`);
  console.log(`Valid rate: ${Math.round((overallResults.accepted + overallResults.skipped) / overallResults.total * 100)}% (no errors)`);
}

console.log('\n═'.repeat(70));
console.log('✅ Batch acceptance complete!');
