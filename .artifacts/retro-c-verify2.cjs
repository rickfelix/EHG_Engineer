require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: b, error } = await sb.from('retrospectives').select('*').eq('id','08f4cfd8-9b05-4059-9d6d-8740350cfdf8').single();
  if (error) console.log('B err', error.message);
  else console.log('B retro:', JSON.stringify({id:b.id, title:b.title, retro_type:b.retro_type, trigger_type:b.trigger_type, generated_by:b.generated_by, status:b.status, quality_score:b.quality_score, created_at:b.created_at, kl:b.key_learnings, ai:b.action_items, sp:b.success_patterns, fp:b.failure_patterns, wgw:b.what_went_well, wni:b.what_needs_improvement, metadata:b.metadata}, null, 1).slice(0,6000));
  const { data: c } = await sb.from('retrospectives').select('id,retro_type,trigger_type,generated_by,status,quality_score,key_learnings,action_items').eq('id','cf8f7341-ceae-4618-adfd-cc220750877d').single();
  console.log('C existing:', JSON.stringify(c).slice(0,1500));
  const { data: rf, error: e2 } = await sb.from('ship_review_findings').select('*').order('created_at',{ascending:false}).limit(1);
  console.log('srf cols:', e2?e2.message:Object.keys(rf[0]||{}));
  const { data: rf2 } = await sb.from('ship_review_findings').select('*').gte('created_at','2026-09-06T11:00:00Z').order('created_at');
  console.log('srf today:', JSON.stringify((rf2||[]).map(r=>({pr:r.pr_number||r.pr_url||r.pr, sev:r.severity, t:(r.title||r.finding||r.summary||JSON.stringify(r)).slice(0,160), at:r.created_at}))));
})();
