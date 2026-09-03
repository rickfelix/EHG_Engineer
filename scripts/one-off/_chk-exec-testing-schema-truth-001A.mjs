import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: fb, error: fbe } = await s.from('feedback')
  .select('id,title,category,status,created_at')
  .ilike('title', '%swallowed%')
  .order('created_at', { ascending: false }).limit(10);
console.log('FEEDBACK swallowed:', fbe?.message || JSON.stringify(fb, null, 1));

const { data: sds, error: sde } = await s.from('strategic_directives_v2')
  .select('id,sd_key,title,status')
  .or('sd_key.ilike.%SWALLOWED%,title.ilike.%swallowed%').limit(10);
console.log('SDS swallowed:', sde?.message || JSON.stringify(sds, null, 1));

const { data: rows, error: re } = await s.from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,confidence,created_at')
  .eq('sd_id', '00b8482a-de45-4f70-82c3-4fead8f71ee9')
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: false });
console.log('TESTING ROWS:', re?.message || JSON.stringify(rows, null, 1));
