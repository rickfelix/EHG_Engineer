require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await sb.from('sub_agent_execution_results')
    .select('id,sub_agent_code,verdict,confidence,created_at,metadata')
    .eq('id','8b2ee61d-a554-4dd5-a0f5-38640821c0f2').single();
  if (error) return console.error(error);
  const m = data.metadata || {};
  console.log('id            ', data.id);
  console.log('code/verdict  ', data.sub_agent_code, data.verdict, data.confidence);
  console.log('phase         ', m.phase);
  console.log('repo_path     ', m.repo_path);
  console.log('executed_cwd  ', m.executed_from_cwd);
  console.log('cwd_leak_risk ', m.repo_path === m.executed_from_cwd);
  console.log('session_id    ', m.session_id);
  console.log('content_hash  ', m.content_hash);
  console.log('eval_commit   ', m.evaluated_commit_sha);
  console.log('repo_resolved ', m.repo_resolved, '| registry_source', m.registry_source, '| probe_exists', m.probe_exists);
  console.log('report_path   ', m.report_path);
  console.log('top-level path cols present:', Object.keys(data).filter(k => /repo_path|local_path/.test(k)));
})();
