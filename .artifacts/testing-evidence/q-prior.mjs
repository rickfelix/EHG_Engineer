import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, created_at, metadata, sd_id')
  .eq('id','e116fbce-eace-4dbd-8960-ee312ee272e3').maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data) { console.log('NO ROW FOUND'); process.exit(0); }
console.log('id      :', data.id);
console.log('code    :', data.sub_agent_code, '| phase:', data.phase, '| verdict:', data.verdict);
console.log('sd_id   :', data.sd_id);
console.log('created :', data.created_at);
console.log('metadata:', JSON.stringify(data.metadata, null, 2).slice(0, 5000));
