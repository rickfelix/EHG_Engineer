require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const { data, error } = await s.from('sub_agent_execution_results').select('*')
    .eq('id','e1639df4-3339-4115-8083-dec2f46d99ce').single();
  if(error) return console.error(error);
  const m = data.metadata||{};
  console.log('COLUMNS:', Object.keys(data).join(', '));
  console.log('\n-- core --');
  for(const k of ['id','sub_agent_code','phase','verdict','confidence','sd_id','created_at','status']) console.log(String(k).padEnd(18), JSON.stringify(data[k]));
  console.log('\n-- required metadata --');
  for(const k of ['repo_path','executed_from_cwd','session_id','content_hash','evaluated_commit_sha','risk_level','overall_risk_score','risk_domains','repo_resolved']) console.log(String(k).padEnd(22), JSON.stringify(m[k]));
  console.log('\n-- top-level path cols (must be empty) --');
  console.log(Object.keys(data).filter(k=>/repo_path|local_path/.test(k)));
  console.log('\n-- conditions/justification present --');
  console.log('conditions:', Array.isArray(data.conditions)? data.conditions.length : typeof data.conditions, '| justification chars:', (data.justification||'').length);
})();
