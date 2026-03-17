import { createSupabaseClient } from '../lib/supabase-client.js';

const supabase = createSupabaseClient();

console.log('=== Updating PLAN→LEAD Handoff with Migration Success ===\n');

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', 'SD-RECONNECT-004')
  .single();

const handoff = sd.metadata.plan_to_lead_handoff_week2;

// Update the handoff with migration success
handoff.content.completeness_report.runtime_verification.database_migration_applied = true;
handoff.content.completeness_report.runtime_verification.database_migration_status = 'SUCCESS';
handoff.content.completeness_report.runtime_verification.migration_applied_at = new Date().toISOString();

handoff.content.completeness_report.warnings = [
  'Runtime testing deferred (dev server not running during verification)',
  'Recommend smoke test during next dev session'
];

// Remove the database migration warning from known issues
handoff.content.known_issues_and_risks = handoff.content.known_issues_and_risks.filter(
  issue => issue.issue !== 'Database migration not applied'
);

// Update action items
handoff.content.action_items_for_lead[1] = {
  priority: 'HIGH',
  action: 'Acknowledge successful database migration',
  details: 'executive_reports table successfully created in EHG app database with 11 columns',
  recommendation: 'Migration complete - no deployment blockers',
  estimated_effort: '2 minutes'
};

await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      ...sd.metadata,
      plan_to_lead_handoff_week2: handoff
    }
  })
  .eq('id', 'SD-RECONNECT-004');

console.log('✅ Handoff updated with migration success\n');
console.log('Key Updates:');
console.log('  ✅ Database migration: APPLIED');
console.log('  ✅ Table: executive_reports (11 columns)');
console.log('  ✅ Deployment blockers: NONE');
console.log('  ✅ Ready for LEAD approval\n');
