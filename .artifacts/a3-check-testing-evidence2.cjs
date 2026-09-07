require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data:sd,error:e0}=await s.from('strategic_directives_v2').select('id').eq('sd_key','SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001').single();
console.log('sd.id',sd&&sd.id,e0);
const {data,error}=await s.from('sub_agent_execution_results').select('*').eq('sd_id',sd.id).order('created_at',{ascending:false}).limit(10);
console.log('error',error);
console.log('count',data&&data.length);
for(const r of data||[]) console.log(r.created_at,'|',r.id,'|',r.sub_agent_code||r.agent_code,'|',JSON.stringify(r.metadata||{}).slice(0,200));
})();
