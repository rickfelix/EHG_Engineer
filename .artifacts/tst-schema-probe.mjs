import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// 1. uat_test_runs shape
const r = await s.from('uat_test_runs').select('*').order('created_at',{ascending:false}).limit(3);
if (r.error) console.log('uat_test_runs err:', r.error.message);
else {
  console.log('uat_test_runs COLUMNS:', Object.keys(r.data[0]||{}).join(', '));
  for (const row of r.data) {
    console.log('--- row', row.id);
    console.log('  top-level control_pack_failures:', JSON.stringify(row.control_pack_failures));
    console.log('  metadata:', JSON.stringify(row.metadata)?.slice(0,600));
  }
}
const cnt = await s.from('uat_test_runs').select('id',{count:'exact',head:true});
console.log('uat_test_runs row count:', cnt.count);
