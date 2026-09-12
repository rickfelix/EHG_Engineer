const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: sd } = await sb.from('strategic_directives_v2').select('id,sd_key,status,current_phase,progress')
    .eq('sd_key','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D').maybeSingle();
  console.log('SD:', JSON.stringify(sd));
  if (!sd) return;
  for (const key of [sd.id, sd.sd_key]) {
    const { data, error } = await sb.from('sub_agent_execution_results').select('sub_agent_code,verdict,phase,created_at,evaluated_commit_sha,metadata')
      .eq('sd_id', key).order('created_at',{ascending:true});
    console.log(`\n--- sd_id = ${key} -> ${error? 'ERR '+error.message : data.length + ' rows'}`);
    for (const r of (data||[])) {
      const md = r.metadata||{};
      console.log([r.phase||'-', r.sub_agent_code, r.verdict, (r.created_at||'').slice(0,19),
        'sha=' + (r.evaluated_commit_sha? String(r.evaluated_commit_sha).slice(0,11):'-'),
        'repo=' + (md.repo_path? String(md.repo_path).split(/[\/]/).pop():'-')].join(' | '));
    }
  }
})();
