import dotenv from 'dotenv'; import path from 'path'; import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('id','0d8e40af-509d-4bfd-bb00-443fdfe52d31').maybeSingle();
if (error) { console.error(error); process.exit(1); }
const m = data.metadata || {};
const req = ['producer','run_id','content_hash','content_hash_input','repo_path','executed_from_cwd','session_id','evaluated_commit_sha','sub_agent_version','reviewed_diff_sha256'];
console.log('row:', data.id, '| code:', data.sub_agent_code, '| phase:', data.phase, '| verdict:', data.verdict, '| source:', data.source, '| sd_id:', data.sd_id);
for (const k of req) console.log((m[k] !== undefined && m[k] !== null ? 'OK   ' : 'MISS ') + k + ' = ' + JSON.stringify(m[k]));
console.log('top-level repo_path present?', Object.prototype.hasOwnProperty.call(data,'repo_path'));
console.log('top-level local_path present?', Object.prototype.hasOwnProperty.call(data,'local_path'));
console.log('metadata.security_findings count:', Array.isArray(m.security_findings) ? m.security_findings.length : 'ABSENT');
console.log('repo_resolved:', JSON.stringify(m.repo_resolved));
console.log('warnings:', (data.warnings||[]).length, '| conditions:', (data.conditions||[]).length, '| recommendations:', (data.recommendations||[]).length);
console.log('summary chars:', (data.summary||'').length);
