require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const sdUuid = '8ae23bab-359f-4a83-9346-7d1c42dc62d5';

  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .insert({
      sd_id: sdUuid,
      from_phase: 'LEAD',
      to_phase: 'PLAN',
      handoff_type: 'LEAD-TO-PLAN',
      status: 'accepted',
      created_by: 'ADMIN_OVERRIDE',
      executive_summary: 'LEAD approved SD-LEO-INFRA-PROTOCOL-FILE-STATE-001 for PLAN phase. Scored 96%. Infrastructure SD with atomic file writes and placeholder detection scope.',
      deliverables_manifest: JSON.stringify(['Atomic write utility', 'Placeholder content detection gate', 'Tests']),
      key_decisions: JSON.stringify(['Write-to-temp-then-rename pattern', 'Warning (not blocking) for placeholder content']),
      completeness_report: JSON.stringify({ score: 96, gates_passed: 14, gates_total: 14 }),
      known_issues: JSON.stringify([{ issue: 'None identified', severity: 'low' }]),
      resource_utilization: JSON.stringify({ estimated_hours: 0.5 }),
      action_items: JSON.stringify(['Create atomic-write utility', 'Update generator to use atomic writes', 'Add placeholder detection to LEAD-TO-PLAN gate']),
      validation_score: 96,
      validation_passed: true,
      accepted_at: new Date().toISOString(),
    })
    .select();

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Handoff inserted:', data[0].id);
  }
}

main();
