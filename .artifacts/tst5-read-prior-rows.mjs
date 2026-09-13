import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, confidence, created_at, critical_issues, metadata')
  .eq('sd_id', 'fbbf9a6d-e079-4c22-9189-88336aae9a16')
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: true });
if (error) { console.error(error); process.exit(1); }
for (const r of data) {
  console.log('---', r.id.slice(0, 8), r.phase, r.verdict, 'conf=' + r.confidence, r.created_at);
  console.log('   critical_issues:', Array.isArray(r.critical_issues) ? r.critical_issues.length : typeof r.critical_issues);
  console.log('   metadata keys:', Object.keys(r.metadata || {}).join(', '));
  console.log('   repo_path:', r.metadata?.repo_path, '| executed_from_cwd:', r.metadata?.executed_from_cwd);
}
