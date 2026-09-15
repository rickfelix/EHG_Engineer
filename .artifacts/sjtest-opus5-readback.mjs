import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID='b9408054-add2-431b-b959-5a9d278ecb3e';
const { data, error } = await s.from('sub_agent_execution_results')
  .select('id,sd_id,sub_agent_code,verdict,phase,created_at,confidence,source,metadata').eq('id',ID).single();
if (error) { console.error('SELECT ERROR:', JSON.stringify(error)); process.exit(1); }
console.log('READBACK FROM DB (independent SELECT, not the writer return value):');
for (const k of ['id','sd_id','sub_agent_code','verdict','phase','confidence','source','created_at']) console.log('  '+k.padEnd(17), data[k]);
console.log('  age_seconds      ', Math.round((Date.now()-new Date(data.created_at))/1000));
console.log('  meta.repo_path   ', data.metadata?.repo_path);
console.log('  meta.exec_cwd    ', data.metadata?.executed_from_cwd);
console.log('  meta.repo_resolved', data.metadata?.repo_resolved);
console.log('  meta.measured    ', data.metadata?.measured);
console.log('  test_execution   ', JSON.stringify(data.metadata?.test_execution));
console.log('  mutation M1      ', JSON.stringify(data.metadata?.mutation_testing?.mutations?.[0]));
console.log('  findings persisted?', data.metadata?._findings_had_keys ? JSON.stringify(data.metadata._findings_had_keys) : 'findings key absent from metadata');

const { data: sd, error: e2 } = await s.from('strategic_directives_v2').select('current_phase').eq('id', data.sd_id).single();
if (e2) { console.error('SD SELECT ERROR:', JSON.stringify(e2)); } else console.log('  SD current_phase ', sd.current_phase);

// Gate-shaped freshness probe: is this the newest TESTING row, and is it newer than the PLAN-phase ones?
const { data: rows, error: e3 } = await s.from('sub_agent_execution_results')
  .select('id,sub_agent_code,verdict,phase,created_at').eq('sd_id', data.sd_id)
  .in('sub_agent_code',['TESTING','SECURITY']).order('created_at',{ascending:false}).limit(8);
if (e3) { console.error('ROWS SELECT ERROR:', JSON.stringify(e3)); }
else { console.log('\nTESTING/SECURITY rows for this SD (newest first):');
  for (const r of rows) console.log('  ', r.created_at, r.sub_agent_code.padEnd(9), (r.phase||'-').padEnd(6), r.verdict.padEnd(17), r.id.slice(0,8), r.id===ID?'<== THIS RUN':''); }
