import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id,sub_agent_code,sd_id,verdict,confidence,created_at,metadata')
  .eq('id','3a0213a7-3178-4766-9290-95adc3c24b3d').maybeSingle();
if (error) { console.log('ERR', error.message); process.exit(1); }
if (!data) { console.log('ROW ABSENT'); process.exit(1); }
console.log('READBACK OK');
console.log('code:', data.sub_agent_code, '| verdict:', data.verdict, '| conf:', data.confidence);
console.log('sd_id:', data.sd_id, '| created:', data.created_at);
console.log('metadata.repo_path:', data.metadata?.repo_path);
console.log('metadata.executed_from_cwd:', data.metadata?.executed_from_cwd);
console.log('metadata.phase:', data.metadata?.phase);
const { data: app } = await sb.from('applications').select('local_path').eq('name','EHG_Engineer').maybeSingle();
console.log('applications.local_path:', app?.local_path, '| gate-compare match:', app?.local_path === data.metadata?.repo_path);
