import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, confidence, source, created_at, summary, warnings, critical_issues, conditions, justification, metadata')
  .eq('sd_id','6b090e53-3732-43e9-9f07-939bae2a0f69').eq('sub_agent_code','SECURITY')
  .order('created_at',{ascending:false});
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('SECURITY rows for this SD:', data.length);
for (const r of data) {
  console.log('---');
  console.log(' id:', r.id);
  console.log(' phase:', r.phase, '| verdict:', r.verdict, '| conf:', r.confidence, '| source:', r.source);
  console.log(' created_at:', r.created_at);
  console.log(' repo_path(meta):', r.metadata?.repo_path);
  console.log(' executed_from_cwd(meta):', r.metadata?.executed_from_cwd);
  console.log(' analysis_mode:', r.metadata?.analysis_mode || '(n/a - automated scan)');
  console.log(' warnings:', (r.warnings||[]).length, '| critical:', (r.critical_issues||[]).length, '| conditions:', (r.conditions||[]).length);
  console.log(' summary present:', !!r.summary, '| summary len:', (r.summary||'').length);
  console.log(' justification len:', (r.justification||'').length);
  if (r.metadata?.measured_on_real_fixture) console.log(' measured_on_real_fixture ventures:', r.metadata.measured_on_real_fixture.ventures, '| fixture sha:', String(r.metadata.measured_on_real_fixture.fixture_sha256).slice(0,16));
  if (r.metadata?.content_hash) console.log(' content_hash:', String(r.metadata.content_hash).slice(0,16), '...');
  console.log(' warning ids:', (r.warnings||[]).map(w=>w.id||w.severity).join(', '));
}
