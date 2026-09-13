import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('\n=== execution_mode migration in applied ledger? ===');
for (const t of ['applied_migrations','schema_migrations','migration_ledger']) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  if (error) { console.log(`${t}: ABSENT ${error.code}`); continue; }
  console.log(`${t}: EXISTS cols=${data[0]?Object.keys(data[0]).join(','):'(empty)'}`);
  const { data: hits } = await sb.from(t).select('*').or('migration_name.ilike.%execution_mode%,filename.ilike.%execution_mode%,name.ilike.%execution_mode%').limit(10).then(r=>r,()=>({data:null}));
  if (hits) hits.forEach(h=>console.log('   HIT:', JSON.stringify(h).slice(0,300)));
}

console.log('\n=== venture_demand_verdicts ===');
const { data: vd, error: evd } = await sb.from('venture_demand_verdicts').select('venture_id,verdict,computed_at').limit(20);
console.log(evd ? 'ERR '+evd.code+' '+evd.message : `rows=${vd.length}`);
(vd||[]).forEach(r=>console.log('  ', r.verdict, r.venture_id?.slice(0,8), r.computed_at));

console.log('\n=== AltifyAI venture + channel portfolio ===');
const { data: v } = await sb.from('ventures').select('id,name,current_workflow_stage,status').ilike('name','%altify%').limit(5);
(v||[]).forEach(x=>console.log('  venture:', x.id?.slice(0,8), x.name, '| stage:', x.current_workflow_stage, '| status:', x.status));

for (const t of ['venture_channels','channel_budgets','venture_channel_autonomy']) {
  const { data, error } = await sb.from(t).select('*').limit(10);
  if (error) { console.log(`${t}: ABSENT ${error.code}`); continue; }
  console.log(`${t}: rows=${data.length}`);
  data.forEach(r=>console.log('   ', JSON.stringify({v:r.venture_id?.slice?.(0,8), ch:r.channel_type||r.platform, state:r.autonomy_state, status:r.status}).slice(0,160)));
}
