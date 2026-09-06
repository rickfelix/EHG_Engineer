require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await s.from('quick_fixes').select('id,title,description,status,disposition,pr_url,commit_sha,files_changed,escalated_to_sd_id,resolution_sd_id,created_at,completed_at').in('id',['QF-20260904-935','QF-20260904-695']);
  for (const r of data||[]) {
    console.log('==',r.id,'| status=',r.status,'| disp=',r.disposition,'| pr=',r.pr_url,'| sha=',r.commit_sha,'| esc_sd=',r.escalated_to_sd_id,'| res_sd=',r.resolution_sd_id,'| completed=',r.completed_at);
    console.log('  TITLE:',String(r.title||'').slice(0,300));
    console.log('  DESC:',String(r.description||'').slice(0,900));
    console.log('  FILES:',JSON.stringify(r.files_changed));
  }
  if(!data||!data.length) console.log('NONE FOUND');
})();
