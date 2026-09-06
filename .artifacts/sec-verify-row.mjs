import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('*').eq('id','5f31b9b9-acb6-4a17-884b-5ac25b07c6bb').single();
if (error) { console.error(error); process.exit(1); }
console.log('id            :', data.id);
console.log('sd_id         :', data.sd_id);
console.log('sub_agent_code:', data.sub_agent_code);
console.log('phase         :', data.phase);
console.log('verdict       :', data.verdict);
console.log('confidence    :', data.confidence_score);
console.log('validation_mode:', data.validation_mode);
console.log('source        :', data.source ?? '(none)');
console.log('top-level repo_path column present?:', Object.prototype.hasOwnProperty.call(data,'repo_path'));
console.log('top-level local_path column present?:', Object.prototype.hasOwnProperty.call(data,'local_path'));
const m = data.metadata || {};
console.log('metadata.repo_path        :', m.repo_path);
console.log('metadata.repo_resolved    :', m.repo_resolved);
console.log('metadata.executed_from_cwd:', m.executed_from_cwd);
console.log('metadata.session_id       :', m.session_id);
console.log('metadata.content_hash     :', m.content_hash);
console.log('metadata.evaluated_commit_sha:', m.evaluated_commit_sha);
console.log('metadata.sub_agent_version:', data.sub_agent_version ?? m.sub_agent_version);
console.log('findings count on row     :', Array.isArray(data.findings) ? data.findings.length : typeof data.findings);
