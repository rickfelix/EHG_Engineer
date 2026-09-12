require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  let { data, error } = await s.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D');
  if(error) return console.error(error);
  if(!data||!data.length){
    const r2 = await s.from('product_requirements_v2').select('id,title,directive_id,status').ilike('id','%MICHAEL%');
    return console.log('NOT FOUND, siblings:', JSON.stringify(r2.data,null,2));
  }
  const p = data[0];
  console.log('KEYS:', Object.keys(p).join(', '));
  console.log(JSON.stringify(p, null, 2));
})();
