const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await sb.from('sub_agent_execution_results')
    .select('sub_agent_code,verdict,phase,created_at,session_id,evaluated_commit_sha,content_hash')
    .eq('sd_id','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D')
    .order('created_at',{ascending:true});
  if (error) { console.error('ERR', error.message); process.exit(1); }
  console.log('rows', data.length);
  for (const r of data) console.log([r.phase, r.sub_agent_code, r.verdict, (r.created_at||'').slice(0,19), 'sess=' + (r.session_id? String(r.session_id).slice(0,8):'NULL'), 'sha=' + (r.evaluated_commit_sha? String(r.evaluated_commit_sha).slice(0,11):'NULL'), 'hash=' + (r.content_hash?'y':'n')].join(' | '));
})();
