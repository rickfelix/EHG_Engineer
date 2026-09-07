require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data}=await s.from('quick_fixes').select('id,status,claiming_session_id,claimed_at,metadata').in('id',['QF-20260904-695','QF-20260904-724']);
for(const r of data||[]) console.log(r.id,r.status,r.claiming_session_id,r.claimed_at,JSON.stringify(r.metadata||{}).slice(0,400));
})();
