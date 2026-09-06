require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
 const {data,error} = await s.from('product_requirements_v2').select('id,title,status,functional_requirements,acceptance_criteria').eq('sd_id','058c33b2-62ce-45d0-a712-39716c5e8cfc');
 if(error) return console.error(error);
 for(const p of data){
  console.log('PRD', p.id, '|', p.title, '|', p.status);
  console.log(JSON.stringify(p.functional_requirements,null,1).slice(0,12000));
 }
})();
