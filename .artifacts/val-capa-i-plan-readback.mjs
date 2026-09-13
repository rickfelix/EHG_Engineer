import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results').select('*').eq('id', '32b46c18-7adb-4ef9-a3be-fae29fa16ca5').maybeSingle();
if (error) { console.error(error); process.exit(1); }
console.log('COLS:', Object.keys(data).join(', '));
console.log({ id: data.id, code: data.sub_agent_code, phase: data.phase, verdict: data.verdict, sd_id: data.sd_id, created_at: data.created_at });
console.log('metadata.repo_path =', data.metadata?.repo_path);
console.log('metadata.executed_from_cwd =', data.metadata?.executed_from_cwd);
console.log('metadata.phase =', data.metadata?.phase, '| validation_type =', data.metadata?.validation_type, '| head =', data.metadata?.head_sha);
console.log('critical_issues count =', (data.results?.critical_issues || data.critical_issues || []).length);
