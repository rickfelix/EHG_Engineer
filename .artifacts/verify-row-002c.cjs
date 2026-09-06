require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await s.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,confidence,sd_id,created_at,metadata').eq('id','cd6df38e-07bc-44fd-8987-9f1a5bd29949').maybeSingle();
  const m = data.metadata || {};
  console.log(JSON.stringify({
    id: data.id, code: data.sub_agent_code, phase: data.phase, verdict: data.verdict,
    confidence: data.confidence, sd_id: data.sd_id, created_at: data.created_at,
    repo_path: m.repo_path, executed_from_cwd: m.executed_from_cwd,
    session_id: m.session_id, content_hash: m.content_hash, evaluated_commit_sha: m.evaluated_commit_sha,
    te: m.test_execution, ac_cov: (m.acceptance_criteria_coverage||[]).map(a=>a.status),
    checklist_len: (m.exec_test_checklist||[]).length,
    top_level_path_cols: Object.keys(data).filter(k=>/repo_path|local_path/.test(k))
  }, null, 2));
})();
