import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,status,created_at,sd_id,results')
  .in('sub_agent_code',['SECURITY'])
  .order('created_at',{ascending:false}).limit(120);
if (error) { console.error(error); process.exit(1); }
console.log('scanned', data.length);
for (const r of data) {
  const txt = JSON.stringify(r.results||{});
  if (!/michael/i.test(txt)) continue;
  const m = txt.match(/SEC-M2[\s\S]{0,900}/);
  console.log('---', r.id, r.phase, r.created_at, r.sd_id, 'len', txt.length, m ? 'HAS-SEC-M2' : '');
  if (m) console.log(m[0]);
}
