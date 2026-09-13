import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('=== ventures table: explicit error capture ===');
const { data, error, count } = await sb.from('ventures').select('id,name,current_workflow_stage,status',{count:'exact'}).limit(10);
console.log('error:', error ? `${error.code} :: ${error.message}` : 'none', '| count:', count, '| rows:', data?.length);
(data||[]).forEach(v=>console.log('  ', v.id?.slice(0,8), '|', v.name, '| stage:', v.current_workflow_stage, '| status:', v.status));

console.log('\n=== channel secrets provisioning (credential chokepoint) ===');
for (const t of ['venture_channel_secrets','channel_secrets','venture_secrets']) {
  const { data: d, error: e } = await sb.from(t).select('*').limit(10);
  if (e) { console.log(`${t}: ABSENT/ERR ${e.code} ${e.message.slice(0,70)}`); continue; }
  console.log(`${t}: rows=${d.length} cols=${d[0]?Object.keys(d[0]).join(','):'(empty)'}`);
  d.forEach(r=>console.log('   ', JSON.stringify({v:r.venture_id?.slice?.(0,8), ch:r.channel_type, ref:r.secret_ref?'SET':'null'})));
}
