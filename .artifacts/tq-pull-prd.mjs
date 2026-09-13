import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('product_requirements_v2').select('*').eq('sd_id','fbbf9a6d-e079-4c22-9189-88336aae9a16');
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('ROWS:', data.length);
for (const r of data) console.log('id=', r.id, '| status=', r.status, '| updated_at=', r.updated_at, '| version=', r.version);
const out='C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/689a1237-33b7-406f-9772-668958b289d6/scratchpad/prd-fresh.json';
fs.writeFileSync(out, JSON.stringify(data, null, 2));
console.log('WROTE bytes=', fs.statSync(out).size);
const r0=data[0];
console.log('NONEMPTY KEYS:');
for (const [k,v] of Object.entries(r0)) {
  if (v===null||v===undefined) continue;
  const s = typeof v==='string'? v : JSON.stringify(v);
  if (s.length<=2) continue;
  console.log('  ', k, '=>', s.length, 'chars');
}
