import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const { data, error } = await sb.from('product_requirements_v2').select('*').eq('sd_id','fbbf9a6d-e079-4c22-9189-88336aae9a16');
if (error) { console.error('ERR', error); process.exit(1); }
console.log('ROWS', data.length);
for (const r of data) { console.log('id=', r.id, 'status=', r.status, 'title=', r.title); }
fs.writeFileSync('.artifacts/valv-prd.json', JSON.stringify(data, null, 2));
console.log('keys:', Object.keys(data[0]||{}).join(', '));
