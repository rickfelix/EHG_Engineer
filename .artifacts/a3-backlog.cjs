require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data:cols,error:e1}=await s.from('sd_backlog_map').select('*').limit(1);
console.log('sample row cols:',cols&&cols[0]?Object.keys(cols[0]):[],e1);
const {data:sd}=await s.from('strategic_directives_v2').select('id').eq('sd_key','SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001').single();
console.log('sd id',sd.id);
})();
