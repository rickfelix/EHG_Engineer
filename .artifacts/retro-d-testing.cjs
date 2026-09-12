require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: t } = await sb.from('sub_agent_execution_results').select('id,created_at,verdict,metadata').eq('sd_id','3f128d5c-8168-4415-86cc-ab5da4663d11').eq('sub_agent_code','TESTING').order('created_at',{ascending:false}).limit(3);
  for (const r of t) console.log(r.id, r.created_at, r.verdict, r.metadata.phase, 'exec=' + JSON.stringify(r.metadata.test_execution), 'supersedes=' + r.metadata.supersedes, 'full_unit=' + JSON.stringify(r.metadata.regression_full_unit_tier).slice(0,200), 'sha=' + r.metadata.evaluated_commit_sha);
})();
