import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, confidence, sd_id, created_at, conditions, justification, metadata')
  .eq('id','1a24f0c5-8c38-488e-9504-1a9b6260ef4b').maybeSingle();
if (error) { console.error(error); process.exit(1); }
console.log('id           ', data.id);
console.log('agent/phase  ', data.sub_agent_code, '/', data.phase);
console.log('verdict      ', data.verdict, '| confidence', data.confidence);
console.log('sd_id        ', data.sd_id);
console.log('created_at   ', data.created_at);
console.log('conditions   ', Array.isArray(data.conditions) ? data.conditions.length + ' (blocking: ' + data.conditions.filter(c=>c.blocking).length + ')' : typeof data.conditions);
console.log('justification', (data.justification||'').length, 'chars');
const m = data.metadata || {};
console.log('measured     ', m.measured);
console.log('test_execution', JSON.stringify({e:m.test_execution?.tests_executed,p:m.test_execution?.tests_passed,f:m.test_execution?.tests_failed,s:m.test_execution?.tests_skipped}));
console.log('supersedes   ', m.supersedes);
console.log('repo_path    ', m.repo_path);
console.log('repo_resolved', m.repo_resolved, '| executed_from_cwd', m.executed_from_cwd);
console.log('content_hash ', m.content_hash);
console.log('findings     ', m._findings_had_keys ? 'stripped, keys: '+JSON.stringify(m._findings_had_keys) : (m.findings||[]).length + ' in metadata');
