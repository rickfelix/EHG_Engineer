import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id,sd_id,sub_agent_code,phase,verdict,confidence,metadata,summary,raw_output,executed_from_cwd,source')
  .eq('id', '08e7cb19-dd77-4fd3-b8eb-f05576b42a87').maybeSingle();
if (error) { console.error(error); process.exit(1); }
const md = data.metadata || {};
const findings = data.raw_output?.findings || md.findings || [];
console.table({
  sd_id_ok: data.sd_id === 'ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5',
  phase: data.phase,
  code: data.sub_agent_code,
  verdict: data.verdict,
  confidence: data.confidence,
  repo_path: md.repo_path,
  repo_resolved: md.repo_resolved,
  anon_executable_secdef_live: md.anon_executable_secdef_live,
  chairman_ask_true_count: md.chairman_ask_true_count,
  bucket_a_len: (md.bucket_a_final || []).length,
  bucket_b_len: (md.bucket_b_final || []).length,
  bucket_c_len: (md.bucket_c_final || []).length,
  migration_applied: md.migration_applied,
  summary_len: (data.summary || '').length,
  findings_count: findings.length,
});
const required = ['repo_path', 'executed_from_cwd', 'design_informed', 'anon_executable_secdef_live',
  'chairman_ask_true_count', 'bucket_a_final', 'bucket_b_final', 'bucket_c_final', 'adp_effectiveness',
  'bucket_moves_from_original', 'proposed_files', 'rollback_baseline_stmts', 'measurement_path'];
const missing = required.filter((k) => md[k] === undefined || md[k] === null);
console.log(missing.length
  ? 'VERIFY_FAILED — absent from metadata: ' + missing.join(', ')
  : `VERIFY_OK — all ${required.length} required keys present in the intended column (metadata); findings=${findings.length}`);
