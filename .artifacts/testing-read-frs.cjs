const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
(async () => {
  const { data } = await sb.from('product_requirements_v2').select('functional_requirements,test_scenarios').eq('id','PRD-SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001').maybeSingle();
  const frs = data.functional_requirements || [];
  console.log('FR count:', frs.length);
  for (const fr of frs) {
    console.log('\n### ' + (fr.id||fr.key||'?') + ' :: ' + (fr.title||fr.name||''));
    const acs = fr.acceptance_criteria || fr.acceptanceCriteria || [];
    if (Array.isArray(acs)) acs.forEach((a,i) => console.log('   - ' + (typeof a === 'string' ? a : JSON.stringify(a))));
    else console.log('   acs:', JSON.stringify(acs));
  }
  console.log('\n=== TEST_SCENARIOS ===');
  console.log(JSON.stringify(data.test_scenarios, null, 1));
})();
