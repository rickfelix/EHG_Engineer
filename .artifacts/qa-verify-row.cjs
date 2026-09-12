require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const sb = createClient(url, key);
(async () => {
  const { data, error } = await sb
    .from('sub_agent_execution_results')
    .select('id, sub_agent_code, phase, verdict, confidence, created_at, metadata')
    .eq('sd_id', '3f128d5c-8168-4415-86cc-ab5da4663d11')
    .eq('sub_agent_code', 'TESTING')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) { console.error('ERR', error.message); process.exit(1); }
  for (const r of data) {
    const m = r.metadata || {};
    const te = m.test_execution || {};
    console.log('---', r.id);
    console.log('  phase=' + r.phase + ' verdict=' + r.verdict + ' confidence=' + r.confidence + ' created=' + r.created_at);
    console.log('  metadata.evaluated_commit_sha =', m.evaluated_commit_sha);
    console.log('  MATCH_68c2b948 =', m.evaluated_commit_sha === '68c2b9481c8e784b462a401ab3c8f29543c95641');
    console.log('  session_id =', m.session_id);
    console.log('  repo_path =', m.repo_path);
    console.log('  executed_from_cwd =', m.executed_from_cwd);
    console.log('  repo_resolved =', m.repo_resolved, 'registry_source =', m.registry_source);
    console.log('  test_execution =', JSON.stringify(te));
    console.log('  has scenario_coverage =', !!m.scenario_coverage, '| covered =', m.scenario_coverage && m.scenario_coverage.covered);
    console.log('  supersedes =', m.supersedes ? JSON.stringify(m.supersedes.rows || m.supersedes.row_id) : 'none');
    console.log('  lint =', m.lint ? m.lint.errors + ' errors / ' + m.lint.warnings + ' warnings over ' + m.lint.files_linted + ' files' : 'none');
  }
})();
