import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY);
const { data, error } = await sb.from('product_requirements_v2').select('*').or('directive_id.eq.SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A,sd_id.eq.SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A');
if (error) { console.error('ERR', error); process.exit(1); }
console.log('rows:', data.length);
for (const r of data) {
  console.log('=== PRD', r.id, r.title, 'status=', r.status, 'phase=', r.phase);
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v === null || v === undefined) continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
    if (s.length < 3) continue;
    console.log('\n-----[' + k + ']-----\n' + s);
  }
}
