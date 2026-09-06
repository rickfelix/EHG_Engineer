require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await s.from('quick_fixes').select('id,status,title,description,claiming_session_id,pr_url,commit_sha,not_before,created_at').in('id',['QF-20260905-666','QF-20260904-116','QF-20260905-934']);
  for (const r of data||[]) {
    console.log('==',r.id,'status=',r.status,'holder=',r.claiming_session_id,'pr=',r.pr_url,'sha=',r.commit_sha,'not_before=',r.not_before);
    console.log(' T:',String(r.title||'').slice(0,320));
    console.log(' D:',String(r.description||'').slice(0,1100));
    console.log('');
  }
})();
