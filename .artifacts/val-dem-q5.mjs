import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// LIVE schema of the ledger + siblings: probe by selecting one row
for (const t of ['venture_channel_publish_ledger','venture_channel_autonomy','venture_channel_secrets','campaign_enrollments']) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  const { count } = await sb.from(t).select('id', { count:'exact', head:true });
  console.log(`\n=== ${t} === rows=${count} err=${error?.message||'none'}`);
  if (data && data[0]) console.log('COLUMNS:', Object.keys(data[0]).join(', '));
  else console.log('COLUMNS: (0 rows - cannot infer from data)');
}

console.log('\n\n############ VENTURES BLAST RADIUS ############');
const { data: v, error: ve } = await sb.from('ventures').select('id,name,is_demo,launch_mode,current_lifecycle_stage,status');
console.log('err:', ve?.message||'none', 'total ventures:', v?.length);
const nonDemo = (v||[]).filter(x => x.is_demo !== true);
console.log(`is_demo=true: ${(v||[]).filter(x=>x.is_demo===true).length} | non-demo: ${nonDemo.length}`);
console.log('\n--- NON-DEMO ventures (the ones the predicate actually evaluates) ---');
for (const x of nonDemo.sort((a,b)=>(b.current_lifecycle_stage||0)-(a.current_lifecycle_stage||0))) {
  const stage = x.current_lifecycle_stage;
  const verdict = (stage===null||stage===undefined) ? 'BLOCK(unresolvable_stage)' : (stage < 24 ? 'BLOCK(stage<24)' : 'PASS(stage>=24)');
  console.log(` ${verdict.padEnd(26)} S${String(stage).padEnd(4)} launch_mode=${String(x.launch_mode).padEnd(10)} status=${String(x.status).padEnd(12)} ${x.name} [${x.id.slice(0,8)}]`);
}
console.log('\n--- launch_mode distribution across ALL ventures ---');
const lm = {}; for (const x of (v||[])) { const k=`${x.is_demo===true?'demo':'real'}/${x.launch_mode}`; lm[k]=(lm[k]||0)+1; }
console.log(JSON.stringify(lm,null,1));
console.log('\n--- ventures with launch_mode=live (would PASS under the corrected predicate) ---');
console.log(JSON.stringify((v||[]).filter(x=>x.launch_mode==='live').map(x=>`${x.name} S${x.current_lifecycle_stage} demo=${x.is_demo}`),null,1));
