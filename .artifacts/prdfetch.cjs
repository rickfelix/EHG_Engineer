require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  let { data, error } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E').maybeSingle();
  if (error) { console.error('ERR', error.message); }
  if (!data) {
    const r2 = await s.from('product_requirements_v2').select('*').eq('sd_id','dfdad20c-bf37-47ef-8588-0ebd82cfb874');
    console.log('by sd_id count:', r2.data && r2.data.length);
    data = r2.data && r2.data[0];
  }
  if (!data) { console.log('NO PRD FOUND'); process.exit(0); }
  require('fs').writeFileSync('.artifacts/prd.json', JSON.stringify(data,null,2));
  console.log('id:', data.id, 'title:', data.title);
  console.log('KEYS:', Object.keys(data).filter(k=>data[k]!==null && data[k]!=='' ).join(', '));
})();
