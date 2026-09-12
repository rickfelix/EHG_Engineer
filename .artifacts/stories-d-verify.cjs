require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';
(async () => {
  const { data: st } = await sb.from('user_stories')
    .select('story_key,sd_id,prd_id,priority,story_points,status,created_by,technical_notes,acceptance_criteria,implementation_context,title')
    .eq('prd_id', PRD_ID).order('story_key');
  console.log('STORIES:', st.length);
  st.forEach(s => {
    const tn = JSON.parse(s.technical_notes);
    console.log(`  ${s.story_key} FR=${tn.source_requirement_id} ${s.priority} ${s.story_points}pt ac=${s.acceptance_criteria.length} ctx=${s.implementation_context.length}ch status=${s.status} by=${s.created_by} sd=${s.sd_id.slice(0,8)}`);
  });
  const { data: ev } = await sb.from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,source,metadata,created_at,sd_id')
    .eq('sd_id', '3f128d5c-8168-4415-86cc-ab5da4663d11').eq('sub_agent_code', 'STORIES').order('created_at', { ascending: false }).limit(3);
  console.log('\nEVIDENCE ROWS:', ev.length);
  ev.forEach(r => console.log(`  ${r.id} ${r.phase} ${r.verdict} conf=${r.confidence} source=${r.source} repo=${r.metadata?.repo_path} hash=${(r.metadata?.content_hash||'').slice(0,12)} sha=${(r.metadata?.evaluated_commit_sha||'').slice(0,12)} sess=${(r.metadata?.session_id||'').slice(0,8)} stories=${r.metadata?.stories_created}`));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
