import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ids = ['3ed447ec-de8c-4798-9fdc-5a0c814623a5','9b8602a9-76bb-4b2c-b36f-01f4625b720c'];
const { data } = await s.from('sub_agent_execution_results').select('*').in('id', ids).order('created_at');
for (const r of data) {
  console.log('\n########## ROW', r.id, '| verdict:', r.verdict, '| conf:', r.confidence, '| phase:', r.phase, '| cwd:', r.executed_from_cwd, '| repo:', r.metadata?.repo_path);
  console.log('SUMMARY:', r.summary);
  console.log('CRITICAL_ISSUES:', JSON.stringify(r.critical_issues, null, 1));
  console.log('WARNINGS:', JSON.stringify(r.warnings, null, 1));
  console.log('RECOMMENDATIONS:', JSON.stringify(r.recommendations, null, 1));
  console.log('CONDITIONS:', JSON.stringify(r.conditions, null, 1));
  console.log('DETAILED_ANALYSIS:', typeof r.detailed_analysis === 'string' ? r.detailed_analysis : JSON.stringify(r.detailed_analysis, null, 1));
}
