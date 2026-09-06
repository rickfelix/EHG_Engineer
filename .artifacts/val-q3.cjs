require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const t of ['quick_fixes','quick_fix_items','qf_items']) {
    const { data, error } = await s.from(t).select('*').limit(1);
    console.log('TABLE', t, error ? 'ERR '+error.message : 'OK cols='+Object.keys(data[0]||{}).join(','));
  }
  for (const k of ['QF-20260904-935','QF-20260904-695']) {
    const { data, error } = await s.from('quick_fixes').select('*').or(`id.eq.${k},qf_key.eq.${k},key.eq.${k}`);
    console.log(k, error? 'ERR '+error.message : JSON.stringify((data||[]).map(r=>({id:r.id,status:r.status,title:String(r.title||'').slice(0,180),pr:r.pr_url,sha:r.commit_sha,disposition:r.disposition,updated:r.updated_at}))));
  }
})();
