import { createClient } from '@supabase/supabase-js';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('sub_agent_execution_results').select('verdict').not('verdict','is',null).limit(200);
console.log('Distinct verdicts:', [...new Set(data.map(r=>r.verdict))]);
