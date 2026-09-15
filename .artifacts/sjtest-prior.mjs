import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('sub_agent_execution_results').select('*').eq('id','2c67573a-2fa5-44ac-a15f-e9a1257843dd');
const r = data[0];
for (const [k,v] of Object.entries(r)) {
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  console.log(k, '=', s.length > 400 ? s.slice(0,400)+'...[len '+s.length+']' : s);
}
