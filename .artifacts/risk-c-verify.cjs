require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
 const {data,error} = await s.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,sd_id,metadata').eq('id','4d362d66-76c0-46e2-acc6-90c343f412e3').single();
 if(error) return console.error(error.message);
 const m = data.metadata||{};
 console.log(JSON.stringify({
  id:data.id, code:data.sub_agent_code, phase:data.phase, verdict:data.verdict, sd_id:data.sd_id,
  repo_path:m.repo_path, executed_from_cwd:m.executed_from_cwd, session_id:m.session_id,
  content_hash:m.content_hash, evaluated_commit_sha:m.evaluated_commit_sha,
  risk_level:m.risk_level, overall_risk_score:m.overall_risk_score,
  risk_domain_keys:Object.keys(m.risk_domains||{}),
  has_top_level_path_cols: Object.keys(data).filter(k=>/repo_path|local_path/.test(k))
 },null,1));
})();
