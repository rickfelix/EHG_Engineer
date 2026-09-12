import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id,sd_id,sub_agent_code,phase,verdict,confidence,source,executed_from_cwd,created_at,metadata,critical_issues,warnings')
  .eq('id','a3587993-ab6e-4611-a27f-8020c465a522').single();
if (error) { console.error(error); process.exit(1); }
const m = data.metadata || {};
console.log(JSON.stringify({
  id: data.id, sd_id: data.sd_id, code: data.sub_agent_code, phase: data.phase,
  verdict: data.verdict, confidence: data.confidence, source: data.source,
  created_at: data.created_at,
  meta_repo_path: m.repo_path, meta_executed_from_cwd: m.executed_from_cwd,
  meta_session_id: m.session_id, meta_content_hash: m.content_hash,
  meta_evaluated_commit_sha: m.evaluated_commit_sha,
  meta_repo_resolved: m.repo_resolved, meta_registry_source: m.registry_source,
  top_level_repo_path_present: Object.prototype.hasOwnProperty.call(data,'repo_path'),
  critical_count: (data.critical_issues||[]).length,
  warning_count: (data.warnings||[]).length,
}, null, 2));
