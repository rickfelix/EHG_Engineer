import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Do recent completed SD-LEO-INFRA-* SDs carry backlog items? (is 0-backlog the norm?)
const { data: sds } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,status').like('sd_key','SD-LEO-INFRA-%').eq('status','completed')
  .order('created_at',{ascending:false}).limit(15);
let withBacklog=0;
for (const s of (sds||[])) {
  const { count } = await sb.from('sd_backlog_map').select('*',{count:'exact',head:true}).eq('sd_id', s.sd_key);
  const { count: c2 } = await sb.from('sd_backlog_map').select('*',{count:'exact',head:true}).eq('sd_id', s.id);
  const n=(count||0)+(c2||0);
  if(n>0) withBacklog++;
  console.log(`${s.sd_key}: ${n} backlog item(s)`);
}
console.log(`\n=> ${withBacklog}/${(sds||[]).length} recent completed SD-LEO-INFRA-* SDs have >=1 backlog item`);
