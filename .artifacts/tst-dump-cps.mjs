import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('uat_test_runs').select('id,created_at,metadata').order('created_at',{ascending:false}).limit(4);
for (const r of data) {
  const m=r.metadata||{};
  console.log('=== ', r.id.slice(0,8), r.created_at);
  console.log('control_pack_status:', JSON.stringify(m.control_pack_status, null, 2));
  console.log('control_pack_evaluated:', JSON.stringify(m.control_pack_evaluated));
  console.log('control_pack_failures:', JSON.stringify(m.control_pack_failures));
  console.log('other control_pack* keys:', Object.keys(m).filter(k=>/control_pack/.test(k)));
}
// distinct status values across all rows
const { data: all } = await sb.from('uat_test_runs').select('metadata');
const vals=new Set();
for (const r of all){const cps=(r.metadata||{}).control_pack_status; if(cps) for(const k of Object.keys(cps)) vals.add(k+' => '+JSON.stringify(cps[k]));}
console.log('\nDISTINCT key=>value pairs across all rows:');
[...vals].sort().forEach(v=>console.log('  ',v));
