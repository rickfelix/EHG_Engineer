require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await s.from('sub_agent_execution_results').select('id,sub_agent_code,sd_id,phase,verdict,confidence,created_at,metadata,conditions').eq('id','3b3bae92-e37a-41eb-9dcb-e214e3a4192a').single();
  if (error) return console.error(error);
  console.log({ id: data.id, code: data.sub_agent_code, sd_id: data.sd_id, phase: data.phase, verdict: data.verdict, confidence: data.confidence, created_at: data.created_at });
  console.log('measured:', data.metadata.measured, '| amendments:', data.metadata.amendment_count, '| critical:', JSON.stringify(data.metadata.critical_amendment_ids));
  console.log('repo_path:', data.metadata.repo_path, '| executed_from_cwd:', data.metadata.executed_from_cwd);
  console.log('top-level path cols present?', 'repo_path' in data, 'local_path' in data);
  console.log('conditions:', (data.conditions||[]).length);
})();
