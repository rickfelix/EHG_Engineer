const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await sb.from('user_stories').select('*').eq('prd_id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B').order('story_key');
  if (error) { console.error(error); process.exit(1); }
  console.log('COUNT', data.length);
  if (data.length) {
    console.log('COLUMNS:', Object.keys(data[0]).join(','));
    console.log('\n--- FIRST ROW FULL ---');
    console.log(JSON.stringify(data[0], null, 2));
    console.log('\n--- ALL KEYS/TITLES ---');
    data.forEach(r => console.log(r.story_key, '|', r.priority, '|', r.story_points, '|', r.status, '|', r.title));
    console.log('\n--- NON-NULL FIELD SUMMARY (row2) ---');
    const r=data[1]||data[0];
    for (const [k,v] of Object.entries(r)) if (v!==null && v!==undefined && !(Array.isArray(v)&&!v.length)) console.log(k, '=>', typeof v==='object'?JSON.stringify(v).slice(0,300):String(v).slice(0,300));
  }
})();
