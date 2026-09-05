import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, created_at, metadata')
  .eq('id', '53dbe7ca-b8b3-458f-b8fb-97c089bbd3fb')
  .single();
if (error) throw error;
console.log(JSON.stringify({
  id: data.id,
  sub_agent_code: data.sub_agent_code,
  phase: data.phase,
  verdict: data.verdict,
  created_at: data.created_at,
  repo_path: data.metadata?.repo_path,
  executed_from_cwd: data.metadata?.executed_from_cwd,
}, null, 2));
