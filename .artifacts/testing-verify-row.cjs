const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await sb.from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,created_at,sd_id,metadata')
    .eq('sd_id','e11ede7e-db45-467c-9372-26b67bee08ff')
    .order('created_at',{ascending:false}).limit(15);
  if (error) { console.error('ERR', error.message); process.exit(1); }
  console.log('rows for this SD:', data.length);
  data.forEach(r => console.log(' ', r.id, '|', r.sub_agent_code, '| phase=' + JSON.stringify(r.phase), '|', r.verdict, '|', r.created_at, '| te=' + (r.metadata && r.metadata.test_execution ? 'yes' : 'no')));
  const mine = data.find(r => r.id === '4298bd82-d59d-4ac6-b585-eb6aaf206915');
  console.log('\nMY ROW:', mine ? 'PRESENT phase=' + JSON.stringify(mine.phase) + ' verdict=' + mine.verdict : 'NOT FOUND');
})();
