import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID='39101e4d-0b38-4ee4-a573-26926221e585';
const { data, error } = await s.from('sub_agent_execution_results').select('*').eq('id',ID).maybeSingle();
if (error) { console.error('ERR:', error.message); process.exit(1); }
if (!data) { console.error('ROW NOT FOUND'); process.exit(1); }
console.log('ROW EXISTS ✓  columns:', Object.keys(data).length);
for (const k of ['id','sd_id','sub_agent_code','sub_agent_name','verdict','confidence','phase','source','invocation_id','validation_mode','status','created_at'])
  if (k in data) console.log(' ', k.padEnd(18), '=', data[k]);
const m = data.metadata||{};
console.log('  metadata.repo_path        =', m.repo_path);
console.log('  metadata.executed_from_cwd=', m.executed_from_cwd);
console.log('  metadata.repo_resolved    =', m.repo_resolved, '| probe_exists =', m.probe_exists, '| registry_source =', m.registry_source);
console.log('  metadata.original_verdict =', m.original_verdict);
console.log('  metadata.evaluated_commit_sha =', m.evaluated_commit_sha);
console.log('  summary len =', (data.summary||'').length, '| warnings =', (data.warnings||[]).length, '| conditions =', (data.conditions||[]).length, '| recs =', (data.recommendations||[]).length);
console.log('  justification len =', (data.justification||'').length);
try { const { data:v, error:ve } = await s.from('v_sub_agent_repo_compliance').select('*').eq('id',ID).maybeSingle();
  console.log('  repo-compliance view =', ve ? 'ERR '+ve.message : JSON.stringify(v)); } catch(e){ console.log('  view err', e.message); }
const { count } = await s.from('sub_agent_execution_results').select('id',{count:'exact',head:true})
  .eq('sd_id','71fb0b59-adb5-4c65-88d3-5fe788b062d1').eq('sub_agent_code','VALIDATION').eq('phase','LEAD-TO-PLAN');
console.log('  VALIDATION @ LEAD-TO-PLAN rows for this SD =', count);
