import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,status,created_at,sd_id,results,metadata')
  .eq('sub_agent_code','SECURITY').order('created_at',{ascending:false}).limit(40);
if (error) { console.error(error); process.exit(1); }
for (const r of data) {
  const txt = JSON.stringify(r.results||{});
  if (!/MICHAEL/i.test(String(r.sd_id)+txt) && !/michael/i.test(txt)) continue;
  console.log('=====', r.id, r.sub_agent_code, r.phase, r.status, r.created_at, r.sd_id);
  console.log(txt.slice(0, 9000));
}
