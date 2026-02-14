#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // First find all children of the sub-orchestrator to see parent_sd_id format
  const { data: allChildren } = await supabase.from('strategic_directives_v2')
    .select('id, sd_key, status, progress, current_phase, parent_sd_id')
    .like('sd_key', 'SD-EVA-FEAT-TEMPLATES-%');

  console.log('All TEMPLATES children:');
  if (allChildren) {
    allChildren.forEach(c => console.log('  ', c.sd_key, 'parent:', c.parent_sd_id, 'status:', c.status, 'progress:', c.progress));
  }

  // Find parent orchestrator UUID
  const { data: parent } = await supabase.from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('sd_key', 'SD-EVA-ORCH-TEMPLATE-GAPFILL-001')
    .single();

  console.log('\nParent:', parent ? parent.sd_key + ' UUID:' + parent.id : 'NOT FOUND');

  // Get completed siblings using parent UUID
  const parentId = parent ? parent.id : 'SD-EVA-ORCH-TEMPLATE-GAPFILL-001';
  const { data: sibs } = await supabase.from('strategic_directives_v2')
    .select('id, sd_key, status, progress, current_phase')
    .eq('parent_sd_id', parentId)
    .eq('status', 'completed')
    .limit(1);

  if (!sibs || sibs.length === 0) { console.log('No completed siblings'); return; }
  const sib = sibs[0];
  console.log('Completed sibling:', sib.sd_key, 'UUID:', sib.id);
  console.log('  Status:', sib.status, 'Progress:', sib.progress, 'Phase:', sib.current_phase);

  const { data: handoffs } = await supabase.from('sd_phase_handoffs')
    .select('handoff_type, status, from_phase, to_phase, validation_score')
    .eq('sd_id', sib.id);

  console.log('\nHandoffs:', handoffs ? handoffs.length : 0);
  if (handoffs) {
    handoffs.forEach(h => console.log('  ', h.handoff_type, h.status, 'score:', h.validation_score));
  }

  // Also check progress breakdown for the completed sibling
  const { data: breakdown } = await supabase.rpc('get_progress_breakdown', { sd_id_param: sib.id });
  console.log('\nProgress breakdown:', JSON.stringify(breakdown, null, 2));

  // Check BUILDLOOP (0% progress, completed status) - how?
  const { data: bl } = await supabase.from('strategic_directives_v2')
    .select('id, sd_key, status, progress')
    .eq('sd_key', 'SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001')
    .single();
  if (bl) {
    console.log('\n--- BUILDLOOP (0% progress, completed) ---');
    console.log('UUID:', bl.id);
    const { data: blHandoffs } = await supabase.from('sd_phase_handoffs')
      .select('handoff_type, status')
      .eq('sd_id', bl.id);
    console.log('Handoffs:', blHandoffs ? blHandoffs.length : 0);
    if (blHandoffs) blHandoffs.forEach(h => console.log('  ', h.handoff_type, h.status));

    const { data: blBreak } = await supabase.rpc('get_progress_breakdown', { sd_id_param: bl.id });
    console.log('Total progress:', blBreak ? blBreak.total_progress : 'N/A');
  }
}
run();
