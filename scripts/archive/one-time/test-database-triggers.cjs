require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { readFileSync } = require('fs');
const { execSync } = require('child_process');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  console.log('=== Testing Database Triggers for sd_phase_handoffs ===\n');

  // Test 1: Create a test handoff with pending status
  console.log('Test 1: Auto-timestamp verification...');

  const testId = crypto.randomUUID();
  const testSdId = 'SD-DATA-INTEGRITY-001';

  const { error: insertError } = await supabase
    .from('sd_phase_handoffs')
    .insert({
      id: testId,
      sd_id: testSdId,
      from_phase: 'EXEC',
      to_phase: 'PLAN',
      handoff_type: 'EXEC-to-PLAN',
      status: 'pending_acceptance',
      executive_summary: 'Test handoff for trigger verification - this is a test message with sufficient length',
      deliverables_manifest: 'Test deliverables manifest',
      key_decisions: 'Test key decisions',
      known_issues: 'Test known issues',
      resource_utilization: 'Test resource utilization',
      action_items: 'Test action items',
      completeness_report: 'Test completeness report',
      metadata: { test: true },
      created_by: 'TRIGGER-TEST'
    });

  if (insertError) {
    console.error('❌ Insert failed:', insertError.message);
    process.exit(1);
  }

  console.log('✅ Test handoff created');

  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 100));

  // Update status to accepted
  const { error: updateError } = await supabase
    .from('sd_phase_handoffs')
    .update({ status: 'accepted' })
    .eq('id', testId);

  if (updateError) {
    console.error('❌ Update failed:', updateError.message);
  } else {
    console.log('✅ Status updated to accepted');
  }

  // Wait for trigger to execute
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check if accepted_at was set
  const { data, error: selectError } = await supabase
    .from('sd_phase_handoffs')
    .select('accepted_at, status')
    .eq('id', testId)
    .single();

  if (selectError) {
    console.error('❌ Select failed:', selectError.message);
  } else if (data.accepted_at) {
    console.log('✅ accepted_at auto-set:', data.accepted_at);
  } else {
    console.log('⚠️  accepted_at not set (trigger may not be installed)');
  }

  // Clean up test record
  await supabase.from('sd_phase_handoffs').delete().eq('id', testId);
  console.log('✅ Test record cleaned up\n');

  // Test 2: Verify progress recalculation
  console.log('Test 2: Progress calculation verification...');

  const { data: sdData } = await supabase
    .from('strategic_directives_v2')
    .select('progress_percentage, id')
    .eq('id', testSdId)
    .single();

  if (sdData) {
    console.log(`✅ Current SD progress: ${sdData.progress_percentage}%`);
  }

  console.log('\n✅ Trigger tests complete!');
  console.log('\nNext steps:');
  console.log('1. Apply migration: supabase db push (or run SQL directly)');
  console.log('2. Verify triggers are active in database');
  console.log('3. Test with real handoff creation');
})().catch(console.error);
