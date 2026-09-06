import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
const { data: rows } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,source,executed_from_cwd,metadata,created_at').eq('sd_id','058c33b2-62ce-45d0-a712-39716c5e8cfc').order('created_at',{ascending:false}).limit(3);
for (const r of rows||[]) {
  const m=r.metadata||{};
  console.log('---',r.sub_agent_code,r.phase,r.verdict,'source=',r.source,'cwd=',r.executed_from_cwd);
  console.log('meta scalar keys:', Object.keys(m).filter(k=>typeof m[k]!=='object').map(k=>k+'='+String(m[k]).slice(0,60)).join(' | '));
  console.log('repo_path:',m.repo_path,'| content_hash:',m.content_hash,'| session_id:',m.session_id,'| commit:',m.evaluated_commit_sha||m.commit_sha);
}
