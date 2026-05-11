import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('========================================');
console.log('GHOST-COMPLETION DEEP DIVE');
console.log('========================================\n');

// Triggers query — try various RPC names
console.log('--- 1. Triggers on strategic_directives_v2 ---');
for (const fn of ['exec_sql', 'run_sql', 'execute_sql', 'sql', 'pg_exec']) {
  try {
    const { data, error } = await supabase.rpc(fn, {
      sql: `SELECT tgname, tgenabled, pg_get_triggerdef(t.oid) AS def
            FROM pg_trigger t
            WHERE tgrelid = 'strategic_directives_v2'::regclass
              AND NOT tgisinternal
            ORDER BY tgname;`
    });
    if (!error) {
      console.log(`  RPC ${fn} returned:`);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
  } catch (e) {
    /* ignore */
  }
}

// 2. Re-check the ghost criteria using BOTH tables
console.log('\n--- 2. True ghost-completed (no accepted in EITHER table) ---');
const { data: completedSDs } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, sd_type, completion_date, current_phase, created_at, parent_sd_id, metadata')
  .eq('status', 'completed');

const ghosts = [];
const partialGhosts = [];
for (const sd of completedSDs) {
  const [{ data: sph }, { data: lhe }] = await Promise.all([
    supabase.from('sd_phase_handoffs').select('id').eq('sd_id', sd.id).eq('handoff_type', 'LEAD-FINAL-APPROVAL').eq('status', 'accepted'),
    supabase.from('leo_handoff_executions').select('id').eq('sd_id', sd.id).eq('handoff_type', 'LEAD-FINAL-APPROVAL').eq('status', 'accepted')
  ]);
  const sphHas = (sph?.length || 0) > 0;
  const lheHas = (lhe?.length || 0) > 0;
  if (!sphHas && !lheHas) {
    ghosts.push({ id: sd.id, sd_key: sd.sd_key, sd_type: sd.sd_type, completion_date: sd.completion_date, parent: sd.parent_sd_id, metadata: sd.metadata });
  } else if (!sphHas && lheHas) {
    partialGhosts.push({ id: sd.id, sd_key: sd.sd_key, sd_type: sd.sd_type, completion_date: sd.completion_date });
  }
}

console.log(`TRUE GHOSTS (no accepted LEAD-FINAL-APPROVAL anywhere): ${ghosts.length}`);
console.log(`Partial ghosts (LHE has acceptance, SPH does not): ${partialGhosts.length}`);
console.log(`\nTrue ghost breakdown by sd_type:`);
const typeMap = {};
ghosts.forEach(g => { typeMap[g.sd_type || 'null'] = (typeMap[g.sd_type || 'null'] || 0) + 1; });
Object.entries(typeMap).sort((a,b)=>b[1]-a[1]).forEach(([t,c]) => console.log(`  ${t.padEnd(20)} ${c}`));

console.log('\nFirst 25 true ghosts:');
ghosts.sort((a,b) => (b.completion_date || '').localeCompare(a.completion_date || ''));
ghosts.slice(0, 25).forEach(g => {
  console.log(`  ${(g.sd_key||g.id).padEnd(55)} type=${(g.sd_type||'null').padEnd(15)} parent=${g.parent ? 'Y' : 'N'} completed=${g.completion_date || 'null'}`);
});

// 3. Children of orchestrators
console.log('\n--- 3. True ghosts that are CHILDREN of orchestrators ---');
const childGhosts = ghosts.filter(g => g.parent !== null);
console.log(`Child-ghosts: ${childGhosts.length} of ${ghosts.length}`);

// 4. Recent ghosts
console.log('\n--- 4. Ghosts completed in last 60 days ---');
const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
const recentGhosts = ghosts.filter(g => g.completion_date && g.completion_date > cutoff);
console.log(`Recent (last 60d): ${recentGhosts.length}`);
recentGhosts.forEach(g => {
  console.log(`  ${g.completion_date} ${(g.sd_key||g.id).padEnd(55)} type=${g.sd_type || 'null'} parent=${g.parent ? 'Y' : 'N'}`);
});

// 5. Witness metadata.reverted_at confirms a prior ghost-then-reverted lifecycle
console.log('\n--- 5. WITNESS metadata snapshot (paste of ghost lifecycle) ---');
const w = completedSDs.find(s => s.id === 'b737c27f-3e83-4887-999e-3c1ae158faf4');
if (w?.metadata) console.log(JSON.stringify(w.metadata, null, 2));

// 6. Audit log
console.log('\n--- 6. audit_log for witness ---');
const { data: audit, error: auditErr } = await supabase
  .from('audit_log')
  .select('id, action, target_id, performed_by, performed_at, details')
  .eq('target_id', 'b737c27f-3e83-4887-999e-3c1ae158faf4')
  .order('performed_at', { ascending: true })
  .limit(50);
if (auditErr) console.log('audit_log not available:', auditErr.message);
else if (audit?.length) {
  console.log(`Audit rows: ${audit.length}`);
  audit.forEach(a => console.log(`  ${a.performed_at} action=${a.action} by=${a.performed_by}`));
} else console.log('No audit rows for witness.');

// 7. Existence check on common audit tables
console.log('\n--- 7. Searching for completion audit tables ---');
for (const table of ['sd_completion_log', 'sd_state_history', 'sd_history', 'change_log', 'sd_audit', 'event_log']) {
  const { error } = await supabase.from(table).select('id').limit(1);
  console.log(`  ${table.padEnd(25)} ${error ? 'NOT FOUND' : 'EXISTS'}`);
}

// 8. Check partial ghosts (LHE has but SPH does not) — this is the most likely real ghost class
console.log('\n--- 8. Partial ghosts — LHE acceptance exists but SPH does not (first 30) ---');
partialGhosts.sort((a,b) => (b.completion_date || '').localeCompare(a.completion_date || ''));
partialGhosts.slice(0, 30).forEach(g => {
  console.log(`  ${g.completion_date} ${(g.sd_key||g.id).padEnd(55)} type=${g.sd_type || 'null'}`);
});

// 9. created_by frequency for partial ghost LHE rows
if (partialGhosts.length > 0) {
  console.log('\n--- 9. created_by frequency for partial-ghost LHE acceptances ---');
  const cbMap = {};
  for (const pg of partialGhosts) {
    const { data: lhe } = await supabase
      .from('leo_handoff_executions')
      .select('created_by')
      .eq('sd_id', pg.id)
      .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
      .eq('status', 'accepted');
    (lhe || []).forEach(h => { cbMap[h.created_by || 'NULL'] = (cbMap[h.created_by || 'NULL'] || 0) + 1; });
  }
  Object.entries(cbMap).sort((a,b)=>b[1]-a[1]).forEach(([t,c]) => console.log(`  ${t.padEnd(40)} ${c}`));
}

// 10. Sub-agent evidence for current SD
console.log('\n--- 10. Sub-agent results for SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001 ---');
const { data: subagents } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, sub_agent_id, verdict, confidence, phase, created_at')
  .eq('sd_id', 'SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001')
  .order('created_at', { ascending: true });
if (subagents?.length) {
  console.log(`Sub-agent rows: ${subagents.length}`);
  subagents.forEach(s => console.log(`  ${s.created_at} code=${s.sub_agent_code} phase=${s.phase} verdict=${s.verdict} conf=${s.confidence}`));
} else console.log('No sub-agent rows for this SD yet.');
