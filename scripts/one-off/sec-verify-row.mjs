import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
const sb = await getSupabaseClient();
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id,sub_agent_code,verdict,confidence_score,phase,created_at,metadata')
  .eq('id','5aa479ed-1b4c-47da-95e3-b71343e076da').maybeSingle();
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log({ id:data.id, code:data.sub_agent_code, verdict:data.verdict, conf:data.confidence_score, phase:data.phase, created:data.created_at });
console.log('metadata.repo_path      =', data.metadata?.repo_path);
console.log('metadata.executed_from_cwd =', data.metadata?.executed_from_cwd);
console.log('findings persisted:', (data.metadata?.findings || data.metadata?.findings_keys || 'see column').length ?? 'n/a');
