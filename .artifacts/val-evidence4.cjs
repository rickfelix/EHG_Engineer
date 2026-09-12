const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await sb.from('sub_agent_execution_results').select('*')
    .eq('sd_id','3f128d5c-8168-4415-86cc-ab5da4663d11').order('created_at',{ascending:true});
  if (error) { console.error('ERR', error.message); return; }
  console.log('rows', data.length);
  if (data[0]) console.log('COLUMNS:', Object.keys(data[0]).join(','));
  for (const r of data) {
    const md = r.metadata || {};
    console.log([ (r.phase||md.phase||'-'), r.sub_agent_code, r.verdict, (r.created_at||'').slice(0,19),
      'sha=' + (md.evaluated_commit_sha ? String(md.evaluated_commit_sha).slice(0,11) : '-'),
      'repo=' + (md.repo_path ? String(md.repo_path).split(/[\/]/).pop() : '-') ].join(' | '));
  }
})();
