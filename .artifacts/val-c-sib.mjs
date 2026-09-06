import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
const { data: kids } = await sb.from('strategic_directives_v2').select('id,sd_key,status,current_phase,metadata').eq('parent_sd_id','47695217-d641-486a-959e-7acd0f07737a').order('sd_key');
for (const k of kids||[]) {
  const { data: bl } = await sb.from('sd_backlog_map').select('backlog_id').eq('sd_id',k.id);
  const { count } = await sb.from('sub_agent_execution_results').select('id',{count:'exact',head:true}).eq('sd_id',k.id);
  const md=k.metadata||{};
  console.log(k.sd_key.replace('SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-',''), '|', k.status, '|', k.current_phase, '| backlog:', (bl||[]).length, '| SAR:', count, '| hold:', md.review_hold ?? md.needs_coordinator_review, '| not_before:', JSON.stringify(md.not_before)?.slice(0,40));
}
// canonical SAR row shape from sibling B
const { data: b } = await sb.from('strategic_directives_v2').select('id').eq('sd_key','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B').maybeSingle();
const { data: rows } = await sb.from('sub_agent_execution_results').select('*').eq('sd_id',b.id).eq('sub_agent_code','VALIDATION').order('created_at',{ascending:false}).limit(1);
console.log('=== sample VALIDATION row (B) ===');
if (rows&&rows[0]) { const r=rows[0]; console.log('cols:',Object.keys(r).join(',')); console.log(JSON.stringify({...r, results: typeof r.results==='object'? '[obj keys: '+Object.keys(r.results||{}).join(',')+']':r.results, metadata:r.metadata},null,1).slice(0,2500)); }
