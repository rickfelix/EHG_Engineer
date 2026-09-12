import dotenv from 'dotenv'; import path from 'path'; import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __d = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__d,'..'), '.env') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, confidence, source, created_at, metadata')
  .eq('sd_id','3f128d5c-8168-4415-86cc-ab5da4663d11').eq('sub_agent_code','DESIGN').eq('phase','PLAN')
  .order('created_at',{ascending:false}).limit(5);
if (error) { console.error(error); process.exit(1); }
for (const r of data) console.log(JSON.stringify({
  id: r.id, code: r.sub_agent_code, phase: r.phase, verdict: r.verdict, confidence: r.confidence,
  source: r.source, created_at: r.created_at,
  repo_path: r.metadata?.repo_path, executed_from_cwd: r.metadata?.executed_from_cwd,
  session_id: r.metadata?.session_id, content_hash: r.metadata?.content_hash,
  report_sha256: r.metadata?.report_sha256,
  evaluated_commit_sha: r.metadata?.evaluated_commit_sha,
  has_skip_reason: Boolean(r.metadata?.skip_reason),
  findings_by_severity: r.metadata?.findings_by_severity,
}, null, 2));
