require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await s.from('sub_agent_execution_results').select('id, sub_agent_code, phase, verdict, metadata, created_at').eq('sd_id','058c33b2-62ce-45d0-a712-39716c5e8cfc').order('created_at',{ascending:false});
  if (error) return console.error(error);
  for (const r of data) {
    console.log(r.id, r.sub_agent_code, r.phase, r.verdict, r.created_at);
    const m = r.metadata || {};
    const s2 = JSON.stringify(m);
    console.log('METAKEYS', Object.keys(m).join(','));
    console.log(s2.slice(0, 12000));
  }
})();
