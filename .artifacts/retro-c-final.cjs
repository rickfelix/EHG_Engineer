require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: rows } = await sb.from('sub_agent_execution_results').select('id,phase,verdict,confidence,created_at,updated_at,recommendations,metadata').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152').eq('sub_agent_code','RETRO').order('created_at');
  for (const r of rows) { const m=r.metadata||{}; console.log('RETRO ROW', JSON.stringify({id:r.id,phase:r.phase,verdict:r.verdict,conf:r.confidence,at:r.created_at,upd:r.updated_at,rec:r.recommendations,mode:m.mode,repo_path:m.repo_path,cwd:m.executed_from_cwd,session:m.session_id,hash:m.content_hash,sha:m.evaluated_commit_sha,producer:m.producer,run_id:m.run_id})); }
  const { data: r } = await sb.from('retrospectives').select('id,retro_type,status,quality_score,generated_by,key_learnings,what_needs_improvement,action_items,updated_at').eq('id','6ed9da75-64d8-4c43-9330-974deaab573d').single();
  console.log('RETRO', JSON.stringify({id:r.id,type:r.retro_type,status:r.status,q:r.quality_score,gen:r.generated_by,kl:r.key_learnings.length,titles:r.key_learnings.filter(k=>k.title).map(k=>k.severity+': '+k.title),wni:r.what_needs_improvement,ai:r.action_items.length,upd:r.updated_at},null,1));
})();
