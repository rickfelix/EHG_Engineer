require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data:sd}=await s.from('strategic_directives_v2').select('id,sd_key,status,current_phase,is_working_on,claiming_session_id,created_at,metadata').eq('id','d0402004-3fa0-489c-86cb-cb7ed6c314fc').maybeSingle();
console.log('SD:',JSON.stringify(sd,null,1));
const {data:qf}=await s.from('quick_fixes').select('id,status,pr_url,commit_sha,escalated_to_sd_id,claiming_session_id').eq('id','QF-20260906-162').maybeSingle();
console.log('QF:',JSON.stringify(qf,null,1));
if(sd&&sd.claiming_session_id){const {data:sess}=await s.from('claude_sessions').select('session_id,heartbeat_at,callsign').eq('session_id',sd.claiming_session_id).maybeSingle();console.log('SESSION:',JSON.stringify(sess));}
})();
