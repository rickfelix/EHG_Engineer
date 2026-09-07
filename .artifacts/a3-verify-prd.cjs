require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data}=await s.from('product_requirements_v2').select('functional_requirements,test_scenarios,acceptance_criteria').eq('id','PRD-SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001').single();
console.log(JSON.stringify(data.functional_requirements.find(f=>f.id==='FR-3'),null,1));
console.log('---TS ids---', data.test_scenarios.map(t=>t.id));
console.log('---AC[3]---', data.acceptance_criteria[3]);
})();
