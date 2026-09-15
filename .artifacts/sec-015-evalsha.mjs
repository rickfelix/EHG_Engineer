import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('metadata').eq('id','ec0c3ce4-bab4-4a93-830c-c27a42b12729');
const m = data[0].metadata;
console.log('evaluated_commit_sha:', m.evaluated_commit_sha);
console.log('repo_resolved:', m.repo_resolved, '| registry_source:', m.registry_source);
console.log('metrics:', JSON.stringify(m.metrics));
