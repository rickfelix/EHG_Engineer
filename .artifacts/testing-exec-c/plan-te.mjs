import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('metadata').eq('id','cd6df38e-07bc-44fd-8987-9f1a5bd29949').maybeSingle();
console.log(JSON.stringify(data.metadata.test_execution,null,1));
console.log('metrics:', JSON.stringify(data.metadata.metrics));
