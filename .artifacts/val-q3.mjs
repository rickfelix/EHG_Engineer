import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();
// backlog + stories for GATE 1
const SDU = '2d4e7fea-d8db-447e-a75e-0a8ad201f6c4';
for (const [t, col] of [['sd_backlog_map','sd_id'], ['user_stories','sd_id'], ['product_requirements_v2','directive_id']]) {
  for (const v of [SDU, 'SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001']) {
    const { data, error, count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq(col, v);
    console.log(`${t}.${col}=${v.slice(0,12)} -> ${error ? 'ERR '+error.message : count}`);
  }
}
// the SD row itself
const { data: sd } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,priority,sd_type,is_working_on,claiming_session_id,scope,description')
  .eq('id', SDU).maybeSingle();
console.log('\n=== SD ROW ===');
console.log('sd_key:', sd?.sd_key, '| status:', sd?.status, '| phase:', sd?.current_phase, '| prio:', sd?.priority, '| type:', sd?.sd_type);
console.log('claim:', sd?.claiming_session_id, '| working_on:', sd?.is_working_on);
console.log('scope:', (sd?.scope||'').slice(0,1200));
// canonical-001 status
const { data: can } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase').ilike('sd_key','%CANONICAL%').limit(10);
console.log('\n=== CANONICAL SDs ===');
for (const r of can||[]) console.log(` ${r.sd_key} | ${r.status}/${r.current_phase} | ${r.title?.slice(0,90)}`);
