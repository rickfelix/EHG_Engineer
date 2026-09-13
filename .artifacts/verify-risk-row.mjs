import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = '174798a0-363d-4a25-895a-a23c6e93cf6a';

const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, confidence, created_at, critical_issues, warnings, recommendations, conditions, justification, metadata')
  .eq('sd_id', SD_UUID).eq('sub_agent_code', 'RISK')
  .order('created_at', { ascending: false });

if (error) { console.error('ERR', error.message); process.exit(1); }
console.log('rows for SD+RISK:', data.length);
for (const r of data) {
  console.log('---');
  console.log('id:', r.id, '| verdict:', r.verdict, '| conf:', r.confidence, '| created:', r.created_at);
  console.log('critical_issues:', Array.isArray(r.critical_issues) ? r.critical_issues.length : typeof r.critical_issues);
  console.log('warnings:', Array.isArray(r.warnings) ? r.warnings.length : typeof r.warnings);
  console.log('recommendations:', Array.isArray(r.recommendations) ? r.recommendations.length : typeof r.recommendations);
  console.log('conditions:', Array.isArray(r.conditions) ? r.conditions.length : typeof r.conditions);
  console.log('justification len:', (r.justification || '').length);
  console.log('metadata.phase:', r.metadata?.phase, '| repo_path:', r.metadata?.repo_path, '| overall_risk:', r.metadata?.overall_risk);
  console.log('metadata.domain_scores:', JSON.stringify(r.metadata?.domain_scores));
  console.log('first critical issue:', (r.critical_issues?.[0]?.issue || '').slice(0, 120));
}
