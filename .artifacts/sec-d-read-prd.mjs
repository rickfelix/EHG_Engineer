import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('product_requirements_v2').select('*').or('id.eq.PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D,directive_id.eq.SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D');
if (error) { console.error(error); process.exit(1); }
console.log('ROWS:', data.length);
for (const r of data) {
  console.log('=== id:', r.id, '| directive_id:', r.directive_id, '| status:', r.status, '| phase:', r.phase);
  console.log('KEYS:', Object.keys(r).join(', '));
  for (const [k,v] of Object.entries(r)) {
    if (v === null || v === undefined) continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
    if (s.length < 3) continue;
    console.log(`\n---- ${k} (${s.length}) ----\n${s}`);
  }
}
