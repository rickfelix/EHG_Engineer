require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
 const {data} = await s.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,metadata,created_at').eq('sub_agent_code','RISK').order('created_at',{ascending:false}).limit(1);
 if(data&&data[0]) console.log(JSON.stringify({id:data[0].id,verdict:data[0].verdict,phase:data[0].phase,metaKeys:Object.keys(data[0].metadata||{})},null,1));
 const {data:d2} = await s.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,created_at').eq('sd_id','591400cf-7b88-4974-832a-6043e4f59152').order('created_at',{ascending:false}).limit(10);
 console.log('EXISTING FOR SD:', JSON.stringify(d2,null,1));
})();
