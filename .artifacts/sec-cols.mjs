import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('*').eq('id','3ed447ec-de8c-4798-9fdc-5a0c814623a5').maybeSingle();
console.log('ALL COLUMNS:', Object.keys(data).join(', '));
for (const k of ['phase','execution_phase','status','created_at','sd_key','target_application','results','recommendations','warnings']) {
  if (k in data) console.log(`${k} =`, JSON.stringify(data[k])?.slice(0,200));
}
const { data: sd } = await sb.from('strategic_directives_v2').select('id,sd_key,target_application,current_phase,status').eq('id','4520716b-0603-46b5-bf7e-19fe4271fe3b').maybeSingle();
console.log('SD:', JSON.stringify(sd));
