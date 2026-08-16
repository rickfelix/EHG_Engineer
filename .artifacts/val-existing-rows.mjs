import { createClient } from '@supabase/supabase-js'; import dotenv from 'dotenv'; dotenv.config();
const s=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,confidence,sd_id,created_at,metadata')
  .eq('sub_agent_code','VALIDATION').order('created_at',{ascending:false}).limit(4);
if(error){console.log('ERR',JSON.stringify(error));process.exit(1);}
for(const r of data){
  console.log('---');
  console.log('phase=',r.phase,'| verdict=',r.verdict,'| conf=',r.confidence,'| sd_id=',r.sd_id);
  console.log('metadata keys=',Object.keys(r.metadata||{}).join(','));
  console.log('repo_path=',r.metadata?.repo_path,'| executed_from_cwd=',r.metadata?.executed_from_cwd);
}
console.log('\n=== distinct phases used ===');
const { data: ph } = await s.from('sub_agent_execution_results').select('phase').limit(1000);
console.log([...new Set((ph||[]).map(x=>x.phase))].join(' | '));
