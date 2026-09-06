import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, created_at, metadata')
  .eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152')
  .order('created_at',{ascending:false}).limit(30);
for (const r of data||[]) {
  const m=r.metadata||{};
  console.log([r.sub_agent_code,r.phase,r.verdict,r.created_at,'hash='+(m.content_hash?'Y':'N'),'sha='+(m.evaluated_commit_sha||'-'),r.id].join(' | '));
}
