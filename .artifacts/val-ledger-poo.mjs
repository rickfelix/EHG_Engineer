import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== venture_channel_publish_ledger (ALL rows) ===');
const { data: led, error: e1 } = await sb.from('venture_channel_publish_ledger').select('*').order('created_at',{ascending:false});
if (e1) console.log('ERR:', e1.message, '| code:', e1.code);
else {
  console.log('row count:', led.length);
  console.log('columns:', led[0] ? Object.keys(led[0]).join(', ') : '(no rows - cannot infer columns)');
  led.forEach(r=>console.log(JSON.stringify({id:r.id?.slice?.(0,8), venture:r.venture_id?.slice?.(0,8), ch:r.channel_type, decision:r.decision, outcome:r.outcome, mode:r.execution_mode, corr:r.correlation_id, created:r.created_at})));
}

console.log('\n=== execution_mode column present? (explicit select) ===');
const { data: em, error: e2 } = await sb.from('venture_channel_publish_ledger').select('id,execution_mode').limit(1);
console.log(e2 ? `ABSENT/ERR: ${e2.code} ${e2.message}` : `PRESENT (rows: ${em.length})`);

console.log('\n=== venture_channel_autonomy ===');
const { data: aut, error: e3 } = await sb.from('venture_channel_autonomy').select('*');
if (e3) console.log('ERR:', e3.code, e3.message);
else { console.log('row count:', aut.length); aut.forEach(r=>console.log(JSON.stringify(r).slice(0,300))); }

console.log('\n=== any rework-ish table? ===');
for (const t of ['venture_channel_rework','content_rework','publish_rework','marketing_rework']) {
  const { error } = await sb.from(t).select('id',{head:true,count:'exact'});
  console.log(`${t}: ${error ? 'ABSENT ('+error.code+')' : 'EXISTS'}`);
}
