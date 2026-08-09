import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const terms = ['trend','solomon','longitudinal','series','drift','recurrence','eyes','cluster'];
const seen = new Map();
for (const t of terms) {
  const { data, error } = await s.from('strategic_directives_v2')
    .select('id,sd_key,title,status,current_phase,progress,created_at,sd_type')
    .or(`title.ilike.%${t}%,description.ilike.%${t}%`)
    .order('created_at', { ascending: false }).limit(60);
  if (error) { console.log(t, 'ERR', error.message); continue; }
  for (const d of data) { if (!seen.has(d.sd_key)) seen.set(d.sd_key, { ...d, hits: [t] }); else seen.get(d.sd_key).hits.push(t); }
}
const rows = [...seen.values()].sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));
console.log(`TOTAL MATCHES: ${rows.length}\n`);
for (const r of rows) {
  console.log(`[${r.status}|${r.current_phase||'-'}|${r.progress||0}%] ${r.sd_key}  (hits: ${r.hits.join(',')})`);
  console.log(`    ${String(r.title).slice(0,150)}`);
}
