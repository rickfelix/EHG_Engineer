import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const want = ['561878ae','b9d3607e'];
for (const tbl of ['chairman_ratifications','chairman_decisions']) {
  const { data, error } = await sb.from(tbl).select('*').order('created_at',{ascending:false}).limit(400);
  if (error) { console.log(`[${tbl}] ERR ${error.code} ${error.message}`); continue; }
  console.log(`[${tbl}] scanned ${data.length}`);
  for (const w of want) {
    const hit = (data||[]).find(r => String(r.id||'').startsWith(w));
    if (!hit) { console.log(`  ${w}: NOT FOUND in newest ${data.length}`); continue; }
    const keys = Object.keys(hit);
    console.log(`  ${w}: FOUND. cols=${keys.join(',')}`);
    console.log(`     ${JSON.stringify(hit).slice(0,900)}`);
  }
}
const { data: qf1, error: qe1 } = await sb.from('quick_fixes').select('*').limit(1);
console.log('\nquick_fixes cols:', qe1 ? 'ERR '+qe1.message : Object.keys(qf1?.[0]||{}).join(','));
