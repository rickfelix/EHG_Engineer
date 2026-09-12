import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results')
  .select('id,sd_id,sub_agent_code,verdict,confidence,phase,created_at,metadata')
  .eq('id','7e94571a-f8dd-48b4-859c-9c94cf1eb6db').maybeSingle();
if (error) { console.log('ERROR:', error.message); process.exit(1); }
if (!data) { console.log('NOT PERSISTED'); process.exit(1); }
const m = data.metadata || {};
console.log(JSON.stringify({
  id: data.id, sd_id: data.sd_id, code: data.sub_agent_code, verdict: data.verdict,
  confidence: data.confidence, phase_col: data.phase, meta_phase: m.phase, created_at: data.created_at,
  measured: m.measured, test_execution: m.test_execution,
  repo_path: m.repo_path, executed_from_cwd: m.executed_from_cwd, repo_resolved: m.repo_resolved,
  evaluated_commit_sha: m.evaluated_commit_sha, findings_count: m.findings_count
}, null, 2));
