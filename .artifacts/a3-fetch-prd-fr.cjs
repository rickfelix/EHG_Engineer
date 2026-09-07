require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data}=await s.from('product_requirements_v2').select('functional_requirements,test_scenarios,acceptance_criteria').eq('id','PRD-SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001').single();
require('fs').writeFileSync('.artifacts/a3-current-prd-fr.json', JSON.stringify(data,null,2));
console.log('written');
})();
