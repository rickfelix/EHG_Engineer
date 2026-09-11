import { createSupabaseServiceClient } from '../scripts/lib/supabase-connection.js';
const db = await createSupabaseServiceClient('engineer', {verbose:false});
const { data, error } = await db.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, confidence, created_at, metadata')
  .eq('id', '1a71cf03-cf2c-4c6d-a24c-f1930f190489')
  .maybeSingle();
if (error) { console.error(error); process.exit(1); }
console.log('verdict:', data.verdict, 'confidence:', data.confidence, 'phase:', data.phase);
console.log('repo_path:', data.metadata?.repo_path, 'executed_from_cwd:', data.metadata?.executed_from_cwd);
console.log('content_hash:', data.metadata?.content_hash);
process.exit(0);
