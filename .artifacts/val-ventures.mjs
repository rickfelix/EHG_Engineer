import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. The four cited ventures — created inside the 2026-09-06T19:37:52 burst
const { data: burst, error: e1 } = await sb.from('ventures')
  .select('id, name, is_demo, created_at, updated_at, current_lifecycle_stage')
  .gte('created_at', '2026-09-06T19:37:50')
  .lte('created_at', '2026-09-06T19:37:55')
  .order('created_at', { ascending: true });
console.log('=== BURST 19:37:50-55 ===');
if (e1) console.log('ERR', JSON.stringify(e1)); else {
  console.log('rows:', burst.length);
  for (const v of burst) console.log(` stage=${String(v.current_lifecycle_stage).padStart(2)} is_demo=${String(v.is_demo).padEnd(5)} created=${v.created_at} updated=${v.updated_at} id=${v.id.slice(0,8)} name=${v.name}`);
}

// 2. Venture 8344c34b + decision d87a7018
const { data: v8344, error: e2 } = await sb.from('ventures').select('*').like('id','8344c34b%');
console.log('\n=== VENTURE 8344c34b ===');
if (e2) console.log('ERR', JSON.stringify(e2));
else if (!v8344 || v8344.length === 0) console.log('NOT FOUND via like');
else for (const v of v8344) console.log(` id=${v.id} is_demo=${v.is_demo} created=${v.created_at} updated=${v.updated_at} stage=${v.current_lifecycle_stage} name=${v.name}`);

// 3. is_demo distribution overall
const { count: total } = await sb.from('ventures').select('*', {count:'exact', head:false}).limit(1);
console.log('\n=== VENTURES is_demo DISTRIBUTION ===');
for (const [label, q] of [['is_demo=true', sb.from('ventures').select('id',{count:'exact',head:true}).eq('is_demo',true)],
                          ['is_demo=false', sb.from('ventures').select('id',{count:'exact',head:true}).eq('is_demo',false)],
                          ['is_demo IS NULL', sb.from('ventures').select('id',{count:'exact',head:true}).is('is_demo',null)]]) {
  const { count, error } = await q;
  console.log(` ${label}: ${error ? 'ERR '+error.message : count}`);
}
