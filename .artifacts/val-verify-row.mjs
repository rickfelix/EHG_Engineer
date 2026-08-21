import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const { data, error } = await s.from('sub_agent_execution_results')
  .select('id,sub_agent_code,sd_id,phase,verdict,created_at,metadata,summary')
  .eq('id','06a4d82f-0366-48a6-9900-0dc989ebc5c5').maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data) { console.error('ROW NOT FOUND -- NOT PERSISTED'); process.exit(1); }
console.log('PERSISTED ROW:');
console.log('  id            :', data.id);
console.log('  sub_agent_code:', data.sub_agent_code);
console.log('  sd_id         :', data.sd_id);
console.log('  phase         :', data.phase);
console.log('  verdict       :', data.verdict);
console.log('  confidence    :', data.confidence);
console.log('  created_at    :', data.created_at);
console.log('  repo_path     :', data.metadata?.repo_path);
console.log('  repo_resolved :', data.metadata?.repo_resolved);
console.log('  exec_from_cwd :', data.metadata?.executed_from_cwd);
console.log('  recs count    :', (data.metadata?.q3_reuse_opportunities?.items||[]).length);
console.log('  summary[0:120]:', String(data.summary).slice(0,120));

// Gate-shaped lookup: does a fresh VALIDATION row exist for this SD at LEAD?
const { data: gateRows } = await s.from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,created_at')
  .eq('sd_id', data.sd_id).eq('sub_agent_code','VALIDATION')
  .order('created_at',{ascending:false}).limit(5);
console.log('\nGATE-SHAPED LOOKUP (VALIDATION rows for this SD):');
for (const r of (gateRows||[])) console.log(`  ${r.created_at} phase=${r.phase} verdict=${r.verdict} id=${r.id}`);

// repo compliance view
const { data: comp, error: cErr } = await s.from('v_sub_agent_repo_compliance')
  .select('*').eq('id', data.id).maybeSingle();
console.log('\nREPO COMPLIANCE VIEW:', cErr ? 'ERR '+cErr.message : JSON.stringify(comp));
