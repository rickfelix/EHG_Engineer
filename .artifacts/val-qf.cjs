const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await s.from('quick_fixes').select('id,qf_key,status,title,claimed_by,pr_url,commit_sha,updated_at,created_at,resolution,disposition').or('qf_key.eq.QF-20260904-724,id.eq.QF-20260904-724');
  if (error) { console.error('ERR', error.message); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
})();
