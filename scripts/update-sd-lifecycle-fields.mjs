import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function updateSD() {
  console.log('Updating SD-CAPABILITY-LIFECYCLE-001 with required fields...\n');

  const updates = {
    success_metrics: JSON.stringify([
      { metric: 'Auto-registration success rate', target: '100% of SDs with delivers_capabilities auto-register capabilities', measurement: 'Database audit of SD completions vs capability inserts' },
      { metric: 'Manual registration reduction', target: '0 manual capability registration scripts needed', measurement: 'Count of manual scripts run post-implementation' },
      { metric: 'Capability data freshness', target: '<5 minutes from SD completion to capability availability', measurement: 'Timestamp comparison in audit trail' }
    ]),
    key_principles: JSON.stringify([
      'Event-driven automation using existing trigger patterns',
      'Database-first implementation (no external dependencies)',
      'Backward compatible with existing capability tables',
      'Audit trail for all capability lifecycle changes'
    ]),
    risks: JSON.stringify([
      { risk: 'Trigger performance impact on SD completion', probability: 'Low', impact: 'Medium', mitigation: 'Keep trigger logic simple, defer complex operations' },
      { risk: 'Incorrect capability extraction from SD metadata', probability: 'Medium', impact: 'Low', mitigation: 'Validate delivers_capabilities structure before processing' },
      { risk: 'Duplicate capability entries', probability: 'Low', impact: 'Low', mitigation: 'Use UPSERT with conflict resolution on capability_key' }
    ])
  };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update(updates)
    .eq('id', 'SD-CAPABILITY-LIFECYCLE-001');

  if (error) {
    console.log('Error updating SD:', error.message);
    return;
  }

  console.log('✅ SD updated successfully with:');
  console.log('   - success_metrics: 3 metrics defined');
  console.log('   - key_principles: 4 principles defined');
  console.log('   - risks: 3 risks with mitigations');
  console.log('\nNext: Re-run the LEAD-TO-PLAN handoff');
}

updateSD();
