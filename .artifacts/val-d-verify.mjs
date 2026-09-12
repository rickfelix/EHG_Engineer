import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, source, invocation_id, confidence, created_at, metadata')
  .eq('id', 'c26274e9-5a4e-4d55-afc2-426db7520171')
  .single();
if (error) { console.error('ERR', error.message); process.exit(1); }
const m = data.metadata || {};
console.log('id                  =', data.id);
console.log('sub_agent_code      =', data.sub_agent_code);
console.log('phase               =', data.phase);
console.log('verdict             =', data.verdict);

console.log('created_at          =', data.created_at);
console.log('col.source          =', data.source);
console.log('col.invocation_id   =', data.invocation_id);
console.log('col.confidence      =', data.confidence);
console.log('meta.repo_path      =', m.repo_path);
console.log('meta.executed_from_cwd =', m.executed_from_cwd);
console.log('meta.repo_resolved  =', m.repo_resolved);
console.log('meta.registry_source=', m.registry_source);
console.log('meta.session_id     =', m.session_id);
console.log('meta.content_hash   =', m.content_hash);
console.log('meta.evaluated_commit_sha =', m.evaluated_commit_sha);
console.log('top-level repo_path/local_path present? =', 'repo_path' in data || 'local_path' in data);
console.log('findings count      =', (m.findings || data.findings || []).length || 'see column');
const { data: app } = await sb.from('applications').select('local_path').eq('id', 'EHG_Engineer').maybeSingle();
console.log('applications.local_path (EHG_Engineer) =', app?.local_path);
