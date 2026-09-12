import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

for (const t of ['venture_telemetry','launch_mode_audit','audit_log']) {
  const { count, error } = await sb.from(t).select('*', { count:'exact', head:true });
  console.log(`${t}: rows=${count} err=${error?.message||'none'}`);
}
// metrics_base_url populated anywhere?
const { data: apps, error: ae } = await sb.from('applications').select('id,name,metrics_base_url').not('metrics_base_url','is',null);
console.log('\napplications with metrics_base_url NOT NULL:', ae?.message || (apps||[]).length, JSON.stringify((apps||[]).map(a=>a.name)));

// issue_patterns / feedback relevant rows
console.log('\n=== issue_patterns mentioning stage gate / publish / dry-run ===');
const { data: ip, error: ipe } = await sb.from('issue_patterns').select('pattern_id,category,issue_summary,occurrence_count,status').or('issue_summary.ilike.%stage gate%,issue_summary.ilike.%stage-gate%,issue_summary.ilike.%dry-run%,issue_summary.ilike.%dryRun%,issue_summary.ilike.%publish%,issue_summary.ilike.%go-live%');
console.log('err:', ipe?.message||'none');
for (const r of (ip||[])) console.log(` - ${r.pattern_id} (${r.occurrence_count}x, ${r.status}) ${String(r.issue_summary).slice(0,140)}`);

console.log('\n=== feedback mentioning these ===');
const { data: fb, error: fbe } = await sb.from('feedback').select('id,category,status,created_at,content').or('content.ilike.%STAGE_GATE_PREDICATE_ARMED%,content.ilike.%venture_channel_publish_ledger%,content.ilike.%dry-run%').limit(25);
console.log('err:', fbe?.message||'none', 'count:', (fb||[]).length);
for (const r of (fb||[])) console.log(` - ${r.id?.slice(0,8)} [${r.category}/${r.status}] ${String(r.content).slice(0,180).replace(/\n/g,' ')}`);

// prior sub_agent_execution_results for this SD
console.log('\n=== existing sub_agent_execution_results for this SD ===');
const { data: sar, error: sare } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,verdict,created_at,metadata').eq('sd_id','4520716b-0603-46b5-bf7e-19fe4271fe3b').order('created_at');
console.log('by uuid err:', sare?.message||'none', 'count:', (sar||[]).length);
for (const r of (sar||[])) console.log(` - ${r.created_at} ${r.sub_agent_code} = ${r.verdict} [${r.id.slice(0,8)}]`);
const { data: sar2 } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,verdict,created_at,sd_id').eq('sd_id','SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001').order('created_at');
console.log('by sd_key count:', (sar2||[]).length);
for (const r of (sar2||[])) console.log(` - ${r.created_at} ${r.sub_agent_code} = ${r.verdict} [${r.id.slice(0,8)}]`);
