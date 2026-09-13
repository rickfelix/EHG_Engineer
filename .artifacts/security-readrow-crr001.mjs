import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = process.argv[2];
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('id', id).maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data) { console.log('NO ROW'); process.exit(1); }
console.log('COLUMNS:', Object.keys(data).join(', '));
const m = data.metadata||{};
for (const k of ['id','sub_agent_code','phase','verdict','confidence','confidence_score','status','created_at','sd_id']) {
  if (k in data) console.log(String(k).padEnd(20)+':', JSON.stringify(data[k]));
}
console.log('--- metadata repo fields ---');
console.log('repo_path           :', m.repo_path);
console.log('executed_from_cwd   :', m.executed_from_cwd);
console.log('evaluated_commit_sha:', m.evaluated_commit_sha ?? m.commit_sha ?? '(none)');
console.log('branch              :', m.branch ?? m.git_branch ?? '(none)');
console.log('metadata keys       :', Object.keys(m).join(', '));
