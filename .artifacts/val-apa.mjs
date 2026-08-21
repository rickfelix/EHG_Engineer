import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const keys = ['SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001','SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001','SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001','SD-LEO-INFRA-QUALITY-GATE-TYPE-001','SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E'];
for (const k of keys){
  const { data, error } = await s.from('strategic_directives_v2')
    .select('sd_key,title,status,current_phase,sd_type,created_at,scope,description')
    .eq('sd_key',k).maybeSingle();
  if (error || !data){ console.log(`\n### ${k}: NOT FOUND ${error?.message||''}`); continue; }
  console.log(`\n=================== ${k}`);
  console.log(`status=${data.status} phase=${data.current_phase} type=${data.sd_type} created=${(data.created_at||'').slice(0,10)}`);
  console.log(`TITLE: ${data.title}`);
  console.log(`SCOPE: ${String(data.scope||'(none)').slice(0,1600)}`);
  console.log(`DESC: ${String(data.description||'(none)').slice(0,900)}`);
}
// children of APA
const { data: kids } = await s.from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase,sd_type')
  .ilike('sd_key','SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001%');
console.log('\n\n=== APA family ===');
for (const k of (kids||[])) console.log(`  ${(k.status||'').padEnd(11)} ${(k.current_phase||'-').padEnd(18)} ${(k.sd_type||'-').padEnd(14)} ${k.sd_key} :: ${String(k.title).slice(0,110)}`);
