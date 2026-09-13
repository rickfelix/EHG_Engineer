import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,verdict,confidence,phase,created_at,metadata').eq('id','1d78482f-bc8c-486f-b49d-5a10b9773718').single();
console.log('id:', data.id, '| code:', data.sub_agent_code, '| verdict:', data.verdict, '| confidence:', data.confidence, '| phase:', data.phase, '| created:', data.created_at);
console.log('metadata.phase:', data.metadata?.phase, '| blockers:', data.metadata?.blockers, '| findings:', data.metadata?.findings?.length);
console.log('metadata.repo_path:', data.metadata?.repo_path);
