import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const { data, error } = await sb.from('product_requirements_v2').select('*').eq('directive_id','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C');
if (error) { console.error(error); process.exit(1); }
console.log('rows:', data.length);
for (const r of data) {
  console.log('=== id:', r.id, '| title:', r.title, '| status:', r.status, '| phase:', r.phase);
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v === null || v === '') continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
    if (s.length < 3) continue;
    console.log('---- FIELD:', k, '----');
    console.log(s.slice(0, 30000));
  }
}
