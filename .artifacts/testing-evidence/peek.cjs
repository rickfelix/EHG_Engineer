require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const { data, error } = await s.from('sub_agent_execution_results').select('*').eq('sub_agent_code','TESTING').order('created_at',{ascending:false}).limit(1);
  if(error){console.error(error.message);process.exit(1);}
  const r=data[0]; console.log('COLUMNS:', Object.keys(r).join(', '));
  console.log('sample verdict:', r.verdict, '| phase:', r.phase, '| status:', r.status);
  console.log('metadata keys:', Object.keys(r.metadata||{}).join(', '));
})();
