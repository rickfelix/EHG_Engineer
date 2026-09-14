import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ratification ledger
for (const tbl of ['chairman_ratifications','chairman_decisions']) {
  for (const id of ['561878ae','b9d3607e']) {
    const { data, error } = await sb.from(tbl).select('*').ilike('id', `${id}%`).limit(2);
    if (error) { console.log(`[${tbl}/${id}] ERR ${error.code} ${error.message}`); continue; }
    console.log(`[${tbl}/${id}] rows=${(data||[]).length}` + ((data||[]).length ? ` :: ${JSON.stringify(data[0]).slice(0,600)}` : ''));
  }
}

// quick_fixes overlap
const { data: qf, error: qe } = await sb.from('quick_fixes')
  .select('qf_key,title,status,created_at')
  .or('title.ilike.%michael%,title.ilike.%checkpoint%')
  .order('created_at',{ascending:false}).limit(30);
console.log('\n=== quick_fixes michael|checkpoint ===', qe ? 'ERR '+JSON.stringify(qe) : (qf||[]).length);
for (const r of (qf||[])) console.log(`  ${String(r.status).padEnd(12)} ${r.qf_key} :: ${String(r.title).slice(0,130)}`);
