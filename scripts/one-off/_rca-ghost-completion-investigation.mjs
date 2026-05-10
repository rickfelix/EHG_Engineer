import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('========================================');
console.log('GHOST-COMPLETION FORENSIC INVESTIGATION');
console.log('========================================\n');

// 1. Inspect the witness SD
console.log('--- 1. WITNESS SD (b737c27f-3e83-4887-999e-3c1ae158faf4) ---');
const { data: witness, error: wErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, status, current_phase, progress_percentage, sd_type, parent_sd_id, completion_date, updated_at, created_at, metadata, is_working_on')
  .eq('id', 'b737c27f-3e83-4887-999e-3c1ae158faf4')
  .single();
if (wErr) console.error('Witness error:', wErr);
else console.log(JSON.stringify(witness, null, 2));

// 2. All handoffs for witness
console.log('\n--- 2. ALL HANDOFFS for witness (sd_phase_handoffs) ---');
const { data: handoffs, error: hErr } = await supabase
  .from('sd_phase_handoffs')
  .select('id, handoff_type, status, from_phase, to_phase, validation_score, created_by, created_at, accepted_at, rejected_at')
  .eq('sd_id', 'b737c27f-3e83-4887-999e-3c1ae158faf4')
  .order('created_at', { ascending: true });
if (hErr) console.error('Handoffs error:', hErr);
else {
  console.log(`Total handoffs: ${handoffs.length}`);
  handoffs.forEach(h => {
    console.log(`  ${h.created_at} ${h.handoff_type.padEnd(22)} ${h.status.padEnd(10)} score=${h.validation_score || 'NULL'} created_by=${h.created_by || 'NULL'}`);
  });
}

// 3. Same query on leo_handoff_executions (where LeadFinalApprovalExecutor writes)
console.log('\n--- 3. ALL handoffs for witness in leo_handoff_executions ---');
const { data: lhe, error: lheErr } = await supabase
  .from('leo_handoff_executions')
  .select('id, handoff_type, status, from_agent, to_agent, validation_score, created_by, created_at, accepted_at')
  .eq('sd_id', 'b737c27f-3e83-4887-999e-3c1ae158faf4')
  .order('created_at', { ascending: true });
if (lheErr) console.error('LHE error:', lheErr);
else {
  console.log(`Total LHE rows: ${lhe.length}`);
  lhe.forEach(h => {
    console.log(`  ${h.created_at} ${h.handoff_type.padEnd(22)} ${h.status.padEnd(10)} score=${h.validation_score || 'NULL'} created_by=${h.created_by || 'NULL'}`);
  });
}

// 4. Check witness children
console.log('\n--- 4. WITNESS CHILDREN ---');
const { data: children } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, status, current_phase')
  .eq('parent_sd_id', 'b737c27f-3e83-4887-999e-3c1ae158faf4');
console.log(`Children: ${children?.length || 0}`);
if (children?.length) children.forEach(c => console.log(`  ${c.sd_key} status=${c.status} phase=${c.current_phase}`));

// 5. Check if witness is itself a child
if (witness?.parent_sd_id) {
  console.log(`\n--- 5. WITNESS IS A CHILD of: ${witness.parent_sd_id} ---`);
  const { data: parent } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, current_phase, sd_type')
    .eq('id', witness.parent_sd_id)
    .single();
  if (parent) console.log(JSON.stringify(parent, null, 2));
}

// 6. Retrospectives for witness
console.log('\n--- 6. RETROSPECTIVES for witness ---');
const { data: retros } = await supabase
  .from('retrospectives')
  .select('id, sd_id, retrospective_type, quality_score, status, created_at')
  .eq('sd_id', 'b737c27f-3e83-4887-999e-3c1ae158faf4');
console.log(`Retros: ${retros?.length || 0}`);
if (retros?.length) retros.forEach(r => console.log(`  ${r.created_at} type=${r.retrospective_type} qs=${r.quality_score} status=${r.status}`));

// 7. EMPIRICAL SWEEP
console.log('\n--- 7. EMPIRICAL SWEEP: SDs status=completed with NO accepted LEAD-FINAL-APPROVAL ---');
const { data: completedSDs, error: csErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, sd_type, current_phase, completion_date, created_at')
  .eq('status', 'completed');
if (csErr) console.error('Sweep error:', csErr);
else {
  console.log(`Total completed SDs: ${completedSDs.length}`);
  let ghostCount = 0;
  let ghostList = [];
  for (const sd of completedSDs) {
    const { data: lfHandoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('id, status, created_by, created_at')
      .eq('sd_id', sd.id)
      .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
      .eq('status', 'accepted');
    const { data: lfeHandoffs } = await supabase
      .from('leo_handoff_executions')
      .select('id, status, created_by, created_at')
      .eq('sd_id', sd.id)
      .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
      .eq('status', 'accepted');
    const hasAccepted = (lfHandoffs && lfHandoffs.length > 0) || (lfeHandoffs && lfeHandoffs.length > 0);
    if (!hasAccepted) {
      ghostCount++;
      ghostList.push({
        id: sd.id,
        sd_key: sd.sd_key,
        sd_type: sd.sd_type,
        completion_date: sd.completion_date,
        sph_count: lfHandoffs?.length || 0,
        lhe_count: lfeHandoffs?.length || 0
      });
    }
  }
  console.log(`\nGHOST-COMPLETED SDs: ${ghostCount} / ${completedSDs.length} (${(ghostCount * 100 / completedSDs.length).toFixed(1)}%)`);
  console.log('First 40 (most recent first):');
  ghostList.sort((a, b) => (b.completion_date || '').localeCompare(a.completion_date || ''));
  ghostList.slice(0, 40).forEach(g => {
    console.log(`  ${(g.sd_key || g.id).padEnd(60)} type=${(g.sd_type || 'null').padEnd(18)} completed=${g.completion_date || 'null'}`);
  });
  if (ghostList.length > 40) console.log(`  ... and ${ghostList.length - 40} more`);

  // Breakdown by sd_type
  console.log('\nGhost SDs by sd_type:');
  const typeMap = {};
  ghostList.forEach(g => { typeMap[g.sd_type || 'null'] = (typeMap[g.sd_type || 'null'] || 0) + 1; });
  Object.entries(typeMap).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => console.log(`  ${t.padEnd(20)} ${c}`));
}

// 8. ORCHESTRATOR_AUTO_COMPLETE invocations
console.log('\n--- 8. PLAN-TO-LEAD handoffs with created_by = ORCHESTRATOR_AUTO_COMPLETE ---');
const { data: orchAuto } = await supabase
  .from('sd_phase_handoffs')
  .select('id, sd_id, handoff_type, status, created_by, created_at')
  .eq('created_by', 'ORCHESTRATOR_AUTO_COMPLETE');
console.log(`Rows: ${orchAuto?.length || 0}`);
if (orchAuto?.length) orchAuto.forEach(h => console.log(`  ${h.created_at} sd=${h.sd_id} type=${h.handoff_type} status=${h.status}`));

// 9. created_by frequency on LEAD-FINAL-APPROVAL acceptances
console.log('\n--- 9. created_by frequency on accepted LEAD-FINAL-APPROVAL handoffs ---');
const { data: acceptedLF } = await supabase
  .from('sd_phase_handoffs')
  .select('created_by')
  .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
  .eq('status', 'accepted');
const lfMap = {};
(acceptedLF || []).forEach(h => { lfMap[h.created_by || 'NULL'] = (lfMap[h.created_by || 'NULL'] || 0) + 1; });
Object.entries(lfMap).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => console.log(`  ${t.padEnd(40)} ${c}`));

const { data: acceptedLFE } = await supabase
  .from('leo_handoff_executions')
  .select('created_by')
  .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
  .eq('status', 'accepted');
const lfeMap = {};
(acceptedLFE || []).forEach(h => { lfeMap[h.created_by || 'NULL'] = (lfeMap[h.created_by || 'NULL'] || 0) + 1; });
console.log('\nleo_handoff_executions created_by:');
Object.entries(lfeMap).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => console.log(`  ${t.padEnd(40)} ${c}`));
