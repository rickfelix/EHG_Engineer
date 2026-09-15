import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, phase, verdict, confidence, summary, warnings, critical_issues, recommendations, detailed_analysis, metadata, created_at')
  .eq('sd_id', 'SD-LEARN-FIX-ADDRESS-PAT-LES-015')
  .eq('sub_agent_code', 'SECURITY')
  .order('created_at', { ascending: false })
  .range(0, 9);

console.log('query error:', error?.message || 'none');
console.log('SECURITY rows for this SD:', data?.length, '\n');
for (const r of data || []) {
  const age = ((Date.now() - new Date(r.created_at).getTime()) / 60000).toFixed(1);
  console.log(`${r.id}  ${r.phase}  ${r.verdict} (conf ${r.confidence})  ${age}m ago`);
  console.log(`   mode=${r.metadata?.analysis_mode ?? '(automated)'} review_type=${r.metadata?.review_type ?? '-'} commit=${String(r.metadata?.evaluated_commit_sha).slice(0,11)} diff_verdict=${r.metadata?.diff_verdict ?? '-'}`);
}

const NEW = '7756b313-1afe-4847-8830-2c3ac36afb47';
const r = (data || []).find((x) => x.id === NEW);
console.log('\n=== NEW ROW DETAIL ===');
console.log('sd_id                :', r.sd_id);
console.log('phase                :', r.phase);
console.log('handoff_type (md)    :', r.metadata?.handoff_type);
console.log('analysis_mode        :', r.metadata?.analysis_mode);
console.log('review_type          :', r.metadata?.review_type);
console.log('evaluated_commit_sha :', r.metadata?.evaluated_commit_sha);
console.log('supersedes_row       :', r.metadata?.supersedes_row);
console.log('pr                   :', r.metadata?.pr);
console.log('repo_path            :', r.metadata?.repo_path);
console.log('verdict / diff_verdict:', r.verdict, '/', r.metadata?.diff_verdict);
console.log('prior_low_status     :', r.metadata?.prior_low_finding_status);
console.log('critical_issues      :', r.critical_issues?.length);
console.log('warnings             :', r.warnings?.length, '->', r.warnings?.map((w) => w.severity).join(', '));
console.log('recommendations      :', r.recommendations?.length);
console.log('durable findings     :', r.metadata?.security_review_findings?.length, '->', r.metadata?.security_review_findings?.map((f) => f.severity).join(', '));
const da = r.detailed_analysis;
const daStr = typeof da === 'string' ? da : JSON.stringify(da);
console.log('detailed_analysis    :', daStr?.includes('_compressed') ? 'COMPRESSED to artifact' : `INLINE (${daStr?.length} chars)`);
console.log('metrics keys         :', Object.keys(r.metadata?.metrics || {}).length);
