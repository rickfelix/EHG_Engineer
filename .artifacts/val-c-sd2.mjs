import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
const UUID='1315f7f7-3b4e-44f4-97f9-f174be21789b';
const LEG='591400cf-7b88-4974-832a-6043e4f59152';
for (const [col,val] of [['id',UUID],['id',LEG],['uuid_id',UUID],['legacy_id',LEG]]) {
  try {
    const { data, error } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,parent_sd_id').eq(col,val);
    console.log(col,'=',val.slice(0,8),'->', error? 'ERR '+error.message : JSON.stringify(data));
  } catch(e){ console.log(col,'threw',e.message.slice(0,120)); }
}
const { data: byKey } = await sb.from('strategic_directives_v2').select('*').eq('sd_key','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C').maybeSingle();
console.log('BY KEY found:', !!byKey);
if (byKey) {
  console.log('id:',byKey.id,'| status:',byKey.status,'| phase:',byKey.current_phase,'| prio:',byKey.priority,'| parent:',byKey.parent_sd_id, '| target_app:', byKey.target_application);
  console.log('title:',byKey.title);
  console.log('--- description ---\n'+(byKey.description||'').slice(0,6000));
  const md=byKey.metadata||{};
  console.log('--- md keys ---',Object.keys(md).join(','));
  for (const k of ['needs_coordinator_review','not_before','review_hold','deferred_blocker','roadmap_link_reason','scope_lock','children']) if (k in md) console.log(k+':',JSON.stringify(md[k]).slice(0,500));
  const { data: prds } = await sb.from('product_requirements_v2').select('id,title,status,created_at').eq('directive_id', byKey.sd_key);
  console.log('PRDs by directive_id:', JSON.stringify(prds));
  const { data: prds2 } = await sb.from('product_requirements_v2').select('id,title,status').eq('sd_id', byKey.id);
  console.log('PRDs by sd_id:', JSON.stringify(prds2));
  for (const idv of [byKey.id, byKey.sd_key]) {
    const { data: bl } = await sb.from('sd_backlog_map').select('backlog_id,backlog_title,priority').eq('sd_id', idv);
    console.log('BACKLOG for',String(idv).slice(0,20),':',(bl||[]).length, JSON.stringify((bl||[]).slice(0,10)));
  }
  for (const idv of [byKey.id, byKey.sd_key, UUID]) {
    const { data: sar } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,created_at').eq('sd_id', idv).order('created_at',{ascending:false}).limit(10);
    console.log('SAR for',String(idv).slice(0,20),':',JSON.stringify(sar));
  }
}
