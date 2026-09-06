require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const B = '058c33b2-62ce-45d0-a712-39716c5e8cfc';
  const { data: rows } = await sb.from('sub_agent_execution_results').select('id,phase,verdict,created_at,recommendations,metadata').eq('sd_id', B).eq('sub_agent_code','RETRO').order('created_at');
  console.log('B RETRO rows:', JSON.stringify(rows.map(r=>({id:r.id.slice(0,8),phase:r.phase,at:r.created_at,rec:r.recommendations,mode:r.metadata?.mode,opts:r.metadata?.options && Object.keys(r.metadata.options)}))));
  const { data: bl, error } = await sb.from('retrospectives').select('id,retro_type,generated_by,status,quality_score,title,created_at,metadata').eq('sd_id', B).order('created_at');
  console.log('B all retros:', error?error.message:JSON.stringify(bl,null,1).slice(0,3000));
  const { data: c, error: e2 } = await sb.from('retrospectives').select('id,retro_type,generated_by,status,quality_score,created_at').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152');
  console.log('C retros:', e2?e2.message:JSON.stringify(c));
})();
