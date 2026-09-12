import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = 'fa9de2a7-0c57-4941-8b0b-faec7d74591e';

// 1. Every TESTING row for this SD (catches stray ERROR rows from the two refused attempts)
const { data: rows, error } = await sb
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, confidence, created_at, metadata')
  .eq('sd_id', SD_UUID)
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: true });

if (error) { console.error('ERR', error.message); process.exit(1); }

console.log(`=== ALL TESTING rows for SD (${rows.length}) ===`);
for (const r of rows) {
  console.log(`  ${r.created_at}  ${r.id}  phase=${r.phase}  verdict=${r.verdict}`);
}

const target = rows.find((r) => r.id === 'b52f0fbb-bb3b-4194-b194-97647149aa19');
if (!target) { console.error('\nFATAL: the row we just wrote is NOT readable back.'); process.exit(1); }

const m = target.metadata || {};
console.log('\n=== TARGET ROW b52f0fbb ===');
console.log('phase (column)      :', target.phase);
console.log('metadata.phase      :', m.phase);
console.log('verdict             :', target.verdict);
console.log('original_verdict    :', m.original_verdict ?? '(none — no mutation)');
console.log('verdict_chain       :', JSON.stringify(m.verdict_chain ?? null));
console.log('confidence_score    :', target.confidence);
console.log('repo_path           :', m.repo_path);
console.log('repo_resolved       :', m.repo_resolved);
console.log('executed_from_cwd   :', m.executed_from_cwd);
const cwdLeak = m.repo_path && m.executed_from_cwd &&
  String(m.repo_path).replace(/\\/g, '/').toLowerCase() === String(m.executed_from_cwd).replace(/\\/g, '/').toLowerCase();
console.log('CWD_LEAK            :', cwdLeak ? 'YES  <-- PROBLEM' : 'NO   (repo_path != executed_from_cwd)');
console.log('cwd is the worktree :', String(m.executed_from_cwd || '').includes('.worktrees'));
console.log('test_execution      :', JSON.stringify(m.test_execution));
console.log('content_hash        :', m.content_hash);
console.log('artifact_sha        :', m.test_execution?.artifact_sha);
console.log('git.head            :', m.evidence?.git?.head);
console.log('parent==prior head  :', m.evidence?.commit_identity_vs_prospective_review?.parent_matches_prior_head);
console.log('PR head oid match   :', m.evidence?.pull_request?.head_oid_matches_local_head);
console.log('results_files count :', (m.evidence?.results_files || []).length);

// 2. repo-compliance view
const { data: comp, error: cErr } = await sb
  .from('v_sub_agent_repo_compliance')
  .select('*')
  .eq('id', 'b52f0fbb-bb3b-4194-b194-97647149aa19')
  .maybeSingle();
console.log('\n=== v_sub_agent_repo_compliance ===');
if (cErr) console.log('view error:', cErr.message);
else console.log(comp ? JSON.stringify(comp, null, 2) : '(no row in view)');
