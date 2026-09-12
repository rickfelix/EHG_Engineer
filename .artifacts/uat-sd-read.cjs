require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const {data,error}=await sb.from('strategic_directives_v2').select('id,sd_key,status,current_phase,metadata,smoke_test_steps').or('id.eq.SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D,sd_key.eq.SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D');
  if(error){console.error(error);process.exit(1);}
  console.log('rows',data.length);
  for (const d of data){
  console.log('id',d.id,'key',d.sd_key,'status',d.status,d.current_phase);
  console.log('smoke_test_steps', JSON.stringify(d.smoke_test_steps,null,1));
  console.log('meta keys', Object.keys(d.metadata||{}));
  console.log('meta smoke', JSON.stringify(d.metadata?.smoke_test_steps||d.metadata?.smoke_tests||null,null,1));
  }
})();
