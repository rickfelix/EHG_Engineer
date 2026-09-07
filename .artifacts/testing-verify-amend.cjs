const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('sub_agent_execution_results').select('id,verdict,phase,critical_issues,metadata,created_at,updated_at').eq('id','4298bd82-d59d-4ac6-b585-eb6aaf206915').maybeSingle();
  console.log('verdict:', data.verdict, '| phase:', data.phase);
  console.log('critical_issues count:', (data.critical_issues||[]).length);
  (data.critical_issues||[]).forEach((c,i)=>console.log('  ['+i+']', String(c).slice(0,95)+'...'));
  console.log('\namends_row:', data.metadata && data.metadata.amends_row);
  console.log('amendment_reason present:', !!(data.metadata && data.metadata.amendment_reason));
  console.log('test_execution present:', !!(data.metadata && data.metadata.test_execution));
  console.log('artifact_sha:', data.metadata && data.metadata.test_execution && data.metadata.test_execution.artifact_sha);
})();
