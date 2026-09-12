require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await s.from('user_stories').select('*').eq('prd_id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C').order('story_key');
  if (error) { console.error('ERR', error); process.exit(1); }
  console.log('count', data.length);
  console.log('COLUMNS:', Object.keys(data[0]).join(', '));
  console.log('---SAMPLE ROW 1---');
  console.log(JSON.stringify(data[0], null, 2));
  console.log('---KEYS ALL---');
  console.log(data.map(d=>d.story_key + ' | ' + d.title).join('\n'));
})();
