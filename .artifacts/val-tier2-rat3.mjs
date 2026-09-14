import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const want = ['561878ae','b9d3607e'];
const { data: r1, error: e1 } = await sb.from('chairman_ratifications').select('*').limit(1);
console.log('chairman_ratifications cols:', e1 ? 'ERR '+e1.message : Object.keys(r1?.[0]||{}).join(','));
if (!e1) {
  const { data, error } = await sb.from('chairman_ratifications').select('*').limit(1000);
  if (error) console.log('ERR', error.message);
  else { console.log('scanned', data.length);
    for (const w of want) { const h = data.find(r=>String(r.id||'').startsWith(w));
      console.log(` ${w}: ${h? 'FOUND :: '+JSON.stringify(h).slice(0,700) : 'NOT FOUND'}`); } }
}
const { data: qf, error: qe } = await sb.from('quick_fixes')
  .select('id,title,status,created_at,target_application')
  .or('title.ilike.%michael%,title.ilike.%checkpoint send%,description.ilike.%michael%sms%')
  .order('created_at',{ascending:false}).limit(30);
console.log('\n=== quick_fixes michael-related ===', qe? 'ERR '+qe.message : (qf||[]).length);
for (const r of (qf||[])) console.log(`  ${String(r.status).padEnd(12)} ${String(r.id).slice(0,8)} :: ${String(r.title).slice(0,130)}`);
