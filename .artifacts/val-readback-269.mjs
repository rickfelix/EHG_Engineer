import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results')
  .select('id,sd_id,sub_agent_code,verdict,confidence,phase,source,invocation_id,validation_mode,created_at,evaluated_commit_sha,metadata,summary')
  .eq('id','39101e4d-0b38-4ee4-a573-26926221e585').maybeSingle();
if (error) { console.error('READBACK ERR:', error.message); process.exit(1); }
if (!data) { console.error('ROW NOT FOUND'); process.exit(1); }
console.log('ROW EXISTS ✓');
for (const k of ['id','sd_id','sub_agent_code','verdict','confidence','phase','source','invocation_id','validation_mode','created_at','evaluated_commit_sha'])
  console.log(' ', k.padEnd(22), '=', data[k]);
console.log('  metadata.repo_path     =', data.metadata?.repo_path);
console.log('  metadata.executed_from_cwd =', data.metadata?.executed_from_cwd);
console.log('  metadata.repo_resolved =', data.metadata?.repo_resolved, '| probe_exists =', data.metadata?.probe_exists);
console.log('  summary len            =', (data.summary||'').length);
// gate view
const { data: v, error: ve } = await s.from('v_sub_agent_repo_compliance').select('*').eq('id','39101e4d-0b38-4ee4-a573-26926221e585').maybeSingle();
console.log('  repo-compliance view   =', ve ? 'ERR '+ve.message : JSON.stringify(v));
// freshness for the handoff gate
const { count } = await s.from('sub_agent_execution_results').select('id',{count:'exact',head:true})
  .eq('sd_id','71fb0b59-adb5-4c65-88d3-5fe788b062d1').eq('sub_agent_code','VALIDATION').eq('phase','LEAD-TO-PLAN');
console.log('  VALIDATION @ LEAD-TO-PLAN rows for this SD =', count);
