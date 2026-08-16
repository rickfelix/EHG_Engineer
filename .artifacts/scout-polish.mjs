import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('strategic_directives_v2')
  .select('sd_key,sd_type,status,current_phase,priority,success_criteria,success_metrics,key_changes,risks,smoke_test_steps,updated_at,target_application')
  .eq('id','ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5').maybeSingle();
if (error) { console.log('ERR', error.message); process.exit(0); }
const j = v => JSON.stringify(v);
console.log('sd_type:', data.sd_type, '| status:', data.status, '| phase:', data.current_phase, '| prio:', data.priority, '| app:', data.target_application);
console.log('updated_at:', data.updated_at);
for (const f of ['success_criteria','success_metrics','key_changes','risks','smoke_test_steps']) {
  const v = data[f];
  const str = j(v) || '';
  const n = Array.isArray(v) ? v.length : (v ? 1 : 0);
  const placeholder = /See description for details|Implement core changes for|\[title\]/i.test(str);
  console.log(`${f}: n=${n} placeholder=${placeholder} :: ${str.slice(0,180)}`);
}
