require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await s.from('sub_agent_execution_results').select('*').eq('id','793aa2bd-de99-4d9c-a7f9-04f30f04e3d8').single();
  if (error) return console.error(error);
  console.log('id', data.id);
  console.log('code', data.sub_agent_code, '| phase', data.phase, '| verdict', data.verdict, '| conf', data.confidence_score ?? data.confidence);
  console.log('sd_id', data.sd_id, '| created_at', data.created_at);
  const m = data.metadata || {};
  console.log('metadata.repo_path', m.repo_path);
  console.log('executed_from_cwd', m.executed_from_cwd);
  console.log('test_execution', JSON.stringify({e:m.test_execution.tests_executed,p:m.test_execution.tests_passed,f:m.test_execution.tests_failed,file:m.test_execution.results_file,sha:m.test_execution.sha256}));
  console.log('top-level repo_path/local_path present?', 'repo_path' in data, 'local_path' in data);
  console.log('amendments not_landed', JSON.stringify(m.amendments_verified.not_landed));
})();
