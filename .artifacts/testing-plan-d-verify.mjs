import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s
  .from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,confidence,source,created_at,metadata')
  .eq('id', 'ec4eafbb-642d-473a-a1dd-7b01244235cd')
  .maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data) { console.error('ROW NOT FOUND'); process.exit(1); }
const m = data.metadata || {};
console.log('id            =', data.id);
console.log('sub_agent_code=', data.sub_agent_code);
console.log('phase         =', data.phase);
console.log('verdict       =', data.verdict);
console.log('confidence    =', data.confidence);
console.log('source        =', data.source);
console.log('created_at    =', data.created_at);
console.log('--- required metadata keys ---');
for (const k of ['repo_path', 'executed_from_cwd', 'session_id', 'content_hash', 'evaluated_commit_sha']) {
  console.log(`  ${k.padEnd(21)} = ${m[k]}`);
}
console.log('  test_execution        =', JSON.stringify(m.test_execution));
console.log('  acceptance_criteria_coverage present =', !!m.acceptance_criteria_coverage, '| gaps =', (m.acceptance_criteria_coverage?.gaps || []).length);
console.log('  exec_test_checklist items =', (m.exec_test_checklist || []).length);
console.log('--- provenance invariants ---');
console.log('  repo_path !== executed_from_cwd (no CWD leak):', m.repo_path !== m.executed_from_cwd);
console.log('  no top-level repo_path/local_path columns    :', !('repo_path' in data) && !('local_path' in data));
console.log('  test_execution measured (executed > 0)       :', Number(m.test_execution?.tests_executed) > 0);
console.log('  artifact_sha present                         :', !!m.test_execution?.artifact_sha);
