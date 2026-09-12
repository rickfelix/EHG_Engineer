import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results').select('*')
  .eq('sd_id','4520716b-0603-46b5-bf7e-19fe4271fe3b').eq('sub_agent_code','TESTING').eq('phase','PLAN')
  .order('created_at',{ascending:false}).limit(1);
if (error) { console.error(error); process.exit(1); }
const r = data[0];
console.log('ROW ID           :', r.id);
console.log('sd_id            :', r.sd_id);
console.log('sub_agent_code   :', r.sub_agent_code);
console.log('phase            :', r.phase);
console.log('verdict          :', r.verdict);
console.log('confidence       :', r.confidence);
console.log('created_at       :', r.created_at);
console.log('validation_mode  :', r.validation_mode);
console.log('critical_issues  :', (r.critical_issues||[]).length);
console.log('warnings         :', (r.warnings||[]).length);
console.log('recommendations  :', (r.recommendations||[]).length);
console.log('summary present  :', !!r.summary, '| detailed_analysis len:', (r.detailed_analysis||'').length);
console.log('meta.repo_path         :', r.metadata?.repo_path);
console.log('meta.executed_from_cwd :', r.metadata?.executed_from_cwd);
console.log('meta.target_application:', r.metadata?.target_application);
console.log('meta.measured (guard)  :', r.metadata?.measured);
console.log('meta.test_execution    :', JSON.stringify(r.metadata?.test_execution));
console.log('meta.content_hash      :', r.metadata?.content_hash);
console.log('meta.prd_id            :', r.metadata?.prd_id);
console.log('meta.findings_count    :', r.metadata?.findings_count);
console.log('meta.measured_facts ok :', !!r.metadata?.measured_facts, '| ventures_total:', r.metadata?.measured_facts?.ventures_total);
