require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data}=await s.from('quick_fixes').select('id,title,status,pr_url,commit_sha,created_at,completed_at,description').or('id.ilike.%695,id.ilike.%724').order('created_at');
for(const r of data||[]) console.log(JSON.stringify(r,null,1));
const {data:prd}=await s.from('product_requirements_v2').select('id,status').eq('sd_key','SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001');
console.log('PRD:',JSON.stringify(prd));
const {data:bl}=await s.from('sd_backlog_map').select('backlog_id,backlog_title').eq('sd_id','SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001');
console.log('BACKLOG:',JSON.stringify(bl));
})();
