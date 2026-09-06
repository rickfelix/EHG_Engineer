require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await s.from('product_requirements_v2').select('*').eq('sd_id','058c33b2-62ce-45d0-a712-39716c5e8cfc');
  if (error) { console.error(error); process.exit(1); }
  console.log('COUNT', data.length);
  for (const p of data) {
    console.log('=== PRD', p.id, p.title, p.status);
    for (const [k,v] of Object.entries(p)) {
      if (v === null || v === undefined) continue;
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      if (str.length < 3) continue;
      console.log('--- FIELD:', k);
      console.log(str.slice(0, 20000));
    }
  }
})();
