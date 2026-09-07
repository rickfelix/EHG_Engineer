const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
(async () => {
  const { data, error } = await sb.from('product_requirements_v2').select('id,title,functional_requirements,acceptance_criteria,test_scenarios,activation_test_id').eq('id','PRD-SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001').maybeSingle();
  if (error) { console.error('ERR', error.message); process.exit(1); }
  if (!data) { console.log('NO ROW by id; trying sd_id'); 
    const r2 = await sb.from('product_requirements_v2').select('id,title,functional_requirements,acceptance_criteria,activation_test_id').eq('directive_id','SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001');
    console.log(JSON.stringify(r2.data,null,2).slice(0,3000), r2.error && r2.error.message); return; }
  console.log('ID:', data.id, '| activation_test_id:', data.activation_test_id);
  console.log('=== ACCEPTANCE_CRITERIA ===');
  console.log(JSON.stringify(data.acceptance_criteria, null, 2));
})();
