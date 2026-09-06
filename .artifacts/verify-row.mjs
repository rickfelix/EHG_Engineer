import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('sub_agent_execution_results').select('id,sub_agent_code,verdict,phase,confidence,created_at,metadata').eq('id','3e0331d8-68ac-4027-a43f-8c795de07d1c').maybeSingle();
console.log(JSON.stringify({id:data.id,code:data.sub_agent_code,verdict:data.verdict,phase:data.phase,confidence:data.confidence,repo_path:data.metadata?.repo_path,repo_resolved:data.metadata?.repo_resolved,test_execution:data.metadata?.test_execution},null,1));
