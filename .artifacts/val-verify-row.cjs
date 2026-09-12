require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await sb.from('sub_agent_execution_results')
    .select('id,sub_agent_code,verdict,confidence,phase,created_at,metadata,executed_from_cwd')
    .eq('id','9dd45d52-5d41-41da-8c1a-398448a33320').single();
  if (error) return console.error(error);
  const m = data.metadata || {};
  console.log('id           ', data.id);
  console.log('code/verdict ', data.sub_agent_code, data.verdict, data.confidence);
  console.log('phase col    ', data.phase, '| meta.phase', m.phase);
  console.log('repo_path    ', m.repo_path);
  console.log('exec cwd     ', m.executed_from_cwd);
  console.log('cwd_leak     ', m.repo_path === m.executed_from_cwd);
  console.log('session_id   ', m.session_id);
  console.log('eval_commit  ', m.evaluated_commit_sha);
  console.log('content_hash ', m.content_hash || '(none)');
  console.log('repo_resolved', m.repo_resolved, '| registry_source', m.registry_source);
  console.log('coverage     ', JSON.stringify(m.subagent_coverage));
  console.log('frs_absent   ', JSON.stringify(m.frs_absent), '| conflicts', JSON.stringify(m.integration_conflicts));
})();
