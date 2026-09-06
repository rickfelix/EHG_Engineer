import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
const UUID='1315f7f7-3b4e-44f4-97f9-f174be21789b';
const { data: sd, error } = await sb.from('strategic_directives_v2').select('*').eq('id',UUID).maybeSingle();
if (error) console.error('SD err', error.message);
if (sd) {
  console.log('SD KEY:', sd.sd_key, '| status:', sd.status, '| phase:', sd.current_phase, '| prio:', sd.priority, '| parent:', sd.parent_sd_id);
  console.log('title:', sd.title);
  console.log('--- description ---');
  console.log((sd.description||'').slice(0,5000));
  const md = sd.metadata||{};
  console.log('--- md keys ---', Object.keys(md).join(','));
  for (const k of ['needs_coordinator_review','not_before','review_hold','deferred_blocker','roadmap_link_reason','scope_lock']) if (k in md) console.log(k+':', JSON.stringify(md[k]).slice(0,400));
}
const { data: prds } = await sb.from('product_requirements_v2').select('id,title,status,created_at').or(`directive_id.eq.${sd?.sd_key||"x"},sd_id.eq.${UUID}`);
console.log('PRDs:', JSON.stringify(prds));
const { data: bl } = await sb.from('sd_backlog_map').select('backlog_id,backlog_title,priority,item_description').eq('sd_id', sd?.sd_key || '');
console.log('BACKLOG(sd_key) count:', (bl||[]).length);
for (const b of bl||[]) console.log(' -', b.backlog_id, '|', b.backlog_title, '|', b.priority);
const { data: bl2 } = await sb.from('sd_backlog_map').select('backlog_id,backlog_title,priority').eq('sd_id', UUID);
console.log('BACKLOG(uuid) count:', (bl2||[]).length);
for (const b of bl2||[]) console.log(' -', b.backlog_id, '|', b.backlog_title, '|', b.priority);
const { data: sar } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,created_at').eq('sd_id',UUID).order('created_at',{ascending:false}).limit(20);
console.log('SUBAGENT ROWS:', JSON.stringify(sar));
