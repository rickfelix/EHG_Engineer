import { createSupabaseClient } from '../lib/supabase-client.js';

const supabase = createSupabaseClient();

console.log('=== PLAN Agent: Accepting EXEC→PLAN Handoff ===\n');

// Get current SD with handoff data
const { data: sd, error: fetchError } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', 'SD-RECONNECT-004')
  .single();

if (fetchError) {
  console.error('❌ Error fetching SD:', fetchError);
  process.exit(1);
}

const handoff = sd.metadata?.exec_to_plan_handoff_week2;

if (!handoff) {
  console.error('❌ No Week 2 handoff found in SD metadata');
  process.exit(1);
}

console.log('📋 Handoff Details:');
console.log('  From:', handoff.from_agent);
console.log('  To:', handoff.to_agent);
console.log('  Type:', handoff.handoff_type);
console.log('  Status:', handoff.status);
console.log('');

// Review handoff completeness
console.log('✅ Handoff Review:');
console.log('  1. Executive Summary:', handoff.content.executive_summary ? 'PRESENT' : 'MISSING');
console.log('  2. Completeness Report:', handoff.content.completeness_report ? 'PRESENT' : 'MISSING');
console.log('  3. Deliverables Manifest:', handoff.content.deliverables_manifest ? 'PRESENT' : 'MISSING');
console.log('  4. Key Decisions:', handoff.content.key_decisions ? 'PRESENT' : 'MISSING');
console.log('  5. Known Issues & Risks:', handoff.content.known_issues_and_risks ? 'PRESENT' : 'MISSING');
console.log('  6. Resource Utilization:', handoff.content.resource_utilization ? 'PRESENT' : 'MISSING');
console.log('  7. Action Items for PLAN:', handoff.content.action_items_for_plan ? 'PRESENT' : 'MISSING');
console.log('');

// Verify all 7 elements present
const allElementsPresent =
  handoff.content.executive_summary &&
  handoff.content.completeness_report &&
  handoff.content.deliverables_manifest &&
  handoff.content.key_decisions &&
  handoff.content.known_issues_and_risks &&
  handoff.content.resource_utilization &&
  handoff.content.action_items_for_plan;

if (!allElementsPresent) {
  console.error('❌ HANDOFF REJECTED: Missing required elements');
  process.exit(1);
}

console.log('✅ All 7 mandatory elements present');
console.log('');

// Review deliverables
console.log('📦 Deliverables Received:');
handoff.content.deliverables_manifest.files_created?.forEach(f => {
  console.log('  ✅', f);
});
console.log('');

// Review HIGH priority issues
const highIssues = handoff.content.known_issues_and_risks.filter(i => i.severity === 'HIGH');
console.log('⚠️  HIGH Priority Issues:', highIssues.length);
highIssues.forEach(issue => {
  console.log('  -', issue.issue);
  console.log('    Mitigation:', issue.mitigation);
});
console.log('');

// Accept handoff
const { error: updateError } = await supabase
  .from('strategic_directives_v2')
  .update({
    current_phase: 'PLAN_VERIFICATION',
    metadata: {
      ...sd.metadata,
      exec_to_plan_handoff_week2: {
        ...handoff,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: 'PLAN'
      },
      plan_verification_status: {
        started_at: new Date().toISOString(),
        phase: 'acceptance_testing',
        tests_to_run: [
          'database_migration_verification',
          'typescript_compilation_check',
          'integration_test_suite',
          'manual_smoke_test'
        ],
        high_priority_actions: handoff.content.action_items_for_plan
          .filter(a => a.priority === 'HIGH')
          .map(a => a.action)
      }
    }
  })
  .eq('id', 'SD-RECONNECT-004');

if (updateError) {
  console.error('❌ Error accepting handoff:', updateError);
  process.exit(1);
}

console.log('✅ HANDOFF ACCEPTED by PLAN agent');
console.log('');
console.log('SD-RECONNECT-004 Phase: PLAN_VERIFICATION');
console.log('');
console.log('Next Steps:');
console.log('  1. Apply database migration (HIGH priority)');
console.log('  2. Create integration tests (HIGH priority)');
console.log('  3. Manual smoke test');
console.log('  4. Verify TypeScript compilation');
console.log('  5. Plan Week 2 implementation');
console.log('');
console.log('🚀 PLAN verification phase begins now');
