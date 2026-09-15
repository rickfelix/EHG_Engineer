import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, sub_agent_name, phase, verdict, confidence, summary, warnings, critical_issues, metadata, created_at')
  .eq('sd_id', 'SD-LEARN-FIX-ADDRESS-PAT-LES-015')
  .eq('sub_agent_code', 'SECURITY')
  .order('created_at', { ascending: false })
  .range(0, 9);

console.log('query error:', error?.message || 'none');
console.log('SECURITY rows for this SD:', data?.length, '\n');
for (const r of data || []) {
  const ageMin = ((Date.now() - new Date(r.created_at).getTime()) / 60000).toFixed(1);
  console.log(`ID            : ${r.id}`);
  console.log(`  code/phase  : ${r.sub_agent_code} / ${r.phase}`);
  console.log(`  verdict     : ${r.verdict}  (confidence ${r.confidence})`);
  console.log(`  created_at  : ${r.created_at}  (${ageMin} min ago)`);
  console.log(`  analysis_mode         : ${r.metadata?.analysis_mode ?? '(none - automated scan)'}`);
  console.log(`  metadata.handoff_type : ${r.metadata?.handoff_type ?? '(none)'}`);
  console.log(`  metadata.diff_verdict : ${r.metadata?.diff_verdict ?? '(none)'}`);
  console.log(`  evaluated_commit_sha  : ${r.metadata?.evaluated_commit_sha}`);
  console.log(`  metadata.repo_path    : ${r.metadata?.repo_path}`);
  console.log(`  critical_issues : ${Array.isArray(r.critical_issues) ? r.critical_issues.length : r.critical_issues}`);
  console.log(`  warnings        : ${Array.isArray(r.warnings) ? r.warnings.length : 'n/a'}`);
  console.log(`  findings in md  : ${Array.isArray(r.metadata?.findings) ? r.metadata.findings.length : 'n/a'}`);
  console.log(`  summary[0..160] : ${String(r.summary).slice(0, 160)}...`);
  console.log('');
}

// Freshness probe the handoff gate cares about: a SECURITY row at phase=EXEC created recently.
const fresh = (data || []).filter((r) => r.phase === 'EXEC');
console.log(`GATE CHECK -> SECURITY rows with phase='EXEC': ${fresh.length} (newest ${fresh[0]?.id}, verdict ${fresh[0]?.verdict})`);
