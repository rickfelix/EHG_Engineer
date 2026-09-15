import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, phase, verdict, confidence, created_at, metadata')
  .eq('id', '15b6427b-55e9-48d5-b1c2-d86c4c3f7843')
  .single();
if (error) { console.error('READBACK ERROR', error); process.exit(1); }
console.log(JSON.stringify({
  id: data.id, sd_id: data.sd_id, sub_agent_code: data.sub_agent_code, phase: data.phase,
  verdict: data.verdict, confidence: data.confidence, created_at: data.created_at,
  repo_path: data.metadata?.repo_path, supersedes: data.metadata?.supersedes_evidence_row,
  verified_commit: data.metadata?.verified_commit,
}, null, 2));
