require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const {data,error}=await sb.from('sub_agent_execution_results').select('*').eq('sd_id','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D').order('created_at',{ascending:false}).limit(25);
  if(error){console.error(error);process.exit(1);}
  console.log('rows',data.length); if(data[0]) console.log('columns:', Object.keys(data[0]).join(','));
  for(const r of data){ const m=r.metadata||{}; console.log(r.created_at, r.sub_agent_code, r.phase, r.verdict, 'session='+String(m.session_id||r.session_id||'').slice(0,8), 'sha='+String(m.evaluated_commit_sha||r.evaluated_commit_sha||'').slice(0,11), 'hash='+String(m.content_hash||r.content_hash||'').slice(0,10), 'repo='+(m.repo_path||''), 'commit='+String(r.commit_sha||'').slice(0,11)); }
})();
