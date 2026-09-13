import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('product_requirements_v2').select('*').eq('sd_id','SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001');
if (error) { console.error(error); process.exit(1); }
if (!data?.length) {
  const r2 = await s.from('product_requirements_v2').select('id,sd_id,title').ilike('sd_id','%SUMMARY-COLUMNS%');
  console.log('no direct match', JSON.stringify(r2.data));
  process.exit(0);
}
for (const p of data) {
  console.log('=== PRD', p.id, p.title, 'status', p.status);
  for (const k of Object.keys(p)) {
    const v = p[k];
    if (v === null || v === undefined) continue;
    const str = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
    if (str.length < 3) continue;
    console.log(`\n--- ${k} ---\n${str}`);
  }
}
