const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await s.from('quick_fixes').select('*').eq('id','QF-20260904-724').maybeSingle();
  if (error) { console.error('ERR', error.message); return; }
  if (!data) { console.log('NOT FOUND by id'); return; }
  const keep = ['id','status','title','claimed_by','claimed_at','pr_url','commit_sha','updated_at','created_at','resolution','disposition','escalated_to_sd','tier'];
  const out = {}; for (const k of keep) if (k in data) out[k] = data[k];
  console.log(JSON.stringify(out, null, 2));
  console.log('ALL COLUMNS:', Object.keys(data).join(','));
})().then(()=>process.exit(0));
