import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,verdict,confidence,created_at,metadata')
  .eq('id','81faa991-4e20-4f2d-8f81-04d9638eae7c').single();
if (error) { console.error(error.message); process.exit(1); }
console.log(JSON.stringify({
  id:data.id, code:data.sub_agent_code, phase:data.phase, verdict:data.verdict,
  conf:data.confidence, created:data.created_at,
  repo_path:data.metadata?.repo_path, executed_from_cwd:data.metadata?.executed_from_cwd,
  test_execution:data.metadata?.test_execution,
  artifact_sha:data.metadata?.evidence_provenance?.content_sha256,
  clean_tree:data.metadata?.evidence_provenance?.working_tree_clean_for_impl_paths,
  commit_match:data.metadata?.commit_verification?.match
}, null, 1));
