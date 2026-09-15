import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results').select('id,sub_agent_code,verdict,phase,created_at')
  .eq('sd_id','6b090e53-3732-43e9-9f07-939bae2a0f69').eq('sub_agent_code','SECURITY').order('created_at',{ascending:false});
if (error) { console.error('SELECT ERROR (NOT absence):', JSON.stringify(error)); process.exit(1); }
console.log(data.length === 0 ? '  SECURITY rows: NONE (query succeeded, genuine absence) -- EXEC-TO-PLAN will still block on SUBAGENT_EVIDENCE_MISSING: SECURITY' : '  ' + JSON.stringify(data,null,1));
