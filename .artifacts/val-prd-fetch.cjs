const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const sb = createClient(url, key);
(async () => {
  const { data, error } = await sb.from('product_requirements_v2').select('*').eq('directive_id','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D');
  if (error) { console.error('ERR', error.message); process.exit(1); }
  console.log('ROWS', data.length);
  require('fs').writeFileSync('.artifacts/val-prd-d.json', JSON.stringify(data, null, 2));
  for (const r of data) console.log(r.id, r.title, r.status, 'keys:', Object.keys(r).filter(k=>r[k]!==null&&r[k]!==undefined).join(','));
})();
