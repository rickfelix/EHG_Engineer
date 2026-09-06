const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('user_stories').select('*').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152').order('story_key');
  data.forEach(r => {
    console.log('\n==========', r.story_key, '| pts', r.story_points, '| prio', r.priority, '| status', r.status, '| by', r.created_by, '| prd', r.prd_id);
    console.log('TITLE:', r.title);
    console.log('ROLE:', r.user_role, '\nWANT:', r.user_want, '\nBENEFIT:', r.user_benefit);
    console.log('AC:', JSON.stringify(r.acceptance_criteria));
    console.log('IMPL_CTX len', (r.implementation_context||'').length, ':', (r.implementation_context||'').slice(0,300).replace(/\n/g,' | '));
    console.log('TECH_NOTES:', (r.technical_notes||'').slice(0,200));
  });
  const { data: sa } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,metadata,created_at').eq('id','f0e64347-fe8b-4b68-bb82-61d6a2fa40a8').single();
  console.log('\n=== EVIDENCE ROW ===', sa.sub_agent_code, sa.phase, sa.verdict);
  const m = sa.metadata||{};
  console.log('repo_path:', m.repo_path, '| executed_from_cwd:', m.executed_from_cwd, '| session_id:', m.session_id, '| content_hash:', m.content_hash, '| evaluated_commit_sha:', m.evaluated_commit_sha, '| stories_created:', m.stories_created, '| source:', sa.source ?? m.source);
})();
