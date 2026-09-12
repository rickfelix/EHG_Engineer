require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: r } = await sb.from('retrospectives').select('*').eq('id', process.argv[2] || '7988686d-1fff-4303-95c5-0cf54599e565').single();
  console.log('RETRO', r.id, r.retro_type, r.status, r.quality_score, r.generated_by, r.auto_generated, r.created_at);
  console.log('WENT_WELL', JSON.stringify(r.what_went_well, null, 1));
  console.log('NEEDS_IMPROVEMENT', JSON.stringify(r.what_needs_improvement, null, 1));
  console.log('KEY_LEARNINGS', JSON.stringify(r.key_learnings, null, 1));
  console.log('ACTION_ITEMS', JSON.stringify(r.action_items, null, 1));
  console.log('PATTERNS', JSON.stringify(r.success_patterns), JSON.stringify(r.failure_patterns));
  const { data: e } = await sb.from('sub_agent_execution_results').select('id,verdict,confidence,session_id,evaluated_commit_sha,metadata,findings,recommendations').eq('id', process.argv[3] || '22739b35-1ea8-4dae-95f0-4f97c0ff191a').single();
  const m = e.metadata || {};
  console.log('EVIDENCE', e.id, e.verdict, e.confidence, 'session_col=' + e.session_id, 'sha_col=' + e.evaluated_commit_sha);
  console.log('  meta phase', m.phase, '| session', m.session_id, '| sha', m.evaluated_commit_sha, '| repo', m.repo_path, '| cwd', m.executed_from_cwd, '| hash', m.content_hash);
  console.log('  findings.retrospective', JSON.stringify(e.findings?.retrospective || {}).slice(0,300));
  console.log('  recs', JSON.stringify(e.recommendations));
})();
