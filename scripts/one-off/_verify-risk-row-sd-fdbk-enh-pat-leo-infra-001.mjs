import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
const { data, error } = await sb
  .from('sub_agent_execution_results')
  .select('id,sub_agent_code,sub_agent_name,phase,verdict,confidence,validation_mode,source,summary,created_at')
  .eq('sd_id','670b1f01-95c2-4695-b7a9-979f9db2c598')
  .eq('phase','LEAD')
  .order('created_at',{ascending:false})
  .limit(10);
if (error) console.error('Error:', error.message);
console.log('Rows for SD/LEAD:', data?.length);
console.log(JSON.stringify(data, null, 2));
