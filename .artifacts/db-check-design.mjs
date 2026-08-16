import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,confidence,created_at,summary')
  .eq('sd_id', 'ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5')
  .order('created_at', { ascending: false }).limit(30);
if (error) { console.error(error); process.exit(1); }
for (const r of data) {
  console.log(`${r.created_at} | ${r.sub_agent_code} | ${r.phase} | ${r.verdict} (${r.confidence}) | ${r.id}`);
  if (/DESIGN/i.test(r.sub_agent_code)) console.log('   SUMMARY: ' + String(r.summary || '').slice(0, 1500));
}
console.log('TOTAL_ROWS=' + data.length);
