import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// find candidate decision tables
for (const t of ['chairman_decisions','decisions','chairman_decision_queue','chairman_feedback']) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  console.log(`table ${t}: ${error ? 'ERR '+error.code+' '+error.message.slice(0,80) : 'EXISTS, cols='+(data[0]?Object.keys(data[0]).join(','):'(empty)')}`);
}
