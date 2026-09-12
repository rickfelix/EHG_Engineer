import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A');
if (error) { console.error('ERR', error); process.exit(1); }
if (!data?.length) { console.log('NO ROW by id; trying sd_id ilike'); const r2 = await s.from('product_requirements_v2').select('id,sd_id,title,status,phase').ilike('sd_id','%AUDIT-FIX-FEEDBACK%'); console.log(JSON.stringify(r2.data,null,2)); const r3 = await s.from('product_requirements_v2').select('id,sd_id,title').ilike('id','%AUDIT-FIX%'); console.log(JSON.stringify(r3.data,null,2)); process.exit(0); }
const p = data[0];
console.log('KEYS:', Object.keys(p).join(', '));
for (const k of ['id','sd_id','directive_id','title','status','phase','version','created_at','updated_at','activation_test_id','category','priority']) console.log(k, '=', JSON.stringify(p[k]));
import fs from 'fs';
fs.writeFileSync('.artifacts/tst-prd-full.json', JSON.stringify(p,null,2));
console.log('WROTE .artifacts/tst-prd-full.json bytes=', fs.statSync('.artifacts/tst-prd-full.json').size);
