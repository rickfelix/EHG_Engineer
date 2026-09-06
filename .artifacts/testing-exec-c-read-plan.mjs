import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, metadata, created_at')
  .eq('id', 'cd6df38e-07bc-44fd-8987-9f1a5bd29949').maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data) { console.log('NO ROW'); process.exit(0); }
console.log('verdict', data.verdict, data.created_at);
const m = data.metadata || {};
console.log('metadata keys:', Object.keys(m).join(', '));
console.log(JSON.stringify(m.exec_test_checklist, null, 1));
console.log('--- coverage map ---');
console.log(JSON.stringify(m.acceptance_criteria_coverage || m.coverage_map || m.acceptance_criteria_map, null, 1));
