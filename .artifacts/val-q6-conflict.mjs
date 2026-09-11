import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD='b0331d11-b360-4fd1-b1e7-6b97676654bf', KEY='SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001';
// conflict matrix
const { data: cm, error: e1 } = await sb.from('sd_conflict_matrix').select('*').limit(5);
if (e1) console.log('sd_conflict_matrix:', e1.message);
else {
  console.log('sd_conflict_matrix COLUMNS:', cm[0]?Object.keys(cm[0]).join(', '):'(empty table)');
  const { data: mine } = await sb.from('sd_conflict_matrix').select('*').or(`sd_id_a.eq.${SD},sd_id_b.eq.${SD}`);
  console.log('rows for this SD:', JSON.stringify(mine));
}
// prior handoffs
const { data: ho } = await sb.from('sd_phase_handoffs').select('id,handoff_type,status,created_at,resolved_at').eq('sd_id',SD).order('created_at',{ascending:false});
console.log('\nHANDOFFS for this SD:', (ho||[]).length);
for (const h of (ho||[])) console.log(` ${h.handoff_type} | ${h.status} | ${h.created_at} | resolved=${h.resolved_at||'-'}`);
// PRD
const { data: prd } = await sb.from('product_requirements_v2').select('id,title,status,created_at').eq('sd_id',SD);
console.log('\nPRDs:', JSON.stringify(prd));
// backlog
const { data: bl } = await sb.from('sd_backlog_map').select('backlog_id,backlog_title,priority').eq('sd_id',KEY);
console.log('\nBACKLOG items (by sd_key):', (bl||[]).length);
const { data: bl2 } = await sb.from('sd_backlog_map').select('backlog_id,backlog_title,priority').eq('sd_id',SD);
console.log('BACKLOG items (by uuid):', (bl2||[]).length);
// sub agent results so far
const { data: sar } = await sb.from('sub_agent_execution_results').select('sub_agent_code,verdict,phase,validation_mode,created_at').eq('sd_id',SD).order('created_at',{ascending:false}).limit(20);
console.log('\nSUB-AGENT RESULTS:', (sar||[]).length);
for (const s of (sar||[])) console.log(` ${s.sub_agent_code} | ${s.verdict} | phase=${s.phase||'-'} | mode=${s.validation_mode||'-'} | ${s.created_at}`);
