import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, verdict, confidence, created_at, metadata')
  .eq('id','d541ebcc-47be-4558-9647-70eef32fb43a');
if (error) { console.error('READ ERROR:', error.message); process.exit(1); }
if (!data || data.length === 0) { console.error('ROW NOT FOUND'); process.exit(1); }
const r = data[0];
console.log('ROW FOUND');
console.log('  id            :', r.id);
console.log('  sd_id         :', r.sd_id);
console.log('  sub_agent_code:', r.sub_agent_code);
console.log('  verdict       :', r.verdict);
console.log('  confidence    :', r.confidence);
console.log('  created_at    :', r.created_at);
console.log('  metadata.repo_path       :', r.metadata?.repo_path);
console.log('  metadata.executed_from_cwd:', r.metadata?.executed_from_cwd);
console.log('  metadata.repo_resolved   :', r.metadata?.repo_resolved);
console.log('  metadata.phase           :', r.metadata?.phase);
console.log('  metadata.handoff_type    :', r.metadata?.handoff_type);
console.log('  findings keys :', Object.keys(r.metadata?.findings || {}).length ? Object.keys(r.metadata.findings) : '(findings stored elsewhere)');
console.log('  measurements  :', JSON.stringify(r.metadata?.measurements));
// freshness for LEAD phase
const { data: recent } = await s.from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, created_at')
  .eq('sd_id','SD-LEARN-FIX-ADDRESS-PAT-LES-015').order('created_at',{ascending:false}).limit(6);
console.log('\nRECENT ROWS FOR SD:');
for (const x of recent) console.log(`  ${x.created_at} | ${x.sub_agent_code} | ${x.verdict} | ${x.id}`);
