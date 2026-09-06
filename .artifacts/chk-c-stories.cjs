const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('user_stories').select('story_key,title,created_by,status').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152');
  console.log('EXISTING C STORIES:', (data||[]).length);
  (data||[]).forEach(r=>console.log(' ', r.story_key, r.created_by, r.status, '|', r.title));
  const { data: sa } = await sb.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,created_at').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152').order('created_at',{ascending:false}).limit(10);
  console.log('SUBAGENT ROWS:'); (sa||[]).forEach(r=>console.log(' ', r.sub_agent_code, r.phase, r.verdict, r.created_at, r.id));
})();
