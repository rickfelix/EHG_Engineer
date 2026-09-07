require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
// find a recent infra SD's backlog row as a template
const {data:sds}=await s.from('strategic_directives_v2').select('id,sd_key').ilike('sd_key','SD-LEO-INFRA-%').order('created_at',{ascending:false}).limit(15);
for(const sd of sds){
  const {data:bl}=await s.from('sd_backlog_map').select('*').eq('sd_id',sd.id).limit(1);
  if(bl&&bl.length){console.log(sd.sd_key, JSON.stringify(bl[0],null,1)); break;}
}
})();
