import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
const { data } = await sb.from('sub_agent_execution_results')
  .select('validation_mode,source,sub_agent_code,phase')
  .not('validation_mode','is',null)
  .order('created_at',{ascending:false})
  .limit(50);
const modes = [...new Set((data||[]).map(r=>r.validation_mode))];
console.log('validation_mode values observed:', modes);
const sources = [...new Set((data||[]).map(r=>r.source))];
console.log('source values observed:', sources);
