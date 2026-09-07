require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data}=await s.from('user_stories').select('story_key,title,user_role,user_want,user_benefit,implementation_context,acceptance_criteria').order('created_at',{ascending:false}).limit(1);
console.log(JSON.stringify(data,null,1));
})();
