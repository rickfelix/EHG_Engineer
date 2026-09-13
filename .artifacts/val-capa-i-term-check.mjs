import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const id of ['2f4f3260-ba8e-4526-b45f-18e37fc562f9','32b46c18-7adb-4ef9-a3be-fae29fa16ca5']) {
  const { data } = await s.from('sub_agent_execution_results').select('id, phase, verdict, recommendations, summary, metadata').eq('id', id).maybeSingle();
  const blob = JSON.stringify({ r: data.recommendations, s: data.summary, m: data.metadata });
  console.log(`\n${id.slice(0,8)} phase=${data.phase} verdict=${data.verdict}`);
  console.log('  mentions EXEC-TO-PLAN:', /EXEC-TO-PLAN/.test(blob));
  console.log('  mentions PLAN-TO-LEAD:', /PLAN-TO-LEAD/.test(blob));
  const hits = (blob.match(/[^"]{0,90}EXEC-TO-PLAN[^"]{0,40}/g) || []);
  hits.forEach(h => console.log('   >', h.trim()));
}
