require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data:sd}=await s.from('strategic_directives_v2').select('id').eq('sd_key','SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001').single();
const {data}=await s.from('sub_agent_execution_results').select('id,sub_agent_id,created_at,metadata,results').eq('sd_id',sd.id).order('created_at',{ascending:false}).limit(8);
for(const r of data||[]) console.log(r.created_at, r.id, r.metadata?.phase, JSON.stringify(r.results||{}).slice(0,150));
})();
