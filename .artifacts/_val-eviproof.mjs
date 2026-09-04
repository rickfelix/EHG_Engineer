import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('sub_agent_execution_results').select('id,sub_agent_code,verdict,created_at')
  .eq('sd_id','0e12ecbe-da83-4c52-879c-6426997075d4').order('created_at',{ascending:false}).limit(5);
console.log(JSON.stringify(data,null,1));
