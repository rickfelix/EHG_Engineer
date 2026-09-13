import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,sd_id,verdict,phase,confidence,created_at,metadata').eq('id','19dfb4fb-b0e4-402e-8cdb-cbe2a36057a6').single();
if (error) { console.error('ERR', error.message); process.exit(1); }
console.log('id        :', data.id);
console.log('code      :', data.sub_agent_code);
console.log('sd_id     :', data.sd_id);
console.log('verdict   :', data.verdict);
console.log('phase     :', data.phase);
console.log('confidence:', data.confidence);
console.log('created_at:', data.created_at);
console.log('repo_path :', data.metadata?.repo_path);
console.log('exec_cwd  :', data.metadata?.executed_from_cwd);
console.log('repo_resolved:', data.metadata?.repo_resolved);
console.log('orig_verdict :', data.metadata?.original_verdict);
